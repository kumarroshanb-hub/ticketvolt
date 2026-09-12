# backend/ticket_bookings/management/commands/update_event_status.py
from django.core.management.base import BaseCommand
from django.utils import timezone
from ticket_bookings.models import Event
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Update event status to completed for events whose end_date has passed'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be updated without actually updating'
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed output for each event'
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        verbose = options.get('verbose', False)
        now = timezone.now()
        
        # Find events that should be completed
        past_events = Event.objects.filter(
            end_date__lt=now,
            status__in=['active', 'published', 'draft', 'sold_out', 'postponed']
        ).exclude(
            status__in=['completed', 'cancelled']
        )
        
        count = past_events.count()
        
        self.stdout.write(self.style.WARNING(f"Found {count} events with past end dates that should be marked as completed"))
        
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made"))
            for event in past_events:
                self.stdout.write(f"  - {event.title} (ID: {event.id}) - End: {event.end_date}")
        else:
            # Update events
            updated = past_events.update(status='completed')
            self.stdout.write(self.style.SUCCESS(f"✅ Updated {updated} events to 'completed' status"))
            
            if verbose:
                self.stdout.write("\nUpdated events:")
                for event in Event.objects.filter(status='completed', updated_at__gte=now):
                    self.stdout.write(f"  - {event.title} (ID: {event.id})")
        
        self.stdout.write(self.style.SUCCESS("Command completed successfully"))