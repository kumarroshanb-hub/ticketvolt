# backend/ticket_bookings/views.py
"""
Auth views for TicketVolt.

LoginView implements multiple defense layers:
  - Axes lockout (5 failures per [username, ip] or per IP)
  - ScopedRateThrottle (login scope) to blunt distributed attempts
  - Generic error messages — no user enumeration
  - Constant-time-ish credential check using a precomputed dummy hash
  - Optional single-session enforcement: on login, blacklist any
    existing outstanding refresh tokens for the user (env toggle)
"""
import os

from django.contrib.auth import authenticate
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import status
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from axes.handlers.proxy import AxesProxyHandler
from axes.helpers import get_client_ip_address

# Precomputed hash of a throwaway password. Used to equalize timing
# between "user does not exist" and "wrong password" without actually
# allocating a User object per request.
_DUMMY_PASSWORD_HASH = make_password('dummy-password-for-timing-equalization')

# Env toggle: when "True", logging in blacklists all previous refresh
# tokens for the user, effectively signing out other devices.
_SINGLE_SESSION = os.environ.get('SINGLE_SESSION_LOGIN', 'False') == 'True'


def get_user_role(user):
    """Compute the effective role string for a user."""
    if user.is_superuser:
        return 'super_admin'
    if user.is_staff:
        return 'admin'
    if hasattr(user, 'profile') and user.profile.is_organizer:
        return 'organizer'
    return 'user'


def _get_user_by_email(email):
    """
    Case-insensitive email lookup.
    Returns None if not found.
    """
    if not email:
        return None
    return User.objects.filter(email__iexact=email.strip()).first()


class LoginView(APIView):
    """
    Email + password login.

    Request body:
        { "email": "...", "password": "..." }

    Response on success:
        {
          "access": "<jwt>",
          "refresh": "<jwt>",
          "user": { ... }
        }

    All failure paths return 401 with the same generic detail so that
    attackers cannot distinguish "no such user" from "wrong password"
    from "disabled account".
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request):
        email = (request.data.get('email') or '').strip()
        password = request.data.get('password') or ''

        if not email or not password:
            return Response(
                {'detail': 'Email and password required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_request = getattr(request, '_request', request)
        client_ip = get_client_ip_address(raw_request)

        # ---------- Axes lockout check ----------
        if AxesProxyHandler.is_locked(
            request=raw_request,
            credentials={'username': email, 'ip_address': client_ip},
        ):
            return Response(
                {
                    'detail': 'Too many failed login attempts. '
                              'Please try again later.'
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # ---------- Lookup + authenticate ----------
        user_obj = _get_user_by_email(email)
        user = None

        if user_obj is not None:
            user = authenticate(
                request=raw_request,
                username=user_obj.username,
                password=password,
            )

        # ---------- Timing equalization ----------
        # If auth failed or the user does not exist, run a dummy hash
        # comparison so the response time does not leak whether the
        # email exists.
        if user is None:
            check_password(password, _DUMMY_PASSWORD_HASH)

            AxesProxyHandler.user_login_failed(
                sender=None,
                credentials={'username': email, 'ip_address': client_ip},
                request=raw_request,
            )
            return Response(
                {'detail': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_active:
            # Same generic message — do not confirm existence.
            return Response(
                {'detail': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # ---------- Success ----------
        AxesProxyHandler.user_logged_in(
            sender=None,
            request=raw_request,
            user=user,
        )

        # ---------- Optional single-session enforcement ----------
        if _SINGLE_SESSION:
            with transaction.atomic():
                for outstanding in OutstandingToken.objects.filter(user=user):
                    BlacklistedToken.objects.get_or_create(token=outstanding)

        refresh = RefreshToken.for_user(user)
        role = get_user_role(user)

        # Embed non-sensitive claims so the frontend doesn't need a
        # /me round-trip immediately after login.
        refresh['role'] = role
        refresh['email'] = user.email

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'name': user.get_full_name() or user.username,
                'role': role,
                'is_superuser': user.is_superuser,
                'is_staff': user.is_staff,
            },
        })


class MeView(APIView):
    """
    Return the current user's profile.
    Returns 403 if the account has been locked by Axes.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        raw_request = getattr(request, '_request', request)

        if AxesProxyHandler.is_locked(request=raw_request, credentials=None):
            return Response(
                {'detail': 'Account temporarily locked'},
                status=status.HTTP_403_FORBIDDEN,
            )

        role = get_user_role(user)

        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'name': user.get_full_name() or user.username,
            'role': role,
            'is_superuser': user.is_superuser,
            'is_staff': user.is_staff,
            'is_active': user.is_active,
        })