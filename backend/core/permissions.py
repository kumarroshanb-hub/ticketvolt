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

IMPORTANT (2026-11-03 — B.2 consolidation):
  • ``IsPlatformStaff`` is now **read-only** — platform staff may only
    perform SAFE_METHODS; platform admins retain full access.
  • The duplicated ``IsTenantManager`` semantics are replaced by four
    explicit classes:
        IsAnyOrgManager   — manager of ≥1 org   (list/create endpoints)
        IsAnyOrgOperator  — operator of ≥1 org  (list endpoints)
        IsOrgManager      — manager of obj's org (object-level)
        IsOrgOperator     — operator of obj's org (object-level)
  • Legacy names (``IsOrganizerOrAdmin``, ``IsOrganizerUser``,
    ``IsTenantManager``, ``IsTenantOperator``) are kept as thin
    deprecated shims that log a warning. Remove once every caller has
    migrated.
"""
import logging

from rest_framework.permissions import SAFE_METHODS, BasePermission

from ticket_bookings.services import tenancy

logger = logging.getLogger(__name__)


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


def _deprecated(old_name, new_name):
    """Emit a deprecation warning from a legacy permission class."""
    logger.warning(
        "permissions.%s is deprecated — use permissions.%s instead.",
        old_name,
        new_name,
    )


# ---------------------------------------------------------------------------
# DRF Permission Classes — delegated, validity-aware
# ---------------------------------------------------------------------------

class IsPlatformAdmin(BasePermission):
    """Allows access only to platform superusers."""

    def has_permission(self, request, view):
        return tenancy.is_platform_admin(request.user)


class IsPlatformStaff(BasePermission):
    """
    DEPRECATED: platform staff no longer has cross-tenant read access.

    Only a system-level user (``is_superuser``) may read every tenant.
    ``is_staff`` is Django-admin access only. Kept as an alias so any
    legacy import still fails closed.
    """

    def has_permission(self, request, view):
        return tenancy.is_platform_admin(request.user)


# --- Object-level org permissions (the canonical pair) ---------------------

class IsOrgManager(BasePermission):
    """
    Owner/Admin of the object's org.

    Object-level only: use ``IsAnyOrgManager`` on list/create endpoints,
    since object-level checks never run on list views.
    """

    def has_object_permission(self, request, view, obj):
        org = _resolve_org_from_obj(obj)
        return org is not None and tenancy.can_manage_org(request.user, org)


class IsOrgOperator(BasePermission):
    """
    Owner/Admin/Staff of the object's org.

    Object-level only: use ``IsAnyOrgOperator`` on list endpoints.
    """

    def has_object_permission(self, request, view, obj):
        org = _resolve_org_from_obj(obj)
        return org is not None and tenancy.can_operate_org(request.user, org)


# --- Collection-level org permissions (list/create endpoints) --------------

class IsAnyOrgManager(BasePermission):
    """
    Manager of ≥1 org. For list/create endpoints.

    Viewsets that need to scope results by org should combine this with
    a queryset filter using ``user_manager_org_ids(request.user)``.
    """

    def has_permission(self, request, view):
        return tenancy.is_tenant_admin(request.user)


class IsAnyOrgOperator(BasePermission):
    """
    Operator of ≥1 org. For list endpoints on scanner-related models.

    Combines with ``user_operator_org_ids(request.user)`` for queryset
    scoping.
    """

    def has_permission(self, request, view):
        return tenancy.is_tenant_operator(request.user)


class IsTenantMember(BasePermission):
    """Allows access to any valid member of the organization (object-level)."""

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


# --- Backwards-compatible aliases (canonical names above) ------------------

class CanManageOrganization(IsOrgManager):
    """
    DEPRECATED alias for ``IsOrgManager``.
    Kept because existing viewsets import this name.
    """

    def has_object_permission(self, request, view, obj):
        _deprecated("CanManageOrganization", "IsOrgManager")
        return super().has_object_permission(request, view, obj)


class CanOperateOrganization(IsOrgOperator):
    """
    DEPRECATED alias for ``IsOrgOperator``.
    Kept because existing viewsets import this name.
    """

    def has_object_permission(self, request, view, obj):
        _deprecated("CanOperateOrganization", "IsOrgOperator")
        return super().has_object_permission(request, view, obj)


# ---------------------------------------------------------------------------
# Legacy aliases — names still imported by several viewsets/decorators.
#
# These are thin deprecated shims. Every one of them now maps to the
# tenant-correct, validity-aware class. Remove once callers migrate
# (grep for each name across the codebase before deleting).
# ---------------------------------------------------------------------------

class IsOrganizerOrAdmin(IsOrgManager):
    """Legacy name → ``IsOrgManager`` (manager of the target org)."""

    def has_object_permission(self, request, view, obj):
        _deprecated("IsOrganizerOrAdmin", "IsOrgManager")
        return super().has_object_permission(request, view, obj)


class IsOrganizerUser(IsAnyOrgOperator):
    """
    Legacy name → ``IsAnyOrgOperator``.

    Historically this granted operational access to any valid org the
    user operates. Mapped to the any-org operator class, which matches
    that historical ``has_permission`` behaviour.
    """

    def has_permission(self, request, view):
        _deprecated("IsOrganizerUser", "IsAnyOrgOperator")
        return super().has_permission(request, view)


class IsTenantManager(IsAnyOrgManager):
    """
    Legacy name → ``IsAnyOrgManager``.

    ⚠️ NOTE: this was previously duplicated in ``template_api.py``.
    Delete that copy and import from here instead.
    """

    def has_permission(self, request, view):
        _deprecated("IsTenantManager", "IsAnyOrgManager")
        return super().has_permission(request, view)


class IsTenantOperator(IsAnyOrgOperator):
    """Legacy name → ``IsAnyOrgOperator``."""

    def has_permission(self, request, view):
        _deprecated("IsTenantOperator", "IsAnyOrgOperator")
        return super().has_permission(request, view)