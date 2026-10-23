# backend/ticket_bookings/management/commands/seed_wide_stub_template.py
from pathlib import Path
from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand
from ticket_bookings.models import Event, EventTemplate, EventTemplateType

DEFAULT_IMAGE = 'media/event_templates/my_custom_ticket.png'

CONFIG = {
    "fields": {
        # =====================================================================
        # ROW 1: EVENT, DATE, TIME
        # =====================================================================
        # Labels
        "ticket_code_label": {"x": 0.085, "y": 0.40, "font_size": 22, "color": "#4A5568", "align": "left", "enabled": True},
        "booking_label":     {"x": 0.275, "y": 0.40, "font_size": 22, "color": "#4A5568", "align": "left", "enabled": True},
        "organizer":         {"x": 0.465, "y": 0.40, "font_size": 22, "color": "#4A5568", "align": "left", "enabled": True},
        
        # Values (Moved up to y: 0.455 to sit closer to labels)
        "event_title":       {"x": 0.085, "y": 0.455, "font_size": 36, "color": "#1A202C", "align": "left"},
        "event_date":        {"x": 0.275, "y": 0.455, "font_size": 32, "color": "#1A202C", "align": "left"},
        "slot_time_value":   {"x": 0.465, "y": 0.455, "font_size": 32, "color": "#1A202C", "align": "left", "enabled": True},

        # =====================================================================
        # ROW 2: VENUE, TICKET NO., TICKET TYPE
        # =====================================================================
        # Labels
        "venue_label":       {"x": 0.085, "y": 0.64, "font_size": 22, "color": "#4A5568", "align": "left", "enabled": True},
        "attendee_label":    {"x": 0.275, "y": 0.64, "font_size": 22, "color": "#4A5568", "align": "left", "enabled": True},
        "slot_time_label":   {"x": 0.465, "y": 0.64, "font_size": 22, "color": "#4A5568", "align": "left", "enabled": True},
        
        # Values (Moved up to y: 0.695 to sit closer to labels)
        "venue_value":       {"x": 0.085, "y": 0.695, "font_size": 20, "color": "#1A202C", "align": "left"},
        "ticket_number":     {"x": 0.275, "y": 0.695, "font_size": 32, "color": "#1A202C", "align": "left", "enabled": True},
        "attendee_value":    {"x": 0.465, "y": 0.695, "font_size": 32, "color": "#1A202C", "align": "left"},

        # =====================================================================
        # RIGHT SIDE: QR CODE
        # =====================================================================
        # Centered in the right black square
        "qr_code": {"x": 0.825, "y": 0.50, "size": 270},

        # Hide unused fields
        "organizer_sub": {"enabled": False},
        "event_date_secondary": {"enabled": False},
        "booking_value": {"enabled": False},
        "admit_one": {"enabled": False},
        "ticket_code_value": {"enabled": False},
    },
    "template_type": "ticket",
    "orientation": "landscape",
    "shape": "wide_stub",
}


class Command(BaseCommand):
    help = 'Seed a wide-stub ticket template for an event.'

    def add_arguments(self, parser):
        parser.add_argument('--event', '-e', help='Event UUID to attach the template to.')
        parser.add_argument('--image', '-i', default=DEFAULT_IMAGE, help='Path to the template PNG.')
        parser.add_argument('--name', default='Wide Stub Ticket', help='Template name.')
        parser.add_argument('--overwrite', action='store_true', help='Overwrite an existing template.')
        parser.add_argument('--list-events', action='store_true', help='List all events and exit.')

    def handle(self, *args, **options):
        if options['list_events']:
            return self._list_events()

        event_id = options.get('event')
        if not event_id:
            self.stderr.write(self.style.ERROR('Missing --event.'))
            return

        event = self._get_event(event_id)
        if event is None:
            return

        image_path = Path(options['image'])
        if not image_path.is_absolute():
            image_path = Path(settings.BASE_DIR) / image_path

        if not image_path.exists():
            self.stderr.write(self.style.ERROR(f'Image not found: {image_path}'))
            return

        self._seed(event=event, image_path=image_path, name=options['name'], overwrite=options['overwrite'])

    def _list_events(self):
        events = Event.objects.all().order_by('-created_at')
        if not events.exists():
            self.stdout.write('No events found.')
            return
        self.stdout.write(self.style.MIGRATE_HEADING('\nAvailable events:\n'))
        for e in events:
            self.stdout.write(f'  {e.id}  |  {e.title}  |  status={e.status}')
        self.stdout.write('')

    def _get_event(self, event_id):
        try:
            return Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            self.stderr.write(self.style.ERROR(f'Event not found: {event_id}'))
        except (ValueError, TypeError):
            self.stderr.write(self.style.ERROR(f'Invalid UUID: {event_id}'))
        return None

    def _seed(self, *, event, image_path, name, overwrite):
        ttype, _ = EventTemplateType.objects.get_or_create(slug='ticket', defaults={'name': 'Ticket', 'is_active': True})
        existing = EventTemplate.objects.filter(event=event, name=name).first()

        if existing and not overwrite:
            self.stdout.write(self.style.WARNING(f'⚠️  Template "{name}" already exists. Pass --overwrite to replace.'))
            return

        EventTemplate.objects.filter(event=event, template_type=ttype, is_default=True).update(is_default=False)

        if existing:
            template = existing
            template.config = CONFIG
            template.template_type = ttype
            template.is_default = True
            template.is_active = True
        else:
            template = EventTemplate(
                event=event, template_type=ttype, name=name,
                description='Custom 4:1 stub-style ticket',
                config=CONFIG, is_default=True, is_active=True,
            )

        with image_path.open('rb') as fh:
            template.image.save(image_path.name, File(fh), save=False)
        template.save()

        self.stdout.write(self.style.SUCCESS(f'✅ {"Updated" if existing else "Created"} template "{template.name}"'))