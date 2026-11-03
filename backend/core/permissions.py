# backend/core/permissions.py
"""
Tenant-aware DRF permissions — core layer.

6-tier role hierarchy:
  Platform : Super Admin  (User.is_superuser)          — NOT a membership
  Tenant   : Owner > Admin > Staff > Member            — OrganizationMembership.role
  Public   : Member-less user / Guest                  — no membership row

`is_staff` is Django admin-site access ONLY. It does not grant
platform-admin privileges.

IMPORTANT (2026-11-02):
Every predicate and permission class in this module now DELEGATES to
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
    """Org IDs where the user holds ANY valid membership role."""
    return tenancy.user_membership_org_ids(user)


def user_manager_org_ids(user):
    """Org IDs where the user is Owner or Admin (valid membership)."""
    return tenancy.user_org_ids(user)


def user_operator_org_ids(user):
    """Org IDs where the user is Owner, Admin, or Staff (valid membership)."""
    return tenancy.user_operator_org_ids(user)


# ---------------------------------------------------------------------------
# DRF Permission Classes — delegated, validity-aware
# ---------------------------------------------------------------------------

class IsPlatformAdmin(BasePermission):
    """Allows access only to platform superusers."""

    def has_permission(self, request, view):
        return tenancy.is_platform_admin(request.user)


class CanManageOrganization(BasePermission):
    """Allows access to Owner and Admin of the organization."""

    def has_object_permission(self, request, view, obj):
        org = getattr(obj, 'organization', obj)
        return tenancy.can_manage_org(request.user, org)


class CanOperateOrganization(BasePermission):
    """Allows access to Owner, Admin, and Staff of the organization."""

    def has_object_permission(self, request, view, obj):
        org = getattr(obj, 'organization', obj)
        return tenancy.can_operate_org(request.user, org)


class IsTenantMember(BasePermission):
    """Allows access to any valid member of the organization."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if tenancy.is_platform_admin(user):
            return True
        org = getattr(obj, 'organization', obj)
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