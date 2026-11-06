# backend/ticket_bookings/migrations/0039_event_membership_fields.py
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_bookings', '0038_membership_models'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='members_only',
            field=models.BooleanField(
                default=False,
                help_text='When true, only users with an active membership in this organization may view or book.',
            ),
        ),
        migrations.AddField(
            model_name='event',
            name='min_membership_tier',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='events',
                to='ticket_bookings.membershiptier',
                help_text='If set, only members at this tier or higher may view/book this event.',
            ),
        ),
    ]