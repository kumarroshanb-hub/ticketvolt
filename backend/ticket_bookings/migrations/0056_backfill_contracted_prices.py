from django.db import migrations


def backfill(apps, schema_editor):
    TenantSubscription = apps.get_model('ticket_bookings', 'TenantSubscription')
    for sub in TenantSubscription.objects.select_related('plan'):
        changed = []
        if sub.contracted_monthly_price is None:
            sub.contracted_monthly_price = sub.plan.monthly_price
            changed.append('contracted_monthly_price')
        if sub.contracted_yearly_price is None:
            sub.contracted_yearly_price = sub.plan.yearly_price
            changed.append('contracted_yearly_price')
        if changed:
            sub.save(update_fields=changed)


def reverse(apps, schema_editor):
    TenantSubscription = apps.get_model('ticket_bookings', 'TenantSubscription')
    TenantSubscription.objects.update(
        contracted_monthly_price=None, contracted_yearly_price=None,
    )


class Migration(migrations.Migration):
    dependencies = [('ticket_bookings', '0055_subscription_price_lock')]
    operations = [migrations.RunPython(backfill, reverse)]
