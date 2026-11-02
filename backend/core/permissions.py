# backend/core/permissions.py
"""
Tenant-aware DRF permissions — core layer.

6-tier role hierarchy:
  Platform : Super Admin  (User.is_superuser)          — NOT a membership
  Tenant   : Owner > Admin > Staff > Member            — OrganizationMembership.role
  Public   : Member-less user / Guest                  — no membership row

`is_staff` is Django admin-site access ONLY. It does not grant
platform-admin privileges. See services/tenancy.py for the
authoritative predicate implementations used by viewsets.

This module provides lightweight helpers and DRF permission classes
for code that imports from core rather than ticket_bookings.permissions.
The canonical implementations live in services/tenancy.py and
ticket_bookings/permissions.py.
"""
from rest_framework.permissions import BasePermission
from ticket_bookings.models_tenancy import OrganizationMembership, OrgRole


# ---------------------------------------------------------------------------
# Predicates
# ---------------------------------------------------------------------------

def is_platform_admin(user):
    """
    Check if user is a Platform Super Admin.

    FIXED for 6-tier hierarchy: was `user.is_superuser or user.is_staff`.
    `is_staff` is Django admin-site access only and must NOT grant
    platform-admin privileges. An is_staff user with zero org
    memberships resolves to 'user' (Guest) per the permission matrix.

    Mirrors services/tenancy.py::is_platform_admin exactly.
    """
    if not user or not user.is_authenticated:
        return False
    return user.is_superuser  # ← FIXED: removed `or user.is_staff`


def can_manage_org(user, org):
    """Can create/edit events, venues, and manage members (Owner + Admin)."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    try:
        membership = OrganizationMembership.objects.get(
            user=user,
            organization=org,
            # is_active=True,  # ← UNCOMMENT if your model has is_active on Membership
        )
        return membership.role in [OrgRole.OWNER, OrgRole.ADMIN]
    except OrganizationMembership.DoesNotExist:
        return False


def can_operate_org(user, org):
    """Can perform operational tasks like scanning tickets (Owner + Admin + Staff)."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    try:
        membership = OrganizationMembership.objects.get(
            user=user,
            organization=org,
            # is_active=True,  # ← UNCOMMENT if your model has is_active on Membership
        )
        return membership.role in [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.STAFF]
    except OrganizationMembership.DoesNotExist:
        return False


def can_delete_org(user, org):
    """Only Owners can delete an organization."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    try:
        membership = OrganizationMembership.objects.get(
            user=user,
            organization=org,
            # is_active=True,  # ← UNCOMMENT if your model has is_active on Membership
        )
        return membership.role == OrgRole.OWNER
    except OrganizationMembership.DoesNotExist:
        return False


def user_org_ids(user):
    """Get list of organization IDs where user has any role."""
    if not user or not user.is_authenticated:
        return []
    return list(
        OrganizationMembership.objects.filter(
            user=user,
            # is_active=True,  # ← UNCOMMENT if your model has is_active on Membership
        ).values_list('organization_id', flat=True)
    )


def user_manager_org_ids(user):
    """Get list of organization IDs where user is Owner or Admin."""
    if not user or not user.is_authenticated:
        return []
    return list(
        OrganizationMembership.objects.filter(
            user=user,
            role__in=[OrgRole.OWNER, OrgRole.ADMIN],
            # is_active=True,  # ← UNCOMMENT if your model has is_active on Membership
        ).values_list('organization_id', flat=True)
    )


def user_operator_org_ids(user):
    """Get list of organization IDs where user is Owner, Admin, or Staff."""
    if not user or not user.is_authenticated:
        return []
    return list(
        OrganizationMembership.objects.filter(
            user=user,
            role__in=[OrgRole.OWNER, OrgRole.ADMIN, OrgRole.STAFF],
            # is_active=True,  # ← UNCOMMENT if your model has is_active on Membership
        ).values_list('organization_id', flat=True)
    )


# ---------------------------------------------------------------------------
# DRF Permission Classes
# ---------------------------------------------------------------------------

class IsPlatformAdmin(BasePermission):
    """Allows access only to platform superusers."""

    def has_permission(self, request, view):
        return request.user and is_platform_admin(request.user)


class CanManageOrganization(BasePermission):
    """Allows access to Owner and Admin of the organization."""

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        org = getattr(obj, 'organization', obj)
        return can_manage_org(request.user, org)


class CanOperateOrganization(BasePermission):
    """Allows access to Owner, Admin, and Staff of the organization."""

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        org = getattr(obj, 'organization', obj)
        return can_operate_org(request.user, org)


class IsTenantMember(BasePermission):
    """Allows access to any member of the organization."""

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_platform_admin(request.user):
            return True
        org = getattr(obj, 'organization', obj)
        return OrganizationMembership.objects.filter(
            user=request.user,
            organization=org,
            # is_active=True,  # ← UNCOMMENT if your model has is_active on Membership
        ).exists()


# ---------------------------------------------------------------------------
# Legacy aliases — do not remove yet.
# These names are still imported by several viewsets and decorators.
# They now mean the tenant-correct thing.
# ---------------------------------------------------------------------------

class IsOrganizerOrAdmin(CanManageOrganization):
    """Legacy name. Now: manager of the target org, or platform admin."""
    pass


class IsOrganizerUser(CanOperateOrganization):
    """Legacy name for operational access."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_platform_admin(request.user):
            return True
        return OrganizationMembership.objects.filter(
            user=request.user,
            role__in=[OrgRole.OWNER, OrgRole.ADMIN, OrgRole.STAFF],
            # is_active=True,  # ← UNCOMMENT if your model has is_active on Membership
        ).exists()


class IsTenantManager(BasePermission):
    """Allows access to users who manage at least one organization."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_platform_admin(request.user):
            return True
        return OrganizationMembership.objects.filter(
            user=request.user,
            role__in=[OrgRole.OWNER, OrgRole.ADMIN],
            # is_active=True,  # ← UNCOMMENT if your model has is_active on Membership
        ).exists()


class IsTenantOperator(BasePermission):
    """Allows access to users who operate at least one organization."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_platform_admin(request.user):
            return True
        return OrganizationMembership.objects.filter(
            user=request.user,
            role__in=[OrgRole.OWNER, OrgRole.ADMIN, OrgRole.STAFF],
            # is_active=True,  # ← UNCOMMENT if your model has is_active on Membership
        ).exists()