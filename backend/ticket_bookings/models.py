# backend/ticket_bookings/models.py
from django.db import models
from django.contrib.auth.models import User
import uuid
from django.db.models import Sum, Q

# ============================================
# IMPORT SHARED CONSTANTS
# ============================================
from .constants import TicketStatus, BookingStatus, EventStatus

# ============ USER PROFILE ============
class UserProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    whatsapp_number = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, default='India')
    postal_code = models.CharField(max_length=20, blank=True)
    is_organizer = models.BooleanField(default=False)  # ✅ ADD THIS FIELD
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} - {self.email}"


# ============ VENUE ============
class Venue(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    venue_type = models.CharField(max_length=20, default='indoor')
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, default='India')
    latitude = models.DecimalField(max_digits=10, decimal_places=8, null=True, blank=True)
    longitude = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    capacity = models.IntegerField(null=True, blank=True)
    has_reserved_seating = models.BooleanField(default=False)
    contact_phone = models.CharField(max_length=20, blank=True)
    contact_email = models.EmailField(blank=True)
    website_url = models.URLField(blank=True)
    amenities = models.JSONField(default=list)
    rules = models.TextField(blank=True)
    metadata = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def full_address(self):
        parts = [self.address_line1, self.address_line2, self.city, self.state, self.postal_code, self.country]
        return ', '.join([p for p in parts if p])

    def __str__(self):
        return f"{self.name} ({self.city})"


# ============ EVENT ============
class Event(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organizer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='events')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    short_description = models.CharField(max_length=500, blank=True)
    event_type = models.CharField(max_length=20, default='single')
    category = models.CharField(max_length=20, default='other')
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    timezone = models.CharField(max_length=50, default='Asia/Kolkata')
    venue = models.ForeignKey(Venue, on_delete=models.SET_NULL, null=True, blank=True, related_name='events')
    metadata = models.JSONField(default=dict)
    venue_metadata = models.JSONField(default=dict)
    cover_image = models.URLField(blank=True)
    gallery_images = models.JSONField(default=list)
    # Use shared EventStatus constants
    status = models.CharField(
        max_length=20, 
        choices=EventStatus.choices(), 
        default=EventStatus.DRAFT
    )
    is_public = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    booking_start_date = models.DateTimeField(null=True, blank=True)
    booking_end_date = models.DateTimeField(null=True, blank=True)
    min_tickets_per_order = models.IntegerField(default=1)
    max_tickets_per_order = models.IntegerField(default=10)
    cancellation_policy = models.TextField(blank=True)
    refundable_until = models.DateTimeField(null=True, blank=True)
    total_tickets_sold = models.IntegerField(default=0)
    total_revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ============================================
    # TICKET FORMAT SETTINGS
    # ============================================
    TICKET_FORMAT_CHOICES = [
        ('pdf', 'PDF - Print Ready'),
        ('png', 'PNG - Image Format'),
        ('both', 'Both PDF and PNG'),
    ]
    
    ticket_format = models.CharField(
        max_length=10,
        choices=TICKET_FORMAT_CHOICES,
        default='pdf',
        help_text="Select the format for ticket delivery"
    )
    
    combine_tickets = models.BooleanField(
        default=False,
        help_text="Combine all tickets into a single file"
    )
    
    tickets_per_page = models.IntegerField(
        default=4,
        help_text="Number of tickets per page (for combined tickets)"
    )

    # ============================================
    # EVENT HELPER METHODS
    # ============================================
    
    def get_active_tickets_count(self):
        """Get count of tickets from non-cancelled/non-refunded bookings"""
        return self.tickets.exclude(
            booking__status__in=['cancelled', 'refunded']
        ).count()
    
    def get_active_revenue(self):
        """Get revenue from non-cancelled/non-refunded bookings"""
        return self.bookings.filter(
            status__in=['paid', 'confirmed', 'completed']
        ).aggregate(
            total=Sum('total_amount')
        )['total'] or 0
    
    def get_active_bookings_count(self):
        """Get count of non-cancelled/non-refunded bookings"""
        return self.bookings.exclude(
            status__in=['cancelled', 'refunded']
        ).count()
    
    def update_ticket_counts(self):
        """Update total_tickets_sold and total_revenue for the event"""
        self.total_tickets_sold = self.get_active_tickets_count()
        self.total_revenue = self.get_active_revenue()
        self.save(update_fields=['total_tickets_sold', 'total_revenue', 'updated_at'])
    
    def get_tickets_by_booking_status(self, booking_status):
        """Get tickets filtered by booking status"""
        return self.tickets.filter(booking__status=booking_status)

    def __str__(self):
        return self.title


# ============ SESSION ============
class Session(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='sessions')
    venue = models.ForeignKey(Venue, on_delete=models.SET_NULL, null=True, blank=True)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    capacity = models.IntegerField()
    booked = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def remaining_capacity(self):
        return self.capacity - self.booked

    def __str__(self):
        return f"{self.event.title} - {self.start_time.strftime('%I:%M %p')}"


# ============ TICKET TIER ============
class TicketTier(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='tiers')
    session = models.ForeignKey(Session, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity_total = models.IntegerField()
    quantity_sold = models.IntegerField(default=0)
    ticket_type = models.CharField(max_length=20, default='ga')
    sale_start_date = models.DateTimeField(null=True, blank=True)
    sale_end_date = models.DateTimeField(null=True, blank=True)
    min_per_order = models.IntegerField(default=1)
    max_per_order = models.IntegerField(default=10)
    created_at = models.DateTimeField(auto_now_add=True)

    def available_tickets(self):
        return self.quantity_total - self.quantity_sold

    def __str__(self):
        return f"{self.name} - ₹{self.price}"


# ============ BOOKING ============
class Booking(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    booking_reference = models.CharField(max_length=20, unique=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bookings')
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='bookings')
    session = models.ForeignKey(Session, on_delete=models.SET_NULL, null=True, blank=True)
    
    customer_name = models.CharField(max_length=255)
    customer_email = models.EmailField()
    customer_phone = models.CharField(max_length=20)
    whatsapp_number = models.CharField(max_length=20, blank=True)
    
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    # Use shared BookingStatus constants
    status = models.CharField(
        max_length=20, 
        choices=BookingStatus.choices(), 
        default=BookingStatus.PENDING
    )
    payment_id = models.CharField(max_length=255, blank=True)
    payment_method = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)
    
    discount_applied = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_code = models.CharField(max_length=50, blank=True)
    
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    metadata = models.JSONField(default=dict, blank=True)

    def save(self, *args, **kwargs):
        if not self.booking_reference:
            import random
            import string
            self.booking_reference = 'BK' + ''.join(random.choices(string.digits, k=10))
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.booking_reference} - {self.customer_name}"


# ============ TICKET ============
class Ticket(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name='tickets')
    tier = models.ForeignKey(TicketTier, on_delete=models.CASCADE)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='tickets')
    session = models.ForeignKey(Session, on_delete=models.SET_NULL, null=True, blank=True)
    unique_code = models.CharField(max_length=50, unique=True)
    qr_code = models.TextField(blank=True)
    # Use shared TicketStatus constants
    status = models.CharField(
        max_length=20, 
        choices=TicketStatus.choices(), 
        default=TicketStatus.ACTIVE
    )
    attendee_name = models.CharField(max_length=255, blank=True)
    attendee_email = models.EmailField(blank=True)
    attendee_phone = models.CharField(max_length=20, blank=True)
    check_in_time = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.unique_code:
            import random
            import string
            self.unique_code = 'TIX' + ''.join(random.choices(string.digits + string.ascii_uppercase, k=12))
        super().save(*args, **kwargs)

    def __str__(self):
        return self.unique_code


# ============ CHECK-IN LOG ============
class CheckInLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='checkins')
    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    session = models.ForeignKey(Session, on_delete=models.SET_NULL, null=True, blank=True)
    scanner_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='scans')
    scanner_device_id = models.CharField(max_length=255, blank=True)
    scanner_ip = models.GenericIPAddressField(null=True, blank=True)
    scanned_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, default='success')
    latitude = models.DecimalField(max_digits=10, decimal_places=8, null=True, blank=True)
    longitude = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    notes = models.TextField(blank=True)
    is_offline = models.BooleanField(default=False)
    synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.ticket.unique_code} - {self.scanned_at}"


# ============ DISCOUNT ============
class Discount(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organizer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='discounts')
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255, blank=True)
    type = models.CharField(max_length=20, default='percentage')
    value = models.DecimalField(max_digits=10, decimal_places=2)
    min_order_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    max_discount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    max_uses = models.IntegerField(null=True, blank=True)
    used_count = models.IntegerField(default=0)
    valid_from = models.DateTimeField(null=True, blank=True)
    valid_to = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.code} - {self.type} {self.value}"


# ============================================
# EVENT TEMPLATE MODELS
# ============================================

class EventTemplateType(models.Model):
    """
    Template types for events (Announcement, Ticket, Flyer, etc.)
    """
    TYPE_CHOICES = [
        ('announcement', 'Event Announcement'),
        ('ticket', 'Ticket'),
        ('flyer', 'Flyer/Poster'),
        ('social', 'Social Media'),
        ('invite', 'Invitation'),
        ('certificate', 'Certificate'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50, blank=True, default='📄')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return self.name


class EventTemplate(models.Model):
    """
    Templates for events - multiple templates per event
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='templates')
    template_type = models.ForeignKey(EventTemplateType, on_delete=models.CASCADE, related_name='templates')
    
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    
    # Template image
    image = models.ImageField(upload_to='event_templates/', null=True, blank=True)
    
    # Configuration for dynamic content placement
    config = models.JSONField(default=dict, help_text="""
        JSON configuration for dynamic content placement on the template.
        Example:
        {
            "fields": {
                "event_title": {"x": 0.5, "y": 0.22, "font_size": 32, "color": "#D69E2E", "align": "center"},
                "event_date": {"x": 0.5, "y": 0.34, "font_size": 36, "color": "#1A202C", "align": "center"},
                "venue": {"x": 0.5, "y": 0.88, "font_size": 14, "color": "#4A5568", "align": "center"},
                "qr_code": {"x": 0.18, "y": 0.58, "size": 140}
            },
            "template_type": "ticket",
            "page_size": "A4",
            "orientation": "landscape"
        }
    """)
    
    # Template metadata
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['event', 'template_type', 'name']
        ordering = ['template_type', 'created_at']
    
    def __str__(self):
        return f"{self.event.title} - {self.template_type.name}: {self.name}"