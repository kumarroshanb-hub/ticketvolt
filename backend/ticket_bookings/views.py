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

Scanner views (`checkin_verify`, `checkin_perform`, `checkin_history`)
implement the server-side half of the signed-QR contract:
  - Strict schema validation (v=1, type='ticket', code matches regex)
  - HMAC-SHA256 signature verification using TICKET_SIGNING_SECRET
  - Only then trust `code` enough to look up a Ticket row
"""
import hashlib
import hmac
import json
import os
import re

from django.contrib.auth import authenticate
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from axes.handlers.proxy import AxesProxyHandler
from axes.helpers import get_client_ip_address

from .models import Ticket, CheckInLog

# ---------------------------------------------------------------------------
# Ticket signature contract (must match the mobile scanner exactly)
# ---------------------------------------------------------------------------
TICKET_SCHEMA_VERSION = 1
TICKET_TYPE = 'ticket'
TICKET_CODE_RE = re.compile(r'^TIX[A-Z0-9]{8,32}$')
MAX_QR_PAYLOAD_LENGTH = 2048

_DUMMY_PASSWORD_HASH = make_password('dummy-password-for-timing-equalization')

_SINGLE_SESSION = os.environ.get('SINGLE_SESSION_LOGIN', 'False') == 'True'


def _get_ticket_signing_secret() -> str:
    """
    Resolve the HMAC secret used to sign QR ticket payloads.

    Required in every environment. We refuse to run without it so that a
    misconfigured deploy cannot silently fall back to "no signature
    checking", which would defeat the whole scheme.
    """
    secret = os.environ.get('TICKET_SIGNING_SECRET', '').strip()
    if not secret:
        raise RuntimeError(
            "TICKET_SIGNING_SECRET is not set. Signed QR verification "
            "cannot run without it. Set it in the environment."
        )
    if len(secret) < 32:
        raise RuntimeError(
            "TICKET_SIGNING_SECRET must be at least 32 characters."
        )
    return secret


def _canonical_ticket_message(payload: dict) -> bytes:
    """
    Rebuild the exact byte string that was signed at issue time.

    Must use the same separators and key ordering as the issuer.
    """
    return json.dumps(
        {
            'v': payload.get('v'),
            'type': payload.get('type'),
            'code': payload.get('code'),
        },
        separators=(',', ':'),
        sort_keys=True,
    ).encode('utf-8')


def verify_ticket_signature(payload: dict) -> bool:
    """
    Constant-time HMAC-SHA256 check over (v, type, code).
    Returns False for any malformed input rather than raising.
    """
    if not isinstance(payload, dict):
        return False

    provided_sig = payload.get('sig')
    if not isinstance(provided_sig, str) or not provided_sig:
        return False

    try:
        expected = hmac.new(
            _get_ticket_signing_secret().encode('utf-8'),
            _canonical_ticket_message(payload),
            hashlib.sha256,
        ).hexdigest()
    except RuntimeError:
        # Misconfigured server — fail closed.
        return False

    return hmac.compare_digest(expected, provided_sig)


def _validate_ticket_payload(data) -> tuple[dict | None, str | None]:
    """
    Enforce the exact QR schema server-side.

    Returns (payload, None) on success, or (None, reason) on failure.
    """
    if not isinstance(data, dict):
        return None, 'Payload must be a JSON object.'

    # Size guard against oversized payloads.
    try:
        serialized = json.dumps(data, separators=(',', ':'))
    except (TypeError, ValueError):
        return None, 'Payload is not serializable.'
    if len(serialized) > MAX_QR_PAYLOAD_LENGTH:
        return None, 'Payload too large.'

    if data.get('v') != TICKET_SCHEMA_VERSION:
        return None, 'Unsupported schema version.'
    if data.get('type') != TICKET_TYPE:
        return None, 'Invalid payload type.'

    code = data.get('code')
    if not isinstance(code, str) or not TICKET_CODE_RE.match(code):
        return None, 'Invalid ticket code.'

    sig = data.get('sig')
    if not isinstance(sig, str) or not sig:
        return None, 'Missing signature.'

    # Reject unknown top-level keys — keeps the surface minimal.
    allowed = {'v', 'type', 'code', 'sig'}
    extra = set(data.keys()) - allowed
    if extra:
        return None, f'Unexpected fields: {sorted(extra)}'

    return {
        'v': data['v'],
        'type': data['type'],
        'code': code,
        'sig': sig,
    }, None


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
    """Case-insensitive email lookup. Returns None if not found."""
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

        user_obj = _get_user_by_email(email)
        user = None

        if user_obj is not None:
            user = authenticate(
                request=raw_request,
                username=user_obj.username,
                password=password,
            )

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
            return Response(
                {'detail': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        AxesProxyHandler.user_logged_in(
            sender=None,
            request=raw_request,
            user=user,
        )

        if _SINGLE_SESSION:
            with transaction.atomic():
                for outstanding in OutstandingToken.objects.filter(user=user):
                    BlacklistedToken.objects.get_or_create(token=outstanding)

        refresh = RefreshToken.for_user(user)
        role = get_user_role(user)

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


# ===========================================================================
# Scanner endpoints — signed QR verification
# ===========================================================================

def _ticket_to_scan_response(ticket: Ticket) -> dict:
    """Build the `ticket` sub-object returned by /checkin/verify/."""
    return {
        'id': str(ticket.id),
        'unique_code': ticket.unique_code,
        'attendee_name': ticket.attendee_name,
        'attendee_email': ticket.attendee_email,
        'status': ticket.status,
        'is_checked_in': ticket.status == 'used',
        'checked_in_at': ticket.check_in_time,
        'event': ticket.event.title if ticket.event else None,
        'tier': ticket.tier.name if ticket.tier else None,
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkin_verify(request):
    """
    POST /api/checkin/verify/

    Body: { "v": 1, "type": "ticket", "code": "TIX...", "sig": "<hex>" }

    Returns:
      200 { "valid": true,  "ticket": {...} }
      200 { "valid": false, "detail": "..." }   for well-formed but invalid tickets
      400 { "detail": "..." }                   for malformed payloads
    """
    payload, reason = _validate_ticket_payload(request.data)
    if payload is None:
        return Response(
            {'detail': reason or 'Invalid payload.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not verify_ticket_signature(payload):
        return Response(
            {'valid': False, 'detail': 'Signature mismatch.'},
            status=status.HTTP_200_OK,
        )

    ticket = (
        Ticket.objects
        .select_related('event', 'tier')
        .filter(unique_code=payload['code'])
        .first()
    )
    if ticket is None:
        return Response(
            {'valid': False, 'detail': 'Ticket not found.'},
            status=status.HTTP_200_OK,
        )

    if ticket.status == 'cancelled':
        return Response(
            {'valid': False, 'detail': 'Ticket has been cancelled.'},
            status=status.HTTP_200_OK,
        )

    return Response(
        {'valid': True, 'ticket': _ticket_to_scan_response(ticket)},
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkin_perform(request):
    """
    POST /api/checkin/

    Body: { "v": 1, "type": "ticket", "code": "TIX...", "sig": "<hex>" }

    Re-verifies the signature (never trust a bare code) and performs an
    atomic check-in. Returns 409 if the ticket was already used.
    """
    payload, reason = _validate_ticket_payload(request.data)
    if payload is None:
        return Response(
            {'detail': reason or 'Invalid payload.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not verify_ticket_signature(payload):
        return Response(
            {'detail': 'Invalid signature.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        ticket = (
            Ticket.objects
            .select_for_update()
            .select_related('event', 'tier')
            .filter(unique_code=payload['code'])
            .first()
        )
        if ticket is None:
            return Response(
                {'detail': 'Ticket not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if ticket.status == 'cancelled':
            return Response(
                {'detail': 'Ticket has been cancelled.'},
                status=status.HTTP_409_CONFLICT,
            )

        if ticket.status == 'used':
            return Response(
                {'detail': 'Ticket already checked in.'},
                status=status.HTTP_409_CONFLICT,
            )

        now = timezone.now()
        ticket.status = 'used'
        ticket.check_in_time = now
        ticket.save(update_fields=['status', 'check_in_time'])

        CheckInLog.objects.create(
            ticket=ticket,
            event=ticket.event,
            scanner_user=request.user,
            scanner_ip=get_client_ip_address(
                getattr(request, '_request', request)
            ),
            scanned_at=now,
            status='success',
        )

    return Response(
        {
            'status': 'checked_in',
            'ticket': _ticket_to_scan_response(ticket),
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def checkin_history(request):
    """
    GET /api/checkin/history/?limit=N

    Returns the most recent check-in log entries. The scanner app's
    History screen calls this to display recent activity.

    Notes:
      - `limit` is clamped to [1, 500] to prevent scraping / accidental
        memory blowups.
      - Only fields the scanner UI needs are returned.
    """
    try:
        limit = int(request.query_params.get('limit', 20))
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 500))

    logs = (
        CheckInLog.objects
        .select_related('ticket', 'ticket__event', 'event', 'scanner_user')
        .order_by('-scanned_at')[:limit]
    )

    def _event_title(log):
        if log.event:
            return log.event.title
        if log.ticket and log.ticket.event:
            return log.ticket.event.title
        return None

    data = [
        {
            'id': str(log.id),
            'ticket_code': log.ticket.unique_code if log.ticket else None,
            'attendee_name': log.ticket.attendee_name if log.ticket else None,
            'event': _event_title(log),
            'status': log.status,
            'scanned_at': log.scanned_at,
            'scanner': (
                log.scanner_user.username if log.scanner_user else None
            ),
        }
        for log in logs
    ]
    return Response({'history': data})