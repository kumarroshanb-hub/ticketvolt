# backend/ticket_bookings/migrations/0014_ticket_cancellation_fields.py
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_bookings', '0013_alter_checkinlog_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='cancelled_at',
            field=models.DateTimeField(
                null=True,
                blank=True,
                help_text='When this individual ticket was cancelled.',
            ),
        ),
        migrations.AddField(
            model_name='ticket',
            name='cancelled_reason',
            field=models.CharField(
                max_length=255,
                blank=True,
                default='',
                help_text='Free-text reason recorded at cancellation time.',
            ),
        ),
        migrations.AddField(
            model_name='ticket',
            name='refund_amount',
            field=models.DecimalField(
                max_digits=10,
                decimal_places=2,
                default=0,
                help_text='Amount refunded for this specific ticket.',
            ),
        ),
    ]