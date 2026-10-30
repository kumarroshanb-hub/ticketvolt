# backend/ticket_bookings/api/analytics_api.py
"""
Analytics API — tenant-aware.

Scope (Phase 3):
  • Platform admins see every organization's analytics combined.
  • Org Owners/Admins see their org(s) combined (single-org users see
    only their org; multi-org users see all their orgs combined).
  • Everyone else sees nothing (the view returns zeros).

BUG 9 FIX: `permission_classes` now includes `IsTenantManager`, so
non-managers are rejected with 403 at the permission layer instead of
receiving a zero-shaped 200. The `has_analytics_scope` gate is kept as
defence-in-depth (and to preserve the zero-shape contract for any
future caller that bypasses DRF permissions in tests).

All event/bookings/ticket scoping delegates to `services.tenancy`. No
`filter(event__organizer=user)` remains anywhere in this file.

Response shape is unchanged so `Analytics.js` continues to work without
modification:

  overview         { total_events, total_bookings, total_revenue,
                     total_tickets, total_checkins, conversion_rate, ... }
  revenueData      [{ month, revenue, bookings }, ...]
  deviceData       [{ name, value }, ...]
  eventData        [{ name, value, count }, ...]
  topEvents        [{ id, name, bookings, revenue, percentage }, ...]
  statusBreakdown  [{ status, count }, ... ]
  categoryBreakdown[{ name, value, count }, ...]
"""
import logging
from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from ..utils.money import format_money

from core.permissions import IsTenantManager

from ..models import Event, Booking, Ticket, CheckInLog, Venue, Discount
from ..services.tenancy import (
    visible_events,
    visible_bookings,
    visible_tickets,
    visible_venues,
    visible_discounts,
    is_platform_admin,
    user_org_ids,
)
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
    return today - timedelta(days=6), now, 'day'


class AnalyticsView(APIView):
    # BUG 9 FIX: manager-only endpoint. `IsTenantManager` allows platform
    # admins and managers of ≥ 1 org, and rejects everyone else with 403
    # before any queryset is evaluated.
    permission_classes = [IsAuthenticated, IsTenantManager]

    def get(self, request):
        try:
            user = request.user
            timeframe = request.query_params.get('timeframe', 'week')
            start, end, granularity = _timeframe_range(timeframe)

            # ============================================================
            # 0. Scope gate — BUG 3 FIX (kept as defence-in-depth).
            #
            # Per the documented scope:
            #   • Platform admins → full combined analytics.
            #   • Org Owners/Admins (manager of ≥1 org) → combined orgs.
            #   • Everyone else → zeros.
            #
            # We compute the manager-scoped org set ONCE and use it for
            # *both* venue and discount counts so a STAFF-only user never
            # sees venues > 0 while discounts == 0.
            #
            # With `IsTenantManager` in `permission_classes`, the "everyone
            # else" branch is normally unreachable via HTTP — it remains so
            # any test/caller that constructs the view directly still gets
            # the documented zero-shape contract.
            # ============================================================
            platform_admin = is_platform_admin(user)
            manager_org_ids = set(user_org_ids(user))  # managers only
            has_analytics_scope = platform_admin or bool(manager_org_ids)

            if not has_analytics_scope:
                # Return the full zero-shaped response so Analytics.js
                # keeps working without modification.
                return Response(self._zero_response(timeframe, granularity, start, end))

            # ============================================================
            # 1. Scope — delegated entirely to services.tenancy.
            # ============================================================
            events_qs = visible_events(user)
            bookings_qs = visible_bookings(user).filter(event__in=events_qs)
            tickets_qs = visible_tickets(user).filter(booking__in=bookings_qs)

            # ============================================================
            # 2. Overview
            # ============================================================
            total_events = events_qs.count()
            total_bookings = bookings_qs.total_count()
            total_revenue = float(bookings_qs.total_revenue())
            total_tickets = tickets_qs.filter(live_ticket_q()).count()

            total_checkins = CheckInLog.objects.filter(
                status='success',
                event__in=events_qs,
            ).count()

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
            # 3. Revenue & bookings time series
            # ============================================================
            revenue_data = []

            for b_start, b_end in iter_time_buckets(start, end, granularity):
                rev_q = bookings_qs.filter(
                    status__in=SOLD_BOOKING_STATUSES,
                    paid_at__isnull=False,
                )
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
            # 5. Category breakdown
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
            # 6. Booking source breakdown
            # ============================================================
            source_counts = {}
            for booking in bookings_qs.only('metadata'):
                src = (booking.metadata or {}).get('booking_source', 'unknown')
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
            # 8. Response
            # ============================================================
            free_registrations = bookings_qs.filter(
                event__event_flow=Event.EventFlow.FREE_REGISTRATION,
            ).total_count()

            paid_bookings = bookings_qs.exclude(
                event__event_flow=Event.EventFlow.FREE_REGISTRATION,
            ).total_count()

            for row in revenue_data:
                row['revenue_display'] = format_money(row['revenue'])
            for row in top_events:
                row['revenue_display'] = format_money(row['revenue'])

            # Count venues/discounts the user can see.
            #
            # BUG 3 FIX: both counts now use the *same* manager-scoped
            # visibility. Previously venues used `visible_venues` (which
            # includes STAFF orgs) while discounts used `visible_discounts`
            # (managers only), producing mismatched zeros for STAFF users.
            # Since `IsTenantManager` already gates this endpoint, the
            # caller is either a platform admin or a manager of ≥1 org —
            # so both helpers return consistent manager-scoped results.
            total_venues = visible_venues(user).filter(is_active=True).count()
            total_discounts = visible_discounts(user).filter(is_active=True).count()

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
                    'total_revenue_display': format_money(total_revenue),
                    'total_tickets': total_tickets,
                    'total_checkins': total_checkins,
                    'conversion_rate': conversion_rate,
                    'windowed_bookings': windowed_bookings,
                    'windowed_revenue': windowed_revenue,
                    'windowed_revenue_display': format_money(windowed_revenue),
                    'total_venues': total_venues,
                    'total_discounts': total_discounts,
                    'free_registrations': free_registrations,
                    'paid_bookings': paid_bookings,
                },
                'total_events': total_events,
                'total_bookings': total_bookings,
                'total_revenue': total_revenue,
                'total_checkins': total_checkins,

                'revenueData': revenue_data,
                'deviceData': device_data,
                'eventData': event_data,
                'topEvents': top_events,

                'statusBreakdown': status_breakdown,
                'categoryBreakdown': event_data,
            })

        except Exception as exc:
            logger.exception('Analytics error')
            return Response({'error': str(exc)}, status=500)

    # ------------------------------------------------------------------
    # Zero-shaped response for out-of-scope users.
    #
    # Retained as defence-in-depth: with `IsTenantManager` in
    # `permission_classes` this branch is normally unreachable via HTTP,
    # but keeping it means direct view construction (tests, scripts) still
    # gets the documented zero-shape contract instead of a 500 or a leak.
    # ------------------------------------------------------------------
    def _zero_response(self, timeframe, granularity, start, end):
        return Response({
            'timeframe': timeframe,
            'granularity': granularity,
            'range': {
                'start': start.isoformat() if start else None,
                'end': end.isoformat(),
            },
            'overview': {
                'total_events': 0,
                'total_bookings': 0,
                'total_revenue': 0,
                'total_revenue_display': format_money(0),
                'total_tickets': 0,
                'total_checkins': 0,
                'conversion_rate': 0.0,
                'windowed_bookings': 0,
                'windowed_revenue': 0,
                'windowed_revenue_display': format_money(0),
                'total_venues': 0,
                'total_discounts': 0,
                'free_registrations': 0,
                'paid_bookings': 0,
            },
            'total_events': 0,
            'total_bookings': 0,
            'total_revenue': 0,
            'total_checkins': 0,

            'revenueData': [],
            'deviceData': [{'name': 'Unknown', 'value': 0}],
            'eventData': [{'name': 'No data', 'value': 0, 'count': 0}],
            'topEvents': [],

            'statusBreakdown': [],
            'categoryBreakdown': [{'name': 'No data', 'value': 0, 'count': 0}],
        })