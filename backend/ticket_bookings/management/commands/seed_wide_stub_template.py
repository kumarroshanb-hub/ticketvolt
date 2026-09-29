# backend/ticket_bookings/management/commands/seed_wide_stub_template.py
"""
Seed a wide-stub ticket template for an event.

Usage:
    python manage.py seed_wide_stub_template --list-events
    python manage.py seed_wide_stub_template --event <event-uuid>
    python manage.py seed_wide_stub_template --event <event-uuid> --overwrite
"""
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

from ticket_bookings.models import Event, EventTemplate, EventTemplateType


DEFAULT_IMAGE = 'media/event_templates/ticket_wide_stub_gold.png'

CONFIG = {
    "fields": {
        "event_title": {"x": 0.44, "y": 0.16, "font_size": 0.040,
                        "color": "#8B1A1A", "align": "center"},
        "event_date": {"x": 0.36, "y": 0.36, "font_size": 0.018,
                       "color": "#1A202C", "align": "center"},
        "event_date_secondary": {"x": 0.36, "y": 0.42, "font_size": 0.013,
                                 "color": "#4A5568", "align": "center"},
        "venue_label": {"x": 0.53, "y": 0.34, "font_size": 0.012,
                        "color": "#4A5568", "align": "left"},
        "venue_value": {"x": 0.53, "y": 0.39, "font_size": 0.013,
                        "color": "#1A202C", "align": "left"},
        "attendee_label": {"x": 0.235, "y": 0.52, "font_size": 0.011,
                           "color": "#4A5568", "align": "left"},
        "attendee_value": {"x": 0.235, "y": 0.57, "font_size": 0.014,
                           "color": "#1A202C", "align": "left"},
        "booking_label": {"x": 0.235, "y": 0.63, "font_size": 0.011,
                          "color": "#4A5568", "align": "left"},
        "booking_value": {"x": 0.235, "y": 0.68, "font_size": 0.013,
                          "color": "#1A202C", "align": "left"},
        "ticket_code_label": {"x": 0.53, "y": 0.63, "font_size": 0.011,
                              "color": "#4A5568", "align": "left"},
        "ticket_code_value": {"x": 0.53, "y": 0.68, "font_size": 0.013,
                              "color": "#1A202C", "align": "left"},
        "ticket_number": {"x": 0.835, "y": 0.13, "font_size": 0.030,
                          "color": "#8B1A1A", "align": "center", "enabled": True},
        "qr_code": {"x": 0.7875, "y": 0.2917, "size": 0.142},
        "slot_time_label": {"x": 0.835, "y": 0.76, "font_size": 0.011,
                            "color": "#4A5568", "align": "center"},
        "slot_time_value": {"x": 0.835, "y": 0.82, "font_size": 0.018,
                            "color": "#1A202C", "align": "center"},
    },
    "template_type": "ticket",
    "orientation": "landscape",
    "shape": "wide_stub",
}


class Command(BaseCommand):
    help = 'Seed a wide-stub ticket template for an event.'

    def add_arguments(self, parser):
        parser.add_argument('--event', '-e',
                            help='Event UUID to attach the template to.')
        parser.add_argument('--image', '-i', default=DEFAULT_IMAGE,
                            help=f'Path to the template PNG (default: {DEFAULT_IMAGE}).')
        parser.add_argument('--name', default='Wide Stub Ticket',
                            help='Template name.')
        parser.add_argument('--overwrite', action='store_true',
                            help='Overwrite an existing template with the same name.')
        parser.add_argument('--list-events', action='store_true',
                            help='List all events and exit.')

    def handle(self, *args, **options):
        if options['list_events']:
            return self._list_events()

        event_id = options.get('event')
        if not event_id:
            self.stderr.write(self.style.ERROR(
                'Missing --event. Use --list-events to see available events.'
            ))
            return

        event = self._get_event(event_id)
        if event is None:
            return

        image_path = Path(options['image'])
        if not image_path.is_absolute():
            image_path = Path(settings.BASE_DIR) / image_path

        if not image_path.exists():
            self.stderr.write(self.style.ERROR(
                f'Image not found: {image_path}\n'
                f'  Pass --image <path> to point at the file.'
            ))
            return

        self._seed(event=event, image_path=image_path,
                   name=options['name'], overwrite=options['overwrite'])

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
        ttype, _ = EventTemplateType.objects.get_or_create(
            slug='ticket',
            defaults={'name': 'Ticket', 'is_active': True},
        )

        existing = EventTemplate.objects.filter(event=event, name=name).first()
        if existing and not overwrite:
            self.stdout.write(self.style.WARNING(
                f'⚠️  Template "{name}" already exists. Pass --overwrite to replace.'
            ))
            return

        EventTemplate.objects.filter(
            event=event, template_type=ttype, is_default=True,
        ).update(is_default=False)

        if existing:
            template = existing
            template.config = CONFIG
            template.template_type = ttype
            template.is_default = True
            template.is_active = True
        else:
            template = EventTemplate(
                event=event, template_type=ttype, name=name,
                description='Generic 2.5:1 stub-style ticket',
                config=CONFIG, is_default=True, is_active=True,
            )

        with image_path.open('rb') as fh:
            template.image.save(image_path.name, File(fh), save=False)
        template.save()

        action = 'Updated' if existing else 'Created'
        self.stdout.write(self.style.SUCCESS(
            f'✅ {action} template "{template.name}"'
        ))
        self.stdout.write(f'   Event:    {event.title}')
        self.stdout.write(f'   Template: {template.id}')
        self.stdout.write(f'   Image:    {template.image.name}')
        self.stdout.write(f'   Default:  {template.is_default}')