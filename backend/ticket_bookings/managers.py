# backend/ticket_bookings/managers.py
"""
Canonical definitions of what counts as a "real" booking, ticket, revenue
event, etc. Every statistic in the system MUST go through this module.

Rationale
---------
Before this file existed, the dashboard, analytics page, event list, event
detail, and event count-update logic each had their own inline lists of
"counted" statuses. They drifted, and the pages disagreed.

Now there is exactly ONE definition per concept. Change it here, and every
consumer changes with it. If the dashboard and analytics page ever disagree
again, the bug is here — not in the views.
"""
from datetime import timedelta

from django.db import models
from django.db.models import Q, Sum, Count


# ============================================================================
# CANONICAL STATUS GROUPS
# ----------------------------------------------------------------------------
# Single source of truth for "which booking statuses count". Add new
# groupings here; never inline status lists in views again.
# ============================================================================

# Bookings that should NOT count toward any "how many bookings do we have?" stat.
EXCLUDED_BOOKING_STATUSES = ('cancelled', 'refunded')

# Bookings that DO count toward revenue.
REVENUE_BOOKING_STATUSES = ('paid', 'confirmed', 'completed')

# Bookings whose tickets should count as "sold". Same as revenue — a ticket
# is only sold once payment cleared.
SOLD_BOOKING_STATUSES = REVENUE_BOOKING_STATUSES

# Bookings awaiting payment.
PENDING_BOOKING_STATUSES = ('pending', 'processing')

# Bookings whose tickets have been fully used / event over.
COMPLETED_BOOKING_STATUSES = ('completed',)

# Ticket statuses that should not count as a "live" ticket.
EXCLUDED_TICKET_STATUSES = ('cancelled', 'refunded')


# ============================================================================
# Q-OBJECT HELPERS
# ============================================================================

def counted_booking_q() -> Q:
    """Booking is real (not cancelled/refunded)."""
    return ~Q(status__in=EXCLUDED_BOOKING_STATUSES)


def revenue_booking_q() -> Q:
    """Booking contributes to revenue."""
    return Q(status__in=REVENUE_BOOKING_STATUSES)


def pending_booking_q() -> Q:
    """Booking still needs payment."""
    return Q(status__in=PENDING_BOOKING_STATUSES)


def sold_ticket_q() -> Q:
    """Ticket belongs to a revenue-generating booking."""
    return Q(booking__status__in=SOLD_BOOKING_STATUSES)


def live_ticket_q() -> Q:
    """Ticket itself is not cancelled/refunded."""
    return ~Q(status__in=EXCLUDED_TICKET_STATUSES)


# ============================================================================
# QUERYSET
# ============================================================================

class BookingQuerySet(models.QuerySet):
    # ---------- Scoping ----------

    def for_user(self, user):
        """Bookings owned by this user."""
        return self.filter(user=user)

    def for_organizer(self, user):
        """Bookings for events this organizer owns."""
        return self.filter(event__organizer=user)

    def visible_to(self, user):
        """
        The single scoping rule used by the dashboard, analytics, and
        bookings list:
          • Admin    → everything
          • Organizer→ their events
          • User     → their own bookings
          • Anonymous→ nothing
        """
        if not user or not user.is_authenticated:
            return self.none()
        if user.is_staff or user.is_superuser:
            return self
        is_org = (
            (hasattr(user, 'profile')
             and getattr(user.profile, 'is_organizer', False))
            or hasattr(user, 'organizer')
        )
        if is_org:
            return self.for_organizer(user)
        return self.for_user(user)

    # ---------- Canonical filtered subsets ----------

    def counted(self):
        """Real bookings (not cancelled/refunded)."""
        return self.filter(counted_booking_q())

    def revenue_generating(self):
        """Bookings that contribute to revenue."""
        return self.filter(revenue_booking_q())

    def pending_only(self):
        """Bookings still awaiting payment."""
        return self.filter(pending_booking_q())

    def in_range(self, start=None, end=None):
        """Filter by created_at range. Either bound may be None."""
        qs = self
        if start is not None:
            qs = qs.filter(created_at__gte=start)
        if end is not None:
            qs = qs.filter(created_at__lte=end)
        return qs

    def paid_in_range(self, start=None, end=None):
        """Filter by paid_at range — used for revenue-over-time charts."""
        qs = self.filter(paid_at__isnull=False)
        if start is not None:
            qs = qs.filter(paid_at__gte=start)
        if end is not None:
            qs = qs.filter(paid_at__lte=end)
        return qs

    # ---------- Aggregates ----------

    def total_revenue(self):
        return (
            self.revenue_generating()
            .aggregate(total=Sum('total_amount'))
            .get('total')
            or 0
        )

    def total_count(self):
        """Count of *real* bookings (excludes cancelled/refunded)."""
        return self.counted().count()

    def pending_count(self):
        return self.pending_only().count()

    def paid_count(self):
        """Count of bookings at or past the 'paid' stage."""
        return self.filter(status__in=SOLD_BOOKING_STATUSES).count()


class BookingManager(models.Manager.from_queryset(BookingQuerySet)):
    """Default manager — exposes the queryset helpers on Booking.objects."""


# ============================================================================
# TIME BUCKET HELPERS
# ============================================================================

def iter_time_buckets(start, end, granularity):
    """
    Yield (bucket_start, bucket_end) pairs covering [start, end].
    If start is None, yields a single (None, end) bucket (i.e. "All time").
    """
    if start is None:
        yield None, end
        return

    cursor = start
    while cursor < end:
        if granularity == 'day':
            nxt = cursor + timedelta(days=1)
        elif granularity == 'week':
            nxt = cursor + timedelta(weeks=1)
        elif granularity == 'month':
            if cursor.month == 12:
                nxt = cursor.replace(year=cursor.year + 1, month=1)
            else:
                nxt = cursor.replace(month=cursor.month + 1)
        else:
            nxt = cursor + timedelta(days=1)

        yield cursor, min(nxt, end)
        cursor = nxt


def bucket_label(dt, granularity):
    if dt is None:
        return 'All Time'
    if granularity == 'day':
        return dt.strftime('%b %d')
    if granularity == 'week':
        return dt.strftime('Wk of %b %d')
    if granularity == 'month':
        return dt.strftime('%b %Y')
    return dt.strftime('%b %d')