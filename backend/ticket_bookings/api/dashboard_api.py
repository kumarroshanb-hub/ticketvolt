# backend/ticket_bookings/api/dashboard_api.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import timedelta
from ..models import Event, Booking, Ticket, CheckInLog
import logging

logger = logging.getLogger(__name__)

# Statuses that should NOT count toward stats
EXCLUDED_BOOKING_STATUSES = ['cancelled', 'refunded']

# Statuses that DO count as revenue-generating
REVENUE_BOOKING_STATUSES = ['paid', 'confirmed', 'completed']

# Statuses that DO count as "sold" tickets
SOLD_BOOKING_STATUSES = ['paid', 'confirmed', 'completed']


class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            now = timezone.now()

            is_organizer = (
                (hasattr(user, 'profile') and getattr(user.profile, 'is_organizer', False))
                or hasattr(user, 'organizer')
            )

            # ============================================================
            # 1. Build a SINGLE flat queryset for events (no `|` combinator).
            #    Using Q objects instead of `qs1 | qs2` preserves annotations.
            # ============================================================
            if user.is_staff or user.is_superuser:
                events_qs = Event.objects.all()
                bookings_qs = Booking.objects.all()
                tickets_qs = Ticket.objects.all()
                checkins_qs = CheckInLog.objects.filter(status='success')
                active_events = events_qs.exclude(
                    status__in=['cancelled', 'completed']
                ).count()

            elif is_organizer:
                # ✅ Use Q objects, not `|` on querysets.
                #    Q(...) | Q(...) inside a single .filter() keeps the queryset
                #    as one query, which preserves annotations and prefetches.
                event_scope_q = (
                    Q(organizer=user, end_date__gte=now)
                    | Q(status__in=['active', 'published'], is_public=True, end_date__gte=now)
                )
                events_qs = Event.objects.filter(event_scope_q).distinct()

                bookings_qs = Booking.objects.filter(
                    Q(event__organizer=user, event__end_date__gte=now)
                    | Q(event__status__in=['active', 'published'],
                        event__is_public=True,
                        event__end_date__gte=now)
                ).distinct()

                tickets_qs = Ticket.objects.filter(
                    Q(event__organizer=user, event__end_date__gte=now)
                    | Q(event__status__in=['active', 'published'],
                        event__is_public=True,
                        event__end_date__gte=now)
                ).distinct()

                checkins_qs = CheckInLog.objects.filter(
                    Q(event__organizer=user, event__end_date__gte=now)
                    | Q(event__status__in=['active', 'published'],
                        event__is_public=True,
                        event__end_date__gte=now),
                    status='success',
                ).distinct()

                active_events = events_qs.exclude(
                    status__in=['cancelled', 'completed']
                ).count()

            else:
                # Regular user: only upcoming public events
                events_qs = Event.objects.filter(
                    status__in=['active', 'published'],
                    is_public=True,
                    end_date__gte=now,
                )
                bookings_qs = Booking.objects.filter(event__in=events_qs)
                tickets_qs = Ticket.objects.filter(event__in=events_qs)
                checkins_qs = CheckInLog.objects.filter(
                    event__in=events_qs, status='success'
                )
                active_events = events_qs.filter(status='active').count()

            # ============================================================
            # 2. Top-level stats.
            #    Note: use `.exclude()` on the ORIGINAL qs, then `.count()`.
            # ============================================================
            total_bookings = bookings_qs.exclude(
                status__in=EXCLUDED_BOOKING_STATUSES
            ).count()

            paid_bookings = bookings_qs.filter(status='paid').count()

            total_tickets = tickets_qs.exclude(
                booking__status__in=EXCLUDED_BOOKING_STATUSES
            ).count()

            total_events = events_qs.count()

            total_revenue = bookings_qs.filter(
                status__in=REVENUE_BOOKING_STATUSES
            ).aggregate(total=Sum('total_amount'))['total'] or 0

            total_checkins = checkins_qs.count()

            # ✅ NEW: Today's revenue (frontend expects this field)
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            today_revenue = bookings_qs.filter(
                status__in=REVENUE_BOOKING_STATUSES,
                paid_at__gte=today_start,
            ).aggregate(total=Sum('total_amount'))['total'] or 0

            # ============================================================
            # 3. Recent bookings — select_related event to avoid N+1.
            # ============================================================
            recent_bookings = (
                bookings_qs
                .select_related('event')
                .order_by('-created_at')[:5]
            )

            recent_bookings_data = []
            for booking in recent_bookings:
                recent_bookings_data.append({
                    'id': str(booking.id),
                    'booking_reference': booking.booking_reference,
                    'customer_name': booking.customer_name,
                    'customer_email': booking.customer_email,
                    'customer_phone': booking.customer_phone,
                    'total_amount': float(booking.total_amount),
                    'status': booking.status,
                    'created_at': booking.created_at.isoformat() if booking.created_at else None,
                    'formatted_date': booking.created_at.strftime('%d/%m/%Y') if booking.created_at else None,
                    'event_title': booking.event.title if booking.event else 'N/A',
                    'event_id': str(booking.event.id) if booking.event else None,
                })

            # ============================================================
            # 4. Popular events — ALL aggregates done in ONE query.
            #    This is the critical fix for the "values are zero" bug:
            #      - Use POSITIVE filters (Q(...in=[...])), not negations (~Q).
            #      - Annotate every value you need.
            #      - Then iterate WITHOUT any further DB hits.
            # ============================================================
            popular_events = (
                events_qs
                .select_related('venue')
                .prefetch_related('tiers')          # needed for tier_count & capacity
                .annotate(
                    # Count tickets belonging to *active* bookings
                    active_ticket_count=Count(
                        'tickets',
                        filter=Q(tickets__booking__status__in=SOLD_BOOKING_STATUSES),
                        distinct=True,
                    ),
                    # Count bookings in active states
                    active_booking_count=Count(
                        'bookings',
                        filter=Q(bookings__status__in=SOLD_BOOKING_STATUSES),
                        distinct=True,
                    ),
                    # Revenue: Sum over active bookings only
                    event_revenue=Sum(
                        'bookings__total_amount',
                        filter=Q(bookings__status__in=REVENUE_BOOKING_STATUSES),
                    ),
                )
                .order_by('-active_ticket_count')[:5]
            )

            popular_events_data = []
            for event in popular_events:
                # tier_count & total_capacity come from prefetch — no extra query
                tiers = list(event.tiers.all())   # hits cache, no DB
                tier_count = len(tiers)
                total_capacity = sum((t.quantity_total or 0) for t in tiers)

                # Session count — cheap, one extra query per event at worst.
                # If you want zero extra queries, add `session_count=Count('sessions', distinct=True)`
                # to the annotate() above and drop this line.
                session_count = event.sessions.count()

                popular_events_data.append({
                    'id': str(event.id),
                    'title': event.title,
                    'status': event.status,
                    'start_date': event.start_date.isoformat() if event.start_date else None,
                    'end_date': event.end_date.isoformat() if event.end_date else None,
                    # ✅ These now come straight from the annotation:
                    'total_tickets_sold': event.active_ticket_count or 0,
                    'total_revenue': float(event.event_revenue or 0),
                    'booking_count': event.active_booking_count or 0,
                    'ticket_count': event.active_ticket_count or 0,
                    # Venue
                    'venue_name': event.venue.name if event.venue else None,
                    'venue_city': event.venue.city if event.venue else None,
                    # Summary fields
                    'tier_count': tier_count,
                    'session_count': session_count,
                    'total_capacity': total_capacity,
                    'is_upcoming': event.end_date >= now if event.end_date else True,
                    'is_past': event.end_date < now if event.end_date else False,
                })

            return Response({
                'total_events': total_events,
                'active_events': active_events,
                'total_bookings': total_bookings,
                'paid_bookings': paid_bookings,
                'total_tickets': total_tickets,
                'total_revenue': float(total_revenue),
                'today_revenue': float(today_revenue),          # ✅ NEW
                'total_checkins': total_checkins,
                'recent_bookings': recent_bookings_data,
                'popular_events': popular_events_data,
                'role_info': {
                    'role': 'admin' if user.is_staff else 'organizer' if is_organizer else 'user',
                    'is_staff': user.is_staff,
                    'is_organizer': is_organizer,
                    'shows_past_events': user.is_staff or is_organizer,
                },
            })

        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Dashboard error: {str(e)}")
            return Response({'error': str(e)}, status=500)