# backend/ticket_bookings/migrations/0027_org_fks_required.py
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_bookings', '0026_backfill_orgs'),
    ]

    operations = [
        migrations.AlterField(
            model_name='event',
            name='organization',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='events',
                to='ticket_bookings.organization',
            ),
        ),
        migrations.AlterField(
            model_name='venue',
            name='organization',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='venues',
                to='ticket_bookings.organization',
            ),
        ),
        migrations.AlterField(
            model_name='discount',
            name='organization',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='discounts',
                to='ticket_bookings.organization',
            ),
        ),
        migrations.AlterField(
            model_name='cancellationpolicy',
            name='organization',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='cancellation_policies',
                to='ticket_bookings.organization',
            ),
        ),
    ]