# backend/ticket_bookings/services/event_pricing.py
"""
Authoritative pricing service for bookings.

Every caller that needs to know what a booking costs MUST go through
compute_booking_subtotal() — never read tier.price or seat.category.price
inline. This is the single source of truth that closes the
total_amount-smuggling vector.
"""

from decimal import Decimal, ROUND_HALF_UP


class PricingError(Exception):
    """Raised when an item cannot be priced (missing tier, unknown seat, etc.)."""


def tier_price(event, tier_id) -> Decimal:
    """Return the price of `tier_id` belonging to `event`, or raise PricingError."""
    from ..models import TicketTier
    try:
        tier = TicketTier.objects.get(id=tier_id, event=event)
    except TicketTier.DoesNotExist:
        raise PricingError(f"Tier {tier_id} not found for this event.")
    return Decimal(str(tier.price))


def seat_price(event, seat_id) -> Decimal | None:
    """
    Return the price of `seat_id` from the event's *published* plan snapshot,
    or None if the seat has no assigned category.
    """
    plan = getattr(event, 'venue_plan', None)
    if plan is None or not plan.published_snapshot:
        return None
    snap = plan.published_snapshot
    categories_by_id = {c['id']: c for c in (snap.get('categories') or [])}
    assignments = snap.get('seat_assignments') or {}
    cat_id = assignments.get(str(seat_id))
    if cat_id is None:
        return None
    cat = categories_by_id.get(cat_id)
    if cat is None:
        return None
    return Decimal(str(cat['price']))


def resolve_seat_price(event, seat_id) -> Decimal:
    """
    Return the price of `seat_id`, falling back to a DB lookup of
    Seat.category.price if the plan snapshot doesn't have an assignment.
    Raises PricingError if the seat exists but has no category.
    """
    price = seat_price(event, seat_id)
    if price is not None:
        return price
    from ..models_seating import Seat
    if not getattr(event, 'venue_id', None):
        raise PricingError(
            'This event has no venue; seat pricing is unavailable.'
        )
    try:
        # Seat -> SeatLayout -> Venue (there is no Seat.layout.event FK).
        seat = Seat.objects.select_related('category').get(
            id=seat_id, layout__venue_id=event.venue_id,
        )
    except Seat.DoesNotExist:
        raise PricingError(f"Seat {seat_id} not found for this event.")
    if seat.category is None:
        raise PricingError(
            f"Seat {seat.seat_number} (Row {seat.row_label}) has no category."
        )
    return Decimal(str(seat.category.price))


def compute_booking_subtotal(event, items) -> Decimal:
    """
    Sum the authoritative price of every item in `items`.

    Each item must have either a `seat_id` (priced from the plan) or a
    `tier_id` (priced from the tier row). Missing both is an error.
    Quantity defaults to 1 if absent.

    Raises PricingError on any item that cannot be priced. Never falls
    back to a client-supplied total.
    """
    total = Decimal('0.00')
    if not isinstance(items, list):
        return total

    for i, item in enumerate(items):
        if not isinstance(item, dict):
            raise PricingError(f"Item {i} is not an object.")

        qty = int(item.get('qty', 1) or 1)
        seat_id = item.get('seat_id')
        tier_id = item.get('tier_id')

        if seat_id:
            unit = seat_price(event, seat_id)
            if unit is None:
                raise PricingError(
                    f"Seat {seat_id} is not priced in the published plan."
                )
            total += unit * qty
        elif tier_id:
            total += tier_price(event, tier_id) * qty
        else:
            raise PricingError(
                f"Item {i} has neither seat_id nor tier_id."
            )

    return total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)