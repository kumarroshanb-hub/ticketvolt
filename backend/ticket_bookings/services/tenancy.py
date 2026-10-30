# backend/ticket_bookings/services/tenancy.py
"""
Single source of truth for tenant scoping.

Role model:
  Platform Admin  = User.is_superuser = True                      (global)
  Tenant Admin    = OrganizationMembership.role IN (OWNER, ADMIN) (tenant)
  Tenant Staff    = OrganizationMembership.role == STAFF          (tenant, scan only)
  Tenant Member   = OrganizationMembership.role == MEMBER
  Regular User    = any other authenticated user, or anonymous    (self only)

`is_staff=True` alone does NOT grant cross-tenant scope.

Event-scoped predicates
-----------------------
Anything that touches an Event or its dependent rows (Booking, Ticket,
CheckInLog, EventTemplate) MUST use one of the two helpers below rather
than calling `can_manage_org` / `can_operate_org` directly:

  can_manage_event_data  — OWNER/ADMIN (mutations: refund, issue, cancel)
  can_operate_event_data — OWNER/ADMIN/STAFF (scanner, read-only)

Using `can_operate_org` in a mutating view silently grants STAFF the
ability to change money.
"""
from django.db.models import Q

from ..models import (
    Event, Venue, Booking, Ticket, Discount,
    CancellationPolicy, EventTemplate, Organization,
    OrganizationMembership,
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
    if not user or not user.is_authenticated:
        return ()
    return tuple(
        OrganizationMembership.objects
        .filter(user=user, role__in=roles)
        .values_list('organization_id', flat=True)
        .distinct()
    )


def user_org_ids(user):
    """Orgs where user is OWNER or ADMIN."""
    return list(_org_ids_for(user, OrganizationMembership.MANAGER_ROLES))


def user_operator_org_ids(user):
    """Orgs where user is OWNER, ADMIN, or STAFF."""
    return list(_org_ids_for(user, OrganizationMembership.OPERATOR_ROLES))


def user_staff_only_org_ids(user):
    """Orgs where the user is STAFF but NOT OWNER/ADMIN."""
    operator = set(user_operator_org_ids(user))
    manager = set(user_org_ids(user))
    return list(operator - manager)


def has_org_role(user, organization, roles):
    if not user or not user.is_authenticated or organization is None:
        return False
    return OrganizationMembership.objects.filter(
        user=user, organization=organization, role__in=roles,
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
    """Managers only (OWNER/ADMIN). Platform Admin sees all."""
    if is_platform_admin(user):
        return Organization.objects.all()
    if not user or not user.is_authenticated:
        return Organization.objects.none()
    return Organization.objects.filter(id__in=user_org_ids(user)).distinct()


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

      Platform admin       → everything.
      Anonymous            → active/published AND is_public=True.
      Manager of org X     → every event in org X (any status / visibility).
      STAFF-only of org X  → active/published AND is_public=True within org X.
      Everyone else        → the public slice globally.
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
    staff_only_org_ids = user_staff_only_org_ids(user)

    conditions = Q(status__in=['active', 'published'], is_public=True)

    if manager_org_ids:
        conditions |= Q(organization_id__in=manager_org_ids)

    if staff_only_org_ids:
        conditions |= (
            Q(organization_id__in=staff_only_org_ids)
            & Q(status__in=['active', 'published'])
            & Q(is_public=True)
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