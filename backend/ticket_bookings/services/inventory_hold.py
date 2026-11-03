# backend/ticket_bookings/services/inventory_hold.py
import logging
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from ..models import TicketTier, Session
from ..models_payments import InventoryHold, Payment, PaymentStatus

logger = logging.getLogger(__name__)


class InsufficientInventoryError(Exception):
    pass


def acquire(payment: Payment) -> None:
    """Atomically reserve every item on the payment. Rolls back fully on shortage."""
    with transaction.atomic():
        for item in payment.items:
            qty = int(item.get('qty', 0))
            if qty <= 0:
                continue
            tier_id = item.get('tier_id')
            session_id = item.get('session_id')

            if tier_id:
                reserved = (
                    TicketTier.objects.filter(pk=tier_id)
                    .filter(quantity_total__gte=F('quantity_sold') + F('quantity_reserved') + qty)
                    .update(quantity_reserved=F('quantity_reserved') + qty)
                )
                if reserved == 0:
                    tier = TicketTier.objects.filter(pk=tier_id).first()
                    avail = tier.available_tickets() if tier else 0
                    raise InsufficientInventoryError(
                        f'Only {avail} ticket(s) left for this tier.'
                    )
                InventoryHold.objects.create(payment=payment, tier_id=tier_id, quantity=qty)

            if session_id:
                reserved = (
                    Session.objects.filter(pk=session_id)
                    .filter(capacity__gte=F('booked') + F('reserved') + qty)
                    .update(reserved=F('reserved') + qty)
                )
                if reserved == 0:
                    raise InsufficientInventoryError('This slot is fully booked.')
                InventoryHold.objects.create(payment=payment, session_id=session_id, quantity=qty)


def release(payment: Payment) -> None:
    """Return reserved capacity to the pool (failure / expiry)."""
    with transaction.atomic():
        for hold in payment.holds.filter(status=InventoryHold.Status.ACTIVE):
            if hold.tier_id:
                TicketTier.objects.filter(pk=hold.tier_id, quantity_reserved__gte=hold.quantity).update(
                    quantity_reserved=F('quantity_reserved') - hold.quantity
                )
            if hold.session_id:
                Session.objects.filter(pk=hold.session_id, reserved__gte=hold.quantity).update(
                    reserved=F('reserved') - hold.quantity
                )
            hold.status = InventoryHold.Status.RELEASED
            hold.released_at = timezone.now()
            hold.save(update_fields=['status', 'released_at'])


def commit(payment: Payment) -> None:
    """Convert holds to sold (reserved -> sold) once payment is captured."""
    with transaction.atomic():
        for hold in payment.holds.filter(status=InventoryHold.Status.ACTIVE):
            if hold.tier_id:
                TicketTier.objects.filter(pk=hold.tier_id, quantity_reserved__gte=hold.quantity).update(
                    quantity_sold=F('quantity_sold') + hold.quantity,
                    quantity_reserved=F('quantity_reserved') - hold.quantity,
                )
            if hold.session_id:
                Session.objects.filter(pk=hold.session_id, reserved__gte=hold.quantity).update(
                    booked=F('booked') + hold.quantity,
                    reserved=F('reserved') - hold.quantity,
                )
            hold.status = InventoryHold.Status.COMMITTED
            hold.save(update_fields=['status'])


def release_expired_holds() -> int:
    """Called by Celery beat. Free capacity held by expired, unpaid checkouts."""
    expired = Payment.objects.filter(
        status__in=[PaymentStatus.CREATED, PaymentStatus.PENDING],
        hold_expires_at__lt=timezone.now(),
    )
    count = 0
    for payment in expired:
        try:
            with transaction.atomic():
                release(payment)
                payment.status = PaymentStatus.EXPIRED
                payment.save(update_fields=['status', 'updated_at'])
            count += 1
        except Exception:
            logger.exception('Failed to release expired hold for payment=%s', payment.id)
    return count