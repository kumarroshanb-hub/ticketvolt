"""
Tenant (Organization) models.

Design:
• Organization        — the tenant object. Every business entity
                        (Event, Venue, Discount, CancellationPolicy)
                        hangs off exactly one Organization.
• OrganizationMembership — a user's role WITHIN one org. Replaces the
                        flat UserProfile.is_organizer flag.
• OrganizationContact — the org's CRM view of a person, whether or not
                        they have a User account. Populated lazily on
                        every booking that lands on this org.
• OrganizationInvite  — tracks pending email invitations (Magic Link flow).
• OrganizationMembershipEvent — append-only audit trail for membership
                        lifecycle changes (invite acceptance, role change,
                        deactivation, removal). See 2026-11-06 review §2.3.

Role hierarchy (6-tier):
  Platform tier : Super Admin  (User.is_superuser / is_staff)  — NOT a membership
  Tenant tier   : Owner > Admin > Staff > Member               — OrganizationMembership.role
  Public tier   : Member-less registered user / Guest          — no membership row

  NOTE: "Platform Staff" is NOT a role — the platform tier is the
  boolean pair `User.is_superuser` / `User.is_staff`. Do not add a
  membership role for platform operators.

Single-owner invariant (2026-11-06):
  An Organization has AT MOST ONE live OWNER at any time. This is
  enforced at three layers:
    1. DB   — UniqueConstraint `one_live_owner_per_org` on
              OrganizationMembership.
    2. Model — OrganizationMembership.save() refuses a second live OWNER.
    3. Service — assign_owner / transfer_ownership are the ONLY endpoints
              that may create or mutate a live OWNER membership.
  `Organization.owner` is a DERIVED property (live OWNER membership's
  user), NOT a stored FK. There is no denormalized owner column.

IMPORTANT (2026-11-06 — membership-as-property model):
  • A `User` is ALWAYS a "regular user" — a person with a login.
  • A user's *roles* are properties of their **memberships**, not of
    the user row itself. There is no `user.role` column and there is no
    single "the user's role" concept in the data model.
  • `user.role` / `user.effective_role` / `user.memberships` are DERIVED
    labels emitted by the API for UI convenience. They are NOT stored.
  • "member" is NOT a user role — it is a property of a membership
    (`membership.is_member == membership.role == 'member'`). A single
    user can hold MEMBER on org A and OWNER on org B simultaneously.
  • "owner" is likewise a per-org role, not a global role. A user is an
    owner *of a specific org*, not "an owner" globally.

The security model remains:
  • `can_manage_org(user, org)`  → user is OWNER/ADMIN of `org`.
  • `can_operate_org(user, org)` → user is OWNER/ADMIN/STAFF of `org`.
  • `owns_org(user, org)`        → user is OWNER of `org`.
None of these look at any global "user.role".
"""
import logging
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify

logger = logging.getLogger(__name__)


class Organization(models.Model):
    """
    A tenant. "Malayalam Academy HK", "Kala", etc.

    Platform-level admins (User.is_superuser) can see every
    Organization. Everyone else is scoped to the Organizations they are
    a member of.

    ✅ FIX [OWNER-AS-PROPERTY]: there is no `owner` FK column. Ownership
    is derived from the live OWNER `OrganizationMembership` row. This
    keeps the Platform tier strictly above every tenant tier and removes
    the dual-source-of-truth bug class (owner FK out of sync with
    memberships).

    The org can exist in an *unowned* state until a superuser assigns a
    tenant OWNER via the `assign-owner` / `transfer-ownership` endpoints.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200, unique=True)

    # Per-tenant display config. Mirrors the fields that used to live
    # on SystemSettings; seeded from SystemSettings on create so a new
    # tenant starts with the platform-configured display config. Any
    # field explicitly supplied by the caller overrides the seed.
    currency_code = models.CharField(max_length=3, default='INR')
    currency_symbol = models.CharField(max_length=8, default='₹')
    currency_locale = models.CharField(max_length=10, default='en-IN')
    country = models.CharField(max_length=100, default='India')
    country_code = models.CharField(max_length=3, default='IN')
    default_timezone = models.CharField(max_length=50, default='Asia/Kolkata')
    org_email = models.EmailField(blank=True, default='')
    org_logo_url = models.URLField(blank=True, default='')
    email_from_name = models.CharField(max_length=120, blank=True, default='')

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [models.Index(fields=['slug'])]

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:180] or 'org'
            candidate = base
            n = 1
            while Organization.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                n += 1
                candidate = f'{base}-{n}'
            self.slug = candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    # ---- Derived owner (no FK column) ----------------------------------
    #
    # These are read-only conveniences. Writes MUST go through
    # services.tenancy.assign_owner / transfer_ownership.

    @property
    def owner(self):
        """The user holding the live OWNER membership, or None.

        Relies on the `one_live_owner_per_org` DB constraint, so
        `.first()` is safe and deterministic.
        """
        m = self.memberships.filter(
            role=OrganizationMembership.OrgRole.OWNER,
            removed_at__isnull=True,
            is_active=True,
        ).select_related('user').first()
        return m.user if m else None

    @property
    def owner_id(self):
        o = self.owner
        return o.id if o else None


class OrganizationMembership(models.Model):
    """
    A user's role inside one Organization.

    This is the ONLY place tenant roles live. `User.is_staff` /
    `is_superuser` remain the platform roles.

    A user may hold *several* memberships (one per org), each with a
    different role. There is no single "user role" in the data model —
    `user.effective_role` is a UI label derived from these rows.

    Single-owner invariant:
      At most one live (role=OWNER, removed_at IS NULL, is_active=True)
      membership exists per Organization. Enforced by
      `one_live_owner_per_org`. `save()` is guarded too, so callers that
      bypass the service layer fail loudly instead of silently creating a
      second owner.

    History (2026-11-06 review §2.3):
      Removing a member is a SOFT delete (`removed_at` + `is_active=False`)
      rather than a row deletion, so re-inviting the same user preserves the
      original `joined_at` and the gap between stints. A role change
      (`transfer_ownership`) writes an `OrganizationMembershipEvent` row.
      `_active_membership_filter` in services.tenancy MUST exclude
      `removed_at__isnull=False` rows — see that file for the matching change.
    """
    class OrgRole(models.TextChoices):
        OWNER = 'owner', 'Owner'
        ADMIN = 'admin', 'Admin'
        STAFF = 'staff', 'Staff'      # scanner / check-in only
        MEMBER = 'member', 'Member'   # registered attendee with an account
        # NOTE: 'customer' removed in the 6-tier refactor.
        # A person who merely bought a ticket and has no account is a
        # Guest (no membership row); one who has an account is a Member.
        # NOTE: "Platform Staff" is not a tenant role — it is
        # `User.is_staff`. Do not add it here.

    # Roles that can manage the tenant (see events, bookings, etc.)
    MANAGER_ROLES = (OrgRole.OWNER, OrgRole.ADMIN)
    # Roles that can perform operational actions (check-in)
    OPERATOR_ROLES = (OrgRole.OWNER, OrgRole.ADMIN, OrgRole.STAFF)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='memberships',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='org_memberships',
    )
    role = models.CharField(
        max_length=20, choices=OrgRole.choices, default=OrgRole.MEMBER,
    )
    # Optional per-org profile data — the org's own view of the person.
    display_name = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    # ✅ Time-bounded membership fields for paid/temporary access
    valid_from = models.DateTimeField(default=timezone.now)
    valid_until = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Leave blank for indefinite/lifetime membership."
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Manual override to disable access without deleting the row."
    )

    # ✅ NEW (2026-11-06 review §2.3): soft-delete marker.
    # Set when the member is removed; cleared on re-invite acceptance.
    # Rows with removed_at set are excluded from all active-membership
    # queries. Do NOT use `.delete()` in remove_member anymore.
    removed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set when the member was removed. NULL = never removed.",
    )

    class Meta:
        # Historical row-per-(org,user) uniqueness. Because removal is a
        # soft delete and re-invite uses update_or_create on the same
        # (org, user) pair, this remains correct — a soft-removed row is
        # mutated back to live rather than duplicated.
        unique_together = [('organization', 'user')]
        ordering = ['-joined_at']
        indexes = [
            models.Index(fields=['organization', 'role']),
            models.Index(fields=['user', 'role']),
            # Speeds up the "is there an active membership?" lookups.
            models.Index(fields=['organization', 'user', 'removed_at']),
        ]
        constraints = [
            # At most one live OWNER per org.
            models.UniqueConstraint(
                fields=['organization'],
                condition=Q(role='owner', removed_at__isnull=True, is_active=True),
                name='one_live_owner_per_org',
            ),
            # At most one live membership per (org, user).
            # (Redundant with unique_together for *rows*, but guards the
            #  live set explicitly so a future re-introduction of removed
            #  rows as separate records cannot break the active-membership
            #  invariant.)
            models.UniqueConstraint(
                fields=['organization', 'user'],
                condition=Q(removed_at__isnull=True),
                name='one_live_membership_per_user_per_org',
            ),
        ]

    def __str__(self):
        return f'{self.user.username} @ {self.organization.slug} ({self.role})'

    def save(self, *args, **kwargs):
        """Refuse a second live OWNER outside the ownership endpoints.

        The DB constraint is the backstop; this check raises a clear
        domain error before we hit an IntegrityError. assign_owner /
        transfer_ownership are expected to demote the previous OWNER
        first, inside a transaction.
        """
        if (
            self.role == self.OrgRole.OWNER
            and self.removed_at is None
            and self.is_active
        ):
            qs = OrganizationMembership.objects.filter(
                organization=self.organization,
                role=self.OrgRole.OWNER,
                removed_at__isnull=True,
                is_active=True,
            ).exclude(pk=self.pk)
            if qs.exists():
                raise ValidationError(
                    'This organization already has a live OWNER. '
                    'Use transfer-ownership or assign-owner.'
                )
        super().save(*args, **kwargs)

    # ---- Role predicates (per-org, not per-user) ----

    @property
    def is_owner(self):
        return self.role == self.OrgRole.OWNER

    @property
    def is_admin(self):
        return self.role == self.OrgRole.ADMIN

    @property
    def is_staff(self):
        """STAFF-only (scanner operator)."""
        return self.role == self.OrgRole.STAFF

    @property
    def is_member(self):
        """MEMBER-only (registered attendee with an account)."""
        return self.role == self.OrgRole.MEMBER

    @property
    def is_manager(self):
        """Owner / Admin — can mutate tenant data."""
        return self.role in self.MANAGER_ROLES

    @property
    def is_operator(self):
        """Owner / Admin / Staff — can run the check-in scanner."""
        return self.role in self.OPERATOR_ROLES

    # ---- Membership-as-property summary (for serializers) ----

    def is_currently_valid(self, now=None):
        """True iff this membership grants access *right now*.

        Respects soft-delete (`removed_at`), the manual `is_active`
        toggle, and the [valid_from, valid_until] window.
        """
        if self.removed_at is not None:
            return False
        now = now or timezone.now()
        return (
            self.is_active
            and self.valid_from <= now
            and (self.valid_until is None or self.valid_until >= now)
        )

    def as_dict(self):
        """Stable payload shape consumed by the frontend.

        Includes ``is_currently_valid`` and the raw window so the UI can
        render "access starts on X" / "access expired on Y" states without
        having to re-implement the time-bounded logic client-side
        (2026-11-06 review §2.2).
        """
        now = timezone.now()
        return {
            'id': str(self.id),
            'organization_id': str(self.organization_id),
            'organization_name': self.organization.name,
            'organization_slug': self.organization.slug,
            'role': self.role,
            'is_owner': self.is_owner,
            'is_admin': self.is_admin,
            'is_staff': self.is_staff,
            'is_member': self.is_member,
            'is_manager': self.is_manager,
            'is_operator': self.is_operator,
            'is_active': self.is_active,
            # ✅ NEW — single flag the UI can branch on (§2.2)
            'is_currently_valid': self.is_currently_valid(now=now),
            'access_starts_at': self.valid_from.isoformat() if self.valid_from else None,
            'access_ends_at': self.valid_until.isoformat() if self.valid_until else None,
            'valid_from': self.valid_from.isoformat() if self.valid_from else None,
            'valid_until': self.valid_until.isoformat() if self.valid_until else None,
            'joined_at': self.joined_at.isoformat() if self.joined_at else None,
            'removed_at': self.removed_at.isoformat() if self.removed_at else None,
        }

    # ---- Soft-delete helpers (§2.3) ----

    def soft_remove(self, *, when=None):
        """Mark this membership as removed without deleting the row.

        Re-inviting the same (org, user) will flip ``removed_at`` back to
        NULL via ``update_or_create`` in ``verify_magic_link``, preserving
        the original ``joined_at``.
        """
        self.removed_at = when or timezone.now()
        self.is_active = False
        self.save(update_fields=['removed_at', 'is_active'])

    def reactivate(self, *, role=None, valid_from=None, valid_until=None, when=None):
        """Clear the soft-delete marker and optionally reset the window."""
        self.removed_at = None
        self.is_active = True
        if role is not None:
            self.role = role
        if valid_from is not None:
            self.valid_from = valid_from
        if valid_until is not None:
            self.valid_until = valid_until
        self.save(update_fields=[
            'removed_at', 'is_active', 'role', 'valid_from', 'valid_until',
        ])


# Expose nested OrgRole as a top-level import for serializers/permissions.
OrgRole = OrganizationMembership.OrgRole


# ✅ Organization Invite Model (For Magic Link / Passwordless Flow)
class OrganizationInvite(models.Model):
    """
    Tracks pending email invitations to join an organization.
    Used by the Magic Link / Passwordless onboarding flow.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='invites'
    )
    email = models.EmailField()
    role = models.CharField(
        max_length=20, choices=OrgRole.choices, default=OrgRole.MEMBER
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='sent_invites'
    )

    # Magic link token for the invite
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['token']),
            models.Index(fields=['organization', 'email']),
        ]

    valid_from = models.DateTimeField(default=timezone.now)
    valid_until = models.DateTimeField(
        null=True, blank=True,
        help_text="Membership expiry applied when the invite is accepted.",
    )

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(48)
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(days=7)  # Invite expires in 7 days
        super().save(*args, **kwargs)

    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return f'Invite for {self.email} to {self.organization.slug} ({self.role})'


class OrganizationContact(models.Model):
    """
    The org's own CRM row for a person. Created lazily on the first
    booking tied to this org, whether the person has a User account or
    checked out as a guest.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='contacts',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='org_contacts',
    )
    email = models.EmailField()
    name = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    first_seen_at = models.DateTimeField(auto_now_add=True)
    unsubscribed = models.BooleanField(default=False)

    class Meta:
        ordering = ['-first_seen_at']

    def __str__(self):
        return f'{self.name or self.email} @ {self.organization.slug}'


# ===========================================================================
# ✅ NEW (2026-11-06 review §2.3): append-only membership audit trail.
# ===========================================================================
class OrganizationMembershipEvent(models.Model):
    """
    Immutable audit row written whenever a membership changes in a way
    that matters for security review:

      • INVITED         — an OrganizationInvite was created
      • ACCEPTED        — invite accepted; membership created or reactivated
      • ROLE_CHANGED    — role mutated (e.g. transfer_ownership owner→admin)
      • VALIDITY_CHANGED— valid_from/valid_until changed
      • DEACTIVATED     — is_active toggled False (no removal)
      • REACTIVATED     — soft-removed member re-invited and accepted
      • REMOVED         — soft_remove() called

    ``before`` / ``after`` are JSON snapshots of the salient fields only
    (role, is_active, valid_from, valid_until, removed_at) — never the
    full row, to keep PII out of the audit log.

    Writes are best-effort: if event logging raises, the caller logs a
    warning and continues. Audit must not block the primary operation.
    """
    class EventType(models.TextChoices):
        INVITED = 'invited', 'Invited'
        ACCEPTED = 'accepted', 'Accepted'
        ADDED = 'added', 'Added'                                  # ← new
        ROLE_CHANGED = 'role_changed', 'Role changed'
        OWNER_ASSIGNED = 'owner_assigned', 'Owner assigned'        # ← new
        OWNER_TRANSFERRED = 'owner_transferred', 'Owner transferred'  # ← new
        VALIDITY_CHANGED = 'validity_changed', 'Validity changed'
        DEACTIVATED = 'deactivated', 'Deactivated'
        REACTIVATED = 'reactivated', 'Reactivated'
        REMOVED = 'removed', 'Removed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='membership_events',
    )
    membership = models.ForeignKey(
        OrganizationMembership, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='events',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='membership_events_about',
    )
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='membership_events_authored',
        help_text="Who performed the action (NULL = system / self-service).",
    )
    before = models.JSONField(default=dict, blank=True)
    after = models.JSONField(default=dict, blank=True)
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-at']
        indexes = [
            models.Index(fields=['organization', 'at']),
            models.Index(fields=['user', 'at']),
            models.Index(fields=['membership', 'at']),
            models.Index(fields=['event_type', 'at']),
        ]

    def __str__(self):
        return f'{self.event_type} @ {self.organization.slug} ({self.at:%Y-%m-%d %H:%M})'


# ---------------------------------------------------------------------------
# Helper (used by auth_api.py and services.tenancy)
# ---------------------------------------------------------------------------
_MEMBERSHIP_SNAPSHOT_FIELDS = (
    'role', 'is_active', 'valid_from', 'valid_until', 'removed_at',
)


def snapshot_membership(membership) -> dict:
    """JSON-safe snapshot of the audit-relevant fields of a membership."""
    if membership is None:
        return {}
    return {
        f: (getattr(membership, f).isoformat()
            if hasattr(getattr(membership, f), 'isoformat')
            else getattr(membership, f))
        for f in _MEMBERSHIP_SNAPSHOT_FIELDS
    }


def log_membership_event(
    *, organization, event_type, user=None, membership=None,
    actor=None, before=None, after=None,
):
    """Best-effort audit write. Never raises.

    Callers in transactional paths should call this *after* the DB write
    commits (or accept that a rolled-back operation may leave an orphan
    event — acceptable for an audit log, but if you use ``transaction.on_commit``
    for correctness, wrap the call there).
    """
    try:
        OrganizationMembershipEvent.objects.create(
            organization=organization,
            membership=membership,
            user=user,
            event_type=event_type,
            actor=actor,
            before=before or {},
            after=after or {},
        )
    except Exception:
        logger.exception(
            'Failed to write membership audit event %s for org=%s user=%s',
            event_type, getattr(organization, 'pk', None), getattr(user, 'pk', None),
        )