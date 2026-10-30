# backend/ticket_bookings/migrations/0024_tenancy_models.py
import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('ticket_bookings', '0023_userprofile_last_active'),
    ]

    operations = [
        migrations.CreateModel(
            name='Organization',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('slug', models.SlugField(max_length=200, unique=True)),
                ('currency_code', models.CharField(default='HKD', max_length=3)),
                ('currency_symbol', models.CharField(default='HK$', max_length=8)),
                ('currency_locale', models.CharField(default='en-HK', max_length=16)),
                ('country', models.CharField(default='Hong Kong', max_length=100)),
                ('country_code', models.CharField(default='HK', max_length=2)),
                ('default_timezone', models.CharField(default='Asia/Hong_Kong', max_length=64)),
                ('org_email', models.EmailField(blank=True, default='', max_length=254)),
                ('org_logo_url', models.URLField(blank=True, default='')),
                ('email_from_name', models.CharField(blank=True, default='', max_length=120)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('owner', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='owned_organizations',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['name']},
        ),
        migrations.AddIndex(
            model_name='organization',
            index=models.Index(fields=['slug'], name='org_slug_idx'),
        ),
        migrations.CreateModel(
            name='OrganizationMembership',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, primary_key=True, serialize=False)),
                ('role', models.CharField(
                    choices=[
                        ('owner', 'Owner'), ('admin', 'Admin'),
                        ('staff', 'Staff'), ('member', 'Member'),
                        ('customer', 'Customer'),
                    ],
                    default='member', max_length=20,
                )),
                ('display_name', models.CharField(blank=True, max_length=200)),
                ('phone', models.CharField(blank=True, max_length=20)),
                ('joined_at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='memberships', to='ticket_bookings.organization',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='org_memberships', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['-joined_at']},
        ),
        migrations.AlterUniqueTogether(
            name='organizationmembership',
            unique_together={('organization', 'user')},
        ),
        migrations.AddIndex(
            model_name='organizationmembership',
            index=models.Index(fields=['organization', 'role'], name='orgmem_org_role_idx'),
        ),
        migrations.AddIndex(
            model_name='organizationmembership',
            index=models.Index(fields=['user', 'role'], name='orgmem_user_role_idx'),
        ),
        migrations.CreateModel(
            name='OrganizationContact',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, primary_key=True, serialize=False)),
                ('email', models.EmailField(max_length=254)),
                ('name', models.CharField(blank=True, max_length=200)),
                ('phone', models.CharField(blank=True, max_length=20)),
                ('first_seen_at', models.DateTimeField(auto_now_add=True)),
                ('unsubscribed', models.BooleanField(default=False)),
                ('organization', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='contacts', to='ticket_bookings.organization',
                )),
                ('user', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='org_contacts', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['-first_seen_at']},
        ),
        migrations.AlterUniqueTogether(
            name='organizationcontact',
            unique_together={('organization', 'email')},
        ),
        migrations.AddIndex(
            model_name='organizationcontact',
            index=models.Index(fields=['organization', 'email'], name='orgcontact_org_email_idx'),
        ),
    ]