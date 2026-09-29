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

Scanner views implement the server-side half of the signed-QR contract.

There are TWO families of scanner endpoints:

  1. Signed-payload endpoints (used by the mobile scanner app):
       POST /checkin/verify/   → verify a signed {v,type,code,sig} payload
       POST /checkin/          → atomic check-in from a signed payload

  2. Manual-entry endpoints (used by the admin web UI):
       POST /checkin/manual-verify/  → verify a bare ticket code
       POST /checkin/manual/         → atomic check-in from a bare code

  The manual endpoints exist because the admin browser does NOT hold
  TICKET_SIGNING_SECRET — it cannot construct a signed payload. They are
  protected by IsAuthenticated + role checks (admin/staff/organizer with
  ownership of the event) so a regular user cannot use them to bypass
  signature verification.

  3. History endpoint (shared by both clients):
       GET /checkin/history/   → recent check-in log rows

The signed-payload endpoints use HMAC-SHA256 over the canonical byte
string of {"v","type","code"} with TICKET_SIGNING_SECRET.
"""
import hashlib
import hmac
import json
import os
import re
from datetime import timedelta

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

from .constants import BookingStatus, TicketStatus
from .models import Ticket, CheckInLog


# ---------------------------------------------------------------------------
# Ticket signature contract (must match the mobile scanner exactly)
# ---------------------------------------------------------------------------
TICKET_SCHEMA_VERSION = 1
TICKET_TYPE = 'ticket'
TICKET_CODE_RE = re.compile(r'^TIX[A-Z0-9]{8,32}$')
MAX_QR_PAYLOAD_LENGTH = 2048

# Slot-window grace periods. Mirrored in the mobile app.
CHECKIN_EARLY_GRACE = timedelta(minutes=30)
CHECKIN_LATE_GRACE = timedelta(minutes=15)

_DUMMY_PASSWORD_HASH = make_password('dummy-password-for-timing-equalization')

_SINGLE_SESSION = os.environ.get('SINGLE_SESSION_LOGIN', 'False') == 'True'


# ===========================================================================
# Shared helpers
# ===========================================================================

def _get_ticket_signing_secret() -> str:
    """Resolve TICKET_SIGNING_SECRET. Fails closed if missing/too short."""
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
    """Rebuild the exact byte string that was signed at issue time."""
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
    """Constant-time HMAC-SHA256 check over (v, type, code)."""
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
        return False

    return hmac.compare_digest(expected, provided_sig)


def _validate_ticket_payload(data) -> tuple[dict | None, str | None]:
    """Enforce the exact QR schema server-side."""
    if not isinstance(data, dict):
        return None, 'Payload must be a JSON object.'

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


def _is_organizer(user):
    return (
        (hasattr(user, 'profile') and getattr(user.profile, 'is_organizer', False))
        or hasattr(user, 'organizer')
    )


def _user_can_manage_event(user, event):
    """
    Admins/staff: any event.
    Organizers:   only their own events.
    Everyone else: no.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    if _is_organizer(user) and event is not None:
        return event.organizer_id == user.id
    return False


def _validate_checkin_window(ticket, now=None):
    """
    Validate that `now` falls within the allowed check-in window for
    the ticket's assigned slot.

    Window: [session.start_time - CHECKIN_EARLY_GRACE,
             session.end_time   + CHECKIN_LATE_GRACE]

    Returns (allowed: bool, reason: str | None).
    """
    now = now or timezone.now()

    if not ticket.session:
        return True, None

    session = ticket.session
    window_start = session.start_time - CHECKIN_EARLY_GRACE
    window_end = session.end_time + CHECKIN_LATE_GRACE

    if now < window_start:
        reason = (
            f"Too early for this slot. Check-in opens at "
            f"{timezone.localtime(window_start).strftime('%I:%M %p')}."
        )
        return False, reason

    if now > window_end:
        reason = (
            f"Too late for this slot. Check-in closed at "
            f"{timezone.localtime(window_end).strftime('%I:%M %p')}."
        )
        return False, reason

    return True, None


def _ticket_to_scan_response(ticket: Ticket) -> dict:
    """
    Build the `ticket` sub-object returned by every verify/checkin
    endpoint.

    Both `unique_code` (used by the mobile app) and `code` (used by the
    admin frontend's VerificationResult component) are returned so both
    clients can share the same response shape.
    """
    return {
        'id': str(ticket.id),
        'unique_code': ticket.unique_code,
        'code': ticket.unique_code,  # alias for the admin UI
        'attendee_name': ticket.attendee_name,
        'attendee_email': ticket.attendee_email,
        'status': ticket.status,
        'is_checked_in': ticket.status == TicketStatus.USED,
        'checked_in_at': (
            ticket.check_in_time.isoformat() if ticket.check_in_time else None
        ),
        'event': ticket.event.title if ticket.event else None,
        'event_id': str(ticket.event.id) if ticket.event else None,
        'tier': ticket.tier.name if ticket.tier else None,
    }


def _rejection_for_ticket(ticket):
    """
    If the ticket cannot be checked in, return the appropriate Response.
    Otherwise return None.
    """
    if ticket.status in (
        TicketStatus.REFUNDED,
        TicketStatus.CANCELLED,
        TicketStatus.EXPIRED,
    ):
        return Response(
            {
                'valid': False,
                'detail': (
                    f'This ticket has been {ticket.status} '
                    f'and is no longer valid'
                ),
                'code': f'TICKET_{ticket.status.upper()}',
                'ticket': _ticket_to_scan_response(ticket),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if ticket.status == TicketStatus.USED:
        return Response(
            {
                'valid': False,
                'detail': 'Ticket has already been used',
                'code': 'TICKET_USED',
                'ticket': _ticket_to_scan_response(ticket),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if (
        ticket.event
        and ticket.event.end_date
        and ticket.event.end_date < timezone.now()
    ):
        return Response(
            {
                'valid': False,
                'detail': 'This event has already ended',
                'code': 'EVENT_ENDED',
                'ticket': _ticket_to_scan_response(ticket),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    return None


def _check_and_complete_booking(booking) -> bool:
    """
    Promote the booking to `completed` iff at least one ticket is `used`
    and no ticket is still check-in-able. Returns True if changed.
    """
    if not booking:
        return False

    if booking.status in (
        BookingStatus.COMPLETED,
        BookingStatus.CANCELLED,
        BookingStatus.REFUNDED,
    ):
        return False

    terminal_states = (
        TicketStatus.USED,
        TicketStatus.CANCELLED,
        TicketStatus.REFUNDED,
        TicketStatus.EXPIRED,
    )

    total_tickets = booking.tickets.count()
    if total_tickets == 0:
        return False

    used_tickets = booking.tickets.filter(status=TicketStatus.USED).count()
    actionable_tickets = booking.tickets.exclude(
        status__in=terminal_states,
    ).count()

    if used_tickets == 0:
        return False
    if actionable_tickets > 0:
        return False

    booking.status = BookingStatus.COMPLETED
    booking.save(update_fields=['status'])
    return True


def _perform_checkin(request, ticket, device_id):
    """
    Shared atomic check-in core. Caller must have already:
      - locked the ticket row (inside a transaction)
      - verified signature (signed payload) OR role permission (manual)
      - run `_rejection_for_ticket` and `_validate_checkin_window`

    Returns the HTTP Response to send back.
    """
    checkin_log = CheckInLog.objects.create(
        ticket=ticket,
        event=ticket.event,
        session=ticket.session,
        scanner_user=request.user,
        scanner_device_id=device_id,
        scanner_ip=get_client_ip_address(
            getattr(request, '_request', request)
        ),
        status='success',
        is_offline=False,
        synced_at=timezone.now(),
    )

    ticket.status = TicketStatus.USED
    ticket.check_in_time = timezone.now()
    ticket.save(update_fields=['status', 'check_in_time'])

    booking_completed = False
    if ticket.booking:
        booking_completed = _check_and_complete_booking(ticket.booking)

    return Response(
        {
            'success': True,
            'message': 'Check-in successful',
            'ticket': _ticket_to_scan_response(ticket),
            'checkin_time': checkin_log.scanned_at.isoformat(),
            'device_id': device_id,
            'booking_completed': booking_completed,
            'booking_status': ticket.booking.status if ticket.booking else None,
        },
        status=status.HTTP_200_OK,
    )


# ===========================================================================
# Auth views
# ===========================================================================

class LoginView(APIView):
    """Email + password login."""
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
    """Return the current user's profile."""
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
# Scanner endpoints — signed QR verification (mobile app)
# ===========================================================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkin_verify(request):
    """
    POST /api/checkin/verify/

    Body: { "v": 1, "type": "ticket", "code": "TIX...", "sig": "<hex>" }

    Returns:
      200 { "valid": true,  "ticket": {...}, "slot_window": {...} }
      200 { "valid": false, "detail": "..." }  for well-formed but invalid tickets
      400 { "detail": "..." }                  for malformed payloads
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
        .select_related('event', 'tier', 'session')
        .filter(unique_code=payload['code'])
        .first()
    )
    if ticket is None:
        return Response(
            {'valid': False, 'detail': 'Ticket not found.'},
            status=status.HTTP_200_OK,
        )

    rejection = _rejection_for_ticket(ticket)
    if rejection is not None:
        return rejection

    is_within_window, window_reason = _validate_checkin_window(ticket)

    return Response(
        {
            'valid': True,
            'ticket': _ticket_to_scan_response(ticket),
            'slot_window': {
                'open': is_within_window,
                'message': window_reason if not is_within_window else None,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkin_perform(request):
    """
    POST /api/checkin/

    Body: { "v": 1, "type": "ticket", "code": "TIX...", "sig": "<hex>" }

    Re-verifies the signature (never trust a bare code) and performs an
    atomic check-in.

    IMPORTANT: `select_for_update(of=('self',))` is required here because
    `Ticket.session` is nullable and `select_related('session')` produces
    a LEFT OUTER JOIN. PostgreSQL refuses `FOR UPDATE` on the nullable
    side of a LEFT JOIN. Locking only the ticket row itself is both
    correct (that's the row we're mutating) and portable.
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

    device_id = (request.data.get('device_id') or 'unknown')[:255]

    with transaction.atomic():
        ticket = (
            Ticket.objects
            .select_for_update(of=('self',))
            .select_related('event', 'tier', 'session', 'booking')
            .filter(unique_code=payload['code'])
            .first()
        )
        if ticket is None:
            return Response(
                {'detail': 'Ticket not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not _user_can_manage_event(request.user, ticket.event):
            return Response(
                {'detail': 'You do not have permission to check in this ticket.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        rejection = _rejection_for_ticket(ticket)
        if rejection is not None:
            return rejection

        is_within_window, window_reason = _validate_checkin_window(ticket)
        if not is_within_window:
            return Response(
                {
                    'detail': window_reason,
                    'code': 'OUTSIDE_SLOT_WINDOW',
                    'ticket': _ticket_to_scan_response(ticket),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return _perform_checkin(request, ticket, device_id)


# ===========================================================================
# Scanner endpoints — manual code entry (admin web UI)
# ---------------------------------------------------------------------------
# These exist because the admin browser does NOT hold the HMAC secret and
# therefore cannot construct a signed payload. They accept a BARE ticket
# code and are protected by IsAuthenticated + role checks.
# ===========================================================================

def _extract_bare_code(raw_code: str) -> str:
    """
    Accept either a bare `TIX...` code or a pasted JSON payload
    containing a `code` field. Returns the extracted code (may be
    empty if nothing usable was found).
    """
    raw_code = (raw_code or '').strip()
    if not raw_code:
        return ''

    if raw_code.startswith('{'):
        try:
            parsed = json.loads(raw_code)
            candidate = parsed.get('code') or parsed.get('unique_code') or ''
            return str(candidate).strip()
        except (ValueError, TypeError):
            return raw_code

    return raw_code


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkin_manual_verify(request):
    """
    POST /api/checkin/manual-verify/

    Body: { "code": "TIX..." }

    Read-only verification for the admin UI's manual-entry form. Same
    response shape as `checkin_verify` so the frontend can share one
    result renderer.
    """
    code = _extract_bare_code(request.data.get('code'))
    if not code:
        return Response(
            {'detail': 'Ticket code is required', 'code': 'MISSING_CODE'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not TICKET_CODE_RE.match(code):
        return Response(
            {'detail': 'Invalid ticket code format', 'code': 'INVALID_FORMAT'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ticket = (
        Ticket.objects
        .select_related('event', 'tier', 'session', 'booking')
        .filter(unique_code=code)
        .first()
    )
    if ticket is None:
        return Response(
            {
                'valid': False,
                'detail': 'Ticket not found',
                'code': 'TICKET_NOT_FOUND',
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    if not _user_can_manage_event(request.user, ticket.event):
        return Response(
            {
                'valid': False,
                'detail': 'You do not have permission to verify this ticket.',
                'code': 'PERMISSION_DENIED',
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    rejection = _rejection_for_ticket(ticket)
    if rejection is not None:
        return rejection

    is_within_window, window_reason = _validate_checkin_window(ticket)

    return Response(
        {
            'valid': True,
            'ticket': _ticket_to_scan_response(ticket),
            'slot_window': {
                'open': is_within_window,
                'message': window_reason if not is_within_window else None,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkin_manual(request):
    """
    POST /api/checkin/manual/

    Body: { "code": "TIX...", "device_id": "admin-panel" }

    Perform an atomic check-in from a bare ticket code. Same core as
    `checkin_perform` but without signature verification — the caller
    has already been authenticated and role-checked.

    IMPORTANT: `select_for_update(of=('self',))` is required here because
    `Ticket.session` is nullable and `select_related('session')` produces
    a LEFT OUTER JOIN. PostgreSQL refuses `FOR UPDATE` on the nullable
    side of a LEFT JOIN. Locking only the ticket row itself is both
    correct (that's the row we're mutating) and portable.
    """
    code = _extract_bare_code(request.data.get('code'))
    if not code:
        return Response(
            {'detail': 'Ticket code is required', 'code': 'MISSING_CODE'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not TICKET_CODE_RE.match(code):
        return Response(
            {'detail': 'Invalid ticket code format', 'code': 'INVALID_FORMAT'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    device_id = (request.data.get('device_id') or 'admin-panel')[:255]

    with transaction.atomic():
        ticket = (
            Ticket.objects
            .select_for_update(of=('self',))
            .select_related('event', 'tier', 'session', 'booking')
            .filter(unique_code=code)
            .first()
        )
        if ticket is None:
            return Response(
                {'detail': 'Ticket not found.', 'code': 'TICKET_NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not _user_can_manage_event(request.user, ticket.event):
            return Response(
                {
                    'detail': 'You do not have permission to check in this ticket.',
                    'code': 'PERMISSION_DENIED',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        rejection = _rejection_for_ticket(ticket)
        if rejection is not None:
            return rejection

        is_within_window, window_reason = _validate_checkin_window(ticket)
        if not is_within_window:
            return Response(
                {
                    'detail': window_reason,
                    'code': 'OUTSIDE_SLOT_WINDOW',
                    'ticket': _ticket_to_scan_response(ticket),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return _perform_checkin(request, ticket, device_id)


# ===========================================================================
# History — shared by both clients
# ===========================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def checkin_history(request):
    """
    GET /api/checkin/history/?limit=N

    Returns the most recent check-in log entries. Two clients consume
    this:

      • The mobile scanner app reads `ticket_code`, `scanned_at`,
        `scanner` (see QRScannerApp/src/screens/HistoryScreen.js).

      • The admin web UI reads `code`, `checked_in_at` (see
        frontend/src/pages/Checkin/Checkin.js).

    To keep both working we emit BOTH sets of keys with identical
    values.

    `limit` is clamped to [1, 500].
    `scanner` is the username, not the display name or email.
    """
    try:
        limit = int(request.query_params.get('limit', 20))
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 500))

    user = request.user

    query = CheckInLog.objects.all()

    if not (user.is_staff or user.is_superuser):
        if _is_organizer(user):
            query = query.filter(event__organizer=user)
        else:
            query = query.filter(scanner_user=user)

    logs = (
        query
        .select_related('ticket', 'ticket__event', 'event', 'scanner_user')
        .order_by('-scanned_at')[:limit]
    )

    def _event_title(log):
        if log.event:
            return log.event.title
        if log.ticket and log.ticket.event:
            return log.ticket.event.title
        return None

    data = []
    for log in logs:
        scanned_iso = log.scanned_at.isoformat() if log.scanned_at else None
        ticket_code = log.ticket.unique_code if log.ticket else None
        attendee = log.ticket.attendee_name if log.ticket else None
        scanner = log.scanner_user.username if log.scanner_user else None

        data.append({
            'id': str(log.id),

            # Mobile app keys
            'ticket_code': ticket_code,
            'scanned_at': scanned_iso,
            'scanner': scanner,

            # Admin UI keys (aliases)
            'code': ticket_code,
            'checked_in_at': scanned_iso,

            # Shared
            'attendee_name': attendee,
            'event': _event_title(log),
            'status': log.status,
            'device_id': log.scanner_device_id,
            'is_offline': log.is_offline,
        })

    return Response({'history': data, 'count': len(data)})