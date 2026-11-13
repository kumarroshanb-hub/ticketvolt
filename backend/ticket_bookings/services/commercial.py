"""Commercial operations: invoice numbering, payouts, transfers, audit."""
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from ..models import (
    AuditLog, Booking, OrganizerPayout, Ticket, TicketTransfer,
    SOLD_BOOKING_STATUSES,
)


def next_invoice_number(organization):
    """Allocate the next per-tenant invoice number atomically."""
    from ..models import Organization

    with transaction.atomic():
        org = Organization.objects.select_for_update().get(pk=organization.pk)
        number = f'{org.invoice_prefix or "INV"}-{org.invoice_next_number:06d}'
        org.invoice_next_number = (org.invoice_next_number or 1) + 1
        org.save(update_fields=['invoice_next_number'])
        return number


def calculate_payout(organization, period_start, period_end, actor=None):
    bookings = Booking.objects.filter(
        event__organization=organization,
        status__in=SOLD_BOOKING_STATUSES,
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    )
    gross = bookings.aggregate(v=Sum('total_amount'))['v'] or Decimal('0.00')
    refunds = bookings.aggregate(v=Sum('refund_amount'))['v'] or Decimal('0.00')
    fee_percent = organization.platform_fee_percent or Decimal('0.00')
    platform_fee = ((gross - refunds) * fee_percent / Decimal('100')).quantize(Decimal('0.01'))
    net = (gross - refunds - platform_fee).quantize(Decimal('0.01'))
    payout, _ = OrganizerPayout.objects.update_or_create(
        organization=organization,
        period_start=period_start,
        period_end=period_end,
        defaults={
            'reference': f'PAY-{organization.slug[:8].upper()}-{period_end:%Y%m%d}',
            'gross_sales': gross,
            'refunds': refunds,
            'platform_fee': platform_fee,
            'net_payout': net,
            'created_by': actor,
        },
    )
    return payout


def create_ticket_transfer(ticket, user, to_email, days=7):
    if ticket.status != 'active':
        raise ValueError('Only active tickets can be transferred.')
    if ticket.booking.user_id != getattr(user, 'id', None):
        raise PermissionError('You do not own this ticket.')
    if not to_email:
        raise ValueError('Recipient email is required.')
    return TicketTransfer.objects.create(
        ticket=ticket,
        from_user=user,
        to_email=to_email,
        expires_at=timezone.now() + timedelta(days=days),
    )


@transaction.atomic
def accept_ticket_transfer(transfer, user):
    locked = TicketTransfer.objects.select_for_update().get(pk=transfer.pk)
    if not locked.is_open:
        raise ValueError('This transfer is no longer available.')
    if (user.email or '').lower() != (locked.to_email or '').lower():
        raise PermissionError('This transfer was sent to a different email address.')
    ticket = locked.ticket
    if ticket.status != 'active':
        raise ValueError('This ticket is no longer active.')
    ticket.attendee_name = user.get_full_name() or user.username
    ticket.attendee_email = user.email
    # Regenerate the ticket code/QR so the previous holder's code is
    # invalidated at acceptance time.
    ticket.unique_code = ''
    ticket.qr_code = ''
    ticket.save()
    try:
        from .qr_service import QRCodeService
        ticket.qr_code = QRCodeService.generate_ticket_qr(ticket)
        ticket.save(update_fields=['qr_code'])
    except Exception:
        pass
    locked.status = TicketTransfer.Status.ACCEPTED
    locked.accepted_by = user
    locked.accepted_at = timezone.now()
    locked.save(update_fields=['status', 'accepted_by', 'accepted_at'])
    return locked


def log_audit(*, organization=None, actor=None, action, request=None, **detail):
    try:
        AuditLog.objects.create(
            organization=organization,
            actor=actor if getattr(actor, 'is_authenticated', False) else None,
            action=action,
            method=getattr(request, 'method', '') if request else '',
            path=getattr(request, 'path', '') if request else '',
            ip_address=(
                request.META.get('REMOTE_ADDR') if request else None
            ),
            detail=detail,
        )
    except Exception:
        pass
