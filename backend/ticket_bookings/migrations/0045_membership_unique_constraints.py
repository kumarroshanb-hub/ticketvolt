from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_bookings', '0044_resolve_duplicate_owners'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='organizationmembership',
            constraint=models.UniqueConstraint(
                fields=['organization'],
                condition=models.Q(role='owner', removed_at__isnull=True, is_active=True),
                name='one_live_owner_per_org',
            ),
        ),
        migrations.AddConstraint(
            model_name='organizationmembership',
            constraint=models.UniqueConstraint(
                fields=['organization', 'user'],
                condition=models.Q(removed_at__isnull=True),
                name='one_live_membership_per_user_per_org',
            ),
        ),
    ]