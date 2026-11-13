# backend/ticket_bookings/migrations/0025_add_org_fks.py
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_bookings', '0024_tenancy_models'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='organization',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='events',
                to='ticket_bookings.organization',
            ),
        ),
        migrations.AddField(
            model_name='venue',
            name='organization',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='venues',
                to='ticket_bookings.organization',
            ),
        ),
        migrations.AddField(
            model_name='discount',
            name='organization',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='discounts',
                to='ticket_bookings.organization',
            ),
        ),
        migrations.AddField(
            model_name='cancellationpolicy',
            name='organization',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='cancellation_policies',
                to='ticket_bookings.organization',
            ),
        ),
    ]