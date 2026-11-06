# backend/core/permissions.py
"""
Tenant-aware DRF permissions — core layer.

6-tier role hierarchy:
  Platform : Super Admin  (User.is_superuser)          — NOT a membership
  Platform : Staff        (User.is_staff, not superuser) — Django-admin only
  Tenant   : Owner > Admin > Staff > Member            — OrganizationMembership.role
  Public   : Member-less user / Guest                  — no membership row

`is_staff` is Django admin-site access ONLY. It does not grant
platform-admin privileges, but it IS a distinct platform tier and must
be checked explicitly when a view requires it.

IMPORTANT (2026-11-02):
Every predicate and permission class in this module DELEGATES to
``ticket_bookings.services.tenancy``. That service enforces:
  • ``is_active=True``
  • the time-bounded validity window (``valid_from <= now <= valid_until``)

Do NOT re-implement membership queries here — that silently re-introduces
the expired-membership bypass. Keep this file a thin delegation layer.
"""
from rest_framework.permissions import BasePermission

from ticket_bookings.services import tenancy


# ---------------------------------------------------------------------------
# Predicates — thin delegation to services/tenancy.py (validity-aware)
# ---------------------------------------------------------------------------

def is_platform_admin(user):
    """Platform Super Admin. `is_staff` alone does NOT qualify."""
    return tenancy.is_platform_admin(user)


def is_platform_staff(user):
    """Platform Staff = is_staff=True and not superuser. NOT a tenant role."""
    return tenancy.is_platform_staff(user)


def can_manage_org(user, org):
    """Create/edit events, venues, manage members (Owner + Admin)."""
    return tenancy.can_manage_org(user, org)


def can_operate_org(user, org):
    """Operational tasks e.g. scanning tickets (Owner + Admin + Staff)."""
    return tenancy.can_operate_org(user, org)


def can_delete_org(user, org):
    """Only Owners (or platform admins) can delete an organization."""
    return tenancy.owns_org(user, org)


def user_org_ids(user):
    """
    Org IDs where the user holds ANY valid membership role.

    NOTE: despite the name, this returns *membership* orgs (owner /
    admin / staff / member). For manager-only IDs use
    `user_manager_org_ids`. Kept for backward compatibility with
    existing call sites.
    """
    return tenancy.user_membership_org_ids(user)


def user_manager_org_ids(user):
    """Org IDs where the user is Owner or Admin (valid membership)."""
    return tenancy.user_org_ids(user)


def user_operator_org_ids(user):
    """Org IDs where the user is Owner, Admin, or Staff (valid membership)."""
    return tenancy.user_operator_org_ids(user)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_org_from_obj(obj):
    """
    ✅ FIX: return the related Organization, or None if `obj` has no
    `.organization` relationship.

    The old code did `getattr(obj, 'organization', obj)` and passed the
    object itself to `can_manage_org` when the attribute was missing
    (e.g. for a `Booking`). That silently returned False and looked like
    a permissions bug. Returning None makes the miss explicit.
    """
    if obj is None:
        return None
    org = getattr(obj, 'organization', None)
    if org is not None:
        return org
    # Some models expose `event__organization` instead.
    event = getattr(obj, 'event', None)
    if event is not None:
        return getattr(event, 'organization', None)
    return None


# ---------------------------------------------------------------------------
# DRF Permission Classes — delegated, validity-aware
# ---------------------------------------------------------------------------

class IsPlatformAdmin(BasePermission):
    """Allows access only to platform superusers."""

    def has_permission(self, request, view):
        return tenancy.is_platform_admin(request.user)


class IsPlatformStaff(BasePermission):
    """
    ✅ NEW: Allows platform staff (is_staff=True, not superuser) and
    platform admins. For internal-tooling surfaces that should be
    reachable by platform staff but must not be granted to tenant
    admins.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated
            and (tenancy.is_platform_admin(user) or tenancy.is_platform_staff(user))
        )


class CanManageOrganization(BasePermission):
    """Allows access to Owner and Admin of the organization."""

    def has_object_permission(self, request, view, obj):
        org = _resolve_org_from_obj(obj)
        if org is None:
            return False
        return tenancy.can_manage_org(request.user, org)


class CanOperateOrganization(BasePermission):
    """Allows access to Owner, Admin, and Staff of the organization."""

    def has_object_permission(self, request, view, obj):
        org = _resolve_org_from_obj(obj)
        if org is None:
            return False
        return tenancy.can_operate_org(request.user, org)


class IsTenantMember(BasePermission):
    """Allows access to any valid member of the organization."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if tenancy.is_platform_admin(user):
            return True
        org = _resolve_org_from_obj(obj)
        if org is None:
            return False
        org_id = getattr(org, 'id', None)
        if org_id is None:
            return False
        return org_id in tenancy.user_membership_org_ids(user)


# ---------------------------------------------------------------------------
# Legacy aliases — names still imported by several viewsets/decorators.
# They now resolve to the tenant-correct, validity-aware thing.
# ---------------------------------------------------------------------------

class IsOrganizerOrAdmin(CanManageOrganization):
    """Legacy name. Now: manager of the target org, or platform admin."""
    pass


class IsOrganizerUser(CanOperateOrganization):
    """Legacy name for operational access (Owner/Admin/Staff, any valid org)."""

    def has_permission(self, request, view):
        return tenancy.is_tenant_operator(request.user)


class IsTenantManager(BasePermission):
    """Allows access to users who manage at least one organization."""

    def has_permission(self, request, view):
        return tenancy.is_tenant_admin(request.user)


class IsTenantOperator(BasePermission):
    """Allows access to users who operate at least one organization."""

    def has_permission(self, request, view):
        return tenancy.is_tenant_operator(request.user)