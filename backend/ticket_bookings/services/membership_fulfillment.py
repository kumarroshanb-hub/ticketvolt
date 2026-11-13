# backend/ticket_bookings/services/membership_fulfillment.py
"""
Provision an active Membership once a MembershipPayment is verified.

Idempotent: safe to call from both the webhook and the sync verify flow.
"""
import logging
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from ..models_membership import Membership, MembershipPayment
from .tenancy import can_manage_org  # noqa: E402

logger = logging.getLogger(__name__)


class MembershipReviewError(Exception):
    """Raised when the caller cannot review an offline membership."""

@transaction.atomic
def activate_offline_membership(*, membership_id, reviewed_by, reference=''):
    """
    Owner/Admin marks an offline-paid membership as paid → ACTIVE.

    Idempotent: re-activating an already-ACTIVE membership returns it.
    """
    m = (
        Membership.objects
        .select_for_update()
        .select_related('tier', 'organization', 'user')
        .get(pk=membership_id)
    )

    if not can_manage_org(reviewed_by, m.organization):
        raise MembershipReviewError('You do not have permission to review this membership.')

    if m.status == Membership.Status.ACTIVE:
        return m

    if m.status != Membership.Status.PENDING_OFFLINE:
        raise MembershipReviewError(
            f'Cannot activate a membership in status {m.status}.'
        )

    now = timezone.now()
    m.status = Membership.Status.ACTIVE
    m.started_at = now
    m.valid_until = (
        now + timedelta(days=m.tier.duration_days)
        if m.tier.duration_days else None
    )
    if reference:
        m.offline_reference = reference[:128]
    m.reviewed_by = reviewed_by
    m.reviewed_at = now
    m.save(update_fields=[
        'status', 'started_at', 'valid_until',
        'offline_reference', 'reviewed_by', 'reviewed_at', 'updated_at',
    ])

    logger.info(
        '✅ Offline membership activated: user=%s org=%s tier=%s by=%s',
        m.user.username, m.organization.slug, m.tier.name, reviewed_by.username,
    )
    return m

@transaction.atomic
def reject_offline_membership(*, membership_id, reviewed_by, reason=''):
    """
    Owner/Admin rejects an offline-paid membership.

    The row is kept (status=REJECTED) for audit, but no longer
    reserves a seat and cannot be activated later.
    """
    m = (
        Membership.objects
        .select_for_update()
        .select_related('organization', 'user')
        .get(pk=membership_id)
    )

    if not can_manage_org(reviewed_by, m.organization):
        raise MembershipReviewError('You do not have permission to review this membership.')

    if m.status != Membership.Status.PENDING_OFFLINE:
        raise MembershipReviewError(
            f'Cannot reject a membership in status {m.status}.'
        )

    now = timezone.now()
    m.status = Membership.Status.REJECTED
    m.cancelled_at = now
    m.cancelled_reason = (reason or 'Offline payment not received')[:255]
    m.reviewed_by = reviewed_by
    m.reviewed_at = now
    m.save(update_fields=[
        'status', 'cancelled_at', 'cancelled_reason',
        'reviewed_by', 'reviewed_at', 'updated_at',
    ])

    logger.info(
        '❌ Offline membership rejected: user=%s org=%s by=%s reason=%s',
        m.user.username, m.organization.slug, reviewed_by.username, m.cancelled_reason,
    )
    return m


class MembershipStateError(Exception):
    pass


@transaction.atomic
def fulfill_membership(membership_payment_id) -> Membership:
    """
    Create-or-reactivate a Membership for the given payment.

    Idempotency contract: if the payment already has a linked membership
    with status=ACTIVE and an unexpired valid_until, this returns it.
    """
    mp = (
        MembershipPayment.objects
        .select_for_update()
        .select_related('tier', 'organization', 'user')
        .get(pk=membership_payment_id)
    )

    # Idempotent path.
    if (
        mp.status == MembershipPayment.Status.PAID
        and mp.membership_id
        and mp.membership.is_active()
    ):
        return mp.membership

    if mp.status not in (
        MembershipPayment.Status.CREATED,
        MembershipPayment.Status.PENDING,
        MembershipPayment.Status.PAID,
    ):
        raise MembershipStateError(f'Cannot fulfill membership payment in status {mp.status}')

    now = timezone.now()
    valid_until = now + timedelta(days=mp.tier.duration_days) if mp.tier.duration_days else None

    # Reuse an existing ACTIVE membership for this user/org if one exists
    # (renewal case: extend its valid_until). Otherwise create a new row.
    existing = Membership.active_for(mp.user, mp.organization, now=now)
    if existing is not None:
        # Extend from whichever is later: now, or the existing valid_until.
        base = existing.valid_until if existing.valid_until and existing.valid_until > now else now
        existing.valid_until = base + timedelta(days=mp.tier.duration_days) if mp.tier.duration_days else None
        existing.tier = mp.tier
        existing.price_paid = mp.amount
        existing.currency_code = mp.currency
        existing.save(update_fields=['valid_until', 'tier', 'price_paid', 'currency_code', 'updated_at'])
        membership = existing
    else:
        membership = Membership.objects.create(
            organization=mp.organization,
            user=mp.user,
            tier=mp.tier,
            price_paid=mp.amount,
            currency_code=mp.currency,
            status=Membership.Status.ACTIVE,
            started_at=now,
            valid_until=valid_until,
            membership_payment_id=str(mp.id),
        )

    mp.status = MembershipPayment.Status.PAID
    mp.paid_at = now
    mp.membership = membership
    mp.save(update_fields=['status', 'paid_at', 'membership', 'updated_at'])

    logger.info(
        '✅ Membership fulfilled: user=%s org=%s tier=%s valid_until=%s',
        mp.user.username, mp.organization.slug, mp.tier.name, membership.valid_until,
    )
    return membership


@transaction.atomic
def fail_membership_payment(membership_payment_id) -> None:
    mp = MembershipPayment.objects.select_for_update().get(pk=membership_payment_id)
    if mp.status == MembershipPayment.Status.PAID:
        return
    mp.status = MembershipPayment.Status.FAILED
    mp.save(update_fields=['status', 'updated_at'])
    logger.info('❌ Membership payment marked failed: %s', mp.id)