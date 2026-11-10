# backend/ticket_bookings/services/venue_snapshot.py
"""
Builds the frozen snapshot dict stored on VenueMaster.

CRITICAL INVARIANTS
-------------------
  • A snapshot describes the PHYSICAL venue only. No seat→category
    assignments live here. Seats carry coordinates only.
  • The category palette is captured separately as an unassigned
    vocabulary (name + colour + suggested price). It is NOT an
    assignment; it's the starting point for events.
  • Once written, a snapshot must never change. EventVenuePlan rows
    point at a version and freeze it forever.
"""
from __future__ import annotations


def build_venue_snapshot(venue) -> dict:
    snapshot = {
        'schema_version': 2,
        'venue_id': str(venue.id),
        'name': venue.name,
        'description': venue.description,
        'venue_type': venue.venue_type,
        'address_line1': venue.address_line1,
        'address_line2': venue.address_line2,
        'city': venue.city,
        'state': venue.state,
        'postal_code': venue.postal_code,
        'country': venue.country,
        'latitude': str(venue.latitude) if venue.latitude is not None else None,
        'longitude': str(venue.longitude) if venue.longitude is not None else None,
        'capacity': venue.capacity,
        'has_reserved_seating': venue.has_reserved_seating,
        'contact_phone': venue.contact_phone,
        'contact_email': venue.contact_email,
        'website_url': venue.website_url,
        'amenities': venue.amenities,
        'rules': venue.rules,
        'is_active': venue.is_active,
        'layout': None,
        'category_palette': [],
    }

    try:
        layout = venue.layout
    except Exception:
        return snapshot

    seats = []
    for seat in layout.seats.filter(is_active=True).order_by('row_label', 'seat_number'):
        seats.append({
            'id': str(seat.id),
            'row_label': seat.row_label,
            'seat_number': seat.seat_number,
            'x_coord': seat.x_coord,
            'y_coord': seat.y_coord,
        })

    snapshot['layout'] = {
        'canvas_width': layout.canvas_width,
        'canvas_height': layout.canvas_height,
        'background_image': layout.background_image,
        'seats': seats,
    }

    from ..models_seating import SeatCategory
    for cat in SeatCategory.objects.filter(
        organization_id=venue.organization_id,
    ).order_by('name'):
        snapshot['category_palette'].append({
            'id': str(cat.id),
            'name': cat.name,
            'hex_color': cat.hex_color,
            'default_price': float(cat.price),
        })

    return snapshot


def snapshot_differs(prev_snapshot: dict, new_snapshot: dict) -> bool:
    if not prev_snapshot:
        return True

    def _strip(s):
        d = dict(s or {})
        d.pop('venue_id', None)
        d.pop('schema_version', None)
        return d

    return _strip(prev_snapshot) != _strip(new_snapshot)