"""
Single source of truth for tenant scoping.

Role model:
  Platform Admin  = User.is_superuser = True                      (global)
  Tenant Admin    = OrganizationMembership.role IN (OWNER, ADMIN) (tenant)
  Tenant Staff    = OrganizationMembership.role == STAFF          (tenant, scan only)
  Tenant Member   = OrganizationMembership.role == MEMBER         (tenant, attendee)
  Regular User    = any other authenticated user, or anonymous    (self only)

`is_staff=True` alone does NOT grant cross-tenant scope.

SECURITY NOTE (Time-Bounded Memberships):
All membership queries now pass through `_active_membership_filter()`.
This ensures that if a membership is expired (valid_until < now) or
manually deactivated (is_active=False), the user instantly loses all
access to the organization's resources.
"""
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
    Returns a base queryset of memberships that are:
    1. Active (is_active=True)
    2. Within their validity window (valid_from <= now <= valid_until)
    """
    if not user or not user.is_authenticated:
        return OrganizationMembership.objects.none()
        
    now = timezone.now()
    return OrganizationMembership.objects.filter(
        user=user,
        is_active=True,
        valid_from__lte=now,
    ).filter(
        Q(valid_until__isnull=True) | Q(valid_until__gte=now)
    )


# ---------------------------------------------------------------------------
# Role predicates
# ---------------------------------------------------------------------------

def is_platform_admin(user):
    return bool(user and user.is_authenticated and user.is_superuser)


def is_platform_superuser(user):
    return is_platform_admin(user)


def is_platform_staff(user):
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


def can_manage_org(user, organization):
    if is_platform_admin(user):
        return True
    return has_org_role(user, organization, OrganizationMembership.MANAGER_ROLES)


def can_operate_org(user, organization):
    if is_platform_admin(user):
        return True
    return has_org_role(user, organization, OrganizationMembership.OPERATOR_ROLES)


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
    if is_platform_admin(user):
        return True
    return has_org_role(user, organization, (OrganizationMembership.OrgRole.OWNER,))


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
    Events the user is allowed to see.
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
    membership_org_ids = user_membership_org_ids(user)

    # Public baseline for everyone authenticated.
    conditions = Q(status__in=['active', 'published'], is_public=True)

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