"""
Single source of truth for tenant scoping.

Role model:
  Platform Admin  = User.is_superuser = True                      (global)
  Platform Staff  = User.is_staff=True AND not is_superuser       (global, READ-ONLY)
  Tenant Admin    = OrganizationMembership.role IN (OWNER, ADMIN) (tenant)
  Tenant Staff    = OrganizationMembership.role == STAFF          (tenant, scan only)
  Tenant Member   = OrganizationMembership.role == MEMBER         (tenant, attendee)
  Regular User    = any other authenticated user, or anonymous    (self only)

`is_staff=True` is Django-admin access ONLY. It does NOT broaden tenant
read scope and does NOT grant cross-tenant visibility. Only `is_superuser`
(platform admin) may read every tenant. Tenant authority comes exclusively
from an active OrganizationMembership.

MEMBERSHIP-AS-PROPERTY MODEL (2026-11-06):
  • Every authenticated user is a "Regular User". There is no global
    `user.role` in the data model.
  • A user *holds memberships*. Each membership carries its own role
    (OWNER / ADMIN / STAFF / MEMBER) and its own validity window.
  • One user may be OWNER of org A and MEMBER of org B at the same time.
  • The single `effective_role` string returned to the frontend is a
    **derived label** — a highest-precedence summary — not the source
    of truth. Every access check below is per-org.

OWNERSHIP (2026-11-06):
  • Each organization has exactly ONE live OWNER, enforced by a DB
    unique constraint on (organization, role=OWNER) over live rows.
  • Use `organization_owner(org)` to resolve the live OWNER user.

SECURITY NOTE (Time-Bounded Memberships):
All membership queries now pass through `_active_membership_filter()`.
This ensures that if a membership is expired (valid_until < now) or
manually deactivated (is_active=False) or soft-removed (removed_at is
set), the user instantly loses all access to the organization's
resources.
"""
import uuid

from django.db.models import Q
from django.utils import timezone

from ..models import (
    Event, Venue, Booking, Ticket, Discount,
    CancellationPolicy, EventTemplate, Organization,
    OrganizationMembership,
)


# ---------------------------------------------------------------------------
# Base Membership Filter (Security Core)
# ---------------------------------------------------------------------------

def _active_membership_filter(user):
    """
    Returns a base queryset of memberships that grant access *right now*:

    1. Not soft-removed       (removed_at IS NULL)
    2. Active                 (is_active=True)
    3. Within validity window (valid_from <= now <= valid_until)

    The ``removed_at IS NULL`` clause is the source of truth for "was
    this member removed?". ``is_active=False`` is a *separate* manual
    override and may coexist with ``removed_at IS NULL`` (e.g. a
    temporarily suspended member who was never removed). Both must be
    satisfied to grant access.

    See 2026-11-06 review §2.3.
    """
    if not user or not user.is_authenticated:
        return OrganizationMembership.objects.none()

    now = timezone.now()
    return OrganizationMembership.objects.filter(
        user=user,
        removed_at__isnull=True,        # ✅ §2.3
        is_active=True,
        valid_from__lte=now,
    ).filter(
        Q(valid_until__isnull=True) | Q(valid_until__gte=now)
    )


# ---------------------------------------------------------------------------
# Role predicates
# ---------------------------------------------------------------------------

def is_platform_admin(user):
    """Global superuser: full read/write across all tenants."""
    return bool(user and user.is_authenticated and user.is_superuser)


def is_platform_superuser(user):
    return is_platform_admin(user)


def is_platform_staff(user):
    """
    Global read-only cross-tenant support tier.

    NOTE: this is deliberately NOT a tenant role. It grants no ownership,
    no mutation rights, and no per-org authority. Its only effect is that
    the `visible_*` querysets return everything for such users so support
    staff can investigate issues.

    Tenant authority must still come from OrganizationMembership. See
    `effective_role_label()` — a platform-staff user with no membership
    resolves to 'user'.
    """
    return bool(
        user and user.is_authenticated
        and user.is_staff and not user.is_superuser
    )


# ---------------------------------------------------------------------------
# Org-ID lookups
# ---------------------------------------------------------------------------

def _org_ids_for(user, roles):
    """Helper to get org IDs for a user with specific roles, respecting validity."""
    if not user or not user.is_authenticated:
        return ()
    return tuple(
        _active_membership_filter(user)
        .filter(role__in=roles)
        .values_list('organization_id', flat=True)
        .distinct()
    )


def user_org_ids(user):
    """Orgs where user is OWNER or ADMIN (with valid membership)."""
    return list(_org_ids_for(user, OrganizationMembership.MANAGER_ROLES))


def user_finance_org_ids(user):
    """Orgs where user is OWNER/ADMIN or FINANCE (with valid membership)."""
    return list(_org_ids_for(user, OrganizationMembership.FINANCE_ROLES))


def user_operator_org_ids(user):
    """Orgs where user is OWNER, ADMIN, or STAFF (with valid membership)."""
    return list(_org_ids_for(user, OrganizationMembership.OPERATOR_ROLES))


def user_membership_org_ids(user):
    """Orgs where user has ANY valid membership role."""
    if not user or not user.is_authenticated:
        return []

    return list(
        _active_membership_filter(user)
        .values_list('organization_id', flat=True)
        .distinct()
    )


def user_staff_only_org_ids(user):
    """Orgs where the user is STAFF but NOT OWNER/ADMIN."""
    operator = set(user_operator_org_ids(user))
    manager = set(user_org_ids(user))
    return list(operator - manager)


def has_org_role(user, organization, roles):
    """Check if user has a specific valid role in a specific org."""
    if not user or not user.is_authenticated or organization is None:
        return False
    return _active_membership_filter(user).filter(
        organization=organization, role__in=roles
    ).exists()


def can_view_finance(user, organization):
    """Owner/Admin and Finance members may access finance workspaces."""
    if getattr(user, 'is_superuser', False):
        return True
    return _active_membership_filter(user).filter(
        organization=organization,
        role__in=[OrganizationMembership.OrgRole.ADMIN, OrganizationMembership.OrgRole.FINANCE],
    ).exists()


def can_manage_org(user, organization):
    if is_platform_admin(user):
        return True
    return has_org_role(user, organization, OrganizationMembership.MANAGER_ROLES)


def can_operate_org(user, organization):
    if is_platform_admin(user):
        return True
    return has_org_role(user, organization, OrganizationMembership.OPERATOR_ROLES)


def paid_membership_org_ids(user):
    """Org IDs where the user holds an ACTIVE paid membership."""
    if not user or not user.is_authenticated:
        return []
    from ..models_membership import Membership  # local import: cycle-safe

    now = timezone.now()
    return list(
        Membership.objects
        .filter(user=user, status=Membership.Status.ACTIVE)
        .filter(Q(valid_until__isnull=True) | Q(valid_until__gte=now))
        .values_list('organization_id', flat=True)
        .distinct()
    )


def is_org_member(user, organization):
    """True for any valid role (OWNER/ADMIN/STAFF/MEMBER) in the org,
    OR an active paid membership in that org.

    Used for private-event access: a private event is visible/bookable to
    signed-in members of its organization, regardless of their role.
    """
    if not user or not user.is_authenticated or organization is None:
        return False
    if is_platform_admin(user):
        return True
    if has_org_role(
        user,
        organization,
        tuple(OrganizationMembership.OrgRole.values),
    ):
        return True
    from ..models_membership import Membership

    return Membership.active_for(user, organization) is not None


def is_tenant_admin(user):
    if is_platform_admin(user):
        return True
    return bool(user_org_ids(user))


def is_tenant_operator(user):
    if is_platform_admin(user):
        return True
    return bool(user_operator_org_ids(user))


def is_org_staff_only(user, organization):
    """True iff the user is STAFF — and ONLY STAFF — on this org."""
    if not user or not user.is_authenticated or organization is None:
        return False
    return (
        has_org_role(user, organization, OrganizationMembership.OPERATOR_ROLES)
        and not has_org_role(user, organization, OrganizationMembership.MANAGER_ROLES)
    )


def owns_org(user, organization):
    """
    True iff the user is the live OWNER of this organization (or platform
    admin). Backed by the DB unique constraint: at most one live OWNER
    per org.
    """
    if is_platform_admin(user):
        return True
    if not user or not user.is_authenticated or organization is None:
        return False
    return _active_membership_filter(user).filter(
        organization=organization, is_owner=True,
    ).exists()


def organization_owner(org):
    """
    Return the live OWNER user for ``org``, or ``None``.

    "Live" means: removed_at IS NULL, is_active=True, and within the
    validity window. Because of the single-owner DB constraint there is
    at most one such membership.
    """
    if org is None:
        return None
    m = (
        OrganizationMembership.objects
        .filter(
            organization=org,
            is_owner=True,
            removed_at__isnull=True,
            is_active=True,
        )
        .filter(
            Q(valid_until__isnull=True) | Q(valid_until__gte=timezone.now())
        )
        .select_related('user')
        .first()
    )
    return m.user if m else None


# ---------------------------------------------------------------------------
# ✅ Membership-as-property helpers
# ---------------------------------------------------------------------------

def user_memberships_payload(user, *, only_active=True):
    """
    Return a stable, serialisable list of the user's memberships.

    This is THE canonical shape the frontend consumes for `user.memberships`.
    It exposes per-org roles as booleans so the UI can render e.g. the
    "Owner" badge on org A and the "Member" badge on org B simultaneously.

    Args:
        user: the user to describe.
        only_active:
            True (default)  → only memberships that grant access *right now*,
                              delegated to `_active_membership_filter` so this
                              payload can never drift from the access-control
                              definition (§2.2/§2.3).
            False           → audit view: every membership row ever created,
                              including soft-removed ones. Each dict still
                              carries ``is_currently_valid`` / ``removed_at``
                              so the UI can render the history.

    Returns:
        list[dict] — see `OrganizationMembership.as_dict()` for shape.
    """
    if not user or not user.is_authenticated:
        return []

    if only_active:
        # ✅ §2.3: single source of truth. Do NOT re-inline the window check.
        qs = _active_membership_filter(user).select_related('organization')
    else:
        qs = (
            OrganizationMembership.objects
            .filter(user=user)
            .select_related('organization')
        )

    return [m.as_dict() for m in qs.order_by('-joined_at')]


def effective_role_label(user):
    """
    Return a UI-facing role *label* for the user.

    This is NOT a real role — it is a highest-precedence summary of the
    user's memberships, used purely so the frontend has one string to
    switch on for sidebar rendering.

    Precedence:
        super_admin  → User.is_superuser
        owner        → live OWNER/ADMIN of ≥1 org
        staff        → STAFF-only member of ≥1 org
        member       → MEMBER-only member of ≥1 org
        user         → no membership at all (regular user / guest)

    IMPORTANT:
      • A manager is labelled 'owner' regardless of `is_staff`. The
        platform-staff flag is a *global read-only* tier, not an org
        role, and must not mask the tenant label.
      • An `is_staff=True` user with *no* org membership still resolves
        to `'user'`. `is_staff` alone is not a tenant role.
    """
    if not user or not user.is_authenticated:
        return 'user'

    if user.is_superuser:
        return 'super_admin'

    memberships = _active_membership_filter(user)

    # Ownership is a property of an Admin membership.
    if memberships.filter(is_owner=True).exists():
        return 'owner'

    if memberships.filter(role=OrganizationMembership.OrgRole.ADMIN).exists():
        return 'admin'

    if memberships.filter(role=OrganizationMembership.OrgRole.FINANCE).exists():
        return 'finance'

    # Scanner-only membership gets its own label.
    if memberships.filter(role=OrganizationMembership.OrgRole.STAFF).exists():
        return 'staff'

    # Member-only membership gets its own label.
    if memberships.filter(role=OrganizationMembership.OrgRole.MEMBER).exists():
        return 'member'

    # is_staff with no tenant membership → org-less platform account.
    # Log so it is visible in production, but return 'user' (the P0 fix:
    # is_staff alone is not a tenant role).
    if user.is_staff:
        import logging
        logging.getLogger(__name__).warning(
            "Staff user %s (id=%s) has no org manager or staff membership; "
            "labelling role as 'user'. Promote via OrganizationMembership "
            "or unset is_staff.",
            user.username, user.id,
        )

    return 'user'


# ---------------------------------------------------------------------------
# Event-scoped predicates — canonical entry points for event-data access
# ---------------------------------------------------------------------------

def can_manage_event_data(user, event):
    """OWNER/ADMIN of the event's org, or platform admin. Use for mutations."""
    if event is None:
        return False
    return can_manage_org(user, event.organization)


def can_operate_event_data(user, event):
    """OWNER/ADMIN/STAFF of the event's org, or platform admin. Read/scan only."""
    if event is None:
        return False
    return can_operate_org(user, event.organization)


# ---------------------------------------------------------------------------
# Querysets
# ---------------------------------------------------------------------------

def visible_organizations(user):
    """
    Organizations visible to the user.

    Only a platform admin (superuser) sees every organisation. Tenant
    users see only organisations where they hold a live membership.
    """
    if is_platform_admin(user):
        return Organization.objects.all()

    if not user or not user.is_authenticated:
        return Organization.objects.none()

    return Organization.objects.filter(
        id__in=user_membership_org_ids(user)
    ).distinct()


def operated_organizations(user):
    """Orgs the caller can scan for (OWNER/ADMIN/STAFF)."""
    if is_platform_admin(user):
        return Organization.objects.all()
    if not user or not user.is_authenticated:
        return Organization.objects.none()
    return Organization.objects.filter(id__in=user_operator_org_ids(user)).distinct()


def visible_events(user, *, organization=None, public_only=False):
    """
    Events the user may access as a TENANT / management user.

    Scope:
      • platform admin (superuser) → everything
      • authenticated with membership → managed orgs (all events) and
        member orgs (active/published)
      • anonymous → public baseline only

    This deliberately does NOT include other tenants' public events for an
    authenticated tenant user. Public browsing/booking uses
    ``publicly_visible_events()`` instead, so management lists, dashboards,
    analytics, and serializers never mix tenants.
    """
    qs = Event.objects.all()
    if organization is not None:
        qs = qs.filter(organization=organization)

    if public_only:
        return qs.filter(status__in=['active', 'published'], is_public=True)

    if is_platform_admin(user):
        return qs

    if not user or not user.is_authenticated:
        return qs.filter(status__in=['active', 'published'], is_public=True)

    manager_org_ids = user_org_ids(user)
    membership_org_ids = list(
        set(user_membership_org_ids(user)) | set(paid_membership_org_ids(user))
    )

    conditions = Q(pk__in=[])

    # Managers see every event in their managed orgs, including drafts/private.
    if manager_org_ids:
        conditions |= Q(organization_id__in=manager_org_ids)

    # Staff/Members see active/published events in their orgs, including private.
    if membership_org_ids:
        conditions |= (
            Q(organization_id__in=membership_org_ids)
            & Q(status__in=['active', 'published'])
        )

    return qs.filter(conditions).distinct()


def publicly_visible_events(user=None, *, organization=None):
    """Public marketplace events, independent of the caller's tenancy.

    Used by the public event pages, buyer seat map, and booking creation —
    NOT by management lists/dashboards.
    """
    qs = Event.objects.filter(
        status__in=['active', 'published'],
        is_public=True,
    )
    if organization is not None:
        qs = qs.filter(organization=organization)
    return qs


def events_visible_to_buyer(user, *, organization=None):
    """Events a buyer may view/book.

    • anonymous / no memberships → public events only
    • org member (any role)       → public + private active/published
                                    events of THEIR organization
    • org operator                → every status in their org
    """
    if is_platform_admin(user):
        return Event.objects.filter(status__in=['active', 'published'])

    if user and user.is_authenticated:
        manager_ids = user_org_ids(user)
        member_ids = list(
            set(user_membership_org_ids(user)) | set(paid_membership_org_ids(user))
        )

        conditions = Q(status__in=['active', 'published'], is_public=True)
        if manager_ids:
            conditions |= Q(organization_id__in=manager_ids)
        if member_ids:
            conditions |= (
                Q(organization_id__in=member_ids)
                & Q(status__in=['active', 'published'])
            )

        return Event.objects.filter(conditions).distinct()

    return publicly_visible_events(user, organization=organization)


def visible_events_for_scan(user):
    """Every active/published event in any org the user can operate on."""
    if is_platform_admin(user):
        return Event.objects.filter(status__in=['active', 'published'])

    if not user or not user.is_authenticated:
        return Event.objects.none()

    org_ids = user_operator_org_ids(user)
    if not org_ids:
        return Event.objects.none()

    return Event.objects.filter(
        organization_id__in=org_ids,
        status__in=['active', 'published'],
    ).distinct()


def visible_venues(user, *, organization=None):
    qs = Venue.objects.all()
    if organization is not None:
        return qs.filter(organization=organization)
    if is_platform_admin(user):
        return qs
    if not user or not user.is_authenticated:
        return qs.none()
    return qs.filter(organization_id__in=user_operator_org_ids(user))


def visible_bookings(user, *, organization=None):
    qs = Booking.objects.all()
    if organization is not None:
        qs = qs.filter(event__organization=organization)

    if is_platform_admin(user):
        return qs

    if not user or not user.is_authenticated:
        return qs.none()

    org_ids = user_operator_org_ids(user)
    if org_ids:
        return qs.filter(
            Q(event__organization_id__in=org_ids) | Q(user=user)
        ).distinct()
    return qs.filter(user=user).distinct()


def visible_tickets(user, *, organization=None):
    return Ticket.objects.filter(
        booking__in=visible_bookings(user, organization=organization)
    ).distinct()


def visible_discounts(user, *, organization=None):
    qs = Discount.objects.all()
    if organization is not None:
        return qs.filter(organization=organization)
    if is_platform_admin(user):
        return qs
    if not user or not user.is_authenticated:
        return qs.none()
    return qs.filter(organization_id__in=user_org_ids(user))


def visible_cancellation_policies(user, *, organization=None):
    qs = CancellationPolicy.objects.all()
    if organization is not None:
        return qs.filter(organization=organization)
    if is_platform_admin(user):
        return qs
    if not user or not user.is_authenticated:
        return qs.none()
    return qs.filter(organization_id__in=user_org_ids(user))


def visible_templates(user, *, organization=None):
    qs = EventTemplate.objects.all()
    if organization is not None:
        return qs.filter(event__organization=organization)
    if is_platform_admin(user):
        return qs
    if not user or not user.is_authenticated:
        return qs.none()
    return qs.filter(event__organization_id__in=user_org_ids(user))


def visible_contacts(user, *, organization=None):
    from ..models_tenancy import OrganizationContact
    qs = OrganizationContact.objects.all()
    if organization is not None:
        return qs.filter(organization=organization)
    if is_platform_admin(user):
        return qs
    if not user or not user.is_authenticated:
        return qs.none()
    return qs.filter(organization_id__in=user_org_ids(user))

def filter_organization_param(qs, raw_org_id, *, field='organization'):
    """Narrow an already-permission-scoped queryset to one organisation.

    This is a convenience for list endpoints that receive
    ``?organization_id=`` from the UI. It NEVER grants access by itself:
    callers must pass a queryset already produced by a ``visible_*``
    helper (or otherwise permission-checked).
    """
    if not raw_org_id:
        return qs
    try:
        uuid.UUID(str(raw_org_id))
    except (ValueError, TypeError, AttributeError):
        return qs.none()
    return qs.filter(**{field: raw_org_id})
