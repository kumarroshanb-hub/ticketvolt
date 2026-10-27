# backend/ticket_bookings/migrations/0021_system_settings.py
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_default_settings(apps, schema_editor):
    SystemSettings = apps.get_model('ticket_bookings', 'SystemSettings')
    SystemSettings.objects.get_or_create(
        pk=1,
        defaults={
            'currency_code': 'HKD',
            'currency_symbol': 'HK$',
            'currency_locale': 'en-HK',
            'country': 'Hong Kong',
            'country_code': 'HK',
            'default_timezone': 'Asia/Hong_Kong',
            'org_name': 'TicketVolt',
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('ticket_bookings', '0020_event_event_flow'),
    ]

    operations = [
        migrations.CreateModel(
            name='SystemSettings',
            fields=[
                ('id', models.PositiveSmallIntegerField(default=1, primary_key=True, serialize=False)),
                ('currency_code', models.CharField(default='HKD', max_length=3)),
                ('currency_symbol', models.CharField(default='HK$', max_length=8)),
                ('currency_locale', models.CharField(default='en-HK', max_length=16)),
                ('country', models.CharField(default='Hong Kong', max_length=100)),
                ('country_code', models.CharField(default='HK', max_length=2)),
                ('default_timezone', models.CharField(default='Asia/Hong_Kong', max_length=64)),
                ('org_name', models.CharField(blank=True, default='TiketVault', max_length=200)),
                ('org_email', models.EmailField(blank=True, default='', max_length=254)),
                ('org_logo_url', models.URLField(blank=True, default='')),
                ('email_from_name', models.CharField(blank=True, default='', max_length=120)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'System Settings',
                'verbose_name_plural': 'System Settings',
            },
        ),
        migrations.RunPython(seed_default_settings, migrations.RunPython.noop),
    ]