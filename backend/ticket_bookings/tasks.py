# backend/ticket_bookings/tasks.py
from celery import shared_task
from django.utils import timezone
from django.db.models import Q, F, Sum
from django.core.management import call_command
import logging

logger = logging.getLogger(__name__)


@shared_task
def update_completed_events():
    """
    Task to update event status to 'completed' when end_date is in the past.
    Runs periodically (e.g., every 15 minutes).
    """
    from ticket_bookings.models import Event

    now = timezone.now()

    # Find events where:
    # - end_date is in the past
    # - status is NOT already 'completed' or 'cancelled'
    # - status is 'active', 'published', 'draft', 'sold_out', or 'postponed'

    past_events = Event.objects.filter(
        end_date__lt=now,
        status__in=['active', 'published', 'draft', 'sold_out', 'postponed']
    ).exclude(
        status__in=['completed', 'cancelled']
    )

    count = past_events.count()

    if count > 0:
        # Snapshot the events *before* the update() so we can log them.
        # (QuerySet.update() returns an int and doesn't re-evaluate; iterating
        # the same queryset after the update would return 0 rows because the
        # status filter no longer matches.)
        updated_event_ids = list(past_events.values_list('id', flat=True))
        updated_titles = list(past_events.values_list('title', flat=True))

        updated = past_events.update(status='completed')
        logger.info(f"✅ Updated {updated} events to 'completed' status")

        for event_id, title in zip(updated_event_ids, updated_titles):
            logger.info(f"  - Event: {title} (ID: {event_id})")

        return {
            'success': True,
            'updated_count': updated,
            'events': [
                {'id': str(event_id), 'title': title}
                for event_id, title in zip(updated_event_ids, updated_titles)
            ],
        }
    else:
        logger.info("ℹ️ No events found to update to 'completed' status")
        return {
            'success': True,
            'updated_count': 0,
            'message': 'No events need status update'
        }


@shared_task
def update_sold_out_events():
    """
    Task to update event status to 'sold_out' when all tickets are sold.
    This complements the completed events task.
    """
    from ticket_bookings.models import Event

    now = timezone.now()

    # Find events that are active/published but all tickets sold
    # Get events where total_tickets_sold >= sum of tier quantities
    events_to_update = Event.objects.filter(
        status__in=['active', 'published'],
        end_date__gte=now,  # Only future events
    ).annotate(
        total_tier_quantity=Sum('tiers__quantity_total')
    ).filter(
        total_tickets_sold__gte=F('total_tier_quantity')
    )

    count = events_to_update.count()

    if count > 0:
        updated = events_to_update.update(status='sold_out')
        logger.info(f"✅ Updated {updated} events to 'sold_out' status")
        return {
            'success': True,
            'updated_count': updated
        }

    logger.info("ℹ️ No events found to update to 'sold_out' status")
    return {
        'success': True,
        'updated_count': 0
    }


@shared_task
def update_event_status():
    """
    Combined task that updates both completed and sold_out events.
    Can be scheduled to run periodically.
    """
    completed_result = update_completed_events()
    sold_out_result = update_sold_out_events()

    return {
        'completed': completed_result,
        'sold_out': sold_out_result
    }


# ===========================================================================
# ✅ FIX [CLEANUP]: prune expired JWT records.
# ---------------------------------------------------------------------------
# SimpleJWT writes a row to OutstandingToken every time a refresh token
# is issued or rotated, and a BlacklistedToken row every time one is
# revoked (logout, ROTATE_REFRESH_TOKENS, or SINGLE_SESSION_LOGIN).
#
# With REFRESH_TOKEN_LIFETIME = 12h and ROTATE_REFRESH_TOKENS = True, an
# active user produces ~2 rows/hour while the tab is open. Across many
# users, token_blacklist_outstandingtoken grows without bound and every
# JWTAuthentication call does a lookup against BlacklistedToken.
#
# `flushexpiredtokens` deletes every OutstandingToken whose expires_at is
# in the past, cascading to its BlacklistedToken row. Idempotent and
# cheap (one DELETE per table).
#
# Called by run_scheduled_tasks() in views.py, which is what GitHub
# Actions hits. Also schedulable via Celery Beat if you ever add a paid
# worker.
# ===========================================================================

@shared_task
def flush_expired_tokens():
    """
    Prune expired OutstandingToken / BlacklistedToken rows.

    Returns:
        {'status': 'ok'} on success
        {'status': 'error', 'detail': '<message>'} on failure

    Never raises. A failure here must not fail the whole cron run —
    event-status updates are the primary job.
    """
    try:
        call_command('flushexpiredtokens')
        logger.info('🧹 flushexpiredtokens: pruned expired JWT rows')
        return {'status': 'ok'}
    except Exception as exc:
        logger.exception('flushexpiredtokens failed: %s', exc)
        return {'status': 'error', 'detail': str(exc)}

@shared_task
def release_expired_payment_holds():
    from .services import inventory_hold
    released = inventory_hold.release_expired_holds()
    if released:
        logger.info('Released %d expired payment holds', released)


@shared_task
def reconcile_payment(payment_id):
    """Sync a stuck payment against the gateway's authoritative status."""
    from .models_payments import Payment, PaymentStatus
    from .services.payments import get_provider
    from .services.payment_fulfillment import fulfill_payment, fail_payment

    payment = Payment.objects.get(pk=payment_id)
    if payment.status in (PaymentStatus.PAID, PaymentStatus.REFUNDED):
        return
    provider = get_provider(payment.gateway, organization=payment.organization)
    gw_status = provider.fetch_status(payment)

    if gw_status in ('captured', 'succeeded'):
        fulfill_payment(payment.id)
    elif gw_status in ('failed', 'canceled'):
        fail_payment(payment.id)


@shared_task
def send_donation_receipts():
    """Issue and email donation receipts for paid bookings.

    Runs independently of the payment gateway so direct/offline bookings
    are covered too. The receipt number is allocated once.
    """
    from ticket_bookings.models import Booking
    from ticket_bookings.services.booking_emails import send_billing_receipt
    from ticket_bookings.managers import SOLD_BOOKING_STATUSES

    sent = 0
    skipped = 0
    qs = Booking.objects.filter(
        status__in=SOLD_BOOKING_STATUSES,
        donation_amount__gt=0,
        donation_tax_receipt_number__isnull=True,
    ).select_related('event__organization')[:500]
    for booking in qs:
        org = booking.event.organization
        if not org.auto_email_donation_receipt or not booking.donation_tax_eligible:
            skipped += 1
            continue
        result = send_billing_receipt(booking, attach_tax_receipt=True)
        if result.get('success'):
            sent += 1
        else:
            skipped += 1
    return {'sent': sent, 'skipped': skipped}


@shared_task
def send_event_reminders():
    """Send 2-day and morning-of reminders for paid bookings."""
    from datetime import timedelta
    from django.conf import settings
    from django.core.mail import EmailMultiAlternatives
    from ticket_bookings.models import Event, Booking
    from ticket_bookings.managers import SOLD_BOOKING_STATUSES

    now = timezone.now()
    today = timezone.localdate()
    targets = {
        'reminder_2d_sent_at': today + timedelta(days=2),
        'reminder_day_sent_at': today,
    }
    sent = 0
    for field, target_date in targets.items():
        events = Event.objects.filter(
            start_date__date=target_date,
            status__in=('active', 'published'),
        )
        for event in events:
            bookings = Booking.objects.filter(
                event=event,
                status__in=SOLD_BOOKING_STATUSES,
                **{f'{field}__isnull': True},
            ).exclude(customer_email='')
            for booking in bookings:
                when = 'tomorrow' if field == 'reminder_2d_sent_at' else 'today'
                subject = f'Reminder: {event.title} is {when}'
                venue = getattr(event.venue, 'name', '') if event.venue else ''
                body = (
                    f'Hello {booking.customer_name},\n\n'
                    f'This is a reminder that {event.title} is {when}.\n'
                    f'Start: {event.start_date:%d %b %Y %H:%M}\n'
                    f'Venue: {venue}\n\n'
                    f'Booking reference: {booking.booking_reference}\n'
                    f'Please have your QR ticket ready at the door.\n'
                )
                try:
                    EmailMultiAlternatives(
                        subject=subject,
                        body=body,
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        to=[booking.customer_email],
                    ).send(fail_silently=True)
                    setattr(booking, field, now)
                    booking.save(update_fields=[field])
                    sent += 1
                except Exception:
                    logger.exception('Reminder failed for booking %s', booking.booking_reference)
    return {'sent': sent}
