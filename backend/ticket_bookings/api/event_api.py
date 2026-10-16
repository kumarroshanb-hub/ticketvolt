# backend/ticket_bookings/api/event_api.py
import logging
logger = logging.getLogger(__name__)

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import ScopedRateThrottle
from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import datetime
from django.db.models import Sum, Count, Q

from ..models import Event, Venue, Session, TicketTier, CancellationPolicy
from .serializers import (
    EventSerializer,
    EventDetailSerializer,
    PublicEventSerializer,
    PublicEventDetailSerializer,
)

from ..managers import (
    SOLD_BOOKING_STATUSES,
    EXCLUDED_BOOKING_STATUSES,
    EXCLUDED_TICKET_STATUSES,
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


# ---------------------------------------------------------------------------
# Effective-status serializer post-processing
# ---------------------------------------------------------------------------
def _apply_effective_status(serialized, event_objs, now=None):
    now = now or timezone.now()

    def _patch_one(d, event_obj):
        d['stored_status'] = event_obj.status
        d['status'] = event_obj.get_effective_status(now=now)
        return d

    if isinstance(serialized, list):
        for i, event_obj in enumerate(event_objs):
            _patch_one(serialized[i], event_obj)
        return serialized

    return _patch_one(serialized, event_objs)


class EventViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Event management.
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
        """
        Parse a datetime string from the frontend into an AWARE datetime.

        The frontend uses `<input type="datetime-local">`, which submits
        values like "2026-10-06T12:30" — no timezone suffix. This project
        runs with USE_TZ=True, so a naive datetime:
          • Triggers a `RuntimeWarning: received a naive datetime` when
            written to a DateTimeField.
          • Is silently interpreted as UTC on save (8-hour shift for HKT).
          • Breaks aware-vs-naive comparisons in the same request.

        We fix all three by:
          1. Parsing the string.
          2. If it has no tzinfo, attaching the project's default
             timezone (settings.TIME_ZONE) — i.e., the user's local zone.
          3. Returning an aware datetime.

        Strings that already carry an offset ("…+08:00", "…Z") are
        honored as-is.

        Returns None for empty input. Returns the original value unchanged
        if it can't be parsed as a datetime — the caller can then decide
        how to reject it (a clean 400) rather than crash.
        """
        if value is None:
            return None

        # Already a datetime? Ensure it's aware.
        if isinstance(value, datetime):
            if timezone.is_naive(value):
                return timezone.make_aware(value, timezone.get_current_timezone())
            return value

        raw = str(value).strip()
        if not raw:
            return None

        # JS `Date.toISOString()` produces "...Z"; fromisoformat doesn't
        # handle the bare "Z" suffix, so normalize it.
        if raw.endswith('Z'):
            raw = raw[:-1] + '+00:00'

        try:
            parsed = datetime.fromisoformat(raw)
        except (ValueError, TypeError):
            # Return the raw value so the serializer/validator can
            # produce a proper error response.
            return value

        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, timezone.get_current_timezone())

        return parsed

    @staticmethod
    def _resolve_cancellation_policy(user, policy_id):
        """
        Return (policy_or_None, error_response_or_None).

        Enforces the same ownership rule as the serializer validator:
        non-staff users may only attach policies they own.
        """
        if not policy_id:
            return None, None

        try:
            policy = CancellationPolicy.objects.get(id=policy_id)
        except (CancellationPolicy.DoesNotExist, ValueError):
            return None, Response(
                {'cancellation_policy_id': 'Policy not found.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not (user.is_staff or user.is_superuser):
            if policy.organizer_id != user.id:
                return None, Response(
                    {'cancellation_policy_id':
                     'You can only attach your own cancellation policies.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        return policy, None

    # ---------------- CREATE ----------------
    def create(self, request, *args, **kwargs):
        user = request.user
        if not _is_manager(user):
            return Response(
                {'error': 'You do not have permission to create events.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data

        # ---- Resolve venue ----
        venue = None
        venue_id = data.get('venue_id')
        if venue_id:
            try:
                venue = Venue.objects.get(id=venue_id)
            except (Venue.DoesNotExist, ValueError):
                return Response(
                    {'venue_id': 'Venue not found.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # ---- Resolve cancellation policy ----
        cancellation_policy, err = self._resolve_cancellation_policy(
            user, data.get('cancellation_policy_id')
        )
        if err is not None:
            return err

        # ---- Parse dates (fail fast on invalid) ----
        start_date = self._parse_dt(data.get('start_date'))
        end_date = self._parse_dt(data.get('end_date'))

        if not start_date or not end_date:
            return Response(
                {'error': 'start_date and end_date are required and must be valid ISO dates.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ---- Create the Event ----
        try:
            event = Event.objects.create(
                organizer=user,
                title=data.get('title', 'Untitled'),
                description=data.get('description', ''),
                short_description=data.get('short_description', ''),
                event_type=data.get('event_type', 'single'),
                category=data.get('category', 'other'),
                start_date=start_date,
                end_date=end_date,
                timezone=data.get('timezone', 'Asia/Kolkata'),
                venue=venue,
                metadata=data.get('metadata', {}) or {},
                status=data.get('status', 'draft'),
                is_public=data.get('is_public', True),
                ticket_format=data.get('ticket_format', 'pdf'),
                combine_tickets=data.get('combine_tickets', False),
                tickets_per_page=data.get('tickets_per_page', 4),
                cancellation_policy=cancellation_policy,
                cancellation_policy_text=data.get('cancellation_policy_text', '') or '',
            )
        except Exception as exc:
            # Surface the real error instead of an opaque 500.
            return Response(
                {'error': f'Could not create event: {exc}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ---- Create Sessions ----
        sessions_created = 0
        for session_data in data.get('sessions', []) or []:
            s_start = self._parse_dt(session_data.get('start_time'))
            s_end = self._parse_dt(session_data.get('end_time'))
            if not s_start or not s_end:
                continue  # skip invalid session entries
            Session.objects.create(
                event=event,
                start_time=s_start,
                end_time=s_end,
                capacity=int(session_data.get('capacity', 100) or 100),
            )
            sessions_created += 1

        # ---- Create Tiers ----
        tiers_created = 0
        for tier_data in data.get('tiers', []) or []:
            try:
                TicketTier.objects.create(
                    event=event,
                    name=tier_data.get('name', 'General'),
                    price=tier_data.get('price', 0) or 0,
                    quantity_total=int(tier_data.get('quantity_total', 100) or 100),
                    ticket_type=tier_data.get('ticket_type', 'ga'),
                )
                tiers_created += 1
            except Exception as exc:
                # Don't fail the whole create — log and continue.
                logger.warning(
                    "Failed to create tier for event %s: %s", event.id, exc,
                )

        logger.info(
            "✅ Event %s created (sessions=%d, tiers=%d)",
            event.id, sessions_created, tiers_created,
        )

        # ---- Serialize and respond ----
        # Wrap this in a try/except so a serialization error returns a
        # clean 500 with a useful message, instead of the opaque "spinner
        # hangs forever" symptom.
        try:
            serialized = EventDetailSerializer(event).data
            serialized = _apply_effective_status(serialized, event)
            return Response(serialized, status=status.HTTP_201_CREATED)
        except Exception as exc:
            logger.exception("Serialization failed after event create")
            return Response(
                {
                    'error': (
                        'Event was created but the response could not be '
                        f'serialized: {exc}'
                    ),
                    'event_id': str(event.id),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ---------------- LIST ----------------
    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        manager = _is_manager(request.user)

        queryset = (
            queryset
            .select_related('venue', 'cancellation_policy')
            .prefetch_related('tiers', 'sessions')
        )

        if manager:
            queryset = queryset.annotate(
                active_tickets_count=Count(
                    'tickets',
                    filter=(
                        ~Q(tickets__status__in=EXCLUDED_TICKET_STATUSES)
                        & ~Q(tickets__booking__status__in=EXCLUDED_BOOKING_STATUSES)
                    ),
                    distinct=True,
                ),
                active_bookings_count=Count(
                    'bookings',
                    filter=~Q(bookings__status__in=EXCLUDED_BOOKING_STATUSES),
                    distinct=True,
                ),
                active_revenue=Sum(
                    'bookings__total_amount',
                    filter=Q(bookings__status__in=SOLD_BOOKING_STATUSES),
                ),
            )

        events_list = list(queryset)

        serializer = self.get_serializer(events_list, many=True)
        data = list(serializer.data)

        if manager:
            for i, event_obj in enumerate(events_list):
                data[i]['total_tickets_sold'] = event_obj.active_tickets_count or 0
                data[i]['total_revenue'] = float(event_obj.active_revenue or 0)
                data[i]['total_bookings'] = event_obj.active_bookings_count or 0

        data = _apply_effective_status(data, events_list)

        return Response(data)

    # ---------------- RETRIEVE ----------------
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        user = request.user

        if user.is_authenticated and not user.is_staff and not user.is_superuser:
            is_org = _is_organizer(user)

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

            if is_org and instance.organizer_id == user.id:
                if instance.end_date and instance.end_date < timezone.now():
                    return Response(
                        {'error': 'Event has ended'},
                        status=status.HTTP_404_NOT_FOUND,
                    )

        serializer = self.get_serializer(instance)
        data = serializer.data

        if _is_manager(user):
            active_tickets_count = instance.tickets.filter(
                ~Q(status__in=EXCLUDED_TICKET_STATUSES),
                booking__status__in=SOLD_BOOKING_STATUSES,
            ).count()
            actual_revenue = (
                instance.bookings
                .filter(status__in=SOLD_BOOKING_STATUSES)
                .aggregate(total=Sum('total_amount'))
                .get('total')
                or 0
            )
            active_bookings_count = instance.bookings.exclude(
                status__in=EXCLUDED_BOOKING_STATUSES
            ).count()

            data['total_tickets_sold'] = active_tickets_count
            data['total_revenue'] = float(actual_revenue)
            data['total_bookings'] = active_bookings_count

        data = _apply_effective_status(data, instance)

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

        if data.get('venue_id'):
            try:
                instance.venue = Venue.objects.get(id=data['venue_id'])
            except (Venue.DoesNotExist, ValueError):
                pass

        data = data.copy() if hasattr(data, 'copy') else dict(data)

        if data.get('start_date'):
            data['start_date'] = self._parse_dt(data['start_date'])
        if data.get('end_date'):
            data['end_date'] = self._parse_dt(data['end_date'])

        if 'cancellation_policy_id' in data:
            raw = data.get('cancellation_policy_id')
            if not raw:
                instance.cancellation_policy = None
            else:
                policy, err = self._resolve_cancellation_policy(user, raw)
                if err is not None:
                    return err
                instance.cancellation_policy = policy

        fields = [
            'title', 'description', 'short_description', 'event_type', 'category',
            'start_date', 'end_date', 'timezone', 'status', 'metadata', 'is_public',
            'is_featured', 'cover_image', 'gallery_images', 'venue_metadata',
            'booking_start_date', 'booking_end_date',
            'min_tickets_per_order', 'max_tickets_per_order',
            'refundable_until',
            'cancellation_policy_text',
            'ticket_format', 'combine_tickets', 'tickets_per_page',
        ]
        for field in fields:
            if field in data:
                setattr(instance, field, data[field])
        instance.save()

        if 'sessions' in data:
            instance.sessions.all().delete()
            for session_data in data['sessions']:
                Session.objects.create(
                    event=instance,
                    start_time=self._parse_dt(session_data.get('start_time')),
                    end_time=self._parse_dt(session_data.get('end_time')),
                    capacity=session_data.get('capacity', 100),
                )

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
        instance.refresh_from_db()

        serialized = EventDetailSerializer(instance).data
        serialized = _apply_effective_status(serialized, instance)
        return Response(serialized)

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
            .select_related('venue')
            .prefetch_related('tiers', 'sessions')
            .order_by('-start_date')
            .annotate(
                active_tickets_count=Count(
                    'tickets',
                    filter=(
                        ~Q(tickets__status__in=EXCLUDED_TICKET_STATUSES)
                        & ~Q(tickets__booking__status__in=EXCLUDED_BOOKING_STATUSES)
                    ),
                    distinct=True,
                )
            )
        )

        events_list = list(queryset)

        serializer = PublicEventSerializer(events_list, many=True)
        data = list(serializer.data)
        for i, event_obj in enumerate(events_list):
            data[i]['total_tickets_sold'] = event_obj.active_tickets_count or 0

        data = _apply_effective_status(data, events_list, now=now)

        return Response({'count': len(events_list), 'results': data})

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

        active_tickets_count = event.tickets.filter(
            ~Q(status__in=EXCLUDED_TICKET_STATUSES),
            booking__status__in=SOLD_BOOKING_STATUSES,
        ).count()

        serializer = PublicEventDetailSerializer(event)
        data = serializer.data
        data['total_tickets_sold'] = active_tickets_count

        data = _apply_effective_status(data, event, now=now)

        return Response(data)