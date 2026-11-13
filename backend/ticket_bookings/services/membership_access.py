# backend/ticket_bookings/services/membership_access.py
"""
Read-only membership access helpers.

Deliberately separate from services/tenancy.py:
  • tenancy.py handles ORGANIZATION MEMBERSHIP (roles: owner/admin/staff/member)
  • this module handles PAID MEMBERSHIP (subscription tier + benefits)

Do not merge them. A user may be a tenant "member" (role) AND hold a
"Family Plan" paid membership. Those are orthogonal axes.
"""
from django.utils import timezone

from ..models_membership import Membership


def has_active_membership(user, organization, now=None):
    """Return True iff the user holds an active membership in the org."""
    if not user or not user.is_authenticated:
        return False
    return Membership.active_for(user, organization, now=now) is not None


def active_membership(user, organization, now=None):
    """Return the active Membership instance, or None."""
    if not user or not user.is_authenticated:
        return None
    return Membership.active_for(user, organization, now=now)


def membership_benefit(user, organization, key, default=None):
    """Read a single benefit flag from the user's active membership."""
    m = active_membership(user, organization)
    if not m:
        return default
    return (m.tier.benefits or {}).get(key, default)


def can_access_event(user, event):
    """
    Gate for events with members_only / min_membership_tier set.

    Rules:
      • Non-gated events → always accessible.
      • Org managers (owner/admin) and platform admins → always.
      • Gated events → caller MUST have an active membership in the org,
        and if min_membership_tier is set, their tier price must be ≥
        the gate tier's price (proxy for "at this tier or higher").
    """
    if event is None:
        return False
    if not (event.members_only or event.min_membership_tier_id):
        return True

    # Tenant managers and platform admins bypass paid-membership gating.
    from .tenancy import can_operate_org, is_platform_admin
    if is_platform_admin(user):
        return True
    if can_operate_org(user, event.organization):
        return True

    m = active_membership(user, event.organization)
    if m is None:
        return False

    gate = event.min_membership_tier
    if gate is None:
        return True

    # Simple ranking: higher price => higher tier. Good enough for v1.
    # If you later need explicit tier ordering, add a `rank` field to
    # MembershipTier and compare on that.
    return m.tier.price >= gate.price


def active_membership_badge(user, organization):
    """Convenience for serializing into user payloads."""
    m = active_membership(user, organization)
    if not m:
        return None
    return {
        'id': str(m.id),
        'tier_name': m.tier.name,
        'tier_slug': m.tier.slug,
        'status': m.status,
        'valid_until': m.valid_until.isoformat() if m.valid_until else None,
        'seats_used': m.seats_used(),
        'seats_max': m.tier.max_members,
    }