from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('ticket_bookings', '0046_remove_platform_staff_role'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='organization',
            name='owner',
        ),
        # OR: operations = []   (if keeping the FK as a cache)
    ]