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