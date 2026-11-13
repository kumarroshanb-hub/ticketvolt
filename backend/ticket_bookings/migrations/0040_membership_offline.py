# backend/ticket_bookings/migrations/0040_membership_offline.py
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('ticket_bookings', '0039_event_membership_fields'),
    ]

    operations = [
        # ---- Status choices: add pending_offline / rejected ----
        migrations.AlterField(
            model_name='membership',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending_offline', 'Pending offline payment'),
                    ('pending', 'Pending gateway payment'),
                    ('active', 'Active'),
                    ('expired', 'Expired'),
                    ('cancelled', 'Cancelled'),
                    ('rejected', 'Rejected (offline payment)'),
                    ('refunded', 'Refunded'),
                ],
                default='pending', max_length=20,
            ),
        ),

        # ---- Offline payment tracking fields ----
        migrations.AddField(
            model_name='membership',
            name='payment_method',
            field=models.CharField(
                choices=[
                    ('online', 'Online (gateway)'),
                    ('cash', 'Cash'),
                    ('offline', 'Other offline (bank transfer, cheque, …)'),
                ],
                default='online', max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='membership',
            name='offline_reference',
            field=models.CharField(
                blank=True, default='', max_length=128,
                help_text='Reference the user quoted at signup (e.g. receipt no., bank ref).',
            ),
        ),
        migrations.AddField(
            model_name='membership',
            name='reviewed_by',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='reviewed_memberships',
                to=settings.AUTH_USER_MODEL,
                help_text='The owner/admin who activated or rejected an offline membership.',
            ),
        ),
        migrations.AddField(
            model_name='membership',
            name='reviewed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),

        # ---- New composite index for the pending-offline queue ----
        migrations.AddIndex(
            model_name='membership',
            index=models.Index(
                fields=['organization', 'status', 'payment_method'],
                name='memb_org_status_method_idx',
            ),
        ),
    ]