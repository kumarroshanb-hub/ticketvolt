from django.db import migrations


def demote_platform_staff(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    User.objects.filter(is_staff=True, is_superuser=False).update(is_staff=False)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_bookings', '0045_membership_unique_constraints'),
    ]

    operations = [
        migrations.RunPython(demote_platform_staff, noop),
    ]