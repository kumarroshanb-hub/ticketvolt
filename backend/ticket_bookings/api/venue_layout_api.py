from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction

# ✅ FIX: Import the correct tenancy functions
from ..models import Venue
from ..models_seating import SeatLayout, Seat, SeatCategory
from ..services.seat_layout_parser import ingest_svg_layout
from ..services.tenancy import can_manage_org  # ✅ Changed from can_manage_venue

@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def upload_venue_layout(request, venue_id):
    """
    Accepts an SVG file, creates/updates the SeatLayout for the venue,
    and runs the automated parser to generate the Seat grid.
    """
    venue = get_object_or_404(Venue, id=venue_id)
    
    # ✅ FIX: Use can_manage_org with venue.organization
    if not can_manage_org(request.user, venue.organization):
        return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
    
    svg_file = request.FILES.get('svg_file')
    if not svg_file:
        return Response({'error': 'No SVG file provided. Please upload a valid .svg file.'}, status=status.HTTP_400_BAD_REQUEST)
        
    canvas_width = int(request.data.get('canvas_width', 1000))
    canvas_height = int(request.data.get('canvas_height', 800))
    
    # Create or update the layout metadata
    layout, created = SeatLayout.objects.update_or_create(
        venue=venue,
        defaults={
            'canvas_width': canvas_width,
            'canvas_height': canvas_height,
        }
    )
    
    # Run the automation engine to parse the SVG and bulk-create seats
    try:
        seat_count = ingest_svg_layout(layout.id, svg_file)
        return Response({
            'message': f'Successfully parsed and generated {seat_count} seats.',
            'layout_id': str(layout.id),
            'seat_count': seat_count
        }, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response({'error': f'Failed to parse SVG layout: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'POST'])
def venue_categories(request, venue_id):
    """List or create seat categories for a venue's organization."""
    venue = get_object_or_404(Venue, id=venue_id)
    org = venue.organization
    
    # ✅ FIX: Use can_manage_org
    if not can_manage_org(request.user, org):
        return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
    
    if request.method == 'GET':
        categories = SeatCategory.objects.filter(organization=org)
        data = [{
            'id': str(c.id),
            'name': c.name,
            'hex_color': c.hex_color,
            'price': float(c.price),
            'seat_count': c.seats.count()
        } for c in categories]
        return Response(data)
    
    elif request.method == 'POST':
        name = request.data.get('name')
        hex_color = request.data.get('hex_color', '#4CAF50')
        price = request.data.get('price', 0.00)
        
        if not name:
            return Response({'error': 'Category name is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        category = SeatCategory.objects.create(
            organization=org,
            name=name,
            hex_color=hex_color,
            price=price
        )
        return Response({
            'id': str(category.id),
            'name': category.name,
            'hex_color': category.hex_color,
            'price': float(category.price)
        }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
def assign_seats_to_category(request, venue_id):
    """Bulk assign selected seats to a category."""
    venue = get_object_or_404(Venue, id=venue_id)
    
    # ✅ FIX: Use can_manage_org
    if not can_manage_org(request.user, venue.organization):
        return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
    
    if not hasattr(venue, 'layout'):
        return Response({'error': 'No layout configured for this venue'}, status=status.HTTP_404_NOT_FOUND)
    
    layout = venue.layout
    category_id = request.data.get('category_id')
    seat_ids = request.data.get('seat_ids', [])
    
    if not category_id:
        return Response({'error': 'category_id is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    if not seat_ids:
        return Response({'error': 'seat_ids array is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    category = get_object_or_404(SeatCategory, id=category_id, organization=venue.organization)
    
    with transaction.atomic():
        updated = Seat.objects.filter(
            id__in=seat_ids,
            layout=layout
        ).update(category=category)
    
    return Response({
        'message': f'Successfully assigned {updated} seats to {category.name}',
        'updated_count': updated
    })


@api_view(['POST'])
def clear_seat_category(request, venue_id):
    """Remove category assignment from selected seats."""
    venue = get_object_or_404(Venue, id=venue_id)
    
    # ✅ FIX: Use can_manage_org
    if not can_manage_org(request.user, venue.organization):
        return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
    
    if not hasattr(venue, 'layout'):
        return Response({'error': 'No layout configured'}, status=status.HTTP_404_NOT_FOUND)
    
    layout = venue.layout
    seat_ids = request.data.get('seat_ids', [])
    
    with transaction.atomic():
        updated = Seat.objects.filter(
            id__in=seat_ids,
            layout=layout
        ).update(category=None)
    
    return Response({
        'message': f'Cleared category from {updated} seats',
        'updated_count': updated
    })

# backend/ticket_bookings/api/venue_layout_api.py

@api_view(['GET'])
def get_venue_layout(request, venue_id):
    """Get the parsed seat layout for a venue."""
    venue = get_object_or_404(Venue, id=venue_id)
    
    if not hasattr(venue, 'layout'):
        return Response({'detail': 'No seating layout configured for this venue.'}, status=status.HTTP_404_NOT_FOUND)
    
    layout = venue.layout
    # Fetch seats and their categories
    seats_qs = layout.seats.filter(is_active=True).select_related('category')
    
    seats_data = []
    for seat in seats_qs:
        seats_data.append({
            'id': str(seat.id),
            'x_coord': seat.x_coord,
            'y_coord': seat.y_coord,
            'row_label': seat.row_label,
            'seat_number': seat.seat_number,
            'category_id': str(seat.category.id) if seat.category else None,
            'category_name': seat.category.name if seat.category else 'General',
            'category_color': seat.category.hex_color if seat.category else '#4CAF50',
            'price': float(seat.category.price) if seat.category else 0.00,
            'status': 'available' # Admin view defaults to available
        })
    
    return Response({
        'canvas_width': layout.canvas_width,
        'canvas_height': layout.canvas_height,
        'background_image': layout.background_image,
        'seats': seats_data
    })