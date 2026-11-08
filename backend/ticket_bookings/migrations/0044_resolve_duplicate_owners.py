from django.db import migrations, models


def resolve_duplicate_owners(apps, schema_editor):
    ...  # body from my earlier message


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_bookings', '0043_organization_owner_nullable'),
    ]

    operations = [
        migrations.RunPython(resolve_duplicate_owners, noop),
    ]