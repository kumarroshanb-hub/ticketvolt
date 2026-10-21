# backend/ticket_bookings/migrations/0016_cancellation_policies_and_discount_enhancements.py

import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('ticket_bookings', '0015_booking_refund_amount'),
    ]

    operations = [
        # ---------------- CancellationPolicy ----------------
        migrations.CreateModel(
            name='CancellationPolicy',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=120)),
                ('description', models.TextField(blank=True)),
                ('rules', models.JSONField(default=dict)),
                ('is_active', models.BooleanField(default=True)),
                ('is_default', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organizer', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='cancellation_policies',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-is_default', 'name'],
            },
        ),
        migrations.AddConstraint(
            model_name='cancellationpolicy',
            constraint=models.UniqueConstraint(
                condition=models.Q(is_default=True),
                fields=('organizer',),
                name='unique_default_policy_per_organizer',
            ),
        ),

        # ---------------- Event FK ----------------
        migrations.AddField(
            model_name='event',
            name='cancellation_policy',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='events',
                to='ticket_bookings.cancellationpolicy',
            ),
        ),

        # ---------------- Booking snapshot ----------------
        migrations.AddField(
            model_name='booking',
            name='cancellation_policy_snapshot',
            field=models.JSONField(blank=True, default=dict),
        ),

        # ---------------- Ticket refund metadata ----------------
        migrations.AddField(
            model_name='ticket',
            name='net_paid_amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name='ticket',
            name='refund_percent_applied',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='ticket',
            name='cancellation_fee_applied',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),

        # ---------------- Discount enhancements ----------------
        migrations.AddField(
            model_name='discount',
            name='applicable_events',
            field=models.ManyToManyField(
                blank=True, related_name='applicable_discounts',
                to='ticket_bookings.event',
            ),
        ),
        migrations.AddField(
            model_name='discount',
            name='max_uses_per_user',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='discount',
            name='min_ticket_count',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='discount',
            name='first_time_buyers_only',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='discount',
            name='stackable',
            field=models.BooleanField(default=False),
        ),

        # ---------------- DiscountUsage ----------------
        migrations.CreateModel(
            name='DiscountUsage',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, primary_key=True, serialize=False)),
                ('amount_applied', models.DecimalField(decimal_places=2, max_digits=10)),
                ('applied_at', models.DateTimeField(auto_now_add=True)),
                ('reversed_at', models.DateTimeField(blank=True, null=True)),
                ('discount', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='usages',
                    to='ticket_bookings.discount',
                )),
                ('booking', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='discount_usages',
                    to='ticket_bookings.booking',
                )),
                ('user', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='discount_usages',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-applied_at'],
            },
        ),
        migrations.AddIndex(
            model_name='discountusage',
            index=models.Index(fields=['discount', 'user'], name='discount_usage_disc_user_idx'),
        ),
    ]