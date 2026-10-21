# backend/ticket_bookings/services/ticket_cancellation.py
"""
Per-ticket cancellation, policy-aware.

This module owns the *only* correct way to cancel individual tickets.
Callers:
  • BookingViewSet.cancel_tickets       — mutation
  • BookingViewSet.preview_cancellation — read-only preview

Design:
  • Row-locks the tickets in a stable order so two concurrent cancel
    requests can't both succeed on the same ticket.
  • Reads the booking's frozen policy snapshot — NOT the current policy —
    so editing a policy later cannot retroactively change refunds.
  • Refunds are computed against `ticket.net_paid_amount` (what the
    customer actually paid after discount proration), never against
    the tier's list price.
  • Writes per-ticket audit fields: refund_percent_applied,
    cancellation_fee_applied, refund_amount, cancelled_at, cancelled_reason.
  • Cascade rule: if every ticket on the booking is now cancelled or
    refunded, the booking flips to `cancelled` and discount usages
    are reversed.
  • Runs inside one transaction. Partial success is not possible.
"""
import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from ..constants import TicketStatus, BookingStatus
from ..models import Booking, Ticket, DiscountUsage
from .cancellation_policy import compute_refund, rules_from_snapshot

logger = logging.getLogger(__name__)


# ===========================================================================
# Errors
# ===========================================================================

class CancellationError(Exception):
    """Raised for any business-rule violation. Callers map to HTTP 400."""


# ===========================================================================
# Helpers used by preview_cancellation in the viewset
# ===========================================================================

def _policy_rules_for(booking: Booking) -> dict:
    """
    Return the policy rules that apply to this booking.

    Prefers the snapshot on the booking (frozen at booking time).
    Falls back to the event's current policy if the booking predates
    the snapshot feature.

    Returns {} when there is no policy attached.
    """
    rules = rules_from_snapshot(booking.cancellation_policy_snapshot or {})
    if rules:
        return rules

    event = getattr(booking, 'event', None)
    if event is not None and getattr(event, 'cancellation_policy', None):
        return event.cancellation_policy.rules or {}

    return {}


def _compute_net_paid_for_ticket(ticket: Ticket, booking: Booking) -> Decimal:
    """
    The net amount paid for a single ticket, after prorating the
    booking-level discount.

    Prefers the persisted `ticket.net_paid_amount` when set. Falls back
    to computing it from the booking's total and discount, which is
    needed for legacy tickets created before `net_paid_amount` existed.

    Returns a Decimal >= 0.
    """
    if ticket.net_paid_amount is not None and Decimal(str(ticket.net_paid_amount)) > 0:
        return Decimal(str(ticket.net_paid_amount))

    all_tickets = list(booking.tickets.all())
    if not all_tickets:
        if ticket.tier is not None:
            return Decimal(str(ticket.tier.price))
        return Decimal('0.00')

    gross_sum = Decimal('0.00')
    for t in all_tickets:
        if t.tier is not None:
            gross_sum += Decimal(str(t.tier.price))

    if gross_sum <= 0:
        return Decimal('0.00')

    if ticket.tier is None:
        return Decimal('0.00')

    discount = Decimal(str(booking.discount_applied or 0))
    net_total = Decimal(str(booking.total_amount)) - discount
    if net_total < 0:
        net_total = Decimal('0.00')

    ticket_share = Decimal(str(ticket.tier.price)) / gross_sum
    return (net_total * ticket_share).quantize(Decimal('0.01'))


# ===========================================================================
# Public API
# ===========================================================================

def cancel_tickets(
    *,
    booking: Booking,
    ticket_ids: list,
    actor,
    reason: str = '',
    allow_used: bool = False,
    override_refund_percent: int = None,
) -> dict:
    """
    Cancel the given tickets on the given booking.

    Args:
        booking:    The Booking instance (must already be loaded).
        ticket_ids: Iterable of Ticket UUIDs to cancel.
        actor:      The user performing the cancellation (for logging).
        reason:     Free-text reason recorded on each ticket.
        allow_used: If True, staff can cancel tickets that have been
                    scanned. Default False.
        override_refund_percent:
                    If set (0-100), bypasses the tier lookup and applies
                    this percent to net_paid_amount. Staff-only (caller
                    is responsible for enforcing that).

    Returns:
        {
            'booking_id':             str,
            'cancelled_ticket_ids':   [str, ...],
            'skipped':                [{id, reason}, ...],
            'refund_amount_added':    Decimal,
            'cancellation_fee_total': Decimal,
            'booking_status':         str,
            'fully_cancelled':        bool,
        }

    Raises:
        CancellationError for any precondition failure.
    """
    ticket_ids = [str(t) for t in (ticket_ids or []) if t]
    if not ticket_ids:
        raise CancellationError('No ticket IDs provided.')

    # ------------------------------------------------------------
    # Load and validate the policy BEFORE entering the transaction.
    # ------------------------------------------------------------
    policy_rules = _policy_rules_for(booking)

    if not policy_rules:
        raise CancellationError(
            'This booking has no cancellation policy attached. '
            'Cancellation is not allowed.'
        )

    allow_partial = bool(policy_rules.get('allow_partial_cancellation', False))

    # Stable, deduplicated ordering of ticket IDs for deterministic locking.
    unique_ids = sorted(set(ticket_ids))

    with transaction.atomic():
        # ------------------------------------------------------------
        # 1. Lock tickets in deterministic order (deadlock prevention).
        # ------------------------------------------------------------
        locked = list(
            Ticket.objects
            .select_for_update()
            .filter(booking=booking, id__in=unique_ids)
            .select_related('tier')
            .order_by('id')
        )

        found_ids = {str(t.id) for t in locked}
        missing = [tid for tid in unique_ids if tid not in found_ids]

        if missing:
            raise CancellationError(
                f'Ticket(s) not found on this booking: {missing}'
            )

        if not locked:
            raise CancellationError('No tickets to cancel.')

        # ------------------------------------------------------------
        # 2. Partial cancellation gate.
        # ------------------------------------------------------------
        if not allow_partial:
            total_cancellable = (
                booking.tickets
                .exclude(status__in=[
                    TicketStatus.CANCELLED,
                    TicketStatus.REFUNDED,
                ])
                .count()
            )
            if len(locked) < total_cancellable:
                raise CancellationError(
                    'This event does not allow partial cancellation. '
                    'Cancel the whole booking instead.'
                )

        # ------------------------------------------------------------
        # 3. Per-ticket validation + mutation.
        # ------------------------------------------------------------
        cancelled_ids = []
        skipped = []
        refund_total = Decimal('0.00')
        fee_total = Decimal('0.00')
        now = timezone.now()

        event = getattr(booking, 'event', None)
        event_start = event.start_date if event is not None else None

        for ticket in locked:
            if ticket.status == TicketStatus.CANCELLED:
                skipped.append({'id': str(ticket.id), 'reason': 'already cancelled'})
                continue

            if ticket.status == TicketStatus.REFUNDED:
                skipped.append({'id': str(ticket.id), 'reason': 'already refunded'})
                continue

            net_paid = _compute_net_paid_for_ticket(ticket, booking)

            # Defensive initialization — every branch below must overwrite
            # these before the ticket is saved.
            pct = 0
            refund_amount = Decimal('0.00')
            cancellation_fee = Decimal('0.00')
            tier_label = 'n/a'

            if override_refund_percent is not None:
                pct = max(0, min(100, int(override_refund_percent)))
                refund_amount = (net_paid * Decimal(pct) / Decimal(100)).quantize(
                    Decimal('0.01')
                )
                tier_label = f'Manual {pct}%'
                cancellation_fee = Decimal('0.00')
            else:
                decision = compute_refund(
                    policy_rules=policy_rules,
                    event_start=event_start,
                    ticket_status=ticket.status,
                    net_paid_amount=net_paid,
                    now=now,
                )

                if not decision.allowed:
                    if (
                        ticket.status == TicketStatus.USED
                        and allow_used
                        and getattr(actor, 'is_staff', False)
                    ):
                        pct = 100
                        refund_amount = net_paid
                        tier_label = 'Staff override (100%)'
                        cancellation_fee = Decimal('0.00')
                    else:
                        raise CancellationError(
                            f'Ticket {ticket.unique_code}: {decision.reason}'
                        )
                else:
                    pct = decision.refund_percent
                    refund_amount = decision.net_refund
                    tier_label = decision.tier_label
                    cancellation_fee = decision.cancellation_fee

            ticket.status = TicketStatus.CANCELLED
            ticket.cancelled_at = now
            ticket.cancelled_reason = (reason or '')[:255]
            ticket.refund_amount = refund_amount
            ticket.refund_percent_applied = pct
            ticket.cancellation_fee_applied = cancellation_fee
            ticket.save(update_fields=[
                'status', 'cancelled_at', 'cancelled_reason',
                'refund_amount', 'refund_percent_applied',
                'cancellation_fee_applied',
            ])

            refund_total += refund_amount
            fee_total += cancellation_fee
            cancelled_ids.append(str(ticket.id))

            logger.info(
                'Ticket %s cancelled by %s — refund %.2f (%s, base %.2f)',
                ticket.unique_code,
                getattr(actor, 'username', 'unknown'),
                refund_amount,
                tier_label,
                net_paid,
            )

        if not cancelled_ids:
            return {
                'booking_id': str(booking.id),
                'cancelled_ticket_ids': [],
                'skipped': skipped,
                'refund_amount_added': Decimal('0.00'),
                'cancellation_fee_total': Decimal('0.00'),
                'booking_status': booking.status,
                'fully_cancelled': False,
            }

        booking.refund_amount = (
            Decimal(str(booking.refund_amount or 0)) + refund_total
        )

        remaining = (
            booking.tickets
            .exclude(status__in=[TicketStatus.CANCELLED, TicketStatus.REFUNDED])
            .exists()
        )
        fully_cancelled = not remaining
        if fully_cancelled:
            booking.status = BookingStatus.CANCELLED
            _reverse_discount_usages(booking)

        # Guard against models without `updated_at`.
        update_fields = ['refund_amount', 'status']
        if hasattr(booking, 'updated_at'):
            update_fields.append('updated_at')
        booking.save(update_fields=update_fields)

        if event is not None:
            event.update_ticket_counts()

        return {
            'booking_id': str(booking.id),
            'cancelled_ticket_ids': cancelled_ids,
            'skipped': skipped,
            'refund_amount_added': refund_total,
            'cancellation_fee_total': fee_total,
            'booking_status': booking.status,
            'fully_cancelled': fully_cancelled,
        }


def _reverse_discount_usages(booking: Booking) -> None:
    """Mark every active DiscountUsage on this booking as reversed."""
    now = timezone.now()
    updated = DiscountUsage.objects.filter(
        booking=booking, reversed_at__isnull=True,
    ).update(reversed_at=now)
    if updated:
        logger.info(
            'Reversed %d discount usage(s) on cancelled booking %s',
            updated, booking.booking_reference,
        )