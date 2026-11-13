"""Google OAuth 2.0 login for the SPA (authorization-code flow)."""
from __future__ import annotations

import secrets
from datetime import timedelta
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.core import signing
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ..models import UserProfile
from ..models_commercial import OAuthLoginTicket
from ..models_tenancy import Organization
from ..services.auth_policy import google_configured, method_allowed, organization_for_user

GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
STATE_MAX_AGE = 600
TICKET_MINUTES = 2


def _frontend_error(message):
    return f"{settings.FRONTEND_URL}/login?oauth_error={requests.utils.quote(message)}"


def _org_from_value(value):
    if not value:
        return None
    try:
        org = Organization.objects.filter(id=value).first()
    except (TypeError, ValueError):
        org = None
    return org or Organization.objects.filter(slug=value).first()


@api_view(['GET'])
@permission_classes([AllowAny])
def google_start(request):
    if not google_configured():
        return Response({'error': 'Google login is not configured.'}, status=503)
    org_value = request.query_params.get('organization_id') or request.query_params.get('org')
    org = _org_from_value(org_value)
    if org is not None and not method_allowed('google', org):
        return Response({'error': 'Google login is not enabled for this organization.'}, status=403)

    state = signing.dumps(
        {
            'org': str(org.id) if org else '',
            'next': request.query_params.get('next') or '',
            'nonce': secrets.token_urlsafe(16),
        },
        salt='google-oauth-state',
    )
    params = {
        'client_id': settings.GOOGLE_CLIENT_ID,
        'redirect_uri': settings.GOOGLE_REDIRECT_URI,
        'response_type': 'code',
        'scope': 'openid email profile',
        'state': state,
        'access_type': 'online',
        'prompt': 'select_account',
    }
    from django.http import HttpResponseRedirect
    return HttpResponseRedirect(f'{GOOGLE_AUTH_URL}?{urlencode(params)}')


@api_view(['GET'])
@permission_classes([AllowAny])
def google_callback(request):
    if request.query_params.get('error'):
        from django.http import HttpResponseRedirect
        return HttpResponseRedirect(_frontend_error('Google sign-in was cancelled.'))

    code = request.query_params.get('code')
    state = request.query_params.get('state')
    if not code or not state:
        from django.http import HttpResponseRedirect
        return HttpResponseRedirect(_frontend_error('Invalid Google sign-in response.'))

    try:
        payload = signing.loads(state, salt='google-oauth-state', max_age=STATE_MAX_AGE)
    except signing.BadSignature:
        from django.http import HttpResponseRedirect
        return HttpResponseRedirect(_frontend_error('Google sign-in session expired. Please try again.'))

    try:
        token_response = requests.post(
            GOOGLE_TOKEN_URL,
            data={
                'code': code,
                'client_id': settings.GOOGLE_CLIENT_ID,
                'client_secret': settings.GOOGLE_CLIENT_SECRET,
                'redirect_uri': settings.GOOGLE_REDIRECT_URI,
                'grant_type': 'authorization_code',
            },
            timeout=10,
        )
        token_response.raise_for_status()
        tokens = token_response.json()
        userinfo_response = requests.get(
            GOOGLE_USERINFO_URL,
            headers={'Authorization': f"Bearer {tokens['access_token']}"},
            timeout=10,
        )
        userinfo_response.raise_for_status()
        userinfo = userinfo_response.json()
    except Exception:
        from django.http import HttpResponseRedirect
        return HttpResponseRedirect(_frontend_error('Google sign-in could not be completed.'))

    email = (userinfo.get('email') or '').strip().lower()
    if not email or not userinfo.get('email_verified'):
        from django.http import HttpResponseRedirect
        return HttpResponseRedirect(_frontend_error('Google did not return a verified email address.'))

    from django.contrib.auth.models import User
    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        user = User.objects.create_user(
            username=email.split('@')[0][:120] or f'google-{secrets.token_hex(4)}',
            email=email,
            password=secrets.token_urlsafe(32),
        )
        UserProfile.objects.get_or_create(user=user, defaults={'email': email})
    if not user.is_active:
        from django.http import HttpResponseRedirect
        return HttpResponseRedirect(_frontend_error('This account is disabled.'))

    org = _org_from_value(payload.get('org'))
    if org is None:
        org = organization_for_user(user)
    if not method_allowed('google', org):
        from django.http import HttpResponseRedirect
        return HttpResponseRedirect(_frontend_error('Google login is not enabled for this organization.'))

    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(user)
    ticket = OAuthLoginTicket.objects.create(
        token=secrets.token_urlsafe(48),
        user=user,
        access_token=str(refresh.access_token),
        refresh_token=str(refresh),
        expires_at=timezone.now() + timedelta(minutes=TICKET_MINUTES),
    )
    from django.http import HttpResponseRedirect
    return HttpResponseRedirect(
        f"{settings.FRONTEND_URL}/auth/google/callback?ticket={ticket.token}"
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def google_exchange(request):
    ticket_value = (request.data.get('ticket') or '').strip()
    if not ticket_value:
        return Response({'error': 'ticket is required.'}, status=400)
    ticket = OAuthLoginTicket.objects.filter(token=ticket_value).first()
    if ticket is None or ticket.used_at is not None or ticket.expires_at < timezone.now():
        return Response({'error': 'This Google sign-in link has expired.'}, status=400)
    ticket.used_at = timezone.now()
    ticket.save(update_fields=['used_at'])

    from .auth_api import _issue_tokens
    tokens = _issue_tokens(ticket.user)
    return Response(tokens, status=status.HTTP_200_OK)
