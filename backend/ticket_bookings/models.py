# backend/ticket_bookings/models.py
import secrets
import string
import uuid

from django.contrib.auth.models import User
from django.db import IntegrityError, models
from django.db.models import Sum, Q

# ✅ Canonical status definitions + manager
from .managers import (
    BookingManager,
    SOLD_BOOKING_STATUSES,
    EXCLUDED_BOOKING_STATUSES,
    EXCLUDED_TICKET_STATUSES,
)

# ============================================
# IMPORT SHARED CONSTANTS
# ============================================
from .constants import TicketStatus, BookingStatus, EventStatus


# 36^12 ≈ 4.7e18. Collision probability is negligible, but we retry on the
# (astronomically rare) IntegrityError anyway — belt and braces.
_CODE_ALPHABET = string.digits + string.ascii_uppercase


def _generate_code(prefix, length):
    """Cryptographically-random, prefixed code."""
    return prefix + ''.join(secrets.choice(_CODE_ALPHABET) for _ in range(length))


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
    is_organizer = models.BooleanField(default=False)
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
        parts = [
            self.address_line1, self.address_line2, self.city,
            self.state, self.postal_code, self.country,
        ]
        return ', '.join(p for p in parts if p)

    def __str__(self):
        return f"{self.name} ({self.city})"


# ============================================
# CANCELLATION POLICY
# ------------------------------------------------------------
# Must be defined BEFORE Event, because Event has a FK to it.
# A policy is a reusable rule object — many events can share one.
# The `rules` JSON schema is owned by
# ticket_bookings/services/cancellation_policy.py.
# ============================================
class CancellationPolicy(models.Model):
    """
    A reusable, named cancellation rule.

    Events FK to this. Multiple events can share one policy, so an
    organizer can define "Standard 7-day" once and attach it to every
    event in a series.

    The `rules` JSONField follows the schema documented in
    ticket_bookings/services/cancellation_policy.py. Version it so
    the engine can evolve without breaking old snapshots.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organizer = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='cancellation_policies',
        help_text="Policy owner. Only the owner (or admin) can edit.",
    )

    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    rules = models.JSONField(
        default=dict,
        help_text=(
            'Policy rules. See services/cancellation_policy.py for schema. '
            'Must include "version" and "refund_tiers".'
        ),
    )

    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(
        default=False,
        help_text=(
            'If true, this policy is preselected when creating a new event '
            'for this organizer. Only one policy per organizer may be default.'
        ),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_default', 'name']
        constraints = [
            # Only one default per organizer.
            models.UniqueConstraint(
                fields=['organizer'],
                condition=models.Q(is_default=True),
                name='unique_default_policy_per_organizer',
            ),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        from .services.cancellation_policy import validate_cancellation_rules
        try:
            validate_cancellation_rules(self.rules)
        except ValidationError:
            raise
        except Exception as exc:
            raise ValidationError({'rules': str(exc)})

    def __str__(self):
        return f'{self.name} ({self.organizer.username})'


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
    venue = models.ForeignKey(
        Venue, on_delete=models.SET_NULL, null=True, blank=True, related_name='events'
    )
    metadata = models.JSONField(default=dict)
    venue_metadata = models.JSONField(default=dict)
    cover_image = models.URLField(blank=True)
    gallery_images = models.JSONField(default=list)
    status = models.CharField(
        max_length=20,
        choices=EventStatus.choices(),
        default=EventStatus.DRAFT,
    )
    is_public = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    booking_start_date = models.DateTimeField(null=True, blank=True)
    booking_end_date = models.DateTimeField(null=True, blank=True)
    min_tickets_per_order = models.IntegerField(default=1)
    max_tickets_per_order = models.IntegerField(default=10)

    # ------------------------------------------------------------
    # Cancellation policy — two fields, on purpose.
    #
    #   `cancellation_policy`       FK  → the structured, reusable rule
    #   `cancellation_policy_text`  text→ free-text shown to customers
    #                                       if no structured policy is set
    #
    # When the FK is set, the text field is treated as a display hint.
    # When only the text field is populated (legacy events), no refunds
    # are computed — the text is purely informational.
    # ------------------------------------------------------------
    cancellation_policy = models.ForeignKey(
        'ticket_bookings.CancellationPolicy',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='events',
        help_text=(
            'Reusable cancellation policy. If null, no structured refunds '
            'are offered — the free-text field may still be shown.'
        ),
    )
    cancellation_policy_text = models.TextField(
        blank=True,
        help_text=(
            'Free-text cancellation terms. Shown to the customer when no '
            'structured policy (FK) is attached, or as an additional note.'
        ),
    )

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
        help_text="Select the format for ticket delivery",
    )
    combine_tickets = models.BooleanField(
        default=False,
        help_text="Combine all tickets into a single file",
    )
    tickets_per_page = models.IntegerField(
        default=4,
        help_text="Number of tickets per page (for combined tickets)",
    )

    # ============================================
    # EVENT HELPER METHODS
    # ------------------------------------------------------------
    # All of these delegate to the canonical status definitions in
    # managers.py. Do not inline status lists here again.
    # ============================================
    def get_active_tickets_count(self):
        """
        Count of live tickets on this event whose parent booking is
        revenue-generating. This is the number that appears on the
        dashboard and event list.
        """
        return self.tickets.filter(
            ~Q(status__in=EXCLUDED_TICKET_STATUSES),
            booking__status__in=SOLD_BOOKING_STATUSES,
        ).count()

    def get_active_revenue(self):
        """Revenue from bookings at or past the 'paid' stage."""
        return (
            self.bookings
            .filter(status__in=SOLD_BOOKING_STATUSES)
            .aggregate(total=Sum('total_amount'))
            .get('total')
            or 0
        )

    def get_active_bookings_count(self):
        """
        Count of non-cancelled/non-refunded bookings.
        """
        return self.bookings.exclude(
            status__in=EXCLUDED_BOOKING_STATUSES
        ).count()

    def update_ticket_counts(self):
        """
        Refresh total_tickets_sold and total_revenue.

        Call this whenever a booking or its tickets change state, or
        whenever an organizer edits an event. It reads the source of
        truth and rewrites the denormalized counters so they can never
        drift.
        """
        self.total_tickets_sold = self.get_active_tickets_count()
        self.total_revenue = self.get_active_revenue()
        self.save(update_fields=[
            'total_tickets_sold', 'total_revenue', 'updated_at',
        ])

    def get_tickets_by_booking_status(self, booking_status):
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
    status = models.CharField(
        max_length=20,
        choices=BookingStatus.choices(),
        default=BookingStatus.PENDING,
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

    # ✅ Accumulates refunds from partial ticket cancellations.
    #    `total_amount` stays as the original charge for receipt purposes.
    refund_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
    )

    # ✅ Snapshot of the event's policy at booking time.
    #    This is IMMUTABLE once the booking is created. It represents
    #    the rules the customer agreed to when they paid.
    cancellation_policy_snapshot = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            'Frozen copy of the event policy rules at booking time. '
            'Do not mutate — used for refund calculation on cancellation.'
        ),
    )

    # ✅ Canonical manager — every statistics query goes through this.
    objects = BookingManager()

    def save(self, *args, **kwargs):
        if not self.booking_reference:
            self.booking_reference = _generate_code('BK', 10)

            # If the caller passed `update_fields`, our freshly-assigned
            # reference would be silently dropped. Add it explicitly.
            update_fields = kwargs.get('update_fields')
            if update_fields is not None:
                kwargs['update_fields'] = set(update_fields) | {'booking_reference'}

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
    status = models.CharField(
        max_length=20,
        choices=TicketStatus.choices(),
        default=TicketStatus.ACTIVE,
    )
    attendee_name = models.CharField(max_length=255, blank=True)
    attendee_email = models.EmailField(blank=True)
    attendee_phone = models.CharField(max_length=20, blank=True)
    check_in_time = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # ------------------------------------------------------------
    # Per-ticket cancellation metadata
    # ------------------------------------------------------------
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_reason = models.CharField(max_length=255, blank=True, default='')

    # Net amount actually paid for this ticket, after prorating any
    # booking-level discount. This is the base the policy engine uses
    # when computing refunds, so the refund never exceeds what the
    # customer actually paid.
    net_paid_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text=(
            'Price actually paid for this ticket after any booking-level '
            'discount proration. This is the base for refund calculation.'
        ),
    )

    # Refund amount computed at cancellation time. Stored so that a
    # later change to the policy rules cannot retroactively alter the
    # refund that was already issued.
    refund_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text=(
            'Refund amount for this ticket due to cancellation. '
            'This is separate from the booking-level refund_amount.'
        ),
    )

    # Audit fields — which tier of the policy applied, and any flat fee.
    refund_percent_applied = models.IntegerField(
        default=0,
        help_text='Refund percentage from the policy tier that applied.',
    )
    cancellation_fee_applied = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text='Flat cancellation fee deducted from the refund.',
    )

    # NOTE: There is deliberately NO `qr_image_url` field.
    #
    # The URL of a ticket's stored QR PNG is derivable from
    # (unique_code, storage backend). Persisting it here means:
    #   1. It can go stale if the storage bucket is renamed.
    #   2. It's a second source of truth for something already computable.
    #
    # `qr_api.QRCodeImageView` no longer reads/writes a model field for
    # this — it just asks the storage backend for the URL each time.

    def save(self, *args, **kwargs):
        if not self.unique_code:
            # Try up to 5 times to avoid IntegrityError on the unique index.
            for _ in range(5):
                candidate = _generate_code('TIX', 12)
                if not Ticket.objects.filter(unique_code=candidate).exists():
                    self.unique_code = candidate
                    break
            else:
                raise IntegrityError(
                    "Could not generate a unique ticket code after 5 attempts."
                )

            update_fields = kwargs.get('update_fields')
            if update_fields is not None:
                kwargs['update_fields'] = set(update_fields) | {'unique_code'}

        super().save(*args, **kwargs)

    def __str__(self):
        return self.unique_code


# ============ CHECK-IN LOG ============
class CheckInLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='checkins')
    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    session = models.ForeignKey(Session, on_delete=models.SET_NULL, null=True, blank=True)
    scanner_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='scans'
    )
    scanner_device_id = models.CharField(max_length=255, blank=True)
    scanner_ip = models.GenericIPAddressField(null=True, blank=True)
    scanned_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20)
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
    max_discount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    max_uses = models.IntegerField(null=True, blank=True)
    used_count = models.IntegerField(default=0)
    valid_from = models.DateTimeField(null=True, blank=True)
    valid_to = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # ------------------------------------------------------------
    # Enhanced discount rules
    # ------------------------------------------------------------

    # Event scoping. Empty = organizer-wide discount.
    applicable_events = models.ManyToManyField(
        'ticket_bookings.Event',
        blank=True,
        related_name='applicable_discounts',
        help_text='If empty, discount applies to all events by this organizer.',
    )

    # Per-user usage cap, independent of the global `max_uses`.
    max_uses_per_user = models.IntegerField(
        null=True,
        blank=True,
        help_text='Max times a single customer can use this code. Null = unlimited.',
    )

    # Minimum ticket count required in the booking.
    min_ticket_count = models.IntegerField(
        default=0,
        help_text='Minimum number of tickets in the booking to apply. 0 = no minimum.',
    )

    # Restrict to first-time buyers.
    first_time_buyers_only = models.BooleanField(
        default=False,
        help_text='If true, only users with no prior paid bookings can use this.',
    )

    # Stackability. False by default — one discount per booking is safer.
    stackable = models.BooleanField(
        default=False,
        help_text='Whether this discount can be combined with others on one booking.',
    )

    def __str__(self):
        return f"{self.code} - {self.type} {self.value}"


# ============ DISCOUNT USAGE (audit trail) ============
class DiscountUsage(models.Model):
    """
    Immutable log of every discount application. Replaces the
    incremented-counter approach with an auditable one.

    When a booking is fully cancelled, we mark the corresponding rows
    as `reversed_at = now()` so that:
      • max_uses checks skip reversed rows
      • per-user limit checks skip reversed rows
      • the historical record survives for reporting
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    discount = models.ForeignKey(
        Discount, on_delete=models.PROTECT, related_name='usages',
    )
    booking = models.ForeignKey(
        'ticket_bookings.Booking',
        on_delete=models.CASCADE,
        related_name='discount_usages',
    )
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True,
        related_name='discount_usages',
    )
    amount_applied = models.DecimalField(max_digits=10, decimal_places=2)
    applied_at = models.DateTimeField(auto_now_add=True)
    reversed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-applied_at']
        indexes = [
            models.Index(fields=['discount', 'user'], name='disc_usage_disc_user_idx'),
            models.Index(fields=['booking'], name='disc_usage_booking_idx'),
        ]

    def __str__(self):
        return (
            f'{self.discount.code} → {self.booking.booking_reference} '
            f'(₹{self.amount_applied})'
        )


# ============================================
# EVENT TEMPLATE MODELS
# ============================================

class EventTemplateType(models.Model):
    """Template types for events (Announcement, Ticket, Flyer, etc.)."""

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
    """Templates for events — multiple templates per event."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='templates')
    template_type = models.ForeignKey(
        EventTemplateType, on_delete=models.CASCADE, related_name='templates'
    )

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    image = models.ImageField(upload_to='event_templates/', null=True, blank=True)

    config = models.JSONField(
        default=dict,
        help_text="""
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
        """,
    )

    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['event', 'template_type', 'name']
        ordering = ['template_type', 'created_at']

    def __str__(self):
        return f"{self.event.title} - {self.template_type.name}: {self.name}"