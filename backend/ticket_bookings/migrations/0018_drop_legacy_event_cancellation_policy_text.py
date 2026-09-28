# backend/ticket_bookings/migrations/0018_drop_legacy_event_cancellation_policy_text.py
from django.db import migrations


class Migration(migrations.Migration):
    """
    Drop the legacy `cancellation_policy` TEXT column on Event.

    Before 0016, `Event.cancellation_policy` was a TextField. In 0016 the
    field was repurposed as an FK to CancellationPolicy, but Django's
    autodetector treated it as a new field named `cancellation_policy_id`
    and left the old TEXT column orphaned with a NOT NULL constraint.

    Every INSERT into ticket_bookings_event was therefore rejected for
    missing a value in a column the model no longer writes to.

    This migration explicitly drops the orphan.
    """

    dependencies = [
        ('ticket_bookings', '0017_rename_discount_usage_disc_user_idx_disc_usage_disc_user_idx_and_more'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE ticket_bookings_event
                DROP COLUMN IF EXISTS cancellation_policy;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]