# backend/ticket_bookings/models_seating.py
import uuid
from django.db import models

class SeatCategory(models.Model):
    """Tenant-scoped seating categories (e.g., VIP, Balcony)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey('ticket_bookings.Organization', on_delete=models.CASCADE, related_name='seat_categories')
    name = models.CharField(max_length=100)
    hex_color = models.CharField(max_length=7, default='#4CAF50')
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    class Meta:
        unique_together = ('organization', 'name')

class SeatLayout(models.Model):
    """The canvas metadata for a specific venue."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # ✅ FIX: Use string reference to avoid NameError / Circular Imports
    venue = models.OneToOneField('ticket_bookings.Venue', on_delete=models.CASCADE, related_name='layout')
    background_image = models.URLField(blank=True, null=True)
    canvas_width = models.IntegerField(default=1000)
    canvas_height = models.IntegerField(default=800)

class Seat(models.Model):
    """Individual seats parsed from the layout."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    layout = models.ForeignKey(SeatLayout, on_delete=models.CASCADE, related_name='seats')
    category = models.ForeignKey(SeatCategory, on_delete=models.SET_NULL, null=True, blank=True)
    row_label = models.CharField(max_length=10, blank=True)
    seat_number = models.CharField(max_length=10, blank=True)
    x_coord = models.FloatField()
    y_coord = models.FloatField()
    is_active = models.BooleanField(default=True)

class SeatReservation(models.Model):
    """Tracks real-time availability of a seat for an Event/Session."""
    STATUS_CHOICES = [
        ('available', 'Available'), 
        ('held', 'Held'), 
        ('booked', 'Booked'), 
        ('cancelled', 'Cancelled')
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # ✅ FIX: Use string references for all cross-model relationships
    event = models.ForeignKey('ticket_bookings.Event', on_delete=models.CASCADE, related_name='seat_reservations')
    session = models.ForeignKey('ticket_bookings.Session', on_delete=models.CASCADE, null=True, blank=True, related_name='seat_reservations')
    seat = models.ForeignKey(Seat, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='available')
    booking = models.ForeignKey('ticket_bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True, related_name='seat_reservations')
    held_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('event', 'session', 'seat')