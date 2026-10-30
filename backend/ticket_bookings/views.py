# backend/ticket_bookings/views.py
"""
Auth views for TicketVolt.

(Header preserved verbatim from the original — see the "Auth views",
"Scanner endpoints", and "Cron endpoints" comments in-line.)

P0 AUTHORIZATION FIX (2026-10-30)
---------------------------------
`get_user_role()` previously returned `'admin'` for ANY `is_staff=True`
user, even one with zero organization memberships. Per the permission
matrix §0:

    "Admin (tenant) = is_staff=True AND OrganizationMembership.role IN
     (OWNER, ADMIN) on at least one org"

An `is_staff=True` user with no org is now correctly reported as `'user'`.
The frontend trusts `user.role` from this endpoint, so this single change
also removes the Users / Settings / Checkin sidebar entries from
org-less staff accounts.

Scanning access (STAFF on an org) is still `can_operate_org` — scanner
operators do need it — but every MUTATING booking action (refund, mark
payment, apply discount, issue tickets, cancel) is now gated by
`can_manage_org` in `booking_api.py`. See that file's header.
"""
import hashlib
import hmac
import json
import os
import re
from datetime import timedelta

from django.conf import settings
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
from .models import Ticket, CheckInLog, UserProfile
from .models_tenancy import OrganizationMembership
from .services.booking_status import reconcile_completed_booking
from .services.tenancy import (
    is_platform_admin,
    can_operate_org,
    user_operator_org_ids,
    user_org_ids,
)

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
# Role helpers
# ---------------------------------------------------------------------------

def get_user_role(user):
    """
    Compute the effective role string for a user.

    P0 FIX (2026-10-30):
    --------------------
    The permission matrix (§0) defines the roles as:

        super_admin = is_superuser
        admin       = is_staff AND member of ≥1 org with role OWNER or ADMIN
        organizer   = membership in MANAGER_ROLES, no is_staff
        staff       = membership with role STAFF, not a manager anywhere  (BUG 23/24)
        user        = everyone else

    Previously this returned `'admin'` for ANY `is_staff=True` user. That
    meant a staff account with zero org memberships was labelled
    `'admin'` — and the frontend showed them Users / Settings / Checkin
    links, none of which they could actually operate (every backend
    permission check for those routes requires `user_org_ids`, which
    was empty).

    BUG 23/24 FIX (2026-10-30):
    ---------------------------
    STAFF (scanner-only) membership is now its own label, `'staff'`.
    Previously a STAFF-only user fell through to `'organizer'` (if
    non-staff) or `'user'` (if staff), even though `can_operate_org`
    grants them every scanner endpoint. The frontend trusts this label
    to render the Checkin entry, so the UI disagreed with the backend.

    Precedence (manager beats staff — a user may hold STAFF on one org
    and OWNER on another):

        superuser                                   → 'super_admin'
        is_staff AND manager-anywhere               → 'admin'
        manager-anywhere (not is_staff)             → 'organizer'
        is_staff AND staff-anywhere                 → 'staff'
        staff-anywhere (not is_staff)               → 'staff'
        otherwise                                   → 'user'

    The P0 fix is preserved: an `is_staff=True` user with *no* org
    membership matches none of the manager/staff branches and still
    resolves to `'user'`.

    Labels only drive the UI. Real authorization remains enforced
    server-side by `can_manage_org` (mutating booking actions) and
    `can_operate_org` (scanning).
    """
    if not user or not user.is_authenticated:
        return 'user'

    if user.is_superuser:
        return 'super_admin'

    # Manager check must run BEFORE the staff-membership check: a user
    # who is STAFF on org A and OWNER/ADMIN on org B is a manager, not
    # a scanner operator.
    is_org_manager = OrganizationMembership.objects.filter(
        user=user,
        role__in=OrganizationMembership.MANAGER_ROLES,
    ).exists()

    if user.is_staff:
        if is_org_manager:
            return 'admin'
        # NOTE: org-less is_staff users deliberately fall through. They
        # may still be STAFF on an org — check that next before giving
        # up and labelling them 'user'.

    elif is_org_manager:
        return 'organizer'

    # BUG 23/24: scanner-only membership gets its own label. This is
    # what makes the Checkin sidebar entry appear for STAFF users and
    # matches what `can_operate_org` already allows on the server.
    #
    # If `OrganizationMembership.STAFF` is not a named constant in this
    # codebase, use `role='staff'` here instead — the intent is "the
    # STAFF tier, not MANAGER_ROLES".
    is_org_staff = OrganizationMembership.objects.filter(
        user=user,
        role=OrganizationMembership.STAFF,
    ).exists()

    if is_org_staff:
        return 'staff'

    # Defensive: is_staff with no manager AND no staff membership means
    # an org-less staff account has sneaked into the app. Log at warning
    # so it's visible in production without failing the request. (This
    # preserves the P0 fix's visibility.)
    if user.is_staff:
        logger.warning(
            "Staff user %s (id=%s) has no org manager or staff membership; "
            "labelling role as 'user'. Promote via OrganizationMembership "
            "or unset is_staff.",
            user.username, user.id,
        )

    return 'user'


def _user_profile_summary(user):
    try:
        profile = user.profile
    except UserProfile.DoesNotExist:
        return {'phone': '', 'whatsapp_number': '', 'is_organizer': False}
    except Exception:
        logger.warning(
            "Could not load UserProfile for user %r in _user_profile_summary",
            getattr(user, 'id', None),
            exc_info=True,
        )
        return {'phone': '', 'whatsapp_number': '', 'is_organizer': False}

    is_org = OrganizationMembership.objects.filter(
        user=user,
        role__in=OrganizationMembership.MANAGER_ROLES,
    ).exists()

    return {
        'phone': getattr(profile, 'phone', '') or '',
        'whatsapp_number': getattr(profile, 'whatsapp_number', '') or '',
        'is_organizer': is_org,
    }


def _get_user_by_email(email):
    if not email:
        return None
    return User.objects.filter(email__iexact=email.strip()).first()


def _user_can_manage_event(user, event):
    """
    Operators of the event's org, or platform admins.

    NOTE (do NOT change to `can_manage_org`):
    This predicate is used by scanning endpoints (checkin_verify,
    checkin_manual, checkin_history, etc.). Scanner operators (STAFF)
    MUST be able to reach those endpoints. Every *mutating* booking
    action in booking_api.py uses `can_manage_org` instead, so STAFF
    can scan but cannot refund.
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


def _perform_checkin(request, ticket, device_id):
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

        # `org_ids` in the JWT claim is the set of orgs the user can
        # OPERATE (scan for). Every frontend / mobile client uses this
        # to pre-populate org pickers. Do not change this to manager-only
        # IDs — scanner operators need to see their org in the list.
        operate_org_ids = [str(oid) for oid in user_operator_org_ids(user)]
        manager_org_ids = [str(oid) for oid in user_org_ids(user)]

        refresh['role'] = role
        refresh['email'] = user.email
        refresh['org_ids'] = operate_org_ids
        refresh['managed_org_ids'] = manager_org_ids

        profile_summary = _user_profile_summary(user)

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
                'org_ids': operate_org_ids,
                'managed_org_ids': manager_org_ids,
                **profile_summary,
            },
        })


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        role = get_user_role(user)
        profile_summary = _user_profile_summary(user)

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
            'org_ids': [str(oid) for oid in user_operator_org_ids(user)],
            'managed_org_ids': [str(oid) for oid in user_org_ids(user)],
            **profile_summary,
        })


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
        return Response(
            {'valid': False, 'detail': 'Signature mismatch.'},
            status=status.HTTP_200_OK,
        )

    ticket = (
        Ticket.objects
        .select_related('event', 'tier', 'session', 'event__organization')
        .filter(unique_code=payload['code'])
        .first()
    )
    if ticket is None:
        return Response(
            {'valid': False, 'detail': 'Ticket not found.'},
            status=status.HTTP_200_OK,
        )

    if not _user_can_manage_event(request.user, ticket.event):
        return Response(
            {
                'valid': False,
                'code': 'PERMISSION_DENIED',
                'detail': 'You do not have permission to verify this ticket.',
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
            .select_related('event', 'tier', 'session', 'booking', 'event__organization')
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

    ticket = (
        Ticket.objects
        .select_related('event', 'tier', 'session', 'booking', 'event__organization')
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
            .select_for_update()
            .select_related('event', 'tier', 'session', 'booking', 'event__organization')
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
        # STAFF may view history for their org. This matches the matrix
        # §4 ("Tenant admin: member list endpoint" is separate; §1.6
        # grants STAFF read-only visibility on org bookings + check-in
        # history). Do NOT narrow to user_org_ids here — that would
        # lock scanner operators out of the page they use to review
        # their own scans.
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

import hmac as _hmac


def _cron_secret_matches(provided: str) -> bool:
    expected = os.environ.get('CRON_SECRET_TOKEN', '').strip()
    if not expected:
        return False
    if not provided:
        return False
    return _hmac.compare_digest(expected, provided)


@csrf_exempt
@require_POST
def run_scheduled_tasks(request):
    provided = (
        request.headers.get('X-Cron-Token')
        or request.headers.get('X-CRON-TOKEN')
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

        return JsonResponse({
            'ok': True,
            'completed': completed_result,
            'sold_out': sold_out_result,
            'token_flush': token_flush_result,
        })
    except Exception as exc:
        logger.exception('Cron task run failed')
        return JsonResponse(
            {'error': 'Task execution failed', 'detail': str(exc)},
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