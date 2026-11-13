from django.db import migrations, models
from django.db.models import Q


def owners_to_property(apps, schema_editor):
    OrganizationMembership = apps.get_model(
        'ticket_bookings', 'OrganizationMembership',
    )
    OrganizationMembership.objects.filter(role='owner').update(
        role='admin', is_owner=True,
    )


def owners_to_role(apps, schema_editor):
    OrganizationMembership = apps.get_model(
        'ticket_bookings', 'OrganizationMembership',
    )
    OrganizationMembership.objects.filter(is_owner=True).update(
        role='owner', is_owner=False,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_bookings', '0049_venuemaster_eventvenueplan_eventseatcategory_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='organizationmembership',
            name='is_owner',
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text=(
                    'True if this Admin-level member is the organization '
                    'owner. At most one live owner per organization.'
                ),
            ),
        ),
        migrations.RunPython(owners_to_property, owners_to_role),
        migrations.RemoveConstraint(
            model_name='organizationmembership',
            name='one_live_owner_per_org',
        ),
        migrations.AddConstraint(
            model_name='organizationmembership',
            constraint=models.UniqueConstraint(
                condition=Q(
                    is_owner=True,
                    removed_at__isnull=True,
                    is_active=True,
                ),
                fields=('organization',),
                name='one_live_owner_per_org',
            ),
        ),
    ]
