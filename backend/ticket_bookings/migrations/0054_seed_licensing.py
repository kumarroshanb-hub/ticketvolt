from django.db import migrations
from django.utils import timezone
from datetime import timedelta


PLANS = [
    {
        'code': 'free',
        'name': 'Free',
        'description': 'Get started with the essentials.',
        'monthly_price': 0,
        'yearly_price': 0,
        'features': ['reports.basic', 'analytics.basic'],
        'limits': {'events': 5, 'tickets_per_month': 500, 'staff_seats': 2},
        'sort_order': 1,
    },
    {
        'code': 'professional',
        'name': 'Professional',
        'description': 'For growing organisers running regular events.',
        'monthly_price': 499,
        'yearly_price': 4990,
        'features': [
            'reports.basic', 'reports.advanced', 'analytics.advanced',
            'custom_branding', 'api_access',
        ],
        'limits': {'events': 100, 'tickets_per_month': 50000, 'staff_seats': 20},
        'sort_order': 2,
    },
    {
        'code': 'enterprise',
        'name': 'Enterprise',
        'description': 'Advanced controls, integrations and support.',
        'monthly_price': 1499,
        'yearly_price': 14990,
        'features': [
            'reports.basic', 'reports.advanced', 'analytics.advanced',
            'custom_branding', 'api_access', 'sso', 'audit_logs',
        ],
        'limits': {},
        'sort_order': 3,
    },
]


def seed(apps, schema_editor):
    PlatformPlan = apps.get_model('ticket_bookings', 'PlatformPlan')
    Organization = apps.get_model('ticket_bookings', 'Organization')
    TenantSubscription = apps.get_model('ticket_bookings', 'TenantSubscription')

    plans = {}
    for data in PLANS:
        plan, _ = PlatformPlan.objects.update_or_create(
            code=data['code'], defaults=data,
        )
        plans[data['code']] = plan

    free = plans['free']
    now = timezone.now()
    for org in Organization.objects.all():
        TenantSubscription.objects.get_or_create(
            organization=org,
            defaults={
                'plan': free,
                'status': 'active',
                'billing_period': 'monthly',
                'current_period_start': now,
                'current_period_end': now + timedelta(days=30),
            },
        )


def unseed(apps, schema_editor):
    PlatformPlan = apps.get_model('ticket_bookings', 'PlatformPlan')
    PlatformPlan.objects.filter(code__in=[p['code'] for p in PLANS]).delete()


class Migration(migrations.Migration):
    dependencies = [('ticket_bookings', '0053_platform_licensing')]
    operations = [migrations.RunPython(seed, unseed)]
