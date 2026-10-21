# backend/ticket_bookings/migrations/0020_event_event_flow.py
from django.db import migrations, models


def backfill_event_flow(apps, schema_editor):
    Event = apps.get_model('ticket_bookings', 'Event')
    Event.objects.all().update(event_flow='ticketed')


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_bookings', '0019_alter_eventtemplate_config'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='event_flow',
            field=models.CharField(
                choices=[
                    ('ticketed', 'Ticketed Event'),
                    ('free_registration', 'Free Registration'),
                    ('paid_registration', 'Paid Registration'),
                ],
                default='ticketed',
                max_length=32,
                help_text=(
                    'Controls the booking pipeline for this event:\n'
                    '  • ticketed          — pay per seat, per-attendee tickets\n'
                    '  • free_registration — RSVP, auto-confirmed, no payment\n'
                    '  • paid_registration — flat fee, single pass, no per-attendee tickets'
                ),
            ),
        ),
        migrations.RunPython(backfill_event_flow, migrations.RunPython.noop),
    ]