# backend/ticket_bookings/migrations/0038_membership_models.py
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('ticket_bookings', '0037_ticket_seat_alter_ticket_tier'),
    ]

    operations = [
        migrations.CreateModel(
            name='MembershipTier',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, primary_key=True, serialize=False)),
                ('slug', models.SlugField(max_length=120)),
                ('name', models.CharField(max_length=120)),
                ('description', models.TextField(blank=True)),
                ('price', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=10)),
                ('currency_code', models.CharField(blank=True, default='', max_length=3)),
                ('billing_period', models.CharField(
                    choices=[('one_time', 'One-time'), ('monthly', 'Monthly'),
                             ('quarterly', 'Quarterly'), ('yearly', 'Yearly')],
                    default='yearly', max_length=20,
                )),
                ('duration_days', models.PositiveIntegerField(default=365)),
                ('max_members', models.PositiveSmallIntegerField(default=1)),
                ('benefits', models.JSONField(blank=True, default=dict)),
                ('is_active', models.BooleanField(default=True)),
                ('is_public', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='membership_tiers',
                    to='ticket_bookings.organization',
                )),
            ],
            options={
                'ordering': ['organization', 'price'],
                'unique_together': {('organization', 'slug')},
            },
        ),
        migrations.AddIndex(
            model_name='membershiptier',
            index=models.Index(fields=['organization', 'is_active'], name='mt_org_active_idx'),
        ),
        migrations.CreateModel(
            name='Membership',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, primary_key=True, serialize=False)),
                ('price_paid', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('currency_code', models.CharField(default='', max_length=3)),
                ('status', models.CharField(
                    choices=[('pending', 'Pending payment'), ('active', 'Active'),
                             ('expired', 'Expired'), ('cancelled', 'Cancelled'),
                             ('refunded', 'Refunded')],
                    default='pending', max_length=20,
                )),
                ('started_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('valid_until', models.DateTimeField(blank=True, null=True)),
                ('membership_payment_id', models.CharField(blank=True, max_length=128)),
                ('cancelled_at', models.DateTimeField(blank=True, null=True)),
                ('cancelled_reason', models.CharField(blank=True, default='', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='paid_memberships',
                    to='ticket_bookings.organization',
                )),
                ('tier', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='memberships',
                    to='ticket_bookings.membershiptier',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='memberships',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.AddIndex(
            model_name='membership',
            index=models.Index(fields=['user', 'organization', 'status'], name='memb_user_org_status_idx'),
        ),
        migrations.AddIndex(
            model_name='membership',
            index=models.Index(fields=['organization', 'valid_until'], name='memb_org_valid_until_idx'),
        ),
        migrations.CreateModel(
            name='MembershipDependent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, primary_key=True, serialize=False)),
                ('full_name', models.CharField(max_length=200)),
                ('email', models.EmailField(blank=True)),
                ('phone', models.CharField(blank=True, max_length=20)),
                ('date_of_birth', models.DateField(blank=True, null=True)),
                ('relationship', models.CharField(
                    choices=[('spouse', 'Spouse'), ('child', 'Child'),
                             ('parent', 'Parent'), ('sibling', 'Sibling'),
                             ('other', 'Other')],
                    default='other', max_length=20,
                )),
                ('member_code', models.CharField(db_index=True, max_length=20, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('membership', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='dependents',
                    to='ticket_bookings.membership',
                )),
                ('promoted_user', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='dependent_profiles',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['membership', 'full_name']},
        ),
        migrations.AddIndex(
            model_name='membershipdependent',
            index=models.Index(fields=['member_code'], name='membdep_code_idx'),
        ),
        migrations.CreateModel(
            name='MembershipPayment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, primary_key=True, serialize=False)),
                ('gateway', models.CharField(max_length=16)),
                ('provider_order_id', models.CharField(blank=True, max_length=128, null=True, unique=True)),
                ('provider_payment_id', models.CharField(blank=True, max_length=128, null=True)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('currency', models.CharField(max_length=8)),
                ('status', models.CharField(
                    choices=[('created', 'Created'), ('pending', 'Pending'),
                             ('paid', 'Paid'), ('failed', 'Failed'),
                             ('expired', 'Expired'), ('refunded', 'Refunded')],
                    default='created', max_length=20,
                )),
                ('checkout', models.JSONField(default=dict)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('membership', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='payments',
                    to='ticket_bookings.membership',
                )),
                ('organization', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='membership_payments',
                    to='ticket_bookings.organization',
                )),
                ('tier', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    to='ticket_bookings.membershiptier',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='membership_payments',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.AddIndex(
            model_name='membershippayment',
            index=models.Index(fields=['provider_order_id'], name='membpay_provider_order_idx'),
        ),
        migrations.AddIndex(
            model_name='membershippayment',
            index=models.Index(fields=['user', 'status'], name='membpay_user_status_idx'),
        ),
    ]