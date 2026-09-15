# backend/ticket_bookings/api/event_api.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import ScopedRateThrottle
from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import datetime
from django.db.models import Sum, Count, Q

from ..models import Event, Venue, Session, TicketTier
from .serializers import (
    EventSerializer,
    EventDetailSerializer,
    PublicEventSerializer,
    PublicEventDetailSerializer,
)


def _is_organizer(user):
    return (
        (hasattr(user, 'profile') and getattr(user.profile, 'is_organizer', False))
        or hasattr(user, 'organizer')
    )


def _is_manager(user):
    """Admins, superadmins, or organizers."""
    if not user or not user.is_authenticated:
        return False
    return user.is_staff or user.is_superuser or _is_organizer(user)


class EventViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Event management.

    Public endpoints (list / retrieve / public / public_detail) are
    readable by anyone but serialized with a narrow, safe field set.
    Authenticated managers see the full serializer with revenue and
    internal metadata.
    """
    queryset = Event.objects.all()
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'public_read'

    # ---------------- permissions ----------------
    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'public', 'public_detail'):
            return [AllowAny()]
        return [IsAuthenticated()]

    # ---------------- serializer selection ----------------
    def get_serializer_class(self):
        user = self.request.user
        manager = _is_manager(user)

        if self.action == 'public':
            return PublicEventSerializer
        if self.action == 'public_detail':
            return PublicEventDetailSerializer
        if self.action == 'list':
            return EventSerializer if manager else PublicEventSerializer
        if self.action == 'retrieve':
            return EventDetailSerializer if manager else PublicEventDetailSerializer
        return EventDetailSerializer

    # ---------------- queryset scoping ----------------
    def get_queryset(self):
        """
        - Admin/SuperAdmin: all events
        - Organizer: their own events + upcoming public events
        - Regular / anonymous: upcoming public events only
        """
        user = self.request.user
        now = timezone.now()

        if not user or not user.is_authenticated:
            return Event.objects.filter(
                status__in=['active', 'published'],
                is_public=True,
                end_date__gte=now,
            )

        if user.is_staff or user.is_superuser:
            return Event.objects.all()

        if _is_organizer(user):
            their_upcoming = Event.objects.filter(
                organizer=user,
                end_date__gte=now,
            )
            upcoming_public = Event.objects.filter(
                status__in=['active', 'published'],
                is_public=True,
                end_date__gte=now,
            )
            return (their_upcoming | upcoming_public).distinct()

        return Event.objects.filter(
            status__in=['active', 'published'],
            is_public=True,
            end_date__gte=now,
        )

    # ---------------- helpers ----------------
    @staticmethod
    def _parse_dt(value):
        if not value:
            return None
        try:
            return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        except Exception:
            return value

    # ---------------- CREATE ----------------
    def create(self, request, *args, **kwargs):
        user = request.user
        if not _is_manager(user):
            return Response(
                {'error': 'You do not have permission to create events.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data

        venue = None
        if data.get('venue_id'):
            try:
                venue = Venue.objects.get(id=data['venue_id'])
            except Venue.DoesNotExist:
                pass

        event = Event.objects.create(
            organizer=request.user,
            title=data.get('title', 'Untitled'),
            description=data.get('description', ''),
            short_description=data.get('short_description', ''),
            event_type=data.get('event_type', 'single'),
            category=data.get('category', 'other'),
            start_date=self._parse_dt(data.get('start_date')),
            end_date=self._parse_dt(data.get('end_date')),
            timezone=data.get('timezone', 'Asia/Kolkata'),
            venue=venue,
            metadata=data.get('metadata', {}),
            status=data.get('status', 'draft'),
            is_public=data.get('is_public', True),
            ticket_format=data.get('ticket_format', 'pdf'),
            combine_tickets=data.get('combine_tickets', False),
            tickets_per_page=data.get('tickets_per_page', 4),
        )

        for session_data in data.get('sessions', []):
            Session.objects.create(
                event=event,
                start_time=self._parse_dt(session_data.get('start_time')),
                end_time=self._parse_dt(session_data.get('end_time')),
                capacity=session_data.get('capacity', 100),
            )

        for tier_data in data.get('tiers', []):
            TicketTier.objects.create(
                event=event,
                name=tier_data.get('name', 'General'),
                price=tier_data.get('price', 0),
                quantity_total=tier_data.get('quantity_total', 100),
                ticket_type=tier_data.get('ticket_type', 'ga'),
            )

        return Response(
            EventDetailSerializer(event).data,
            status=status.HTTP_201_CREATED,
        )

    # ---------------- LIST ----------------
    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        manager = _is_manager(request.user)

        # Only add expensive annotations for managers.
        if manager:
            queryset = queryset.annotate(
                active_tickets_count=Count(
                    'tickets',
                    filter=~Q(tickets__booking__status__in=['cancelled', 'refunded']),
                    distinct=True,
                ),
                active_bookings_count=Count(
                    'bookings',
                    filter=~Q(bookings__status__in=['cancelled', 'refunded']),
                    distinct=True,
                ),
                active_revenue=Sum(
                    'bookings__total_amount',
                    filter=Q(bookings__status__in=['paid', 'confirmed', 'completed']),
                ),
            )

        serializer = self.get_serializer(queryset, many=True)
        data = serializer.data

        if manager:
            for i, event_obj in enumerate(queryset):
                data[i]['total_tickets_sold'] = event_obj.active_tickets_count or 0
                data[i]['total_revenue'] = float(event_obj.active_revenue or 0)
                data[i]['total_bookings'] = event_obj.active_bookings_count or 0

        return Response(data)

    # ---------------- RETRIEVE ----------------
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        user = request.user

        # ---- visibility guard for non-admins ----
        if user.is_authenticated and not user.is_staff and not user.is_superuser:
            is_org = _is_organizer(user)

            # Not the organizer and not a manager: enforce public rules.
            if not is_org or instance.organizer_id != user.id:
                if instance.status not in ('active', 'published') or not instance.is_public:
                    return Response(
                        {'error': 'Event not found'},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                if instance.end_date and instance.end_date < timezone.now():
                    return Response(
                        {'error': 'Event has ended'},
                        status=status.HTTP_404_NOT_FOUND,
                    )

            # Organizer viewing their own past event: block.
            if is_org and instance.organizer_id == user.id:
                if instance.end_date and instance.end_date < timezone.now():
                    return Response(
                        {'error': 'Event has ended'},
                        status=status.HTTP_404_NOT_FOUND,
                    )

        serializer = self.get_serializer(instance)
        data = serializer.data

        # Only include revenue / ticket counts for managers.
        if _is_manager(user):
            active_tickets_count = instance.tickets.exclude(
                booking__status__in=['cancelled', 'refunded']
            ).count()
            actual_revenue = instance.bookings.filter(
                status__in=['paid', 'confirmed', 'completed']
            ).aggregate(total=Sum('total_amount'))['total'] or 0
            active_bookings_count = instance.bookings.exclude(
                status__in=['cancelled', 'refunded']
            ).count()

            data['total_tickets_sold'] = active_tickets_count
            data['total_revenue'] = float(actual_revenue)
            data['total_bookings'] = active_bookings_count

        return Response(data)

    # ---------------- UPDATE ----------------
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        data = request.data
        user = request.user

        if not user.is_staff and not user.is_superuser:
            if not _is_organizer(user) or instance.organizer_id != user.id:
                return Response(
                    {'error': 'Permission denied'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if instance.end_date and instance.end_date < timezone.now():
                return Response(
                    {'error': 'Cannot edit past events'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # venue
        if data.get('venue_id'):
            try:
                instance.venue = Venue.objects.get(id=data['venue_id'])
            except Venue.DoesNotExist:
                pass

        # dates
        if data.get('start_date'):
            data['start_date'] = self._parse_dt(data['start_date'])
        if data.get('end_date'):
            data['end_date'] = self._parse_dt(data['end_date'])

        fields = [
            'title', 'description', 'short_description', 'event_type', 'category',
            'start_date', 'end_date', 'timezone', 'status', 'metadata', 'is_public',
            'is_featured', 'cover_image', 'gallery_images', 'venue_metadata',
            'booking_start_date', 'booking_end_date',
            'min_tickets_per_order', 'max_tickets_per_order',
            'cancellation_policy', 'refundable_until',
            'ticket_format', 'combine_tickets', 'tickets_per_page',
        ]
        for field in fields:
            if field in data:
                setattr(instance, field, data[field])
        instance.save()

        # sessions
        if 'sessions' in data:
            instance.sessions.all().delete()
            for session_data in data['sessions']:
                Session.objects.create(
                    event=instance,
                    start_time=self._parse_dt(session_data.get('start_time')),
                    end_time=self._parse_dt(session_data.get('end_time')),
                    capacity=session_data.get('capacity', 100),
                )

        # tiers
        if 'tiers' in data:
            instance.tiers.all().delete()
            for tier_data in data['tiers']:
                TicketTier.objects.create(
                    event=instance,
                    name=tier_data.get('name', 'General'),
                    price=tier_data.get('price', 0),
                    quantity_total=tier_data.get('quantity_total', 100),
                    ticket_type=tier_data.get('ticket_type', 'ga'),
                )

        instance.update_ticket_counts()
        return Response(EventDetailSerializer(instance).data)

    # ---------------- DESTROY ----------------
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        user = request.user

        if not user.is_staff and not user.is_superuser:
            if not _is_organizer(user) or instance.organizer_id != user.id:
                return Response(
                    {'error': 'Permission denied'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if instance.end_date and instance.end_date < timezone.now():
                return Response(
                    {'error': 'Cannot delete past events'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ---------------- PUBLISH ----------------
    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        event = self.get_object()
        user = request.user

        if not user.is_staff and not user.is_superuser:
            if not _is_organizer(user) or event.organizer_id != user.id:
                return Response(
                    {'error': 'Permission denied'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if event.end_date and event.end_date < timezone.now():
                return Response(
                    {'error': 'Cannot publish past events'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        event.status = 'active'
        event.save(update_fields=['status'])
        return Response({'message': 'Event published successfully'})

    # ============ PUBLIC ENDPOINTS ============

    @action(
        detail=False,
        methods=['get'],
        permission_classes=[AllowAny],
        throttle_classes=[ScopedRateThrottle],
        throttle_scope='public_read',
    )
    def public(self, request):
        """Public upcoming events — no auth, narrow field set."""
        now = timezone.now()

        queryset = (
            Event.objects
            .filter(
                status__in=['active', 'published'],
                is_public=True,
                end_date__gte=now,
            )
            .order_by('-start_date')
            .annotate(
                active_tickets_count=Count(
                    'tickets',
                    filter=~Q(tickets__booking__status__in=['cancelled', 'refunded']),
                    distinct=True,
                )
            )
        )

        serializer = PublicEventSerializer(queryset, many=True)
        data = serializer.data
        for i, event_obj in enumerate(queryset):
            data[i]['total_tickets_sold'] = event_obj.active_tickets_count or 0

        return Response({'count': queryset.count(), 'results': data})

    @action(
        detail=True,
        methods=['get'],
        permission_classes=[AllowAny],
        throttle_classes=[ScopedRateThrottle],
        throttle_scope='public_read',
    )
    def public_detail(self, request, pk=None):
        """Public single-event detail — no auth, narrow field set."""
        now = timezone.now()

        try:
            event = Event.objects.get(
                id=pk,
                status__in=['active', 'published'],
                is_public=True,
                end_date__gte=now,
            )
        except Event.DoesNotExist:
            return Response(
                {'error': 'Event not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        active_tickets_count = event.tickets.exclude(
            booking__status__in=['cancelled', 'refunded']
        ).count()

        serializer = PublicEventDetailSerializer(event)
        data = serializer.data
        data['total_tickets_sold'] = active_tickets_count
        return Response(data)