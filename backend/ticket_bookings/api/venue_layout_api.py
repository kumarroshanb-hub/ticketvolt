# backend/ticket_bookings/api/venue_layout_api.py
import logging

from django.shortcuts import get_object_or_404
from django.db import transaction

from rest_framework import status
from rest_framework.decorators import (
    api_view, parser_classes, permission_classes,
)
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Venue
from ..models_seating import SeatLayout, Seat, SeatCategory
from ..services.seat_layout_parser import ingest_svg_layout
from ..services.venue_versioning import bump_venue_master, suppress_bumps
from ..services.tenancy import (
    can_manage_org,
    can_operate_org,
    is_platform_admin,
    visible_venues,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tenant-safe venue resolver
# ---------------------------------------------------------------------------
# Every endpoint in this module resolves the Venue by an id supplied in
# the URL. We always resolve through `visible_venues(user)` so a caller
# cannot probe venues outside their tenant by observing a 200 vs 403
# difference. This is the same rule used by `VenueViewSet`.
# ---------------------------------------------------------------------------
def _get_visible_venue_or_404(user, venue_id):
    try:
        return visible_venues(user).get(id=venue_id)
    except Venue.DoesNotExist:
        from rest_framework.exceptions import NotFound
        raise NotFound("Venue not found.")


def _has_layout(venue):
    return hasattr(venue, 'layout')


def _seat_payload(seat, status_value='available'):
    return {
        'id': str(seat.id),
        'x_coord': seat.x_coord,
        'y_coord': seat.y_coord,
        'row_label': seat.row_label,
        'seat_number': seat.seat_number,
        'category_id': str(seat.category.id) if seat.category else None,
        'category_name': seat.category.name if seat.category else 'General',
        'category_color': seat.category.hex_color if seat.category else '#4CAF50',
        'price': float(seat.category.price) if seat.category else 0.00,
        'status': status_value,
        'is_accessible': bool(seat.is_accessible),
    }


# ===========================================================================
# UPLOAD LAYOUT
# ===========================================================================
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def upload_venue_layout(request, venue_id):
    """
    Accepts an SVG file, creates/updates the SeatLayout for the venue,
    and runs the automated parser to generate the Seat grid.
    """
    venue = _get_visible_venue_or_404(request.user, venue_id)

    if not can_manage_org(request.user, venue.organization):
        return Response(
            {'error': 'Permission denied'},
            status=status.HTTP_403_FORBIDDEN,
        )

    svg_file = request.FILES.get('svg_file')
    if not svg_file:
        return Response(
            {'error': 'No SVG file provided. Please upload a valid .svg file.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        canvas_width = int(request.data.get('canvas_width', 1000))
        canvas_height = int(request.data.get('canvas_height', 800))
    except (TypeError, ValueError):
        return Response(
            {'error': 'canvas_width and canvas_height must be integers.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if canvas_width <= 0 or canvas_height <= 0:
        return Response(
            {'error': 'canvas_width and canvas_height must be positive integers.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # The layout write, seat parsing, and master bump are one unit of
    # work. If parsing fails we roll back to the previous layout instead
    # of leaving the venue with its old seats deleted.
    layout = None
    try:
        with transaction.atomic():
            # Suppress the SeatLayout signal too: it fires before the
            # parser has created seats, which would otherwise write an
            # empty intermediate master version.
            with suppress_bumps():
                layout, _created = SeatLayout.objects.update_or_create(
                    venue=venue,
                    defaults={
                        'canvas_width': canvas_width,
                        'canvas_height': canvas_height,
                    },
                )
                seat_count = ingest_svg_layout(layout.id, svg_file)
            bump_venue_master(
                venue,
                actor=request.user,
                reason='layout_uploaded',
            )
    except ValueError as exc:
        # Custom validation errors from the parser → 400 with a clean message.
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        # Unexpected errors go to the log at ERROR level; the client sees a
        # generic message so we don't leak internals.
        logger.exception(
            'Unexpected error parsing SVG for venue %s (layout=%s)',
            venue_id, getattr(layout, 'id', None),
        )
        return Response(
            {'error': 'Unexpected server error parsing SVG. Please check the file and try again.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(
        {
            'message': f'Successfully parsed and generated {seat_count} seats.',
            'layout_id': str(layout.id),
            'seat_count': seat_count,
        },
        status=status.HTTP_201_CREATED,
    )


# ===========================================================================
# SEAT CATEGORIES
# ===========================================================================
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def venue_categories(request, venue_id):
    """List or create seat categories for a venue's organization."""
    venue = _get_visible_venue_or_404(request.user, venue_id)
    org = venue.organization

    if not can_manage_org(request.user, org):
        return Response(
            {'error': 'Permission denied'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if request.method == 'GET':
        categories = SeatCategory.objects.filter(organization=org)
        data = [
            {
                'id': str(c.id),
                'name': c.name,
                'hex_color': c.hex_color,
                'price': float(c.price),
                'seat_count': c.seats.count(),
            }
            for c in categories
        ]
        return Response(data)

    # ---- POST ----
    name = (request.data.get('name') or '').strip()
    hex_color = (request.data.get('hex_color') or '#4CAF50').strip()
    raw_price = request.data.get('price', 0.00)

    if not name:
        return Response(
            {'error': 'Category name is required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        price = float(raw_price)
    except (TypeError, ValueError):
        return Response(
            {'error': 'price must be a number.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if price < 0:
        return Response(
            {'error': 'price must be non-negative.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Unique constraint is (organization, name) — surface a clean 409
    # rather than a 500 on IntegrityError.
    if SeatCategory.objects.filter(organization=org, name=name).exists():
        return Response(
            {'error': f'A category named "{name}" already exists in this organization.'},
            status=status.HTTP_409_CONFLICT,
        )

    category = SeatCategory.objects.create(
        organization=org,
        name=name,
        hex_color=hex_color,
        price=price,
    )
    return Response(
        {
            'id': str(category.id),
            'name': category.name,
            'hex_color': category.hex_color,
            'price': float(category.price),
            'seat_count': 0,
        },
        status=status.HTTP_201_CREATED,
    )


# ===========================================================================
# ASSIGN SEATS TO CATEGORY
# ===========================================================================
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assign_seats_to_category(request, venue_id):
    """Bulk assign selected seats to a category."""
    venue = _get_visible_venue_or_404(request.user, venue_id)

    if not can_manage_org(request.user, venue.organization):
        return Response(
            {'error': 'Permission denied'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if not _has_layout(venue):
        return Response(
            {'error': 'No layout configured for this venue'},
            status=status.HTTP_404_NOT_FOUND,
        )

    layout = venue.layout
    category_id = request.data.get('category_id')
    seat_ids = request.data.get('seat_ids') or []

    if not category_id:
        return Response(
            {'error': 'category_id is required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not isinstance(seat_ids, list) or not seat_ids:
        return Response(
            {'error': 'seat_ids array is required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # The category must belong to the *same organization* as the venue,
    # not just to any org.
    category = get_object_or_404(
        SeatCategory,
        id=category_id,
        organization=venue.organization,
    )

    with transaction.atomic():
        updated = Seat.objects.filter(
            id__in=seat_ids,
            layout=layout,
        ).update(category=category)

    return Response({
        'message': f'Successfully assigned {updated} seats to {category.name}',
        'updated_count': updated,
    })


# ===========================================================================
# CLEAR SEAT CATEGORY
# ===========================================================================
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def clear_seat_category(request, venue_id):
    """Remove category assignment from selected seats."""
    venue = _get_visible_venue_or_404(request.user, venue_id)

    if not can_manage_org(request.user, venue.organization):
        return Response(
            {'error': 'Permission denied'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if not _has_layout(venue):
        return Response(
            {'error': 'No layout configured'},
            status=status.HTTP_404_NOT_FOUND,
        )

    layout = venue.layout
    seat_ids = request.data.get('seat_ids') or []

    if not isinstance(seat_ids, list) or not seat_ids:
        return Response(
            {'error': 'seat_ids array is required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        updated = Seat.objects.filter(
            id__in=seat_ids,
            layout=layout,
        ).update(category=None)

    return Response({
        'message': f'Cleared category from {updated} seats',
        'updated_count': updated,
    })


# ===========================================================================
# GET LAYOUT
# ===========================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_venue_layout(request, venue_id):
    """
    Get the parsed seat layout for a venue.

    Access rules:
      • Platform admin            → any venue.
      • OPERATOR (owner/admin/staff of the org) → full view.
      • Venue is part of a public event the caller can see → allow (so the
        public seat picker on CreateBooking works for guests).
      • Otherwise                 → 403.
    """
    venue = _get_visible_venue_or_404(request.user, venue_id)

    # Operator access — full view of the layout.
    if can_operate_org(request.user, venue.organization):
        pass
    else:
        # Non-operators may still read the layout if the venue hosts at
        # least one event the caller can see. This keeps the public seat
        # picker working for guests on public events without leaking the
        # layouts of venues that have no public events.
        from ..services.tenancy import (
            publicly_visible_events,
            visible_events,
        )
        if not (
            visible_events(request.user).filter(venue=venue).exists()
            or publicly_visible_events().filter(venue=venue).exists()
        ):
            return Response(
                {'error': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN,
            )

    if not _has_layout(venue):
        return Response(
            {'detail': 'No seating layout configured for this venue.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    layout = venue.layout
    seats_qs = (
        layout.seats
        .filter(is_active=True)
        .select_related('category')
    )

    seats_data = [_seat_payload(seat) for seat in seats_qs]

    return Response({
        'canvas_width': layout.canvas_width,
        'canvas_height': layout.canvas_height,
        'background_image': layout.background_image,
        'seats': seats_data,
    })

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def set_seat_accessible(request, seat_id):
    from ..models_seating import Seat
    from ..services.tenancy import can_manage_org

    seat = Seat.objects.select_related('layout__venue').filter(pk=seat_id).first()
    if seat is None:
        return Response({'error': 'Seat not found.'}, status=404)
    venue = seat.layout.venue
    if not (request.user.is_superuser or can_manage_org(request.user, venue.organization)):
        return Response({'error': 'Permission denied.'}, status=403)
    seat.is_accessible = bool(request.data.get('is_accessible', True))
    seat.save(update_fields=['is_accessible'])
    return Response({'id': str(seat.id), 'is_accessible': seat.is_accessible})
