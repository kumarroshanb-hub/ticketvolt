# backend/ticket_bookings/api/dashboard_api.py
"""
Dashboard stats — tenant-aware.

Scope (Phase 3):
  • Platform admins see every event / booking in every org.
  • Org Owners/Admins see their org(s) only.
  • Everyone else (Regular Users) sees only public events and their own bookings.

FIX: Removed `IsTenantManager` permission. Regular users are now allowed to 
access the endpoint. The scoping is handled entirely by `services.tenancy` 
(`visible_events`, `visible_bookings`), which correctly restricts Regular 
Users to their own bookings and public events.

Preserved invariants (from earlier fixes):
  ✅ FIX [P15]: past events excluded from `popular_events`.
  ✅ FIX [P10]: revenue via `managers.canonical_revenue` so this
                page cannot drift from Analytics / Events list.
  ✅ FIX [P26]: `Event.get_effective_status` called once per event
                and reused for both display status and
                `is_upcoming` / `is_past`.
"""
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Q, Sum
from django.utils import timezone

from ..models import Event, Booking, Ticket, CheckInLog
from ticket_bookings.views import get_user_role  # noqa: F401
from ..services.tenancy import (
    visible_events,
    visible_bookings,
    visible_tickets,
    is_platform_admin,
    user_org_ids,
    effective_role_label,
    user_memberships_payload,
)
from ..managers import (
    SOLD_BOOKING_STATUSES,
    EXCLUDED_BOOKING_STATUSES,
    live_ticket_q,
    canonical_revenue,
    canonical_revenue_in_window,
    events_visible_upcoming,
)

logger = logging.getLogger(__name__)


_TERMINAL_EVENT_STATUSES = ('cancelled', 'completed')


class DashboardStatsView(APIView):
    # FIXED: Allow all authenticated users. Scoping is handled by the querysets below.
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            now = timezone.now()

            # ------------------------------------------------------------
            # 1. Scope — delegated to services.tenancy.
            #    - Managers see their org's data.
            #    - Regular users see public events + their own bookings.
            # ------------------------------------------------------------
            events_qs = visible_events(user)
            bookings_qs = visible_bookings(user).filter(event__in=events_qs)
            tickets_qs = visible_tickets(user).filter(booking__in=bookings_qs)
            checkins_qs = CheckInLog.objects.filter(
                status='success',
                event__in=events_qs,
            )

            # ------------------------------------------------------------
            # 2. Headline numbers
            # ------------------------------------------------------------
            total_events = events_qs.count()

            active_events = (
                events_qs
                .exclude(status__in=_TERMINAL_EVENT_STATUSES)
                .filter(
                    Q(end_date__isnull=True) | Q(end_date__gte=now)
                )
                .count()
            )

            total_bookings = bookings_qs.total_count()
            pending_bookings = bookings_qs.pending_count()
            paid_bookings = bookings_qs.paid_count()

            total_tickets = tickets_qs.filter(live_ticket_q()).count()
            total_checkins = checkins_qs.count()

            total_revenue = canonical_revenue(bookings_qs)

            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            today_revenue = canonical_revenue_in_window(
                bookings_qs, start=today_start, end=now,
            )

            # ------------------------------------------------------------
            # 3. Recent bookings
            # ------------------------------------------------------------
            recent = (
                bookings_qs
                .select_related('event')
                .order_by('-created_at')[:5]
            )

            recent_bookings_data = [
                {
                    'id': str(b.id),
                    'booking_reference': b.booking_reference,
                    'customer_name': b.customer_name,
                    'customer_email': b.customer_email,
                    'customer_phone': b.customer_phone,
                    'total_amount': float(b.total_amount or 0),
                    'discount_applied': float(b.discount_applied or 0),
                    'discount_code': b.discount_code or '',
                    'net_amount': float(
                        (b.total_amount or 0) - (b.discount_applied or 0)
                    ),
                    'status': b.status,
                    'created_at': b.created_at.isoformat() if b.created_at else None,
                    'formatted_date': (
                        b.created_at.strftime('%d/%m/%Y')
                        if b.created_at else None
                    ),
                    'event_title': b.event.title if b.event else 'N/A',
                    'event_id': str(b.event.id) if b.event else None,
                    'ticket_count': b.tickets.count(),
                }
                for b in recent
            ]

            # ------------------------------------------------------------
            # 4. Popular events — ✅ FIX [P15]: exclude past events.
            # ------------------------------------------------------------
            popular_qs = (
                events_visible_upcoming(
                    events_qs.exclude(status='cancelled'),
                    now,
                )
                .select_related('venue')
                .prefetch_related('tiers', 'sessions')
                .annotate(
                    active_ticket_count=Count(
                        'tickets',
                        filter=Q(
                            tickets__booking__status__in=SOLD_BOOKING_STATUSES,
                        ),
                        distinct=True,
                    ),
                    active_booking_count=Count(
                        'bookings',
                        filter=Q(bookings__status__in=SOLD_BOOKING_STATUSES),
                        distinct=True,
                    ),
                    event_revenue=Sum(
                        'bookings__total_amount',
                        filter=Q(bookings__status__in=SOLD_BOOKING_STATUSES),
                    ),
                )
                .order_by('-active_ticket_count')[:5]
            )

            popular_events_data = []
            for event in popular_qs:
                tiers = list(event.tiers.all())
                effective_status = event.get_effective_status(now=now)

                popular_events_data.append({
                    'id': str(event.id),
                    'title': event.title,
                    'status': effective_status,
                    'stored_status': event.status,
                    'start_date': (
                        event.start_date.isoformat()
                        if event.start_date else None
                    ),
                    'end_date': (
                        event.end_date.isoformat()
                        if event.end_date else None
                    ),
                    'total_tickets_sold': event.active_ticket_count or 0,
                    'total_revenue': float(event.event_revenue or 0),
                    'booking_count': event.active_booking_count or 0,
                    'ticket_count': event.active_ticket_count or 0,
                    'venue_name': event.venue.name if event.venue else None,
                    'venue_city': event.venue.city if event.venue else None,
                    'tier_count': len(tiers),
                    'session_count': event.sessions.count(),
                    'total_capacity': sum(
                        (t.quantity_total or 0) for t in tiers
                    ),
                    'is_upcoming': (
                        event.end_date >= now if event.end_date else True
                    ),
                    'is_past': (
                        event.end_date < now if event.end_date else False
                    ),
                })

            # ------------------------------------------------------------
            # 5. Role info block — 100% accurate 6-tier labels.
            # ------------------------------------------------------------
            # We import get_user_role here to avoid circular imports at the top.
            # This ensures the dashboard label matches the Sidebar/Profile exactly.

            role_label = effective_role_label(user) # Returns: super_admin, owner, admin, staff, member, or user
            is_manager = bool(user_org_ids(user)) # True for Owner/Admin

            return Response({
                'total_events': total_events,
                'active_events': active_events,
                'total_bookings': total_bookings,
                'pending_bookings': pending_bookings,
                'paid_bookings': paid_bookings,
                'total_tickets': total_tickets,
                'total_revenue': float(total_revenue),
                'today_revenue': float(today_revenue),
                'total_checkins': total_checkins,
                'recent_bookings': recent_bookings_data,
                'popular_events': popular_events_data,
                'role_info': {
                    'role': role_label,
                    'effective_role': role_label,
                    'is_staff': user.is_staff,
                    'is_superuser': user.is_superuser,
                    'is_manager': is_manager,
                    'org_ids': [str(o) for o in user_org_ids(user)],
                    'memberships': user_memberships_payload(user),
                    'shows_past_events': is_platform_admin(user) or is_manager,
                },
            })

        except Exception as exc:
            logger.exception('Dashboard error')
            return Response({'error': str(exc)}, status=500)