from django.db import migrations, models


def reclass_customer_to_member(apps, schema_editor):
    OrganizationMembership = apps.get_model('ticket_bookings', 'OrganizationMembership')
    # In the 6-tier model a "customer" who has a User account is a Member;
    # a true guest simply has no membership row at all.
    OrganizationMembership.objects.filter(role='customer').update(role='member')


def noop_reverse(apps, schema_editor):
    # Cannot reliably restore 'customer' (no marker distinguishes it from
    # a genuine member). Intentional no-op.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_bookings', '0028_remove_cancellationpolicy_unique_default_policy_per_organizer_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='organizationmembership',
            name='role',
            field=models.CharField(
                choices=[
                    ('owner', 'Owner'),
                    ('admin', 'Admin'),
                    ('staff', 'Staff'),
                    ('member', 'Member'),
                ],
                default='member',
                max_length=20,
            ),
        ),
        migrations.RunPython(reclass_customer_to_member, noop_reverse),
    ]