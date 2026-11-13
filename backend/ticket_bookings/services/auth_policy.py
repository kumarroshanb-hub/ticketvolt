"""Authentication-method policy resolution (platform → organization)."""
from __future__ import annotations

from django.conf import settings

from ..models import SystemSettings
from ..models_tenancy import Organization

ALL_METHODS = ('password', 'magic_link', 'otp', 'google', 'apple')
DEFAULT_METHODS = ['password', 'magic_link', 'otp']


def google_configured():
    return bool(getattr(settings, 'GOOGLE_CLIENT_ID', '') and getattr(settings, 'GOOGLE_CLIENT_SECRET', ''))


def _clean(methods):
    if not isinstance(methods, (list, tuple)):
        return []
    return [m for m in methods if m in ALL_METHODS]


def system_methods():
    settings = SystemSettings.get()
    methods = _clean(settings.allowed_auth_methods) or list(DEFAULT_METHODS)
    if google_configured() and 'google' not in methods and not settings.allowed_auth_methods:
        methods.append('google')
    return methods


def organization_for_user(user, organization_id=None):
    if user is None or not getattr(user, 'is_authenticated', False):
        return None
    from .tenancy import _active_membership_filter
    memberships = _active_membership_filter(user).select_related('organization')
    if organization_id:
        membership = memberships.filter(organization_id=organization_id).first()
        return membership.organization if membership else None
    membership = memberships.first()
    return membership.organization if membership else None


def allowed_methods(organization=None):
    methods = system_methods()
    if not google_configured():
        methods = [m for m in methods if m != 'google']
    if organization is not None:
        org_methods = _clean(organization.allowed_auth_methods)
        if not org_methods and organization.feature_package_id:
            org_methods = _clean(organization.feature_package.allowed_auth_methods)
        if org_methods:
            methods = [m for m in methods if m in org_methods]
    return methods


def method_allowed(method, organization=None):
    return method in allowed_methods(organization)


def auth_config(organization=None, organization_id=None):
    org = organization
    return {
        'allowed_auth_methods': allowed_methods(org),
        'system_auth_methods': system_methods(),
        'organization_id': str(org.id) if org is not None else organization_id,
        'organization_name': org.name if org is not None else None,
    }
