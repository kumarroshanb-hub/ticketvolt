# backend/ticket_bookings/services/booking_status.py
"""
Canonical booking-status reconciler.

Every path that consumes tickets (check-in, cancel, refund) must call
`reconcile_completed_booking` — NOT reimplement the rule inline.

A booking is promoted to `completed` iff:
  • at least one ticket is `used`, AND
  • no ticket is still check-in-able (i.e. every remaining ticket is
    in a terminal state: used / cancelled / refunded / expired).

Cancelled and refunded tickets cannot be checked in, so they are
excluded from the denominator — they should not block completion.

`cancelled` and `refunded` bookings are terminal and are never re-promoted.
"""
import logging

from django.utils import timezone

from ..constants import BookingStatus, TicketStatus

logger = logging.getLogger(__name__)

_TERMINAL_TICKET_STATES = (
    TicketStatus.USED,
    TicketStatus.CANCELLED,
    TicketStatus.REFUNDED,
    TicketStatus.EXPIRED,
)


def reconcile_completed_booking(booking) -> bool:
    """
    Promote the booking to `completed` iff the rule above holds.
    Returns True if the status changed, False otherwise.
    Never raises.
    """
    if not booking:
        return False

    if booking.status in (
        BookingStatus.COMPLETED,
        BookingStatus.CANCELLED,
        BookingStatus.REFUNDED,
    ):
        return False

    total_tickets = booking.tickets.count()
    if total_tickets == 0:
        return False

    used_tickets = booking.tickets.filter(status=TicketStatus.USED).count()
    actionable_tickets = booking.tickets.exclude(
        status__in=_TERMINAL_TICKET_STATES,
    ).count()

    if used_tickets == 0 or actionable_tickets > 0:
        return False

    booking.status = BookingStatus.COMPLETED
    booking.save(update_fields=['status', 'updated_at'] if hasattr(booking, 'updated_at') else ['status'])
    logger.info(
        "✅ Booking %s auto-completed (used=%d, total=%d, actionable=%d)",
        booking.booking_reference,
        used_tickets,
        total_tickets,
        actionable_tickets,
    )
    return True