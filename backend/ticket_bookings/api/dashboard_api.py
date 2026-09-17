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


class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            now = timezone.now()

            # Check if user is an organizer via profile
            is_organizer = False
            if hasattr(user, 'profile') and user.profile.is_organizer:
                is_organizer = True
            # Fallback: check for organizer attribute
            if hasattr(user, 'organizer'):
                is_organizer = True

            # ✅ ADMIN/SUPERADMIN: See ALL data (past, present, future)
            # No date filtering - full management access
            if user.is_staff or user.is_superuser:
                events_qs = Event.objects.all()
                bookings_qs = Booking.objects.all()
                tickets_qs = Ticket.objects.all()
                checkins_qs = CheckInLog.objects.filter(status='success')

                # Active events = events not cancelled/completed (any date)
                active_events = events_qs.exclude(
                    status__in=['cancelled', 'completed']
                ).count()

            # ✅ ORGANIZER: ONLY UPCOMING events (consistent with events API)
            elif is_organizer:
                # ✅ FIXED: Only upcoming events for organizers (same as events page)
                their_upcoming_events = Event.objects.filter(
                    organizer=user,
                    end_date__gte=now  # ✅ Only upcoming events
                )

                upcoming_public = Event.objects.filter(
                    status__in=['active', 'published'],
                    is_public=True,
                    end_date__gte=now  # ✅ Only upcoming events
                )

                # Combine: their upcoming events + upcoming public events
                events_qs = their_upcoming_events | upcoming_public

                # Bookings for their upcoming events + upcoming public bookings
                bookings_qs = Booking.objects.filter(
                    Q(event__organizer=user, event__end_date__gte=now) | Q(event__in=upcoming_public)
                )

                tickets_qs = Ticket.objects.filter(
                    Q(event__organizer=user, event__end_date__gte=now) | Q(event__in=upcoming_public)
                )

                checkins_qs = CheckInLog.objects.filter(
                    Q(event__organizer=user, event__end_date__gte=now) | Q(event__in=upcoming_public),
                    status='success'
                )

                # Active events = upcoming non-cancelled events
                active_events = (their_upcoming_events.exclude(
                    status__in=['cancelled', 'completed']
                ) | upcoming_public).count()

            # ✅ REGULAR USER: Only upcoming events (no past events)
            else:
                # Regular users only see upcoming active/published public events
                upcoming_events = Event.objects.filter(
                    status__in=['active', 'published'],
                    is_public=True,
                    end_date__gte=now  # ✅ Only upcoming events
                )

                events_qs = upcoming_events

                # Bookings for their upcoming events
                bookings_qs = Booking.objects.filter(
                    event__in=upcoming_events
                )

                tickets_qs = Ticket.objects.filter(
                    event__in=upcoming_events
                )

                checkins_qs = CheckInLog.objects.filter(
                    event__in=upcoming_events,
                    status='success'
                )

                # Active events = upcoming active events
                active_events = upcoming_events.filter(
                    status='active'
                ).count()

            # ✅ Stats counts - Only count confirmed/paid bookings, not cancelled/refunded
            total_bookings = bookings_qs.exclude(
                status__in=['cancelled', 'refunded']
            ).count()

            paid_bookings = bookings_qs.filter(status='paid').count()

            # ✅ Total tickets - Only count tickets from non-cancelled/non-refunded bookings
            total_tickets = tickets_qs.exclude(
                booking__status__in=['cancelled', 'refunded']
            ).count()

            total_events = events_qs.count()

            # ✅ Total revenue - Only from confirmed/paid bookings (not cancelled/refunded)
            total_revenue = bookings_qs.filter(
                status__in=['paid', 'confirmed', 'completed']
            ).aggregate(
                total=Sum('total_amount')
            )['total'] or 0

            total_checkins = checkins_qs.count()

            # ✅ Get recent bookings with event titles
            # For regular users: only their bookings
            # For organizers: bookings for upcoming events
            # For admins: all bookings
            recent_bookings = bookings_qs.select_related('event').order_by('-created_at')[:5]

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

            # ✅ Get popular events with ticket, revenue, tier and session data
            # Only count tickets from active bookings (not cancelled/refunded)
            # ✅ Prefetch tiers/sessions and select venue to avoid N+1 queries.
            popular_events = (
                events_qs
                .select_related('venue')
                .prefetch_related('tiers', 'sessions')
                .annotate(
                    active_ticket_count=Count(
                        'tickets',
                        filter=~Q(tickets__booking__status__in=['cancelled', 'refunded'])
                    )
                )
                .order_by('-active_ticket_count')[:5]
            )

            popular_events_data = []
            for event in popular_events:
                # Calculate revenue for this event from active bookings only
                event_revenue = event.bookings.filter(
                    status__in=['paid', 'confirmed', 'completed']
                ).aggregate(
                    total=Sum('total_amount')
                )['total'] or 0

                # Count active tickets for this event
                active_tickets = event.tickets.exclude(
                    booking__status__in=['cancelled', 'refunded']
                ).count()

                # ✅ NEW: compute tier/session/capacity summary from prefetched data
                tier_count = len(event.tiers.all())
                session_count = len(event.sessions.all())
                total_capacity = sum(
                    (t.quantity_total or 0) for t in event.tiers.all()
                )

                popular_events_data.append({
                    'id': str(event.id),
                    'title': event.title,
                    'status': event.status,
                    'start_date': event.start_date.isoformat() if event.start_date else None,
                    'end_date': event.end_date.isoformat() if event.end_date else None,
                    'total_tickets_sold': active_tickets,
                    'total_revenue': float(event_revenue),
                    'venue_name': event.venue.name if event.venue else None,
                    'venue_city': event.venue.city if event.venue else None,
                    'ticket_count': active_tickets,
                    'booking_count': event.bookings.exclude(
                        status__in=['cancelled', 'refunded']
                    ).count(),
                    # ✅ NEW FIELDS
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
                'total_checkins': total_checkins,
                'recent_bookings': recent_bookings_data,
                'popular_events': popular_events_data,
                # ✅ Additional info for clarity
                'role_info': {
                    'role': 'admin' if user.is_staff else 'organizer' if is_organizer else 'user',
                    'is_staff': user.is_staff,
                    'is_organizer': is_organizer,
                    'shows_past_events': user.is_staff or is_organizer,
                }
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"Dashboard error: {str(e)}")
            return Response({'error': str(e)}, status=500)