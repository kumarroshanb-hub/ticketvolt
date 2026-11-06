# backend/core/decorators.py
"""
Tenant-aware role decorators for plain Django (non-DRF) views.

IMPORTANT
---------
These decorators exist for legacy function-based views that predate
the DRF viewsets. New code should use ``core.permissions`` (DRF
permission classes) or ``services.tenancy`` predicates directly.

There is NO global "user role" in this codebase:

  • Platform role   : User.is_superuser                  (global)
  • Tenant role     : OrganizationMembership.role        (per-org)
                      ∈ {owner, admin, staff, member}
  • Public          : no membership row at all            (guest / regular user)

A single user may be OWNER of org A, ADMIN of org B, and a plain
regular user with respect to every other org — simultaneously. Any
predicate that reduces this to one string is a bug.

Every predicate in this module delegates to
``ticket_bookings.services.tenancy`` so the validity window
(``valid_from <= now <= valid_until``) and ``is_active`` flag are
enforced in exactly one place.
"""
from functools import wraps

from django.http import JsonResponse
from django.utils import timezone

from ticket_bookings.services.tenancy import (
    _active_membership_filter,
    can_manage_org,
    can_operate_org,
    effective_role_label,
    is_platform_admin,
    user_membership_org_ids,
    user_org_ids,
    user_operator_org_ids,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _json_error(message, status, **extra):
    payload = {'error': message}
    payload.update(extra)
    return JsonResponse(payload, status=status)


def _require_authenticated(request):
    """Return a 401 JsonResponse if the caller is anonymous, else None."""
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return _json_error('Authentication required', 401)
    return None


def _has_any_membership(user):
    """True iff the user has at least one *currently valid* membership."""
    return bool(user_membership_org_ids(user))


def _has_manager_membership(user):
    """Owner or Admin of at least one org (validity-enforced)."""
    return bool(user_org_ids(user))


def _has_operator_membership(user):
    """Owner, Admin, or Staff of at least one org (validity-enforced)."""
    return bool(user_operator_org_ids(user))


# ---------------------------------------------------------------------------
# Public decorators
# ---------------------------------------------------------------------------

def platform_admin_required(view_func):
    """
    Allow only Platform Super Admins (``User.is_superuser``).

    ``is_staff`` alone does NOT qualify — that is a platform-level
    admin-site flag, not a tenant role.
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        auth_err = _require_authenticated(request)
        if auth_err is not None:
            return auth_err

        if not is_platform_admin(request.user):
            return _json_error(
                'Permission denied',
                status=403,
                required_roles=['platform_admin'],
            )
        return view_func(request, *args, **kwargs)
    return wrapper


# Backwards-compat alias. The old name implied a tenant role named
# "super admin"; that role does not exist. Kept so legacy imports
# resolve — new code should call ``platform_admin_required``.
super_admin_required = platform_admin_required


def tenant_manager_required(view_func):
    """
    Allow Platform Super Admins, and Owners/Admins of at least one org.

    This is the correct gate for "create an event" / "list org
    bookings" style views that operate on the caller's managed orgs.
    It does NOT grant access to a *specific* org's object — use
    ``org_object_required`` (or a tenancy predicate inside the view)
    for object-level checks.
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        auth_err = _require_authenticated(request)
        if auth_err is not None:
            return auth_err

        if is_platform_admin(request.user) or _has_manager_membership(request.user):
            return view_func(request, *args, **kwargs)

        return _json_error(
            'Permission denied',
            status=403,
            required_roles=['owner', 'admin'],
        )
    return wrapper


def tenant_operator_required(view_func):
    """
    Allow Platform Super Admins, and Owners/Admins/Staff of at least
    one org.

    This is the correct gate for the scanner / check-in surface,
    which Staff may use even though they cannot manage the tenant.
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        auth_err = _require_authenticated(request)
        if auth_err is not None:
            return auth_err

        if is_platform_admin(request.user) or _has_operator_membership(request.user):
            return view_func(request, *args, **kwargs)

        return _json_error(
            'Permission denied',
            status=403,
            required_roles=['owner', 'admin', 'staff'],
        )
    return wrapper


# Backwards-compat aliases for the old flat names.
#
# The old file exposed:
#   • organizer_required  → "organizer or above"
#   • admin_required      → "admin or above"
#
# In the 6-tier model:
#   • "organizer" was a tenant role that has been replaced by OWNER.
#   • "admin" was a platform role that has been replaced by
#     tenant ADMIN + platform is_staff.
#
# We map them to the closest correct semantics rather than the old
# (broken) `is_staff → admin` inference:
#
#   admin_required     = tenant_manager_required
#   organizer_required = tenant_operator_required  (so existing call
#                        sites in check-in code keep working)
admin_required = tenant_manager_required
organizer_required = tenant_operator_required


# ---------------------------------------------------------------------------
# Object-level decorators
# ---------------------------------------------------------------------------

def org_object_required(view_func):
    """
    Enforce object-level org access on views whose signature includes
    an ``org_id`` kwarg (or whose handler resolves one from the URL).

    The view must accept an ``org`` kwarg OR a resolvable
    ``org_id``/``organization_id``. This decorator resolves the
    ``Organization`` row and checks ``can_operate_org`` (OWNER /
    ADMIN / STAFF), which is the safe default for read-and-scan
    endpoints. Mutating views should additionally call
    ``can_manage_org`` (or use ``org_manager_required`` below).

    This is deliberately thin: it does not attempt to guess which
    model is being operated on. It just guards the entry point so a
    caller cannot land in a view with a foreign ``org_id``.
    """
    from ticket_bookings.models_tenancy import Organization

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        auth_err = _require_authenticated(request)
        if auth_err is not None:
            return auth_err

        raw_org_id = kwargs.get('org_id') or kwargs.get('organization_id')
        if raw_org_id is None:
            # The view is responsible for its own object-level check
            # in this case; fall through to the view.
            return view_func(request, *args, **kwargs)

        try:
            org = Organization.objects.get(id=raw_org_id)
        except (Organization.DoesNotExist, ValueError, TypeError):
            return _json_error('Organization not found', 404)

        if not can_operate_org(request.user, org):
            return _json_error('Permission denied', 403)

        return view_func(request, *args, **kwargs)
    return wrapper


def org_manager_required(view_func):
    """
    Like ``org_object_required`` but requires OWNER / ADMIN (mutating
    operations). Staff-only callers get a 403.
    """
    from ticket_bookings.models_tenancy import Organization

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        auth_err = _require_authenticated(request)
        if auth_err is not None:
            return auth_err

        raw_org_id = kwargs.get('org_id') or kwargs.get('organization_id')
        if raw_org_id is None:
            return view_func(request, *args, **kwargs)

        try:
            org = Organization.objects.get(id=raw_org_id)
        except (Organization.DoesNotExist, ValueError, TypeError):
            return _json_error('Organization not found', 404)

        if not can_manage_org(request.user, org):
            return _json_error('Permission denied', 403)

        return view_func(request, *args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# Role-payload helpers (parity with views._build_user_payload)
# ---------------------------------------------------------------------------

def current_user_role_payload(request):
    """
    Return the same role shape ``core/views._build_user_payload`` emits.

    Kept here so a plain-Django view can annotate a JSON response with
    the caller's platform role + effective (highest) membership role
    without importing the whole views module.
    """
    user = request.user
    if not user or not user.is_authenticated:
        return {
            'platform_role': None,
            'effective_role': 'user',
            'memberships': [],
        }

    return {
        'platform_role': (
            'super_admin' if is_platform_admin(user)
            else ('staff' if user.is_staff else 'user')
        ),
        'effective_role': effective_role_label(user),
        'memberships': [
            {
                'organization_id': str(m.organization_id),
                'role': m.role,
                'is_active': m.is_active,
                'valid_from': m.valid_from.isoformat() if m.valid_from else None,
                'valid_until': m.valid_until.isoformat() if m.valid_until else None,
            }
            for m in _active_membership_filter(user)
            .select_related('organization')
            .order_by('-joined_at')
        ],
        'now': timezone.now().isoformat(),
    }