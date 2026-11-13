# backend/ticket_bookings/services/event_venue_plan.py
"""
The single write path for EventVenuePlan and its categories.

Both operations live here so the invariants in models_event_venue.py are
enforced at exactly one place:

  provision_venue_plan(...)  — called once, on event create.
  freeze_venue_plan(...)     — called once, on event publish.
"""
import logging
from datetime import datetime, timezone as dt_timezone

from django.db import transaction

from ..models_event_venue import EventSeatCategory, EventVenuePlan

logger = logging.getLogger(__name__)


class EventVenuePlanError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Provisioning
# ---------------------------------------------------------------------------

@transaction.atomic
def provision_venue_plan(
    *,
    event,
    venue_master,
    seat_assignments: dict | None = None,
    category_overrides: list | None = None,
):
    """
    Create the EventVenuePlan + EventSeatCategory rows for `event`.

    Parameters
    ----------
    event : Event
        The (already-saved) event. Its venue must match venue_master.venue.
    venue_master : VenueMaster
        The specific version being used. Its id is tagged onto the plan.
    seat_assignments : dict, optional
        { seat_id: category_name | palette_category_id | event_category_id }.
        Names and palette ids are resolved to real EventSeatCategory rows
        created below; already-created event ids pass straight through.
    category_overrides : list, optional
        [{ name, hex_color, price }] — any categories the caller wants
        present beyond the template palette. Merged with the palette by
        name; overrides win.

    Returns
    -------
    EventVenuePlan
    """
    if venue_master is None:
        raise EventVenuePlanError('venue_master is required.')

    # NOTE: VenueMaster is a shared cross-tenant catalog. The master may
    # belong to another organization; what matters is that the event
    # pins this exact version (PROTECT FK) so later venue edits do not
    # mutate this event's seat map.
    if event.venue_id and event.venue_id != venue_master.venue_id:
        raise EventVenuePlanError(
            'VenueMaster belongs to a different Venue than the event.'
        )

    if EventVenuePlan.objects.filter(event=event).exists():
        raise EventVenuePlanError(
            'This event already has a venue plan.'
        )

    snapshot = venue_master.snapshot or {}
    palette = snapshot.get('category_palette') or []
    seat_layout = snapshot.get('layout') or {}
    valid_seat_ids = {s['id'] for s in seat_layout.get('seats', [])}

    # ---- 1. Build effective category list (palette + overrides) ----
    by_name: dict[str, dict] = {}
    for cat in palette:
        name = (cat.get('name') or '').strip()
        if not name:
            continue
        by_name[name] = {
            'name': name,
            'hex_color': cat.get('hex_color') or '#4CAF50',
            'price': float(cat.get('default_price') or 0),
            'source_palette_category_id': cat.get('id') or '',
        }

    for ov in (category_overrides or []):
        name = (ov.get('name') or '').strip()
        if not name:
            raise EventVenuePlanError('Category override is missing a name.')
        existing = by_name.get(name, {})
        by_name[name] = {
            'name': name,
            'hex_color': ov.get('hex_color') or existing.get('hex_color') or '#4CAF50',
            'price': float(
                ov.get('price') if ov.get('price') is not None
                else existing.get('price') or 0
            ),
            'source_palette_category_id': (
                ov.get('source_palette_category_id')
                or existing.get('source_palette_category_id')
                or ''
            ),
        }

    # ---- 2. Persist the plan + categories ----
    plan = EventVenuePlan.objects.create(
        event=event,
        venue_master=venue_master,
        seat_assignments={},
    )

    categories_by_name: dict[str, EventSeatCategory] = {}
    for name, payload in by_name.items():
        cat = EventSeatCategory.objects.create(
            venue_plan=plan,
            name=payload['name'],
            hex_color=payload['hex_color'],
            price=payload['price'],
            source_palette_category_id=payload['source_palette_category_id'],
        )
        categories_by_name[cat.name] = cat

    # ---- 3. Resolve seat assignments ----
    assignments: dict[str, str] = {}
    for seat_id, category_ref in (seat_assignments or {}).items():
        seat_str = str(seat_id)
        if seat_str not in valid_seat_ids:
            raise EventVenuePlanError(
                f'Seat {seat_str} is not part of this venue master.'
            )

        category = _resolve_category(
            plan, categories_by_name, str(category_ref),
        )
        if category is None:
            raise EventVenuePlanError(
                f'Category {category_ref!r} does not exist for this event.'
            )
        assignments[seat_str] = str(category.id)

    plan.seat_assignments = assignments
    plan.save(update_fields=['seat_assignments', 'updated_at'])

    # Pin the physical-venue fields onto the EVENT as well. The plan
    # already pins the seat map; this makes venue name/address display
    # event-level too, so a later edit by the owning tenant (which
    # creates a new master version) cannot rewrite an existing event.
    # Never overwrite caller-supplied metadata.
    if not (event.venue_metadata or {}):
        event.venue_metadata = {
            'venue_id': str(venue_master.venue_id),
            'venue_master_id': str(venue_master.id),
            'venue_master_version': venue_master.version,
            'name': snapshot.get('name') or '',
            'address_line1': snapshot.get('address_line1') or '',
            'address_line2': snapshot.get('address_line2') or '',
            'city': snapshot.get('city') or '',
            'state': snapshot.get('state') or '',
            'postal_code': snapshot.get('postal_code') or '',
            'country': snapshot.get('country') or '',
            'latitude': snapshot.get('latitude'),
            'longitude': snapshot.get('longitude'),
            'map_url': snapshot.get('map_url') or '',
            'has_reserved_seating': bool(
                snapshot.get('has_reserved_seating')
            ),
        }
        event.save(update_fields=['venue_metadata'])

    logger.info(
        'EventVenuePlan created: event=%s master=%s (v%d) cats=%d assigned=%d',
        event.id, venue_master.id, venue_master.version,
        len(categories_by_name), len(assignments),
    )
    return plan


def _resolve_category(plan, categories_by_name, ref: str):
    # Order matters: name → palette id → event id.
    if ref in categories_by_name:
        return categories_by_name[ref]
    palette_hit = (
        plan.categories
        .filter(source_palette_category_id=ref)
        .first()
    )
    if palette_hit is not None:
        return palette_hit
    return plan.categories.filter(pk=ref).first()


# ---------------------------------------------------------------------------
# Freeze
# ---------------------------------------------------------------------------

@transaction.atomic
def freeze_venue_plan(*, plan: EventVenuePlan, actor=None):
    """
    Freeze the plan's current state into `published_snapshot`.

    Called once, when the event transitions draft → published.

    Idempotent: if already frozen, return unchanged.
    Raises EventVenuePlanError if there is nothing to freeze (e.g. a
    reserved-seating plan with no categories assigned) — the caller
    (publish endpoint) surfaces this as a 400.
    """
    if plan.published_snapshot:
        return plan

    master_snapshot = plan.venue_master.snapshot or {}
    layout = master_snapshot.get('layout') or {}
    seats = layout.get('seats', [])

    categories = list(plan.categories.all())
    assignments = dict(plan.seat_assignments or {})

    has_reserved = bool(master_snapshot.get('has_reserved_seating'))

    if has_reserved:
        if not categories:
            raise EventVenuePlanError(
                'Cannot publish: reserved-seating event has no seat categories.'
            )
        if not assignments:
            raise EventVenuePlanError(
                'Cannot publish: reserved-seating event has no seat assignments.'
            )
        unassigned = [
            s['id'] for s in seats if s['id'] not in assignments
        ]
        if unassigned:
            raise EventVenuePlanError(
                f'Cannot publish: {len(unassigned)} seat(s) are unassigned. '
                f'Assign all seats before publishing.'
            )

    snapshot = {
        'schema_version': 1,
        'frozen_at': datetime.now(dt_timezone.utc).isoformat(),
        'venue_master_id': str(plan.venue_master_id),
        'venue_master_version': plan.venue_master.version,
        'layout': {
            'canvas_width': layout.get('canvas_width'),
            'canvas_height': layout.get('canvas_height'),
            'background_image': layout.get('background_image'),
            'seats': seats,
        },
        'categories': [
            {
                'id': str(c.id),
                'name': c.name,
                'hex_color': c.hex_color,
                'price': str(c.price),
            }
            for c in categories
        ],
        'seat_assignments': assignments,
    }

    plan.published_snapshot = snapshot
    plan.published_at = datetime.now(dt_timezone.utc)
    # Deliberately bypass the frozen-guard on save().
    plan.save(
        update_fields=['published_snapshot', 'published_at', 'updated_at'],
        _allow_frozen=True,
    )

    logger.info(
        'EventVenuePlan frozen: event=%s master=%s (v%d) cats=%d seats=%d',
        plan.event_id, plan.venue_master_id, plan.venue_master.version,
        len(categories), len(seats),
    )
    return plan