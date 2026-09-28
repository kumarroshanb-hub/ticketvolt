# backend/ticket_bookings/migrations/0015_booking_refund_amount.py
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_bookings', '0014_ticket_cancellation_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='booking',
            name='refund_amount',
            field=models.DecimalField(
                max_digits=10,
                decimal_places=2,
                default=0,
                help_text=(
                    'Accumulated refund total from partial cancellations. '
                    'booking.total_amount stays as the original charge.'
                ),
            ),
        ),
    ]