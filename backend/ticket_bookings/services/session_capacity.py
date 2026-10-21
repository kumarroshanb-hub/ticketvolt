# backend/ticket_bookings/services/session_capacity.py
"""
Single source of truth for session seat accounting.

`Session.booked` counts the number of seats held by bookings in a
non-cancelled, non-refunded state. It is incremented on booking creation
(inside a row lock) and decremented on cancellation / refund.

Both the free-registration path and the ticketed path go through these
helpers so the seat math can never drift.
"""
import logging

from django.db import transaction

from ..models import Session

logger = logging.getLogger(__name__)


def release_session_seats(booking, count: int) -> None:
    """
    Return `count` seats to `booking.session`.

    Locked so two concurrent cancellations on the same session cannot
    race — an admin cancelling one booking and a customer cancelling
    another could otherwise both read the same `booked` value and both
    write the same decremented result, losing one release.

    Clamped at 0 so a bug that double-releases can't leave `booked`
    negative (a negative `booked` would make the session look like it
    has more capacity than it started with).
    """
    if not booking.session_id or count <= 0:
        return

    with transaction.atomic():
        session = (
            Session.objects
            .select_for_update()
            .filter(id=booking.session_id)
            .first()
        )
        if session is None:
            logger.warning(
                "Cannot release %d seat(s) for booking %s — session %s "
                "no longer exists.",
                count, booking.booking_reference, booking.session_id,
            )
            return

        session.booked = max(0, session.booked - count)
        session.save(update_fields=['booked'])
        logger.info(
            "✅ Released %d seat(s) from session %s "
            "(booking=%s, booked=%d, capacity=%d)",
            count, session.id, booking.booking_reference,
            session.booked, session.capacity,
        )


def reserve_session_seats(session_id, count: int, *, event=None):
    """
    Reserve `count` seats on `session_id` inside a row lock.

    Returns (session, error_message).
      - (session, None) → success, seats reserved.
      - (None, reason)  → failure, no seats reserved.

    Callers MUST already be inside a `transaction.atomic()` block — the
    lock is released at transaction end.
    """
    if not session_id or count <= 0:
        return None, None

    session = (
        Session.objects
        .select_for_update()
        .filter(id=session_id)
        .first()
    )

    if session is None:
        return None, 'The selected slot was not found.'

    if event is not None and session.event_id != event.id:
        return None, 'The selected slot does not belong to this event.'

    ok, reason = session.check_capacity(count)
    if not ok:
        return None, reason

    session.booked += count
    session.save(update_fields=['booked'])
    return session, None