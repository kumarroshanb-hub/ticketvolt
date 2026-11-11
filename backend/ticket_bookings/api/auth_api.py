# backend/ticket_bookings/api/auth_api.py
"""Passwordless authentication & organization-invite endpoints.

Endpoints
---------
POST /api/auth/request-magic-link/   — email a single-use login link (public)
POST /api/auth/verify-magic-link/    — exchange a login OR invite token for JWTs (public)
POST /api/auth/request-otp/          — request a 6-digit OTP via email or WhatsApp (public)
POST /api/auth/verify-otp/           — exchange an OTP for JWTs (public)
POST /api/organizations/<id>/invite/ — Owner/Admin invites a user to the org (auth)

Email contract (aligned with services/booking_emails.py)
--------------------------------------------------------
All delivery goes through ``services/auth_emails.py``:
  • HTML rendered from ``core/templates/email/*.html``
  • ``EmailMultiAlternatives`` + ``safe_send_email`` diagnostics
  • senders return ``{'success': bool, 'message'|'error': str}``
  • delivery is NON-BLOCKING: failures are logged and reported via
    ``email_sent`` flags, never swallowed silently and never 500 the flow.

Security invariants
-------------------
  • Responses on the request path are constant (no email enumeration).
  • Tokens are single-use and time-bounded (login: 15 min, invite: 7 days).
  • Inactive users can neither request nor redeem links.
  • Invite acceptance honours the validity window captured at invite time.
  • Ownership can NEVER be granted via invite (transfer-ownership only).

2026-11-06 review fixes applied here
-------------------------------------
  • §2.2 — membership payload now carries ``is_currently_valid`` /
    ``access_starts_at`` / ``access_ends_at`` (via ``as_dict``) so the UI
    can render deferred-access memberships instead of silently hiding them.
  • §2.3 — invite acceptance is soft-aware: re-inviting a soft-removed
    member reactivates the existing row (preserving ``joined_at``) instead
    of creating a new one, and writes an ``OrganizationMembershipEvent``.
  • C.3  — defence-in-depth: invite acceptance rejects ``role == OWNER``
    even though invite-send already blocks it (and the DB constraint
    backs it up). Ownership moves only via transfer-ownership.
"""
import logging
import secrets
import re
import string
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from ..models import UserProfile, OTPRequest
from ..models_tenancy import (
    Organization,
    OrganizationInvite,
    OrganizationMembership,
    OrganizationMembershipEvent,
    OrgRole,
    log_membership_event,
    snapshot_membership,
)
from ..services import auth_emails
from ..services.tenancy import (
    can_manage_org,
    user_org_ids,
    user_operator_org_ids,
)
from ..views import get_user_role, _user_profile_summary

logger = logging.getLogger(__name__)

MAGIC_LINK_MINUTES = 15
# Reserved accounts that must NEVER be hijackable via magic link / OTP.
SERVICE_ACCOUNTS = frozenset({'whatsapp_bot'})

def _is_service_account(user) -> bool:
    """Return True if user is a reserved service account."""
    return bool(user and user.username in SERVICE_ACCOUNTS)


def _looks_like_service_account_email(email: str) -> bool:
    """Block reserved usernames used as email local-parts (e.g. whatsapp_bot@...)."""
    local = (email or '').split('@', 1)[0].lower()
    return local in SERVICE_ACCOUNTS

# OTP Configuration
OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 5
OTP_MAX_ATTEMPTS = 5
OTP_REQUEST_LIMIT = 3            # max sends per destination per window
OTP_REQUEST_WINDOW_MINUTES = 10


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse_iso(value):
    """Parse an ISO datetime string; return an aware datetime or None."""
    if not value:
        return None
    dt = parse_datetime(str(value))
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _unique_username(email):
    """Collision-safe username derived from an email local-part."""
    base = re.sub(r'[^a-zA-Z0-9_]', '_', (email.split('@')[0] or 'user'))[:140]
    username = base
    n = 1
    while User.objects.filter(username=username).exists():
        username = f"{base}_{n}"[:150]
        n += 1
    return username


def _build_user_payload(user):
    """
    Same shape as LoginView / MeView so the frontend hydrates instantly.

    MEMBERSHIP-AS-PROPERTY MODEL: includes `memberships[]` and
    `effective_role`; `role` remains for backward compatibility but is
    a derived label, not a stored value.

    Each membership dict now includes ``is_currently_valid`` and
    ``access_starts_at`` / ``access_ends_at`` (2026-11-06 review §2.2),
    so the UI can distinguish "member but access starts in 3 days" from
    "member and active now" without re-implementing the window check.
    """
    from ..services.tenancy import (
        effective_role_label,
        user_memberships_payload,
        user_org_ids,
        user_operator_org_ids,
    )

    role_label = effective_role_label(user)
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
        'org_ids': [str(o) for o in user_operator_org_ids(user)],
        'managed_org_ids': [str(o) for o in user_org_ids(user)],
        'memberships': user_memberships_payload(user),
        **_user_profile_summary(user),
    }


def _issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': _build_user_payload(user),
    }


# ===========================================================================
# 1. REQUEST MAGIC LINK (public)
# ===========================================================================
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def request_magic_link(request):
    """User enters an email on the login/register page -> we mail a single-use link."""
    email = (request.data.get('email') or '').lower().strip()
    if not email:
        return Response(
            {'error': 'Email is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # 🛡️ Block service accounts from being hijacked via magic link
    if _looks_like_service_account_email(email):
        logger.warning('🚫 Blocked magic-link request for reserved identifier: %s', email)
        return Response({
            'success': True,
            'message': 'If an account exists, a login link has been sent.',
        })

    user = User.objects.filter(email__iexact=email).first()

    if user is not None and _is_service_account(user):
        logger.warning('🚫 Blocked magic-link request for service account: %s', user.username)
        return Response({
            'success': True,
            'message': 'If an account exists, a login link has been sent.',
        })

    if user is None:
        # Auto-provision (existing code continues...)
        user = User.objects.create_user(
            username=_unique_username(email),
            email=email,
            password=secrets.token_urlsafe(32),
            is_active=True,
        )
        UserProfile.objects.get_or_create(user=user, defaults={'email': email})
        logger.info('✨ Auto-provisioned new passwordless user: %s', email)

    # Inactive users must never receive a login link.
    if not user.is_active:
        logger.info('ℹ️ Magic link requested for inactive user; no-op.')
        return Response({
            'success': True,
            'message': 'If an account exists, a login link has been sent.',
        })

    # get_or_create: users created via invite acceptance may lack a profile.
    profile, _ = UserProfile.objects.get_or_create(
        user=user, defaults={'email': user.email},
    )
    token = secrets.token_urlsafe(48)
    profile.magic_token = token
    profile.magic_token_expires = timezone.now() + timedelta(
        minutes=MAGIC_LINK_MINUTES,
    )
    profile.save(update_fields=['magic_token', 'magic_token_expires'])

    login_link = f"{settings.FRONTEND_URL}/auth/verify?token={token}"

    # ✅ Aligned: service-layer send with diagnostics — NEVER silent.
    result = auth_emails.send_magic_link_email(user, login_link)
    if not result['success']:
        logger.warning(
            '⚠️ Magic-link email not delivered for %s: %s',
            user.email, result.get('error'),
        )

    # Constant response — prevents email enumeration.
    return Response({
        'success': True,
        'message': 'If an account exists, a login link has been sent.',
    })

# Reuse the existing 'login' throttle rate for this login-equivalent endpoint.
request_magic_link.cls.throttle_scope = 'login'


# ===========================================================================
# 2. VERIFY MAGIC LINK (public) — login token OR invite token
# ===========================================================================
@api_view(['POST'])
@permission_classes([AllowAny])
def verify_magic_link(request):
    token = request.data.get('token')
    if not token:
        return Response(
            {'error': 'Invalid token.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ---------------------------------------------------------------
    # 2a. Organization invite token
    # ---------------------------------------------------------------
    # ✅ 2026-11-06 §2.3: lock the invite row so two simultaneous
    # verifications can't both accept it. The whole acceptance is one
    # transaction so a failed audit write can't leave a half-applied state.
    invite = OrganizationInvite.objects.filter(token=token).first()
    if invite is not None:
        if invite.is_expired() or invite.accepted_at:
            return Response(
                {'error': 'Link expired or already used.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # 🛡️ Block service accounts from being hijacked via invite acceptance
        if _looks_like_service_account_email(invite.email):
            logger.warning('🚫 Blocked invite acceptance for reserved email: %s',
                           invite.email)
            return Response(
                {'error': 'Invalid or expired link.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ✅ C.3 defence-in-depth: invite-send already rejects role=OWNER,
        #    and the DB constraint backs it up — but never trust that a
        #    persisted invite row is well-formed. Ownership moves only
        #    via transfer-ownership, never via invite acceptance.
        if invite.role == OrgRole.OWNER:
            logger.warning(
                '🚫 Blocked invite acceptance with OWNER role: invite=%s org=%s',
                invite.pk, invite.organization_id,
            )
            return Response(
                {'error': 'Ownership cannot be transferred via invite.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # Re-fetch under a row lock to serialise concurrent accepts.
            invite = (
                OrganizationInvite.objects
                .select_for_update()
                .get(pk=invite.pk)
            )
            if invite.accepted_at or invite.is_expired():
                return Response(
                    {'error': 'Link expired or already used.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # ✅ C.3: re-check under the lock — the row could have been
            #    mutated between the unlocked read and the lock acquisition.
            if invite.role == OrgRole.OWNER:
                logger.warning(
                    '🚫 Blocked invite acceptance with OWNER role (locked): '
                    'invite=%s org=%s',
                    invite.pk, invite.organization_id,
                )
                return Response(
                    {'error': 'Ownership cannot be transferred via invite.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user = User.objects.filter(email__iexact=invite.email).first()
            if user is None:
                # Passwordless account creation
                user = User.objects.create_user(
                    username=_unique_username(invite.email),
                    email=invite.email,
                    password=secrets.token_urlsafe(32),  # hashed once by create_user
                )
            if not user.is_active:
                return Response(
                    {'error': 'Account is disabled.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

            UserProfile.objects.get_or_create(
                user=user, defaults={'email': user.email},
            )

            # ✅ 2026-11-06 §2.3: soft-aware upsert.
            #   • existing row (any state) → update in place, clear removed_at,
            #     preserve joined_at, emit ACCEPTED / REACTIVATED / ROLE_CHANGED.
            #   • no row → create fresh, emit ACCEPTED.
            existing = (
                OrganizationMembership.objects
                .select_for_update()
                .filter(organization=invite.organization, user=user)
                .first()
            )
            before = snapshot_membership(existing)

            if existing is not None and getattr(existing, 'is_owner', False):
                return Response(
                    {
                        'error': (
                            'This user is the organization owner. '
                            'Ownership changes only through transfer-ownership.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if existing is None:
                membership = OrganizationMembership.objects.create(
                    organization=invite.organization,
                    user=user,
                    role=invite.role,
                    is_active=True,
                    valid_from=invite.valid_from,
                    valid_until=invite.valid_until,
                    removed_at=None,
                )
                event_type = OrganizationMembershipEvent.EventType.ACCEPTED
            else:
                was_removed = existing.removed_at is not None
                role_changed = existing.role != invite.role
                existing.role = invite.role
                existing.is_active = True
                existing.valid_from = invite.valid_from
                existing.valid_until = invite.valid_until
                existing.removed_at = None
                existing.save(update_fields=[
                    'role', 'is_active', 'valid_from', 'valid_until', 'removed_at',
                ])
                membership = existing
                if was_removed:
                    event_type = OrganizationMembershipEvent.EventType.REACTIVATED
                elif role_changed:
                    event_type = OrganizationMembershipEvent.EventType.ROLE_CHANGED
                else:
                    event_type = OrganizationMembershipEvent.EventType.ACCEPTED

            invite.accepted_at = timezone.now()
            invite.save(update_fields=['accepted_at'])

            log_membership_event(
                organization=invite.organization,
                membership=membership,
                user=user,
                event_type=event_type,
                actor=invite.invited_by,
                before=before,
                after=snapshot_membership(membership),
            )

        logger.info(
            '✅ Invite accepted (%s): user=%s org=%s role=%s access_from=%s',
            event_type, user.username, invite.organization.slug,
            invite.role, invite.valid_from,
        )
        return Response(_issue_tokens(user), status=status.HTTP_200_OK)

    # ---------------------------------------------------------------
    # 2b. Standard login token
    # ---------------------------------------------------------------
    profile = (
        UserProfile.objects
        .filter(magic_token=token, magic_token_expires__gte=timezone.now())
        .select_related('user')
        .first()
    )
    if profile is None or not profile.user.is_active:
        return Response(
            {'error': 'Invalid or expired login link.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Single-use: invalidate immediately.
    profile.magic_token = None
    profile.magic_token_expires = None
    profile.save(update_fields=['magic_token', 'magic_token_expires'])

    logger.info('✅ Magic-link login: user=%s', profile.user.username)
    return Response(_issue_tokens(profile.user), status=status.HTTP_200_OK)


# ===========================================================================
# 3. REQUEST OTP (public)
# ===========================================================================
def _generate_otp() -> str:
    return ''.join(secrets.choice(string.digits) for _ in range(OTP_LENGTH))

def _normalize_otp_destination(identifier: str, channel: str) -> str:
    if channel == OTPRequest.CHANNEL_EMAIL:
        return identifier.lower()
    return re.sub(r'\D', '', identifier)

def _dispatch_otp(otp_request, otp: str) -> dict:
    if otp_request.channel == OTPRequest.CHANNEL_EMAIL:
        # 🛡️ Block service accounts from OTP hijacking
        if _looks_like_service_account_email(otp_request.destination):
            logger.warning('🚫 Blocked OTP request for reserved identifier: %s',
                           otp_request.destination)
            return {'success': True, 'message': 'queued'}   # silent success (no enum)

        user = User.objects.filter(email__iexact=otp_request.destination).first()

        if user is not None and _is_service_account(user):
            logger.warning('🚫 Blocked OTP request for service account: %s',
                           user.username)
            return {'success': True, 'message': 'queued'}

        if user is None:
            user = User.objects.create_user(
                username=_unique_username(otp_request.destination),
                email=otp_request.destination,
                password=secrets.token_urlsafe(32),
                is_active=True,
            )
            UserProfile.objects.get_or_create(user=user, defaults={'email': user.email})
        return auth_emails.send_otp_email(user, otp, OTP_EXPIRY_MINUTES)

    # Phone / WhatsApp channel — service accounts never have phone numbers
    # on file, but block the reserved local-part anyway for defence-in-depth.
    if _looks_like_service_account_email(otp_request.destination):
        logger.warning('🚫 Blocked OTP request for reserved identifier: %s',
                       otp_request.destination)
        return {'success': True, 'message': 'queued'}

    logger.info('📱 OTP queued for %s via %s (delivery integration pending)',
                otp_request.destination, otp_request.channel)
    return {'success': True, 'message': 'queued'}

@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def request_otp(request):
    """Request a 6-digit OTP via email or WhatsApp (public endpoint)."""
    identifier = (request.data.get('identifier') or '').strip()
    channel = (request.data.get('channel') or OTPRequest.CHANNEL_EMAIL).strip().lower()

    if not identifier:
        return Response({'error': 'Email or phone number is required.'}, status=status.HTTP_400_BAD_REQUEST)
    if channel not in dict(OTPRequest.CHANNEL_CHOICES):
        return Response({'error': f'Invalid channel: {channel!r}'}, status=status.HTTP_400_BAD_REQUEST)

    # Validate format based on channel
    if channel == OTPRequest.CHANNEL_EMAIL:
        if '@' not in identifier:
            return Response({'error': 'Invalid email address.'}, status=status.HTTP_400_BAD_REQUEST)
    else:
        digits = re.sub(r'\D', '', identifier)
        if not (7 <= len(digits) <= 15):
            return Response({'error': 'Invalid phone number.'}, status=status.HTTP_400_BAD_REQUEST)

    # Normalize the identifier (lowercase email, strip non-digits from phone)
    identifier = _normalize_otp_destination(identifier, channel)

    # 🛡️ Block service accounts from OTP hijacking (early-reject)
    if _looks_like_service_account_email(identifier):
        logger.warning('🚫 Blocked OTP request for reserved identifier: %s', identifier)
        return Response({
            'success': True,
            'message': 'If the address is valid, an OTP has been sent.',
        })

    # Rate-limit: max 3 sends per destination per 10-minute window
    window_start = timezone.now() - timedelta(minutes=OTP_REQUEST_WINDOW_MINUTES)
    recent = OTPRequest.objects.filter(
        destination=identifier, created_at__gte=window_start
    ).count()
    if recent >= OTP_REQUEST_LIMIT:
        return Response({
            'error': 'Too many requests. Please try again in a few minutes.'
        }, status=status.HTTP_429_TOO_MANY_REQUESTS)

    # Invalidate any earlier unverified OTPs for this destination
    OTPRequest.objects.filter(
        destination=identifier, verified_at__isnull=True
    ).update(expires_at=timezone.now())

    # Generate and store hashed OTP
    otp = _generate_otp()
    otp_request = OTPRequest.objects.create(
        destination=identifier,
        channel=channel,
        otp_hash=make_password(otp),
        expires_at=timezone.now() + timedelta(minutes=OTP_EXPIRY_MINUTES),
        max_attempts=OTP_MAX_ATTEMPTS,
    )

    # Dispatch the OTP (auto-provision user if needed)
    result = _dispatch_otp(otp_request, otp)
    if not result.get('success'):
        logger.warning(
            '⚠️ OTP delivery failed for %s (%s): %s',
            identifier, channel, result.get('error')
        )

    # Constant response — prevents enumeration
    return Response({
        'success': True,
        'message': 'If the address is valid, an OTP has been sent.',
    })

request_otp.cls.throttle_scope = 'login'


# ===========================================================================
# 4. VERIFY OTP (public)
# ===========================================================================
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def verify_otp(request):
    identifier = (request.data.get('identifier') or '').strip()
    channel = (request.data.get('channel') or OTPRequest.CHANNEL_EMAIL).strip().lower()
    code = (request.data.get('code') or '').strip()

    if not identifier or not code:
        return Response({'error': 'identifier and code are required.'}, status=status.HTTP_400_BAD_REQUEST)

    identifier = _normalize_otp_destination(identifier, channel)

    otp_request = (
        OTPRequest.objects
        .filter(destination=identifier, channel=channel, verified_at__isnull=True)
        .order_by('-created_at')
        .first()
    )
    if otp_request is None or otp_request.is_expired() or otp_request.attempts_exhausted():
        return Response({'error': 'This code has expired. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

    # Consume an attempt BEFORE checking (thwarts brute force)
    otp_request.attempts += 1
    otp_request.save(update_fields=['attempts'])

    if not check_password(code, otp_request.otp_hash):
        remaining = otp_request.max_attempts - otp_request.attempts
        if remaining <= 0:
            return Response({'error': 'Too many incorrect attempts. Please request a new code.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'error': f'Incorrect code. {remaining} attempt(s) remaining.'}, status=status.HTTP_400_BAD_REQUEST)

    # Success — mark consumed
    otp_request.verified_at = timezone.now()
    otp_request.save(update_fields=['verified_at'])

    # Resolve the user
    user = User.objects.filter(email__iexact=identifier, is_active=True).first()
    if user is None:
        # Phone-channel: match against stored phone / whatsapp_number
        profile = (
            UserProfile.objects
            .filter(Q(phone=identifier) | Q(whatsapp_number=identifier))
            .select_related('user')
            .first()
        )
        user = profile.user if profile else None

    if user is None or not user.is_active:
        return Response({'error': 'Account not found or disabled.'}, status=status.HTTP_400_BAD_REQUEST)

    return Response(_issue_tokens(user), status=status.HTTP_200_OK)

verify_otp.cls.throttle_scope = 'login'


# ===========================================================================
# 5. SEND ORGANIZATION INVITE (Owner/Admin only)
# ===========================================================================
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_organization_invite(request, org_id):
    # Resolve the Organization object FIRST — can_manage_org takes
    # (user, organization), not an organization_id kwarg.
    try:
        org = Organization.objects.get(id=org_id)
    except (Organization.DoesNotExist, ValueError, TypeError):
        return Response(
            {'error': 'Organization not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not can_manage_org(request.user, org):
        return Response(
            {'error': 'Permission denied.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    email = (request.data.get('email') or '').strip().lower()
    role = (request.data.get('role') or OrgRole.MEMBER).strip().lower()

    if not email:
        return Response(
            {'error': 'Email is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if role not in dict(OrgRole.choices):
        return Response(
            {'error': f'Invalid role: {role!r}'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # ⚠️ Ownership is deliberately rejected here. This is the primary guard;
    #    it is backed by (a) the defensive check in verify_magic_link's
    #    invite-acceptance path (C.3) and (b) a DB constraint on
    #    OrganizationInvite.role that excludes OWNER. Ownership moves only
    #    via transfer-ownership — never via invite.
    if role == OrgRole.OWNER:
        return Response(
            {'error': 'Ownership moves only via transfer-ownership.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if role == OrgRole.ADMIN:
        is_owner = (
            request.user.is_superuser
            or OrganizationMembership.objects.filter(
                organization=org, user=request.user, is_owner=True,
                removed_at__isnull=True,
            ).exists()
        )
        if not is_owner:
            return Response(
                {'error': 'Only the organization owner can invite admins.'},
                status=status.HTTP_403_FORBIDDEN,
            )

    # ✅ §2.3: block re-inviting an existing *active* member, but allow
    # re-inviting a soft-removed one (that's the whole point of the fix).
    if OrganizationMembership.objects.filter(
        organization=org, user__email__iexact=email,
        removed_at__isnull=True, is_active=True,
    ).exists():
        return Response(
            {'error': 'User is already a member.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    valid_from = _parse_iso(request.data.get('valid_from')) or timezone.now()
    valid_until = _parse_iso(request.data.get('valid_until'))

    # Replace any stale pending invite so only one live link exists.
    OrganizationInvite.objects.filter(
        organization=org, email=email, accepted_at__isnull=True,
    ).delete()
    invite = OrganizationInvite.objects.create(
        organization=org,
        email=email,
        role=role,
        invited_by=request.user,
        valid_from=valid_from,
        valid_until=valid_until,
    )

    # ✅ §2.3: audit the invite creation (best-effort).
    log_membership_event(
        organization=org,
        user=None,           # invitee may not have an account yet
        membership=None,     # membership is created on acceptance
        event_type=OrganizationMembershipEvent.EventType.INVITED,
        actor=request.user,
        after={
            'email': email,
            'role': role,
            'valid_from': valid_from.isoformat(),
            'valid_until': valid_until.isoformat() if valid_until else None,
        },
    )

    invite_link = f"{settings.FRONTEND_URL}/invite/accept?token={invite.token}"

    # ✅ Aligned: non-blocking delivery; result surfaced to the caller.
    email_result = auth_emails.send_organization_invite_email(invite, invite_link)
    if not email_result['success']:
        logger.warning(
            '⚠️ Invite email not delivered for %s: %s',
            email, email_result.get('error'),
        )

    return Response({
        'success': True,
        'message': f'Invite created for {email}.',
        'email_sent': email_result['success'],
        'email_error': email_result.get('error'),
        # ✅ §2.2: surface the deferred-access window to the caller (and
        #    ultimately the frontend can render it in the invite email copy).
        'valid_from': invite.valid_from.isoformat(),
        'valid_until': invite.valid_until.isoformat() if invite.valid_until else None,
        'access_starts_in_future': invite.valid_from > timezone.now(),
    })