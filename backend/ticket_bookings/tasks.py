# backend/ticket_bookings/tasks.py
from celery import shared_task
from django.utils import timezone
from django.db.models import Q, F, Sum
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
        # Update all past events to 'completed'
        updated = past_events.update(status='completed')
        logger.info(f"✅ Updated {updated} events to 'completed' status")
        
        # Log which events were updated
        for event in past_events:
            logger.info(f"  - Event: {event.title} (ID: {event.id}) - End date: {event.end_date}")
        
        return {
            'success': True,
            'updated_count': updated,
            'events': [{'id': str(e.id), 'title': e.title} for e in past_events]
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