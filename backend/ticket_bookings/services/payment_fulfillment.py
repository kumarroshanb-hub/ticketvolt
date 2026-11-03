# backend/ticket_bookings/services/payment_fulfillment.py
import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from ..models import Booking, Ticket
from ..models_payments import Payment, PaymentStatus
from ..constants import BookingStatus
from . import inventory_hold
from . import booking_emails          # ✅ Points to your existing email service
from .qr_service import QRCodeService # ✅ Points to your existing QR generator
from .serializers_helpers import resolve_or_create_user_for_booking

logger = logging.getLogger(__name__)


class PaymentStateError(Exception):
    pass


@transaction.atomic
def fulfill_payment(payment_id) -> Booking:
    """Create the booking + tickets once payment is verified. Idempotent."""
    payment = Payment.objects.select_for_update().get(pk=payment_id)

    # Idempotency: already fulfilled
    if payment.status == PaymentStatus.PAID and payment.booking_id:
        return payment.booking
    if payment.status not in (PaymentStatus.CREATED, PaymentStatus.PENDING, PaymentStatus.PAID):
        raise PaymentStateError(f'Cannot fulfill payment in status {payment.status}')

    # 1. Commit holds (reserved -> sold)
    inventory_hold.commit(payment)

    # 2. Resolve or create the purchaser user
    user = resolve_or_create_user_for_booking(
        email=payment.customer_email,
        name=payment.customer_name,
        phone=payment.customer_phone,
    )

    # 3. Create the booking
    event = payment.event
    total_tickets = sum(int(i.get('qty', 0)) for i in payment.items)
    discount_share = (payment.discount_applied / total_tickets) if total_tickets else Decimal('0')

    booking = Booking(
        user=user,
        event=event,
        customer_name=payment.customer_name,
        customer_email=payment.customer_email,
        customer_phone=payment.customer_phone,
        whatsapp_number=payment.whatsapp_number,
        total_amount=payment.amount,
        status=BookingStatus.PAID,
        payment_method=payment.gateway,
        payment_id=payment.provider_payment_id or '',
        discount_applied=payment.discount_applied,
        discount_code=payment.discount_code,
        paid_at=timezone.now(),
        metadata={'payment_id': str(payment.id), 'gateway': payment.gateway},
    )
    booking.save()  # auto-generates booking_reference

    # 4. Issue tickets + QR
    for item in payment.items:
        qty = int(item.get('qty', 0))
        tier = event.tiers.get(pk=item['tier_id']) if item.get('tier_id') else None
        session = event.sessions.filter(pk=item.get('session_id')).first() if item.get('session_id') else None
        attendees = item.get('attendees') or []
        net_paid = (tier.price - discount_share) if tier else Decimal('0')

        for i in range(qty):
            attendee = attendees[i] if i < len(attendees) else {}
            ticket = Ticket(
                booking=booking,
                tier=tier,
                event=event,
                session=session,
                status='active',
                attendee_name=attendee.get('name', payment.customer_name),
                attendee_email=attendee.get('email', ''),
                attendee_phone=attendee.get('phone', ''),
                net_paid_amount=net_paid,
            )
            ticket.save()   # auto-generates unique_code
            
            # Generate QR using existing service
            try:
                ticket.qr_code = QRCodeService.generate_ticket_qr(ticket)
                ticket.save(update_fields=['qr_code'])
            except Exception:
                logger.exception('QR generation failed for ticket %s', ticket.unique_code)

    # 5. Mark payment paid + link booking
    payment.status = PaymentStatus.PAID
    payment.booking = booking
    payment.paid_at = timezone.now()
    payment.amount_captured = payment.amount
    payment.save(update_fields=['status', 'booking', 'paid_at', 'amount_captured', 'updated_at'])

    if hasattr(event, 'update_ticket_counts'):
        event.update_ticket_counts()

    # 6. Emails (non-blocking, using your existing centralized service)
    try:
        booking_emails.send_payment_confirmation(booking)
        booking_emails.send_tickets(booking)
    except Exception:
        logger.exception('📧 Fulfillment email failed (not blocking) for %s', booking.booking_reference)

    logger.info('✅ Payment %s fulfilled -> booking %s', payment.id, booking.booking_reference)
    return booking


@transaction.atomic
def fail_payment(payment_id) -> None:
    payment = Payment.objects.select_for_update().get(pk=payment_id)
    if payment.status == PaymentStatus.PAID:
        return
    inventory_hold.release(payment)
    payment.status = PaymentStatus.FAILED
    payment.save(update_fields=['status', 'updated_at'])
    logger.info('❌ Payment %s marked failed; holds released', payment.id)