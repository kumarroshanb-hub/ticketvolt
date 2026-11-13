"""
Auth views for TicketVolt.

P0 AUTHORIZATION FIX (2026-10-30)
---------------------------------
`get_user_role()` previously returned `'admin'` for ANY `is_staff=True`
user, even one with zero organization memberships. Per the permission
matrix §0:

    "Admin (tenant) = is_staff=True AND OrganizationMembership.role IN
     (OWNER, ADMIN) on at least one org"

An `is_staff=True` user with no org is now correctly reported as `'user'`.

MEMBERSHIP-AS-PROPERTY MODEL (2026-11-06)
-----------------------------------------
`get_user_role()` is now a thin delegate to
`tenancy.effective_role_label()`. The label is DERIVED, not stored.
The canonical per-org roles are emitted under `user.memberships[]` and
consumers should use those booleans (`is_owner`, `is_admin`, `is_staff`,
`is_member`, `is_manager`, `is_operator`) for any per-org decision.

ROLE LABEL SEMANTICS (2026-11-06)
--------------------------------
`effective_role_label()` returns the *highest* per-org label the user
holds, which can now legitimately be `'owner'` (not just `'admin'`).
There is no separate "Platform Staff" label — platform admins are
identified by `is_superuser` / `is_platform_admin()`, never by the role
string. Frontend `RoleContext` must therefore accept `'owner'` as a
valid label (frontend fix; backend contract is unchanged in shape).

Scanning access (STAFF on an org) is still `can_operate_org` — scanner
operators do need it — but every MUTATING booking action (refund, mark
payment, apply discount, issue tickets, cancel) is gated by
`can_manage_org` in `booking_api.py`. See that file's header.
"""
import hashlib
import hmac
import json
import os
import re
import uuid as _uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q  # ✅ FIX [#12]: was missing; EventSeatMap uses Q()
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import NotFound
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
from .models import Event, Ticket, CheckInLog, UserProfile
from .services.qr_payload import build_ticket_qr_payload
from .models_tenancy import OrganizationMembership
from .services.booking_status import reconcile_completed_booking
from .services.tenancy import (
    can_operate_org,
    effective_role_label,
    is_platform_admin,
    user_memberships_payload,
    user_operator_org_ids,
    user_org_ids,
    visible_events,
)

from .models_seating import SeatReservation, Seat

# ✅ NEW: `VenueMaster` lives in `models_venue_master` in this tree.
# If your project defines it elsewhere, change this import only.
from .models_venue_master import VenueMaster

import logging

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

logger = logging.getLogger(__name__)

TICKET_SCHEMA_VERSION_V1 = 1
TICKET_SCHEMA_VERSION_V2 = 2
SUPPORTED_SCHEMA_VERSIONS = (
    TICKET_SCHEMA_VERSION_V1,
    TICKET_SCHEMA_VERSION_V2,
)

TICKET_TYPE = 'ticket'
REGISTRATION_TYPE = 'registration'
VALID_PAYLOAD_TYPES = (TICKET_TYPE, REGISTRATION_TYPE)

TICKET_CODE_RE = re.compile(r'^(TIX|REG)[A-Z0-9]{8,32}$')
MAX_QR_PAYLOAD_LENGTH = 2048

CHECKIN_EARLY_GRACE = timedelta(minutes=30)
CHECKIN_LATE_GRACE = timedelta(minutes=15)

_DUMMY_PASSWORD_HASH = make_password('dummy-password-for-timing-equalization')

_SINGLE_SESSION = os.environ.get('SINGLE_SESSION_LOGIN', 'False') == 'True'

# Booking statuses whose SeatReservation rows are still authoritative.
# A reservation attached to a cancelled/refunded booking is stale and
# must not make the seat appear unavailable.
_LIVE_SEAT_RESERVATION_STATUSES = (
    'pending', 'processing', 'paid', 'confirmed', 'completed',
)


# ---------------------------------------------------------------------------
# Signature helpers
# ---------------------------------------------------------------------------

def _get_ticket_signing_secret() -> str:
    secret = os.environ.get('TICKET_SIGNING_SECRET', '').strip()
    if not secret:
        secret = getattr(settings, 'TICKET_SIGNING_SECRET', '') or ''
        secret = secret.strip()
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
    version = payload.get('v')
    if version == TICKET_SCHEMA_VERSION_V1:
        return json.dumps(
            {'v': 1, 'type': TICKET_TYPE, 'code': payload.get('code')},
            separators=(',', ':'),
            sort_keys=True,
        ).encode('utf-8')

    return json.dumps(
        {
            'v': payload.get('v'),
            'type': payload.get('type'),
            'code': payload.get('code'),
        },
        separators=(',', ':'),
        sort_keys=True,
    ).encode('utf-8')


class SigningSecretUnavailable(RuntimeError):
    """Raised when TICKET_SIGNING_SECRET is missing or too short."""


def verify_ticket_signature_or_503(payload: dict) -> tuple[bool, str | None]:
    if not isinstance(payload, dict):
        return False, 'malformed'

    provided_sig = payload.get('sig')
    if not isinstance(provided_sig, str) or not provided_sig:
        return False, 'malformed'

    try:
        secret = _get_ticket_signing_secret()
    except RuntimeError:
        logger.critical(
            "🚨 TICKET_SIGNING_SECRET is unavailable — cannot verify signed "
            "QR payloads. This is a configuration error, not a scan error."
        )
        return False, 'misconfigured'

    expected = hmac.new(
        secret.encode('utf-8'),
        _canonical_ticket_message(payload),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, provided_sig), None


def verify_ticket_signature(payload: dict) -> bool:
    ok, _ = verify_ticket_signature_or_503(payload)
    return ok


def _validate_ticket_payload(data) -> tuple[dict | None, str | None]:
    if not isinstance(data, dict):
        return None, 'Payload must be a JSON object.'

    try:
        serialized = json.dumps(data, separators=(',', ':'))
    except (TypeError, ValueError):
        return None, 'Payload is not serializable.'
    if len(serialized) > MAX_QR_PAYLOAD_LENGTH:
        return None, 'Payload too large.'

    version = data.get('v')
    if version not in SUPPORTED_SCHEMA_VERSIONS:
        return None, f'Unsupported schema version: {version!r}.'

    payload_type = data.get('type')
    if payload_type not in VALID_PAYLOAD_TYPES:
        return None, f'Invalid payload type: {payload_type!r}.'

    if version == TICKET_SCHEMA_VERSION_V1 and payload_type != TICKET_TYPE:
        return None, 'v1 payloads only support type="ticket".'

    code = data.get('code')
    if not isinstance(code, str) or not TICKET_CODE_RE.match(code):
        return None, 'Invalid ticket code.'

    is_reg_code = code.startswith('REG')
    if is_reg_code and payload_type != REGISTRATION_TYPE:
        return None, 'Registration code must have type="registration".'
    if not is_reg_code and payload_type != TICKET_TYPE:
        return None, 'Ticket code must have type="ticket".'

    sig = data.get('sig')
    if not isinstance(sig, str) or not sig:
        return None, 'Missing signature.'

    allowed = {'v', 'type', 'code', 'sig'}
    extra = set(data.keys()) - allowed
    if extra:
        return None, f'Unexpected fields: {sorted(extra)}'

    return {
        'v': version,
        'type': payload_type,
        'code': code,
        'sig': sig,
    }, None


# ---------------------------------------------------------------------------
# Role helpers — now delegating to tenancy.effective_role_label()
# ---------------------------------------------------------------------------

def get_user_role(user):
    """
    Compute the effective role *label* for a user.

    Pure delegate to `tenancy.effective_role_label()`. Kept as a thin
    re-export because several modules import `get_user_role` from here
    (active_sessions_api, dashboard_api, auth_api, serializers).

    Returns one of: 'superuser', 'owner', 'admin', 'manager', 'operator',
    'user'. Note that 'owner' and 'admin' are TENANT labels — they say
    nothing about platform privileges. Platform admins are identified by
    `is_superuser` / `tenancy.is_platform_admin()`, never by this string.

    The label is a UI convenience, NOT a source of truth. For per-org
    access decisions, use `tenancy.can_manage_org` / `can_operate_org`
    or the `memberships[]` array on the user payload.
    """
    return effective_role_label(user)


# ---------------------------------------------------------------------------
# Profile summary
# ---------------------------------------------------------------------------
def _user_profile_summary(user, memberships=None):
    try:
        profile = user.profile
    except UserProfile.DoesNotExist:
        profile = None
    except Exception:
        logger.warning(
            "Could not load UserProfile for user %r in _user_profile_summary",
            getattr(user, 'id', None),
            exc_info=True,
        )
        profile = None

    if memberships is None:
        memberships = user_memberships_payload(user)

    is_manager = any(m.get('is_manager') for m in memberships)
    is_owner = any(m.get('is_owner') for m in memberships)

    return {
        'phone': getattr(profile, 'phone', '') if profile else '',
        'whatsapp_number': getattr(profile, 'whatsapp_number', '') if profile else '',
        'is_organizer': is_manager,  # legacy alias → manager of ≥1 org
        'is_owner': is_owner,        # owner of ≥1 org
    }


def _build_user_payload(user):
    """
    Canonical user payload returned by LoginView / MeView / auth_api.

    Shape is stable:
      {
        id, username, email, first_name, last_name, name,
        role, effective_role,             # same value; derived label
        is_superuser, is_staff, is_active,
        org_ids,        # operator orgs (can scan / operate)
        managed_org_ids,# orgs where user can MANAGE (owner/admin)
        memberships: [...],                # per-org booleans
        phone, whatsapp_number, is_organizer, is_owner,
      }
    """
    role_label = effective_role_label(user)
    memberships = user_memberships_payload(user)

    operate_org_ids = [str(oid) for oid in user_operator_org_ids(user)]
    manager_org_ids = [str(oid) for oid in user_org_ids(user)]

    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'name': user.get_full_name() or user.username,
        'role': role_label,
        'effective_role': role_label,
        'is_superuser': user.is_superuser,
        'is_staff': user.is_staff,
        'is_active': user.is_active,
        'org_ids': operate_org_ids,
        'managed_org_ids': manager_org_ids,
        'memberships': memberships,
        **_user_profile_summary(user, memberships=memberships),
    }


def _get_user_by_email(email):
    if not email:
        return None
    return User.objects.filter(email__iexact=email.strip()).first()


def _user_can_manage_event(user, event):
    """
    Operators of the event's org, or platform admins.
    """
    if not user or not user.is_authenticated:
        return False
    if is_platform_admin(user):
        return True
    if event is None:
        return False
    return can_operate_org(user, event.organization)


def _validate_checkin_window(ticket, now=None):
    now = now or timezone.now()
    if not ticket.session:
        return True, None

    session = ticket.session

    # ✅ FIX [#20]: guard against None start/end on a session row.
    if session.start_time is None or session.end_time is None:
        return True, None

    event = getattr(ticket, 'event', None) or getattr(session, 'event', None)
    early_minutes = getattr(event, 'checkin_opens_minutes_before', 30)
    if early_minutes is None:
        early_minutes = 30
    window_start = session.start_time - timedelta(minutes=max(0, int(early_minutes)))
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
    payload_type = (
        REGISTRATION_TYPE
        if ticket.unique_code.startswith('REG')
        else TICKET_TYPE
    )
    return {
        'id': str(ticket.id),
        'unique_code': ticket.unique_code,
        'code': ticket.unique_code,
        'payload_type': payload_type,
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


# ---------------------------------------------------------------------------
# Centralised lookup: resolve a ticket by code, enforcing tenant access
# *before* returning anything about its existence.
# ---------------------------------------------------------------------------
def _resolve_ticket_for_scan(user, code):
    ticket = (
        Ticket.objects
        .select_related('event', 'event__organization', 'tier', 'session', 'booking')
        .filter(unique_code=code)
        .first()
    )

    if ticket is None:
        return None

    if not _user_can_manage_event(user, ticket.event):
        # ✅ FIX [#14]: log the "exists but not accessible" case on the
        # server so ops can diagnose expired-membership scanners. The
        # HTTP response stays uniform (404-equivalent) to prevent
        # enumeration.
        if ticket.event is not None:
            logger.warning(
                "Scanner access denied: user=%s (id=%s) lacks operator "
                "access to org=%s for ticket %s. Possibly an expired "
                "membership.",
                getattr(user, 'username', '?'),
                getattr(user, 'id', '?'),
                getattr(ticket.event, 'organization_id', '?'),
                ticket.unique_code,
            )
        return None

    return ticket


def _perform_checkin(request, ticket, device_id):
    """
    Perform a check-in for `ticket`.
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
        booking_completed = reconcile_completed_booking(ticket.booking)

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

        from .services.auth_policy import method_allowed, organization_for_user

        if not method_allowed('password', None):
            return Response(
                {'detail': 'Password login is currently disabled.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        user_obj = _get_user_by_email(email)
        if user_obj is not None:
            org = organization_for_user(user_obj, request.data.get('organization_id'))
            if not method_allowed('password', org):
                return Response(
                    {'detail': 'Password login is not enabled for your organization.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        user = None

        if user_obj is not None:
            user = authenticate(
                request=raw_request,
                username=user_obj.username,
                password=password,
            )

        if user is None:
            # Constant-time comparison against a dummy hash so that
            # "no user with that email" and "wrong password" take the
            # same wall time.
            check_password(password, _DUMMY_PASSWORD_HASH)

            # ✅ FIX [#8]: `AxesStandaloneBackend` (first in
            # AUTHENTICATION_BACKENDS) already calls `user_login_failed`
            # when `authenticate()` fails. The explicit call here was a
            # SECOND registration, which double-counted each failed
            # attempt toward AXES_FAILURE_LIMIT. Removed.

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
        role = effective_role_label(user)

        # `org_ids` in the JWT claim is the set of orgs the user can
        # OPERATE (scan for). Do not change this to manager-only IDs —
        # scanner operators need to see their org in the list.
        operate_org_ids = [str(oid) for oid in user_operator_org_ids(user)]
        manager_org_ids = [str(oid) for oid in user_org_ids(user)]

        # NOTE: `role` may now legitimately be 'owner' for org owners.
        # There is no distinct "platform staff" role label — platform
        # admins are flagged via `is_superuser` in the user payload.
        # Frontend RoleContext must treat 'owner' as a valid label.
        refresh['role'] = role
        refresh['email'] = user.email
        refresh['org_ids'] = operate_org_ids
        refresh['managed_org_ids'] = manager_org_ids

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': _build_user_payload(user),
        })


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_build_user_payload(request.user))


# ===========================================================================
# Scanner endpoints — signed QR verification (mobile app)
# ===========================================================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkin_verify(request):
    payload, reason = _validate_ticket_payload(request.data)
    if payload is None:
        return Response(
            {'detail': reason or 'Invalid payload.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ok, err = verify_ticket_signature_or_503(payload)
    if not ok:
        if err == 'misconfigured':
            return Response(
                {
                    'valid': False,
                    'code': 'SERVER_MISCONFIGURED',
                    'detail': (
                        'Server cannot verify signatures: '
                        'TICKET_SIGNING_SECRET is not configured. '
                        'Contact the administrator.'
                    ),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        # ✅ FIX [#5]: align with `checkin_perform` — a bad signature is
        # a 400, not a 200 with `valid: false`.
        return Response(
            {
                'valid': False,
                'detail': 'Signature mismatch.',
                'code': 'SIGNATURE_MISMATCH',
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    ticket = _resolve_ticket_for_scan(request.user, payload['code'])
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
    payload, reason = _validate_ticket_payload(request.data)
    if payload is None:
        return Response(
            {'detail': reason or 'Invalid payload.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ok, err = verify_ticket_signature_or_503(payload)
    if not ok:
        if err == 'misconfigured':
            return Response(
                {
                    'code': 'SERVER_MISCONFIGURED',
                    'detail': (
                        'Server cannot verify signatures: '
                        'TICKET_SIGNING_SECRET is not configured.'
                    ),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {'detail': 'Invalid signature.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    device_id = (request.data.get('device_id') or 'unknown')[:255]

    with transaction.atomic():
        ticket = (
            Ticket.objects
            .select_for_update(of=('self',))
            .select_related(
                'event', 'event__organization',
                'tier', 'session', 'booking',
            )
            .filter(unique_code=payload['code'])
            .first()
        )

        if ticket is None or not _user_can_manage_event(request.user, ticket.event):
            return Response(
                {'detail': 'Ticket not found.'},
                status=status.HTTP_404_NOT_FOUND,
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
# Manual code entry (admin web UI)
# ===========================================================================

def _extract_bare_code(raw_code: str) -> str:
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


# ===========================================================================
# Offline check-in: manifest pack + idempotent sync
# ===========================================================================

def _parse_client_scan_time(value):
    """Best-effort parse of the scanner's ISO timestamp."""
    if not value:
        return timezone.now()
    try:
        from django.utils.dateparse import parse_datetime
        parsed = parse_datetime(str(value))
        if parsed is None:
            return timezone.now()
        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
        # A device clock far in the future is not authoritative.
        if parsed > timezone.now() + timedelta(minutes=5):
            return timezone.now()
        return parsed
    except Exception:
        return timezone.now()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def checkin_offline_pack(request):
    """Download a signed ticket manifest for offline verification.

    The manifest contains the exact QR envelope (`v/type/code/sig`) for
    every ticket, so the device can compare a scanned payload against a
    trusted, pre-downloaded copy without needing the signing secret.
    """
    event_id = request.query_params.get('event')
    if not event_id:
        return Response(
            {'detail': 'event query parameter is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        event_uuid = _uuid.UUID(str(event_id))
    except (ValueError, TypeError, AttributeError):
        return Response(
            {'detail': 'Invalid event id.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    event = (
        Event.objects
        .select_related('organization')
        .filter(id=event_uuid)
        .first()
    )
    if event is None or not _user_can_manage_event(request.user, event):
        return Response(
            {'detail': 'Event not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    session_id = request.query_params.get('session')
    tickets_qs = (
        Ticket.objects
        .filter(event=event)
        .select_related('session', 'tier', 'seat')
        .order_by('unique_code')
    )
    if session_id:
        try:
            session_uuid = _uuid.UUID(str(session_id))
        except (ValueError, TypeError, AttributeError):
            return Response(
                {'detail': 'Invalid session id.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tickets_qs = tickets_qs.filter(session_id=session_uuid)

    now = timezone.now()
    entries = []
    for ticket in tickets_qs:
        signed = build_ticket_qr_payload(ticket)
        entries.append({
            'ticket_id': str(ticket.id),
            'code': ticket.unique_code,
            'type': signed['type'],
            'v': signed['v'],
            'sig': signed['sig'],
            'status': ticket.status,
            'is_checked_in': ticket.status == TicketStatus.USED,
            'checked_in_at': (
                ticket.check_in_time.isoformat() if ticket.check_in_time else None
            ),
            'attendee_name': ticket.attendee_name or '',
            'attendee_email': ticket.attendee_email or '',
            'tier': ticket.tier.name if ticket.tier else None,
            'seat': (
                f'{ticket.seat.row_label}-{ticket.seat.seat_number}'
                if ticket.seat else None
            ),
            'session_id': str(ticket.session_id) if ticket.session_id else None,
            'session_start': (
                ticket.session.start_time.isoformat()
                if ticket.session and ticket.session.start_time else None
            ),
            'session_end': (
                ticket.session.end_time.isoformat()
                if ticket.session and ticket.session.end_time else None
            ),
        })

    manifest_id = hashlib.sha256(
        json.dumps(entries, separators=(',', ':'), sort_keys=True).encode('utf-8')
    ).hexdigest()

    # Shared secret for LAN peer sockets. It is deterministic per event
    # and only returned to authenticated scanner operators, so a random
    # device on the same Wi-Fi cannot inject fake check-ins.
    lan_secret = (
        getattr(settings, 'TICKET_SIGNING_SECRET', '')
        or os.environ.get('TICKET_SIGNING_SECRET', '')
    )
    lan_token = hmac.new(
        lan_secret.encode('utf-8'),
        f'lan:{event.id}'.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()[:32] if lan_secret else ''

    return Response({
        'version': 1,
        'manifest_id': manifest_id,
        'lan_token': lan_token,
        'generated_at': now.isoformat(),
        'server_time': now.isoformat(),
        'event': {
            'id': str(event.id),
            'title': event.title,
            'start_date': (
                event.start_date.isoformat() if event.start_date else None
            ),
            'end_date': event.end_date.isoformat() if event.end_date else None,
            'timezone': event.timezone,
            'organization': event.organization.name,
        },
        'ticket_count': len(entries),
        'tickets': entries,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkin_offline_sync(request):
    """Idempotently apply a scanner outbox batch.

    First successful scan is authoritative. Retries with the same
    `client_id` are idempotent. A scan for a ticket already checked in
    by another device is recorded as a duplicate for review and does not
    fail the batch.
    """
    items = request.data.get('items')
    if not isinstance(items, list) or not items:
        return Response(
            {'detail': 'items must be a non-empty list.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(items) > 200:
        return Response(
            {'detail': 'Maximum 200 offline scans per batch.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    device_id = (request.data.get('device_id') or 'unknown')[:255]
    results = []

    for item in items:
        if not isinstance(item, dict):
            results.append({
                'client_id': None,
                'status': 'rejected',
                'code': 'INVALID_ITEM',
                'message': 'Each item must be an object.',
            })
            continue

        raw_client_id = str(item.get('client_id') or '').strip()[:64]
        payload_source = item.get('payload')
        if not isinstance(payload_source, dict):
            payload_source = {
                key: item.get(key) for key in ('v', 'type', 'code', 'sig')
                if key in item
            }
        payload, reason = _validate_ticket_payload(payload_source)
        code = (payload or {}).get('code') or ''

        if payload is None:
            results.append({
                'client_id': raw_client_id or None,
                'status': 'rejected',
                'code': 'INVALID_PAYLOAD',
                'message': reason or 'Invalid QR payload.',
            })
            continue

        ok, sig_err = verify_ticket_signature_or_503(payload)
        if not ok:
            results.append({
                'client_id': raw_client_id or None,
                'status': 'rejected',
                'code': 'SIGNATURE_MISMATCH',
                'message': (
                    'Server cannot verify signatures.'
                    if sig_err == 'misconfigured'
                    else 'Signature mismatch.'
                ),
            })
            continue

        client_id = raw_client_id
        if not client_id:
            client_id = hashlib.sha256(
                f'{device_id}:{code}:{item.get("scanned_at") or ""}'.encode('utf-8')
            ).hexdigest()[:64]

        # Idempotent retry: this exact scan was already accepted.
        prior = CheckInLog.objects.filter(client_scan_id=client_id).first()
        if prior is not None:
            results.append({
                'client_id': client_id,
                'status': 'idempotent',
                'code': code,
                'message': 'Already synced.',
                'authoritative_scan': prior.scanned_at.isoformat(),
            })
            continue

        scanned_at = _parse_client_scan_time(item.get('scanned_at'))

        try:
            with transaction.atomic():
                ticket = (
                    Ticket.objects
                    .select_for_update(of=('self',))
                    .select_related('event', 'event__organization', 'session', 'booking')
                    .filter(unique_code=code)
                    .first()
                )
                if ticket is None or not _user_can_manage_event(
                    request.user, ticket.event,
                ):
                    results.append({
                        'client_id': client_id,
                        'status': 'not_found',
                        'code': code,
                        'message': 'Ticket not found.',
                    })
                    continue

                if ticket.status in (
                    TicketStatus.REFUNDED,
                    TicketStatus.CANCELLED,
                    TicketStatus.EXPIRED,
                ):
                    results.append({
                        'client_id': client_id,
                        'status': 'rejected',
                        'code': f'TICKET_{ticket.status.upper()}',
                        'message': (
                            f'Ticket has been {ticket.status} and is no longer valid.'
                        ),
                    })
                    continue

                existing = CheckInLog.objects.filter(
                    ticket=ticket, status='success',
                ).order_by('scanned_at').first()
                if ticket.status == TicketStatus.USED or existing is not None:
                    authoritative = existing or CheckInLog.objects.filter(
                        ticket=ticket, status='success',
                    ).order_by('scanned_at').first()
                    CheckInLog.objects.create(
                        ticket=ticket,
                        event=ticket.event,
                        session=ticket.session,
                        scanner_user=request.user,
                        scanner_device_id=device_id,
                        status='duplicate',
                        is_offline=True,
                        synced_at=timezone.now(),
                        client_scan_id=client_id,
                        notes=(
                            'Offline scan rejected as duplicate; first scan is '
                            'authoritative.'
                        ),
                    )
                    results.append({
                        'client_id': client_id,
                        'status': 'duplicate',
                        'code': code,
                        'message': 'Ticket was already checked in. Logged for review.',
                        'authoritative_scan': (
                            authoritative.scanned_at.isoformat()
                            if authoritative else None
                        ),
                    })
                    continue

                log = CheckInLog.objects.create(
                    ticket=ticket,
                    event=ticket.event,
                    session=ticket.session,
                    scanner_user=request.user,
                    scanner_device_id=device_id,
                    scanner_ip=get_client_ip_address(
                        getattr(request, '_request', request)
                    ),
                    status='success',
                    is_offline=True,
                    synced_at=timezone.now(),
                    client_scan_id=client_id,
                    notes='Synced from scanner offline outbox.',
                )
                # scanned_at is auto_now_add; set the captured offline time.
                CheckInLog.objects.filter(pk=log.pk).update(scanned_at=scanned_at)
                log.refresh_from_db(fields=['scanned_at'])

                ticket.status = TicketStatus.USED
                ticket.check_in_time = scanned_at
                ticket.save(update_fields=['status', 'check_in_time'])

                booking_completed = False
                if ticket.booking:
                    booking_completed = reconcile_completed_booking(ticket.booking)

                results.append({
                    'client_id': client_id,
                    'status': 'success',
                    'code': code,
                    'message': 'Offline check-in synced.',
                    'scanned_at': log.scanned_at.isoformat(),
                    'booking_completed': booking_completed,
                })
        except Exception:
            logger.exception('Offline sync failed for ticket %s', code)
            results.append({
                'client_id': client_id,
                'status': 'error',
                'code': code,
                'message': 'Could not sync this scan; it will be retried.',
                'retryable': True,
            })

    return Response({
        'results': results,
        'total': len(results),
        'successful': sum(
            1 for r in results if r['status'] in ('success', 'idempotent')
        ),
        'duplicates': sum(1 for r in results if r['status'] == 'duplicate'),
        'failed': sum(
            1 for r in results
            if r['status'] not in ('success', 'idempotent', 'duplicate')
        ),
        'server_time': timezone.now().isoformat(),
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkin_manual_verify(request):
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

    ticket = _resolve_ticket_for_scan(request.user, code)
    if ticket is None:
        # ✅ FIX [#1]: match `checkin_verify` — return 200 with
        # `valid: false` rather than 404, so the manual and camera
        # endpoints share the same enumeration-safe contract.
        return Response(
            {
                'valid': False,
                'detail': 'Ticket not found',
                'code': 'TICKET_NOT_FOUND',
            },
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
def checkin_manual(request):
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
        # ✅ FIX [#2]: lock only the ticket row (not the joined event /
        # session / booking) to match `checkin_perform` and avoid
        # deadlocks against BookingViewSet writes.
        ticket = (
            Ticket.objects
            .select_for_update(of=('self',))
            .select_related(
                'event', 'event__organization',
                'tier', 'session', 'booking',
            )
            .filter(unique_code=code)
            .first()
        )

        if ticket is None or not _user_can_manage_event(request.user, ticket.event):
            return Response(
                {'detail': 'Ticket not found.', 'code': 'TICKET_NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
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
# History
# ===========================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def checkin_history(request):
    try:
        limit = int(request.query_params.get('limit', 20))
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, 500))

    user = request.user

    query = CheckInLog.objects.all()

    if not is_platform_admin(user):
        # STAFF may view history for their org. Do NOT narrow to
        # user_org_ids here — that would lock scanner operators out of
        # the page they use to review their own scans.
        org_ids = user_operator_org_ids(user)
        query = query.filter(event__organization_id__in=org_ids)

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
            'ticket_code': ticket_code,
            'scanned_at': scanned_iso,
            'scanner': scanner,
            # ✅ FIX [#3]: expose stable IDs for the audit trail.
            'scanner_user_id': log.scanner_user_id,
            'event_id': str(log.event_id) if log.event_id else None,
            'code': ticket_code,
            'checked_in_at': scanned_iso,
            'attendee_name': attendee,
            'event': _event_title(log),
            'status': log.status,
            'device_id': log.scanner_device_id,
            'is_offline': log.is_offline,
        })

    return Response({'history': data, 'count': len(data)})


# ===========================================================================
# Cron endpoints
# ===========================================================================

# NOTE: `hmac` is imported at module top (used by both QR signature
# verification and cron token comparison). No redundant alias needed.

def _cron_secret_matches(provided: str) -> bool:
    expected = os.environ.get('CRON_SECRET_TOKEN', '').strip()
    if not expected:
        logger.error(
            "🚨 CRON_SECRET_TOKEN is not set — all cron calls will be "
            "rejected. Set it in the environment."
        )
        return False
    if not provided:
        return False
    return hmac.compare_digest(expected, provided)


@csrf_exempt
@require_POST
def run_scheduled_tasks(request):
    provided = (
        request.headers.get('X-Cron-Token')
        or ''
    )
    if not provided:
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            provided = auth[7:].strip()

    if not _cron_secret_matches(provided):
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    from .tasks import (
        update_completed_events,
        update_sold_out_events,
        flush_expired_tokens,
        send_donation_receipts,
        send_event_reminders,
    )

    try:
        completed_result = update_completed_events()
        sold_out_result = update_sold_out_events()

        try:
            token_flush_result = flush_expired_tokens()
        except Exception as flush_exc:
            logger.exception('flushexpiredtokens failed inside cron run')
            token_flush_result = {
                'status': 'error',
                'detail': str(flush_exc),
            }

        try:
            receipt_result = send_donation_receipts()
        except Exception as receipt_exc:
            logger.exception('Donation receipt task failed inside cron run')
            receipt_result = {'status': 'error', 'detail': str(receipt_exc)}

        try:
            reminder_result = send_event_reminders()
        except Exception as reminder_exc:
            logger.exception('Reminder task failed inside cron run')
            reminder_result = {'status': 'error', 'detail': str(reminder_exc)}

        return JsonResponse({
            'ok': True,
            'completed': completed_result,
            'sold_out': sold_out_result,
            'token_flush': token_flush_result,
            'donation_receipts': receipt_result,
            'reminders': reminder_result,
        })
    except Exception:
        logger.exception('Cron task run failed')
        return JsonResponse(
            {'error': 'Task execution failed. See server logs.'},
            status=500,
        )


@csrf_exempt
@require_GET
def cron_health(request):
    return JsonResponse({
        'ok': True,
        'service': 'ticketvolt',
        'now': timezone.now().isoformat(),
    })


# ===========================================================================
# Seat Map API Endpoint (For Reserved Seating Frontend Canvas)
# ===========================================================================

class EventSeatMapViewSet(viewsets.ViewSet):
    permission_classes = [AllowAny]
    throttle_scope = 'public_read'

    def list(self, request, event_pk=None):
        import uuid as _uuid
        from django.db.models import Q
        from django.utils import timezone
        from rest_framework import status
        from rest_framework.response import Response
        from .models_seating import SeatReservation
        from .services.membership_access import can_access_event

        try:
            event_uuid = _uuid.UUID(str(event_pk))
        except (ValueError, TypeError, AttributeError):
            return Response(
                {'detail': 'Event not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from .services.tenancy import events_visible_to_buyer
        event = (
            events_visible_to_buyer(request.user)
            .filter(id=event_uuid)
            .first()
        )
        if event is None:
            return Response(
                {'detail': 'Event not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not can_access_event(request.user, event):
            return Response(
                {'detail': 'Event not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        plan = getattr(event, 'venue_plan', None)
        if plan is None or not plan.published_snapshot:
            return Response(
                {'detail': 'No seating layout configured for this event.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # ---- Read ONLY from the frozen snapshot ----
        snap = plan.published_snapshot
        layout = snap.get('layout') or {}
        seats_raw = layout.get('seats', [])
        categories_by_id = {
            c['id']: c for c in (snap.get('categories') or [])
        }
        assignments = snap.get('seat_assignments') or {}

        session_id = request.query_params.get('session')

        reservations_qs = SeatReservation.objects.filter(event=event)
        if session_id:
            # A reservation created without a session applies to the whole
            # event; include it alongside session-specific reservations.
            reservations_qs = reservations_qs.filter(
                Q(session_id=session_id) | Q(session_id__isnull=True)
            )
        now = timezone.now()
        reservations_qs = reservations_qs.filter(
            Q(booking__status__in=_LIVE_SEAT_RESERVATION_STATUSES)
            | Q(status='held', held_until__gt=now)
        )
        reservation_map = {str(r.seat_id): r.status for r in reservations_qs}

        seats_data = []
        for seat in seats_raw:
            cat = categories_by_id.get(assignments.get(seat['id']))
            seats_data.append({
                'id': seat['id'],
                'x_coord': seat['x_coord'],
                'y_coord': seat['y_coord'],
                'row_label': seat['row_label'],
                'seat_number': seat['seat_number'],
                'category_id': cat['id'] if cat else None,
                'category_name': cat['name'] if cat else 'Uncategorized',
                'category_color': cat['hex_color'] if cat else '#94a3b8',
                'price': float(cat['price']) if cat else 0.0,
                'status': reservation_map.get(seat['id'], 'available'),
                'is_accessible': bool(seat.get('is_accessible', False)),
            })

        return Response({
            'canvas_width': layout.get('canvas_width'),
            'canvas_height': layout.get('canvas_height'),
            'background_image': layout.get('background_image'),
            'seats': seats_data,
            'categories': list(categories_by_id.values()),
        })


# ===========================================================================
# ✅ NEW: Venue Master API (frontend: venueMasterService.js → /venue-masters/)
#
# The Create Event wizard's seat-plan step needs a read-only way to fetch
# `VenueMaster` snapshots (master layout + category palette) for both
# "own venue" and "venue master" modes. Without this viewset, every
# `GET /venue-masters/...` returns 404 and the canvas can never render.
#
# List payload (VenueMasterListSerializer):
#   id, version, venue_id, name, city, country, venue_type,
#   has_reserved_seating, has_layout, is_current, created_at,
#   seat_count, category_count
#
# Detail payload (VenueMasterDetailSerializer) additionally includes
# `snapshot`, which carries:
#   snapshot.layout           → { canvas_width, canvas_height, seats[] }
#   snapshot.category_palette → [ { id, name, hex_color, default_price } ]
# ===========================================================================

# ===========================================================================
# Venue Master API (frontend: venueMasterService.js → /venue-masters/)
#
# The Create Event wizard's seat-plan step needs a read-only way to fetch
# `VenueMaster` snapshots (master layout + category palette) for both
# "own venue" and "venue master" modes. Without this viewset, every
# `GET /venue-masters/...` returns 404 and the canvas can never render.
#
# List payload (VenueMasterListSerializer):
#   id, version, venue_id, name, city, country, venue_type,
#   has_reserved_seating, has_layout, is_current, created_at,
#   seat_count, category_count
#
# Detail payload (VenueMasterDetailSerializer) additionally includes
# `snapshot`, which carries:
#   snapshot.layout           → { canvas_width, canvas_height, seats[] }
#   snapshot.category_palette → [ { id, name, hex_color, default_price } ]
# ===========================================================================

class VenueMasterViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only API for venue master snapshots.

    The catalog is CROSS-TENANT by design: any authenticated tenant may
    browse venue versions owned by another organization so it can reuse
    a venue instead of recreating it. An event pins one exact version
    (`EventVenuePlan.venue_master`), so the owning tenant's later edits
    create a new version and leave existing events untouched.

    Endpoints (registered under `/api/venue-masters/`):

      GET  /venue-masters/                    → list (current/latest only)
      GET  /venue-masters/?include_history=1  → list every version
      GET  /venue-masters/?venue_id=<uuid>    → list filtered by venue
      GET  /venue-masters/?is_current=1       → list current snapshots
      GET  /venue-masters/?has_layout=1       → list masters with a layout
      GET  /venue-masters/<id>/               → detail (includes snapshot)

    IMPLEMENTATION NOTES
    --------------------
    * `VenueMaster` is imported at MODULE TOP (see the
      `from .models_venue_master import VenueMaster` line near the top
      of this file). It is NOT re-imported inside `get_queryset()`.
      The previous lazy re-import pulled from `models_seating`, where
      `VenueMaster` does not exist, which caused an `ImportError` on
      every request and a 500 on `/api/venue-masters/`. Importing at
      module top also means a future rename/move fails fast at boot
      instead of on a live request.

    * The list endpoint always emits `{count, results}`. The frontend
      `venueMasterService` tolerates both bare arrays and envelopes,
      but the envelope is consistent with every other list endpoint
      in this project and lets us paginate if the catalog grows.
    """
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # `VenueMaster` is imported at module top — see the note above.
        from django.db.models import Q as _Q

        qs = VenueMaster.objects.select_related('venue').all()

        # --- Explicit filters (also covered by filterset_fields once
        #     DjangoFilterBackend is wired) ---
        venue_id = self.request.query_params.get('venue_id')
        if venue_id:
            qs = qs.filter(venue_id=venue_id)

        is_current = self.request.query_params.get('is_current')
        if is_current is not None and is_current != '':
            truthy = is_current.lower() in ('1', 'true', 'yes', 'on')
            qs = qs.filter(is_current=truthy)

        # Creating a new Event must only offer the LATEST version of each
        # venue. The list endpoint therefore defaults to current rows.
        # Older versions remain retrievable by id (existing events pin
        # them) and can be listed explicitly with ?include_history=1.
        include_history = self.request.query_params.get(
            'include_history', '',
        ).lower() in ('1', 'true', 'yes', 'on')
        if (
            self.action == 'list'
            and is_current in (None, '')
            and not include_history
        ):
            qs = qs.filter(is_current=True)

        has_reserved = self.request.query_params.get('has_reserved_seating')
        if has_reserved is not None and has_reserved != '':
            truthy = has_reserved.lower() in ('1', 'true', 'yes', 'on')
            qs = qs.filter(has_reserved_seating=truthy)

        has_layout = self.request.query_params.get('has_layout')
        if has_layout is not None and has_layout != '':
            truthy = has_layout.lower() in ('1', 'true', 'yes', 'on')
            qs = qs.filter(has_layout=truthy)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                _Q(name__icontains=search)
                | _Q(city__icontains=search)
                | _Q(country__icontains=search)
            )

        # --- Cross-tenant catalog ---
        # VenueMaster is SHARED by design: any authenticated tenant may
        # browse masters from any organization so it can reuse a venue
        # instead of recreating it. The event pins a specific version
        # (EventVenuePlan PROTECT FK), so later edits by the owning
        # tenant create a NEW master and never mutate existing events.
        #
        # `organization_id` remains an optional narrowing filter for
        # admin/debug screens; it does not grant access by itself.
        organization_id = self.request.query_params.get('organization_id')
        if organization_id:
            try:
                _uuid.UUID(str(organization_id))
            except (ValueError, TypeError, AttributeError):
                return qs.none()
            qs = qs.filter(venue__organization_id=organization_id)

        return qs.order_by('-created_at')

    def get_serializer_class(self):
        # Serializers still live in `api/serializers.py`, which imports
        # models from this app. Keep the lazy import here — it is NOT
        # what caused the bug, and there is a real circular-import
        # boundary between views.py and api/serializers.py.
        from .api.serializers import (
            VenueMasterDetailSerializer,
            VenueMasterListSerializer,
        )
        if self.action == 'retrieve':
            return VenueMasterDetailSerializer
        return VenueMasterListSerializer

    def list(self, request, *args, **kwargs):
        """
        Same as ReadOnlyModelViewSet.list but always returns the
        `{count, results}` envelope.
        """
        from rest_framework.response import Response

        queryset = self.filter_queryset(self.get_queryset())

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'count': len(serializer.data),
            'results': serializer.data,
        })