# backend/ticket_bookings/api/payments_api.py
import logging
from decimal import Decimal

from django.conf import settings
from django.utils import timezone
from django.db import transaction

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ..models import Event, TicketTier
from ..models_payments import Payment, PaymentGateway, PaymentStatus, WebhookEvent
from ..services import inventory_hold
from ..services.payments import get_provider
from ..services.payment_fulfillment import fulfill_payment, fail_payment, PaymentStateError
from ..services.tenancy import can_operate_org
from ..models import SystemSettings

logger = logging.getLogger(__name__)

def _are_payments_enabled():
    try:
        return SystemSettings.get().payments_enabled
    except Exception:
        return False
    
# ---------------------------------------------------------------------------
# Server-side amount computation (never trust the client)
# ---------------------------------------------------------------------------
def _compute_amount(event, items):
    subtotal = Decimal('0.00')
    normalized = []
    for item in items:
        tier_id = str(item.get('tier_id', '')).strip()
        qty = int(item.get('qty', 0))
        if not tier_id or qty <= 0:
            continue
        tier = TicketTier.objects.filter(pk=tier_id, event=event).first()
        if not tier:
            raise ValueError(f'Tier {tier_id} not found for this event.')
        if qty > tier.max_per_order:
            raise ValueError(f'Maximum {tier.max_per_order} tickets per order for {tier.name}.')
        subtotal += Decimal(tier.price) * qty
        normalized.append({
            'tier_id': str(tier.id),
            'session_id': item.get('session_id'),
            'qty': qty,
            'attendees': item.get('attendees', []),
        })
    if not normalized:
        raise ValueError('No valid tickets in request.')
    return subtotal, normalized


# ---------------------------------------------------------------------------
# 1. CREATE CHECKOUT
# ---------------------------------------------------------------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def create_checkout(request):
    # ✅ BLOCK CHECKOUT IF DISABLED
    if not _are_payments_enabled():
        return Response(
            {'error': 'Online payments are currently disabled by the platform administrator. Please choose an offline payment method or contact support.'}, 
            status=status.HTTP_403_FORBIDDEN
        )
    data = request.data
    event_id = data.get('event_id')
    gateway_name = (data.get('gateway') or settings.PAYMENTS['DEFAULT_GATEWAY']).lower()
    customer = data.get('customer') or {}

    try:
        event = Event.objects.select_related('organization').get(pk=event_id)
    except (Event.DoesNotExist, ValueError):
        return Response({'error': 'Event not found.'}, status=404)

    if gateway_name not in dict(PaymentGateway.choices):
        return Response({'error': f'Unsupported gateway: {gateway_name}'}, status=400)

    # Only paid flows go through a gateway
    if event.event_flow == Event.EventFlow.FREE_REGISTRATION:
        return Response({'error': 'This is a free event. Use the free registration flow.'}, status=400)

    if not customer.get('email'):
        return Response({'error': 'customer.email is required.'}, status=400)

    try:
        subtotal, items = _compute_amount(event, data.get('items', []))
    except ValueError as e:
        return Response({'error': str(e)}, status=400)

    # Currency must match the tenant's configured currency
    currency = event.organization.currency_code

    provider = get_provider(gateway_name)

    with transaction.atomic():
        payment = Payment.objects.create(
            organization=event.organization,
            event=event,
            gateway=gateway_name,
            currency=currency,
            amount=subtotal,
            customer_name=customer.get('name', ''),
            customer_email=customer['email'].lower().strip(),
            customer_phone=customer.get('phone', ''),
            whatsapp_number=customer.get('whatsapp_number', ''),
            items=items,
            status=PaymentStatus.CREATED,
            hold_expires_at=timezone.now() + timezone.timedelta(
                minutes=settings.PAYMENTS['HOLD_TTL_MINUTES']
            ),
        )

        # Reserve inventory (atomic; raises on shortage -> rolls back Payment via outer caller)
        try:
            inventory_hold.acquire(payment)
        except inventory_hold.InsufficientInventoryError as e:
            payment.delete()
            return Response({'error': str(e)}, status=409)

        # Create gateway order/intent
        checkout = provider.create_order(payment)
        payment.provider_order_id = checkout['provider_order_id']
        payment.checkout = checkout.get('client', {})
        payment.save(update_fields=['provider_order_id', 'checkout', 'updated_at'])

    return Response({
        'payment_id': str(payment.id),
        'gateway': gateway_name,
        'amount': str(payment.amount),
        'currency': currency,
        'order_id': payment.provider_order_id,
        'expires_at': payment.hold_expires_at,
        'client': payment.checkout,      # razorpay config OR stripe client_secret
    }, status=201)


# ---------------------------------------------------------------------------
# 2. VERIFY CHECKOUT (sync return; idempotent — races webhook safely)
# ---------------------------------------------------------------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def verify_checkout(request):
    payment_id = request.data.get('payment_id')
    params = request.data.get('params') or request.data

    try:
        payment = Payment.objects.get(pk=payment_id)
    except (Payment.DoesNotExist, ValueError):
        return Response({'error': 'Payment not found.'}, status=404)

    # Already fulfilled by webhook?
    if payment.status == PaymentStatus.PAID and payment.booking_id:
        return Response({'status': 'paid', 'booking_reference': payment.booking.booking_reference})

    provider = get_provider(payment.gateway)
    if not provider.verify_checkout(payment, params):
        return Response({'error': 'Payment verification failed.'}, status=400)

    payment.provider_payment_id = params.get('razorpay_payment_id') or payment.provider_payment_id
    payment.save(update_fields=['provider_payment_id', 'updated_at'])

    try:
        booking = fulfill_payment(payment.id)
        return Response({'status': 'paid', 'booking_reference': booking.booking_reference})
    except PaymentStateError as e:
        return Response({'error': str(e)}, status=409)


# ---------------------------------------------------------------------------
# 3. CHECKOUT STATUS (frontend polling)
# ---------------------------------------------------------------------------
@api_view(['GET'])
@permission_classes([AllowAny])
def checkout_status(request, payment_id):
    try:
        payment = Payment.objects.get(pk=payment_id)
    except (Payment.DoesNotExist, ValueError):
        return Response({'error': 'Payment not found.'}, status=404)
    return Response({
        'status': payment.status,
        'booking_reference': payment.booking.booking_reference if payment.booking else None,
    })


# ---------------------------------------------------------------------------
# 4. WEBHOOKS (signature-verified + idempotent)
# ---------------------------------------------------------------------------
def _process_webhook(provider_name, body, headers):
    provider = get_provider(provider_name)
    result = provider.parse_webhook(body, headers)
    if not result.valid:
        return Response({'error': 'Invalid signature.'}, status=400)

    # Idempotency ledger
    if WebhookEvent.objects.filter(gateway=provider_name, provider_event_id=result.provider_event_id).exists():
        return Response({'status': 'duplicate'})

    # Resolve payment by order id (primary) — provider payment id as fallback
    payment = None
    if result.provider_order_id:
        payment = Payment.objects.filter(provider_order_id=result.provider_order_id).first()
    if payment is None and result.provider_payment_id:
        payment = Payment.objects.filter(provider_payment_id=result.provider_payment_id).first()

    action_taken = 'ignored'
    if payment is not None:
        if result.action == 'paid':
            payment.provider_payment_id = result.provider_payment_id or payment.provider_payment_id
            payment.save(update_fields=['provider_payment_id', 'updated_at'])
            try:
                fulfill_payment(payment.id)
                action_taken = 'fulfilled'
            except PaymentStateError:
                action_taken = 'already_processed'
        elif result.action == 'failed':
            fail_payment(payment.id)
            action_taken = 'failed'
        elif result.action == 'refunded':
            action_taken = 'refunded_noted'   # refund flow handled in refund endpoint

    WebhookEvent.objects.create(
        gateway=provider_name,
        provider_event_id=result.provider_event_id,
        event_type=result.event_type,
        payment=payment,
        action=action_taken,
        raw=result.raw,
    )
    return Response({'status': 'ok'})


@api_view(['POST'])
@permission_classes([AllowAny])
def razorpay_webhook(request):
    return _process_webhook('razorpay', request.body, request.headers)


@api_view(['POST'])
@permission_classes([AllowAny])
def stripe_webhook(request):
    return _process_webhook('stripe', request.body, request.headers)


# ---------------------------------------------------------------------------
# 5. REFUND (tenant-scoped)
# ---------------------------------------------------------------------------
@api_view(['POST'])
@permission_classes([AllowAny])  # swap to IsAuthenticated + org check in real wiring
def refund_payment(request, payment_id):
    try:
        payment = Payment.objects.select_related('organization').get(pk=payment_id)
    except (Payment.DoesNotExist, ValueError):
        return Response({'error': 'Payment not found.'}, status=404)

    # TENANCY: only managers of the payment's org (or platform admin) may refund
    if not can_operate_org(request.user, payment.organization):
        return Response({'error': 'Permission denied.'}, status=403)

    if payment.status != PaymentStatus.PAID:
        return Response({'error': f'Cannot refund payment in status {payment.status}.'}, status=400)

    amount = Decimal(str(request.data.get('amount') or payment.amount))
    remaining = payment.amount - payment.amount_refunded
    if amount <= 0 or amount > remaining:
        return Response({'error': f'Invalid refund amount (max {remaining}).'}, status=400)

    provider = get_provider(payment.gateway)
    try:
        provider_refund = provider.refund(payment, amount, request.data.get('reason', ''))
    except Exception:
        logger.exception('Gateway refund failed for payment=%s', payment.id)
        return Response({'error': 'Gateway refund failed.'}, status=502)

    from ..models_payments import PaymentRefund
    PaymentRefund.objects.create(
        payment=payment,
        provider_refund_id=provider_refund.get('id'),
        amount=amount,
        reason=request.data.get('reason', ''),
        status='processed',
        raw=provider_refund if isinstance(provider_refund, dict) else {},
    )
    payment.amount_refunded += amount
    payment.status = (PaymentStatus.REFUNDED if payment.amount_refunded >= payment.amount
                      else PaymentStatus.PARTIALLY_REFUNDED)
    payment.save(update_fields=['amount_refunded', 'status', 'updated_at'])

    # Cancel tickets + notify (reuse existing refund pipeline)
    try:
        from ..services.ticket_cancellation import cancel_tickets, CancellationError
        
        active_tickets = list(payment.booking.tickets.filter(status='active').values_list('id', flat=True))
        if active_tickets:
            cancel_tickets(
                booking=payment.booking,
                ticket_ids=active_tickets,
                reason=f"Refund issued via {payment.gateway} ({payment.provider_payment_id})",
                user=request.user,
                allow_used=False
            )
            
            # Send refund email using existing service
            from ..services import booking_emails
            booking_emails.send_refund(payment.booking)
            
    except Exception:
        logger.exception('Ticket cancellation/email on refund failed for booking=%s', payment.booking_id)

    return Response({'status': payment.status, 'refunded': str(payment.amount_refunded)})