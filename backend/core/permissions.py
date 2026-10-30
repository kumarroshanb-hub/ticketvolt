# backend/core/permissions.py
"""
Tenant-aware DRF permissions.

Two layers of role exist:

  • Platform roles  — `User.is_staff` (Admin) and `User.is_superuser`
                      (SuperAdmin). These are stored on the user and are
                      checked first.
  • Tenant roles    — `OrganizationMembership.role`, one row per
                      (organization, user). OWNER / ADMIN can manage the
                      org, STAFF can operate the scanner, MEMBER / CUSTOMER
                      cannot touch management views.

Class-level vs object-level gating
----------------------------------
`IsOrgManager` and `IsOrgOperator` enforce their real decision in
`has_object_permission` — they assume the view already constrained the
queryset (via `services.tenancy.visible_*`) and only need to confirm the
specific object belongs to an org the user can act on. That is fine for
detail routes but NOT sufficient for class-level gating (analytics,
dashboard, template mutations) where there is no object yet.

`IsTenantManager` is the class-level gate: it answers "is this user a
platform admin, or a manager (OWNER/ADMIN) of at least one org?" at
`has_permission` time, before any object is loaded. Use it on APIViews
and ViewSets whose *entire endpoint* is manager-scoped.

Legacy class names (`IsOrganizerOrAdmin`, `IsOrganizerUser`,
`IsEventOrganizer`) are kept as thin aliases so existing imports in
views/serializers keep working without touching every call site in one
commit.
"""
from rest_framework import permissions

from ticket_bookings.models_tenancy import OrganizationMembership
from ticket_bookings.services.tenancy import (
    is_platform_admin,
    can_manage_org,
    can_operate_org,
    user_org_ids,
)


def _org_from_obj(obj):
    """
    Resolve the Organization an object belongs to.

    Handles:
      • Organization itself.
      • Anything with `.organization`.
      • Anything with `.event.organization` (Booking, Ticket, CheckInLog,
        Session, TicketTier, EventTemplate, DiscountUsage, ...).
      • Anything with `.ticket.event.organization` (rare).
    """
    if obj is None:
        return None

    # Organization instance?
    if hasattr(obj, 'memberships') and hasattr(obj, 'slug'):
        return obj

    org = getattr(obj, 'organization', None)
    if org is not None:
        return org

    event = getattr(obj, 'event', None)
    if event is not None:
        org = getattr(event, 'organization', None)
        if org is not None:
            return org

    ticket = getattr(obj, 'ticket', None)
    if ticket is not None:
        ev = getattr(ticket, 'event', None)
        if ev is not None:
            return getattr(ev, 'organization', None)

    return None


class IsTenantManager(permissions.BasePermission):
    """
    Class-level gate: platform admin OR manager (OWNER/ADMIN) of ≥ 1 org.

    BUG 9 FIX — this is the permission to use on endpoints whose *whole*
    purpose is management reporting / configuration:

      • analytics_api.AnalyticsView
      • dashboard_api.DashboardStatsView
      • template_api.EventTemplateViewSet (mutation actions)

    It enforces at `has_permission` time so the request is rejected
    before any queryset is evaluated. `user_org_ids()` returns the set
    of organizations where the user holds a manager role; an empty set
    means "not a manager anywhere" and the request is denied (unless the
    user is a platform admin).

    Unlike `IsOrgManager`, this does NOT wait for an object — there is no
    object to check on list/create/analytics endpoints.
    """

    message = 'Manager role required.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_platform_admin(request.user):
            return True
        return bool(user_org_ids(request.user))


class IsOrgManager(permissions.BasePermission):
    """
    Owner or Admin of the target organization. Platform admins always pass.

    Object-level check: the target object's Organization must be one
    where the user has role OWNER or ADMIN.

    NOTE: `has_permission` here only requires authentication — the real
    decision is in `has_object_permission`. Do NOT use this class as the
    sole permission on a list/create/analytics endpoint; use
    `IsTenantManager` for class-level gating.
    """

    message = 'You do not have permission to manage this organization.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_platform_admin(request.user):
            return True
        return can_manage_org(request.user, _org_from_obj(obj))


class IsOrgOperator(permissions.BasePermission):
    """
    Owner, Admin, or Staff. Platform admins always pass.

    Use for scanner / check-in endpoints and for read views that a
    staff member needs to reach.

    STAFF-only users resolve to role='staff' in get_user_role()
    (views.py, BUG 23/24); this class is the server-side gate that the
    frontend's 'staff' label is meant to mirror.
    """

    message = 'You do not have permission to operate on this organization.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_platform_admin(request.user):
            return True
        return can_operate_org(request.user, _org_from_obj(obj))


class IsOrgMember(permissions.BasePermission):
    """
    Any member of the target organization (any role). Platform admins pass.

    Use for member-only read views (e.g. an org's own contact list
    visible to any logged-in member).
    """

    message = 'You are not a member of this organization.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_platform_admin(request.user):
            return True
        org = _org_from_obj(obj)
        if org is None:
            return False
        return OrganizationMembership.objects.filter(
            organization=org, user=request.user,
        ).exists()


# ---------------------------------------------------------------------------
# Legacy aliases — do not remove yet. These names are still imported by
# several viewsets. They now mean the tenant-correct thing.
# ---------------------------------------------------------------------------

class IsOrganizerOrAdmin(IsOrgManager):
    """Legacy name. Now: manager of the target org, or platform admin."""
    pass


class IsOrganizerUser(IsOrgManager):
    """
    Legacy name used for "am I an organizer anywhere?" list filters.

    With tenancy, the correct meaning is "does this user have manager
    rights on at least one org (or are they a platform admin)?". The
    viewset then intersects that with `visible_*()` querysets.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_platform_admin(request.user):
            return True
        return bool(user_org_ids(request.user))


class IsEventOrganizer(IsOrgOperator):
    """Legacy name. Now: operator of the event's org, or platform admin."""
    pass