# backend/ticket_bookings/services/venue_versioning.py
"""
Single write path for VenueMaster rows.

A master row is a *snapshot* of the live Venue + SeatLayout + SeatCategory
palette at a point in time. Because the snapshot is expensive to build
(one query per seat) and because `unique_together(venue, version)` is
load-bearing, every bump must:

  • be serialised per Venue (SELECT ... FOR UPDATE), and
  • rebuild the snapshot from the locked row, not from a stale instance,
  • be suppressible so bulk operations (SVG re-upload, bulk seat delete)
    do not create one master row per seat.

NOTE: the live `SeatLayout` signal only fires *before* the parser has
created seats, so callers that bulk-create seats MUST call
`bump_venue_master()` explicitly once the write is complete. See
`api/venue_layout_api.py::upload_venue_layout`.
"""
import logging
import threading
from contextlib import contextmanager

from django.db import transaction
from django.db.models import Max

logger = logging.getLogger(__name__)

# Thread-local (NOT module-global) so two concurrent requests cannot
# suppress each other's bumps or share a pending-venue set.
_state = threading.local()


def _depth():
    return getattr(_state, 'depth', 0)


def _pending():
    if not hasattr(_state, 'pending'):
        # venue.pk -> (venue, actor, reason); last write wins.
        _state.pending = {}
    return _state.pending


@contextmanager
def suppress_bumps():
    """Defer master bumps until the outermost block exits.

    Use around bulk seat deletes/creates. The deferred flush rebuilds one
    snapshot per touched venue, after the final state is committed.
    """
    _state.depth = _depth() + 1
    try:
        yield
    finally:
        _state.depth = _depth() - 1
        if _depth() == 0 and _pending():
            pending = list(_pending().values())
            _pending().clear()
            for venue, actor, reason in pending:
                _do_bump(venue, actor=actor, reason=f'deferred_{reason}')


def bump_venue_master(venue, *, actor=None, reason='unspecified'):
    if _depth() > 0:
        _pending()[venue.pk] = (venue, actor, reason)
        return
    _do_bump(venue, actor=actor, reason=reason)


def _do_bump(venue, *, actor, reason):
    from ..models import Venue
    from ..models_venue_master import VenueMaster
    from .venue_snapshot import build_venue_snapshot, snapshot_differs

    if venue is None or venue.pk is None:
        return

    try:
        with transaction.atomic():
            # Serialise bumps for this venue. Without the lock two
            # concurrent saves can both read the same Max(version) and
            # collide on unique_together(venue, version).
            locked = Venue.objects.select_for_update().get(pk=venue.pk)
            snapshot = build_venue_snapshot(locked)

            current = (
                VenueMaster.objects
                .filter(venue=locked, is_current=True)
                .order_by('-version')
                .first()
            )

            if current is not None and not snapshot_differs(current.snapshot, snapshot):
                return

            layout = snapshot.get('layout') or {}
            has_seats = bool(layout.get('seats'))

            # Collapse the initial empty placeholder. A venue created
            # without a layout gets v1 with zero seats; when the first
            # real layout is attached moments later we replace that
            # placeholder instead of leaving a useless v1 + v2. Safe only
            # while no EventVenuePlan references it.
            if (
                current is not None
                and not current.has_layout
                and has_seats
                and current.version == 1
            ):
                from ..models_event_venue import EventVenuePlan
                if not EventVenuePlan.objects.filter(
                    venue_master=current,
                ).exists():
                    current.delete()
                    current = None

            next_version = (
                VenueMaster.objects
                .filter(venue=locked)
                .aggregate(high=Max('version'))
                .get('high')
                or 0
            ) + 1

            VenueMaster.objects.filter(venue=locked, is_current=True).update(
                is_current=False,
            )

            VenueMaster.objects.create(
                venue=locked,
                version=next_version,
                is_current=True,
                snapshot=snapshot,
                # `has_layout` now means "the snapshot actually contains
                # seats". A layout dict with an empty seats list must NOT
                # be reported as usable to the event wizard.
                has_layout=has_seats,
                has_reserved_seating=bool(locked.has_reserved_seating),
                name=locked.name,
                city=locked.city or '',
                country=locked.country or '',
                venue_type=locked.venue_type or '',
                created_by=actor,
            )

        logger.info(
            'VenueMaster v%d created for venue=%s (reason=%s)',
            next_version, venue.pk, reason,
        )
    except Exception:
        # Never let an audit/versioning failure break the primary write
        # (the venue/layout has already been saved). Log loudly so it is
        # visible in production.
        logger.exception(
            'Failed to create VenueMaster for venue=%s (reason=%s)',
            venue.pk, reason,
        )
