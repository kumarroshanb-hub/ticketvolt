# backend/ticket_bookings/migrations/0043_organization_owner_nullable.py
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('ticket_bookings', '0042_organizationmembershipevent_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='organization',
            name='owner',
            field=models.ForeignKey(
                blank=True,
                help_text=(
                    'The tenant OWNER. Null until a Platform Admin assigns '
                    'an owner. Superusers are never owners of a tenant they '
                    'created — they sit above every org.'
                ),
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='owned_organizations',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]