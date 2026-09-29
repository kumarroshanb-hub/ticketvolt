# backend/ticket_bookings/api/dashboard_api.py
"""
Dashboard stats.

Every number on this page is produced by BookingManager or by Event's
canonical helpers. If the numbers here ever disagree with the analytics
page, the bug is in managers.py — not here.
"""
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from django.db.models import Count, Q, Sum
from django.utils import timezone

from ..models import Event, Booking, Ticket, CheckInLog
from ..managers import (
    SOLD_BOOKING_STATUSES,
    EXCLUDED_BOOKING_STATUSES,
    live_ticket_q,
)

logger = logging.getLogger(__name__)


class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            now = timezone.now()

            is_admin = user.is_staff or user.is_superuser
            is_organizer = (
                (hasattr(user, 'profile')
                 and getattr(user.profile, 'is_organizer', False))
                or hasattr(user, 'organizer')
            )

            # ============================================================
            # 1. Scope the events queryset consistently.
            # ============================================================
            if is_admin:
                events_qs = Event.objects.all()
            elif is_organizer:
                events_qs = Event.objects.filter(organizer=user)
            else:
                events_qs = Event.objects.filter(
                    status__in=['active', 'published'],
                    is_public=True,
                )

            # Bookings use the manager's scoping rule so this page agrees
            # with the bookings list and the analytics page.
            bookings_qs = Booking.objects.visible_to(user)
            tickets_qs = Ticket.objects.filter(
                booking__in=bookings_qs
            ).distinct()
            checkins_qs = CheckInLog.objects.filter(
                status='success',
                event__in=events_qs,
            )

            # ============================================================
            # 2. Headline numbers — every one of them from the manager.
            # ============================================================
            total_events = events_qs.count()
            active_events = events_qs.exclude(
                status__in=['cancelled', 'completed']
            ).count()

            total_bookings = bookings_qs.total_count()
            pending_bookings = bookings_qs.pending_count()
            paid_bookings = bookings_qs.paid_count()

            total_tickets = tickets_qs.filter(live_ticket_q()).count()
            total_checkins = checkins_qs.count()

            total_revenue = bookings_qs.total_revenue()

            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            today_revenue = (
                bookings_qs
                .paid_in_range(start=today_start)
                .filter(status__in=SOLD_BOOKING_STATUSES)
                .aggregate(total=Sum('total_amount'))
                .get('total')
                or 0
            )

            # ============================================================
            # 3. Recent bookings — avoid N+1 with select_related.
            # ============================================================
            recent = (
                bookings_qs
                .select_related('event')
                .order_by('-created_at')[:5]
            )

            # ------------------------------------------------------------
            # ✅ Include `discount_applied`, `discount_code`, and a
            #    precomputed `net_amount` in every recent booking so the
            #    frontend can render the discount breakdown (net amount
            #    as the headline, gross struck-through, discount line).
            #
            #    The frontend defensively falls back to
            #    `total_amount - discount_applied` when `net_amount` is
            #    absent, so both code paths converge on the same result.
            # ------------------------------------------------------------
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
                }
                for b in recent
            ]

            # ============================================================
            # 4. Popular events — single annotated query.
            # ============================================================
            popular = (
                events_qs
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
            for event in popular:
                tiers = list(event.tiers.all())
                popular_events_data.append({
                    'id': str(event.id),
                    'title': event.title,
                    'status': event.status,
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
                    'role': (
                        'admin' if is_admin
                        else 'organizer' if is_organizer
                        else 'user'
                    ),
                    'is_staff': user.is_staff,
                    'is_organizer': is_organizer,
                    'shows_past_events': is_admin or is_organizer,
                },
            })

        except Exception as exc:
            logger.exception('Dashboard error')
            return Response({'error': str(exc)}, status=500)