"""
One-off backfill for VenueMaster snapshots.

Before the layout-upload fix, `upload_venue_layout` bumped the master
*before* the parser bulk-created the seats. Existing venues can therefore
have a current master whose `snapshot.layout.seats` is empty even though
`/venues/<id>/layout/` returns seats. Run this once after deploying:

    python manage.py rebuild_venue_masters --dry-run
    python manage.py rebuild_venue_masters
    python manage.py rebuild_venue_masters --venue-id <uuid>

It is idempotent: `bump_venue_master` skips venues whose snapshot has not
changed.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from ticket_bookings.models import Venue
from ticket_bookings.services.venue_snapshot import (
    build_venue_snapshot,
    snapshot_differs,
)
from ticket_bookings.services.venue_versioning import bump_venue_master


class Command(BaseCommand):
    help = (
        'Rebuild current VenueMaster snapshots from live venue/layout data. '
        'Fixes masters created before seats were bulk-inserted.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--venue-id',
            dest='venue_id',
            default=None,
            help='Only rebuild a single venue (UUID).',
        )
        parser.add_argument(
            '--reserved-only',
            dest='reserved_only',
            action='store_true',
            help='Only venues with has_reserved_seating=True.',
        )
        parser.add_argument(
            '--dry-run',
            dest='dry_run',
            action='store_true',
            help='Report what would change without writing.',
        )

    def handle(self, *args, **options):
        qs = Venue.objects.all().order_by('name')
        if options['venue_id']:
            qs = qs.filter(pk=options['venue_id'])
        if options['reserved_only']:
            qs = qs.filter(has_reserved_seating=True)

        checked = changed = failed = 0

        for venue in qs.iterator():
            checked += 1
            current = (
                venue.masters
                .filter(is_current=True)
                .order_by('-version')
                .first()
            )
            live = build_venue_snapshot(venue)
            live_seats = len((live.get('layout') or {}).get('seats') or [])
            current_seats = len(
                ((current.snapshot or {}).get('layout') or {}).get('seats') or []
            ) if current else 0

            needs_rebuild = (
                current is None
                or snapshot_differs(current.snapshot, live)
            )

            if not needs_rebuild:
                continue

            changed += 1
            self.stdout.write(
                f'{venue.name} ({venue.pk}): '
                f'master seats {current_seats} -> live seats {live_seats}'
            )

            if options['dry_run']:
                continue

            try:
                with transaction.atomic():
                    bump_venue_master(
                        venue,
                        actor=None,
                        reason='rebuild_venue_masters_command',
                    )
            except Exception as exc:  # pragma: no cover - operational safety
                failed += 1
                self.stderr.write(f'  FAILED: {exc}')

        suffix = ' (dry run)' if options['dry_run'] else ''
        self.stdout.write(self.style.SUCCESS(
            f'Checked {checked}, rebuilt {changed}, failed {failed}{suffix}.'
        ))
