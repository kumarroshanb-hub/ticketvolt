# backend/ticket_bookings/services/discount_service.py

from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Q, Sum
from django.utils import timezone

from ..constants import BookingStatus
from ..models import Booking, Discount, DiscountUsage


class DiscountError(Exception):
    """Validation failure with a user-facing message."""


def validate_discount(
    *,
    discount: Discount,
    user,
    event,
    ticket_count: int,
    order_subtotal: Decimal,
) -> None:
    """
    Raise DiscountError if the discount cannot be applied.

    All the rules live here. Views call this once and trust the result.
    """
    now = timezone.now()

    # ---- Basic eligibility ----
    if not discount.is_active:
        raise DiscountError('This discount code is not active.')

    if discount.valid_from and discount.valid_from > now:
        raise DiscountError('This discount is not yet valid.')

    if discount.valid_to and discount.valid_to < now:
        raise DiscountError('This discount has expired.')

    if discount.min_order_amount and order_subtotal < discount.min_order_amount:
        raise DiscountError(
            f'Minimum order amount of ₹{discount.min_order_amount} '
            f'is required for this discount.'
        )

    if discount.min_ticket_count and ticket_count < discount.min_ticket_count:
        raise DiscountError(
            f'This discount requires at least {discount.min_ticket_count} tickets.'
        )

    # ---- Event scoping ----
    applicable_event_ids = set(
        discount.applicable_events.values_list('id', flat=True)
    )
    if applicable_event_ids and event.id not in applicable_event_ids:
        raise DiscountError('This discount does not apply to this event.')

    # ---- Global uses ----
    if discount.max_uses is not None:
        actual_uses = _count_active_uses(discount)
        if actual_uses >= discount.max_uses:
            raise DiscountError('This discount has reached its usage limit.')

    # ---- Per-user uses ----
    if discount.max_uses_per_user is not None:
        user_uses = _count_active_uses(discount, user=user)
        if user_uses >= discount.max_uses_per_user:
            raise DiscountError('You have already used this discount the maximum number of times.')

    # ---- First-time buyer ----
    if discount.first_time_buyers_only:
        has_prior_paid = Booking.objects.filter(
            user=user,
            status__in=[BookingStatus.PAID, BookingStatus.CONFIRMED, BookingStatus.COMPLETED],
        ).exists()
        if has_prior_paid:
            raise DiscountError('This discount is only for first-time customers.')


def apply_discount_to_booking(
    *,
    discount: Discount,
    booking: Booking,
    subtotal: Decimal,
) -> Decimal:
    """
    Compute and persist the discount on the booking. Returns the
    amount applied (positive number).

    Caller must have already called validate_discount().
    """
    if discount.type == 'percentage':
        amount = (subtotal * Decimal(discount.value) / Decimal(100)).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP,
        )
        if discount.max_discount and amount > discount.max_discount:
            amount = discount.max_discount
    else:  # fixed
        amount = min(Decimal(discount.value), subtotal)

    if amount <= 0:
        raise DiscountError('Computed discount amount is zero.')

    booking.discount_applied = amount
    booking.discount_code = discount.code
    booking.save(update_fields=['discount_applied', 'discount_code', 'updated_at'])

    # Increment usage counter and write an audit row.
    discount.used_count += 1
    discount.save(update_fields=['used_count'])

    DiscountUsage.objects.create(
        discount=discount,
        booking=booking,
        user=booking.user,
        amount_applied=amount,
    )

    return amount


def _count_active_uses(discount: Discount, user=None) -> int:
    """Count non-reversed usages, optionally filtered by user."""
    qs = DiscountUsage.objects.filter(discount=discount, reversed_at__isnull=True)
    if user is not None:
        qs = qs.filter(user=user)
    return qs.count()