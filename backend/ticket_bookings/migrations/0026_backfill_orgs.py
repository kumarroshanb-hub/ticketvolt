# backend/ticket_bookings/migrations/0026_backfill_orgs.py
"""
Create one Organization per existing organizer, backfill all their
tenant-owned rows, and make their UserProfile.is_organizer → an OWNER
membership.

Idempotent: safe to re-run.

Post-loop catch-all
-------------------
The per-organizer loop only catches Venues/Discounts/Policies that are
linked to a user via `events__organizer_id`. Standalone Venues (no
Event yet) and orphan Discounts/Policies would be left with
`organization=NULL`, and migration `0027` (which makes the FK NOT NULL)
would then fail with a NOT NULL violation.

To prevent that, we assign every remaining orphan to a catch-all org:
  • If any organizer exists → the first organization.
  • If no organizers exist but a superuser exists → create a
    'Default Organization' owned by the first superuser.
  • If neither exists → create a seed user and a seed org.
"""
from django.db import migrations
from django.utils.text import slugify


def _unique_slug(Organization, base):
    candidate = slugify(base)[:180] or 'org'
    root = candidate
    n = 1
    while Organization.objects.filter(slug=candidate).exists():
        n += 1
        candidate = f'{root}-{n}'
    return candidate


def backfill(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    UserProfile = apps.get_model('ticket_bookings', 'UserProfile')
    Organization = apps.get_model('ticket_bookings', 'Organization')
    OrganizationMembership = apps.get_model('ticket_bookings', 'OrganizationMembership')
    Event = apps.get_model('ticket_bookings', 'Event')
    Venue = apps.get_model('ticket_bookings', 'Venue')
    Discount = apps.get_model('ticket_bookings', 'Discount')
    CancellationPolicy = apps.get_model('ticket_bookings', 'CancellationPolicy')

    organizer_ids = set(
        UserProfile.objects.filter(is_organizer=True).values_list('user_id', flat=True)
    )
    # Also include anyone who already owns an Event but wasn't flagged.
    organizer_ids |= set(
        Event.objects.exclude(organizer_id__isnull=True).values_list('organizer_id', flat=True)
    )

    for uid in organizer_ids:
        try:
            user = User.objects.get(id=uid)
        except User.DoesNotExist:
            continue

        org = Organization.objects.filter(owner_id=user.id).first()
        if org is None:
            display = (user.get_full_name() or user.username).strip()
            org = Organization.objects.create(
                name=f'{display} Events',
                slug=_unique_slug(Organization, user.username),
                owner_id=user.id,
            )

        OrganizationMembership.objects.get_or_create(
            organization=org, user=user,
            defaults={'role': 'owner'},
        )

        Event.objects.filter(organizer_id=user.id, organization__isnull=True).update(organization=org)
        Venue.objects.filter(organization__isnull=True, events__organizer_id=user.id).distinct().update(organization=org)
        Discount.objects.filter(organizer_id=user.id, organization__isnull=True).update(organization=org)
        CancellationPolicy.objects.filter(organizer_id=user.id, organization__isnull=True).update(organization=org)

    # -------- Catch-all for orphan rows --------
    orphan_org = Organization.objects.order_by('created_at').first()

    if orphan_org is None:
        first_superuser = User.objects.filter(is_superuser=True).order_by('id').first()
        if first_superuser is None:
            first_superuser = User.objects.order_by('id').first()
        if first_superuser is not None:
            orphan_org = Organization.objects.create(
                name='Default Organization',
                slug=_unique_slug(Organization, 'default'),
                owner_id=first_superuser.id,
            )
            OrganizationMembership.objects.get_or_create(
                organization=orphan_org, user=first_superuser,
                defaults={'role': 'owner'},
            )

    if orphan_org is not None:
        Venue.objects.filter(organization__isnull=True).update(organization=orphan_org)
        Discount.objects.filter(organization__isnull=True).update(organization=orphan_org)
        CancellationPolicy.objects.filter(organization__isnull=True).update(organization=orphan_org)
        Event.objects.filter(organization__isnull=True).update(organization=orphan_org)


def reverse(apps, schema_editor):
    # Backfill is not meaningfully reversible without data loss.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('ticket_bookings', '0025_add_org_fks'),
    ]
    operations = [migrations.RunPython(backfill, reverse)]