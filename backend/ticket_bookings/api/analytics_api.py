# backend/ticket_bookings/api/analytics_api.py
"""
Analytics API — fully functional.

Returns a payload shaped to match the fields Analytics.js reads:

  overview         { total_events, total_bookings, total_revenue,
                     total_tickets, total_checkins, conversion_rate }
  revenueData      [{ month, revenue, bookings }, ...]   ← AreaChart
  deviceData       [{ name, value }, ...]                ← PieChart
  eventData        [{ name, value }, ...]                ← BarChart
  topEvents        [{ name, bookings, revenue, percentage }, ...]
  statusBreakdown  [{ status, count }, ...]
  categoryBreakdown[{ name, value, count }, ...]
  timeframe        the range string that was used
"""
import logging
from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Event, Booking, Ticket, CheckInLog, Venue, Discount
from ..managers import (
    SOLD_BOOKING_STATUSES,
    EXCLUDED_TICKET_STATUSES,
    iter_time_buckets,
    bucket_label,
    live_ticket_q,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Timeframe presets
# ---------------------------------------------------------------------------
def _timeframe_range(name):
    """
    Return (start, end, granularity) for the given timeframe name.
    `start` is None for 'all'.
    """
    now = timezone.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if name == 'week':
        return today - timedelta(days=6), now, 'day'
    if name == 'month':
        return today - timedelta(days=29), now, 'day'
    if name == 'quarter':
        return today - timedelta(days=89), now, 'week'
    if name == 'year':
        return today - timedelta(days=364), now, 'month'
    if name == 'all':
        return None, now, 'month'
    # default
    return today - timedelta(days=6), now, 'day'


class AnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            timeframe = request.query_params.get('timeframe', 'week')
            start, end, granularity = _timeframe_range(timeframe)

            # ============================================================
            # 1. Scope — identical rules to the dashboard.
            # ============================================================
            is_admin = user.is_staff or user.is_superuser
            is_organizer = (
                (hasattr(user, 'profile')
                 and getattr(user.profile, 'is_organizer', False))
                or hasattr(user, 'organizer')
            )

            if is_admin:
                events_qs = Event.objects.all()
            elif is_organizer:
                events_qs = Event.objects.filter(organizer=user)
            else:
                events_qs = Event.objects.filter(
                    status__in=['active', 'published'],
                    is_public=True,
                )

            bookings_qs = (
                Booking.objects
                .visible_to(user)
                .filter(event__in=events_qs)
            )
            tickets_qs = (
                Ticket.objects
                .filter(booking__in=bookings_qs)
                .distinct()
            )

            # ============================================================
            # 2. Overview — same manager helpers as the dashboard.
            # ============================================================
            total_events = events_qs.count()
            total_bookings = bookings_qs.total_count()
            total_revenue = float(bookings_qs.total_revenue())
            total_tickets = tickets_qs.filter(live_ticket_q()).count()

            total_checkins = CheckInLog.objects.filter(
                status='success',
                event__in=events_qs,
            ).count()

            # In-window numbers
            windowed = bookings_qs
            if start is not None:
                windowed = windowed.filter(
                    created_at__gte=start, created_at__lte=end,
                )

            windowed_bookings = windowed.total_count()
            windowed_revenue = float(windowed.total_revenue())

            issued_in_window = tickets_qs.filter(
                booking__in=windowed,
            ).exclude(status__in=EXCLUDED_TICKET_STATUSES).count()

            conversion_rate = (
                round(total_checkins / issued_in_window * 100, 2)
                if issued_in_window else 0.0
            )

            # ============================================================
            # 3. Revenue & bookings time series — combined per bucket so
            #    the AreaChart gets a single array with both keys.
            # ============================================================
            revenue_data = []

            for b_start, b_end in iter_time_buckets(start, end, granularity):
                # Revenue: filter on paid_at
                rev_q = bookings_qs.filter(
                    status__in=SOLD_BOOKING_STATUSES,
                    paid_at__isnull=False,
                )
                # Bookings: filter on created_at
                bk_q = bookings_qs

                if b_start is not None:
                    rev_q = rev_q.filter(
                        paid_at__gte=b_start, paid_at__lte=b_end,
                    )
                    bk_q = bk_q.filter(
                        created_at__gte=b_start, created_at__lte=b_end,
                    )

                revenue_value = (
                    rev_q.aggregate(total=Sum('total_amount')).get('total')
                    or 0
                )
                bookings_value = bk_q.counted().count()

                revenue_data.append({
                    'month': bucket_label(b_start, granularity),
                    'label': bucket_label(b_start, granularity),
                    'revenue': float(revenue_value),
                    'bookings': bookings_value,
                })

            # ============================================================
            # 4. Status breakdown
            # ============================================================
            status_rows = (
                bookings_qs
                .values('status')
                .annotate(count=Count('id'))
                .order_by('-count')
            )
            status_breakdown = [
                {'status': row['status'], 'count': row['count']}
                for row in status_rows
            ]

            # ============================================================
            # 5. Category breakdown (revenue per event category)
            # ============================================================
            category_rows = (
                bookings_qs
                .filter(status__in=SOLD_BOOKING_STATUSES)
                .values('event__category')
                .annotate(
                    revenue=Sum('total_amount'),
                    count=Count('id'),
                )
                .order_by('-revenue')
            )
            event_data = [
                {
                    'name': (row['event__category'] or 'other').capitalize(),
                    'value': float(row['revenue'] or 0),
                    'count': row['count'],
                }
                for row in category_rows
            ]
            if not event_data:
                event_data = [{'name': 'No data', 'value': 0, 'count': 0}]

            # ============================================================
            # 6. Device / source breakdown — from Booking.metadata
            # ============================================================
            source_counts = {}
            for booking in bookings_qs.only('metadata'):
                src = (booking.metadata or {}).get(
                    'booking_source', 'unknown'
                )
                source_counts[src] = source_counts.get(src, 0) + 1

            device_data = [
                {'name': src.replace('_', ' ').title(), 'value': count}
                for src, count in sorted(
                    source_counts.items(),
                    key=lambda kv: kv[1],
                    reverse=True,
                )
            ] or [{'name': 'Unknown', 'value': 0}]

            # ============================================================
            # 7. Top events (by revenue in window)
            # ============================================================
            top_q = windowed.filter(status__in=SOLD_BOOKING_STATUSES)
            top_rows = (
                top_q
                .values('event__id', 'event__title')
                .annotate(
                    revenue=Sum('total_amount'),
                    bookings=Count('id'),
                )
                .order_by('-revenue')[:5]
            )

            max_rev = max(
                (float(row['revenue'] or 0) for row in top_rows),
                default=0,
            )
            top_events = [
                {
                    'id': str(row['event__id']) if row['event__id'] else None,
                    'name': row['event__title'] or 'Untitled',
                    'revenue': float(row['revenue'] or 0),
                    'bookings': row['bookings'],
                    'percentage': (
                        round(float(row['revenue'] or 0) / max_rev * 100, 2)
                        if max_rev else 0
                    ),
                }
                for row in top_rows
            ]

            # ============================================================
            # 8. Response — field names match Analytics.js exactly.
            # ============================================================
            return Response({
                'timeframe': timeframe,
                'granularity': granularity,
                'range': {
                    'start': start.isoformat() if start else None,
                    'end': end.isoformat(),
                },
                'overview': {
                    'total_events': total_events,
                    'total_bookings': total_bookings,
                    'total_revenue': total_revenue,
                    'total_tickets': total_tickets,
                    'total_checkins': total_checkins,
                    'conversion_rate': conversion_rate,
                    'windowed_bookings': windowed_bookings,
                    'windowed_revenue': windowed_revenue,
                    'total_venues': Venue.objects.filter(is_active=True).count(),
                    'total_discounts': Discount.objects.filter(is_active=True).count(),
                },
                # Root aliases (some callers read these directly)
                'total_events': total_events,
                'total_bookings': total_bookings,
                'total_revenue': total_revenue,
                'total_checkins': total_checkins,

                # Chart payloads — exact keys Analytics.js reads
                'revenueData': revenue_data,
                'deviceData': device_data,
                'eventData': event_data,
                'topEvents': top_events,

                # Extra breakdowns for future UI
                'statusBreakdown': status_breakdown,
                'categoryBreakdown': event_data,
            })

        except Exception as exc:
            logger.exception('Analytics error')
            return Response({'error': str(exc)}, status=500)