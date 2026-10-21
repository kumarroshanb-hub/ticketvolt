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
from django.db import transaction
from django.db.models import Sum, Count, Q

from ..models import Event, Venue, Session, TicketTier, CancellationPolicy, Ticket
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
    canonical_revenue,
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


# ---------------------------------------------------------------------------
# Shared prefetch list — every public read path uses this so
# `get_template_images()` doesn't trigger an N+1 per event.
# ---------------------------------------------------------------------------
_PUBLIC_PREFETCH = ('tiers', 'sessions', 'templates__template_type')


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
        Accepts:
          • None                  → None
          • already a datetime    → returned (naive converted to aware)
          • ISO string            → parsed to aware
          • anything else         → returns the original value unchanged
        """
        if value is None:
            return None

        if isinstance(value, datetime):
            if timezone.is_naive(value):
                return timezone.make_aware(value, timezone.get_current_timezone())
            return value

        raw = str(value).strip()
        if not raw:
            return None

        if raw.endswith('Z'):
            raw = raw[:-1] + '+00:00'

        try:
            parsed = datetime.fromisoformat(raw)
        except (ValueError, TypeError):
            return value

        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, timezone.get_current_timezone())

        return parsed

    @staticmethod
    def _resolve_cancellation_policy(user, policy_id):
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

        cancellation_policy, err = self._resolve_cancellation_policy(
            user, data.get('cancellation_policy_id')
        )
        if err is not None:
            return err

        start_date = self._parse_dt(data.get('start_date'))
        end_date = self._parse_dt(data.get('end_date'))

        if not start_date or not end_date:
            return Response(
                {'error': 'start_date and end_date are required and must be valid ISO dates.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
            return Response(
                {'error': f'Could not create event: {exc}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ----- Free registrations: auto-create a General Registration tier -----
        from ..models import TicketTier
        event_flow = event.event_flow
        tiers_created = 0

        if event_flow == Event.EventFlow.FREE_REGISTRATION:
            TicketTier.objects.create(
                event=event,
                name='General Registration',
                price=0,
                quantity_total=int(
                    data.get('capacity')
                    or event.max_tickets_per_order
                    or 1000
                ),
                ticket_type='ga',
            )
            tiers_created = 1
            logger.info(
                '✅ Free-registration event %s: auto-created General tier',
                event.id,
            )

        sessions_created = 0
        for session_data in data.get('sessions', []) or []:
            s_start = self._parse_dt(session_data.get('start_time'))
            s_end = self._parse_dt(session_data.get('end_time'))
            if not s_start or not s_end:
                continue
            Session.objects.create(
                event=event,
                start_time=s_start,
                end_time=s_end,
                capacity=int(session_data.get('capacity', 100) or 100),
            )
            sessions_created += 1

        if event_flow != Event.EventFlow.FREE_REGISTRATION:
            for tier_data in data.get('tiers', []) or []:
                try:
                    TicketTier.objects.create(
                        event=event,
                        name=tier_data.get('name', 'General'),
                        price=tier_data.get('price', 0) or 0,
                        quantity_total=int(
                            tier_data.get('quantity_total', 100) or 100
                        ),
                        ticket_type=tier_data.get('ticket_type', 'ga'),
                    )
                    tiers_created += 1
                except Exception as exc:
                    logger.warning(
                        "Failed to create tier for event %s: %s",
                        event.id, exc,
                    )

        logger.info(
            "✅ Event %s created (sessions=%d, tiers=%d)",
            event.id, sessions_created, tiers_created,
        )

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
            .prefetch_related('tiers', 'sessions', 'templates__template_type')
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
        queryset = self.get_queryset().prefetch_related(*_PUBLIC_PREFETCH)
        instance = get_object_or_404(queryset, pk=kwargs.get('pk'))
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
            # ✅ FIX [P10]: canonical revenue helper — same filter used by
            # dashboard and analytics.
            actual_revenue = canonical_revenue(instance.bookings.all())
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
        """
        PUT/PATCH /api/events/<uuid>/

        ✅ FIX [P18]: the old implementation did
            instance.tiers.all().delete()
            ... create new tiers
        on every request that contained a `tiers` key. Because
        `Ticket.tier` is `on_delete=CASCADE`, that deleted EVERY ticket
        on EVERY booking of the event. A single save from the edit page
        could wipe all sold inventory.

        The new implementation reconciles by id:
          • Tier ids present in the request and in the DB → UPDATE in place
          • Ids in the request but not in the DB → CREATE
          • Ids in the DB but not in the request → DELETE only if the
            tier has no sold tickets and no tickets reference it;
            otherwise reject with 409.

        The same reconciliation pattern is applied to sessions, since
        `Ticket.session` is `SET_NULL` (data isn't lost, but the
        assignment silently blanks).
        """
        instance = self.get_object()
        data = request.data
        user = request.user

        # Guard: switching event_flow is destructive on bookings.
        new_flow = data.get('event_flow') if hasattr(data, 'get') else None
        if new_flow and new_flow != instance.event_flow:
            active_bookings = instance.bookings.exclude(
                status__in=['cancelled', 'refunded'],
            ).count()
            if active_bookings > 0:
                return Response(
                    {
                        'error': (
                            f'Cannot change event flow: {active_bookings} '
                            f'active booking(s) exist. Cancel them first.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

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
            'title', 'description', 'short_description', 'event_type', 'category', 'event_flow',
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

        # ============================================================
        # Sessions — diff-based upsert
        # ============================================================
        if 'sessions' in data and isinstance(data['sessions'], list):
            incoming = data['sessions'] or []
            existing_by_id = {str(s.id): s for s in instance.sessions.all()}
            seen_ids = set()

            for sess_payload in incoming:
                sess_id = str(sess_payload.get('id') or '').strip()
                s_start = self._parse_dt(sess_payload.get('start_time'))
                s_end = self._parse_dt(sess_payload.get('end_time'))
                s_capacity = int(sess_payload.get('capacity', 100) or 100)

                if sess_id and sess_id in existing_by_id:
                    sess = existing_by_id[sess_id]
                    if s_start:
                        sess.start_time = s_start
                    if s_end:
                        sess.end_time = s_end
                    sess.capacity = s_capacity
                    sess.save(update_fields=['start_time', 'end_time', 'capacity'])
                    seen_ids.add(sess_id)
                else:
                    if not s_start or not s_end:
                        continue
                    created = Session.objects.create(
                        event=instance,
                        start_time=s_start,
                        end_time=s_end,
                        capacity=s_capacity,
                    )
                    seen_ids.add(str(created.id))

            # Delete sessions that were removed AND have no tickets.
            for sess_id, sess in existing_by_id.items():
                if sess_id in seen_ids:
                    continue
                if sess.booked and sess.booked > 0:
                    return Response(
                        {
                            'error': (
                                f'Cannot delete session {sess_id}: it has '
                                f'{sess.booked} booked seat(s). Cancel or '
                                f'reassign those bookings first.'
                            )
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                if Ticket.objects.filter(session=sess).exists():
                    return Response(
                        {
                            'error': (
                                f'Cannot delete session {sess_id}: existing '
                                f'tickets reference it.'
                            )
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                sess.delete()

        # ============================================================
        # Tiers — diff-based upsert
        # ============================================================
        if 'tiers' in data and isinstance(data['tiers'], list):
            incoming = data['tiers'] or []
            existing_by_id = {str(t.id): t for t in instance.tiers.all()}
            seen_ids = set()

            for tier_payload in incoming:
                tier_id = str(tier_payload.get('id') or '').strip()
                name = tier_payload.get('name', 'General')
                price = tier_payload.get('price', 0) or 0
                quantity_total = int(tier_payload.get('quantity_total', 100) or 100)
                ticket_type = tier_payload.get('ticket_type', 'ga')

                if tier_id and tier_id in existing_by_id:
                    tier = existing_by_id[tier_id]
                    tier.name = name
                    tier.price = price
                    tier.quantity_total = quantity_total
                    tier.ticket_type = ticket_type
                    tier.save(update_fields=[
                        'name', 'price', 'quantity_total', 'ticket_type',
                    ])
                    seen_ids.add(tier_id)
                else:
                    created = TicketTier.objects.create(
                        event=instance,
                        name=name,
                        price=price,
                        quantity_total=quantity_total,
                        ticket_type=ticket_type,
                    )
                    seen_ids.add(str(created.id))

            # Delete tiers that were removed. Refuse if the tier has sold
            # tickets — deleting would CASCADE-delete every Ticket row
            # referencing it.
            for tier_id, tier in existing_by_id.items():
                if tier_id in seen_ids:
                    continue
                if tier.quantity_sold and tier.quantity_sold > 0:
                    return Response(
                        {
                            'error': (
                                f'Cannot delete tier "{tier.name}": it has '
                                f'{tier.quantity_sold} sold ticket(s). '
                                f'Cancel those tickets first.'
                            )
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                if Ticket.objects.filter(tier=tier).exists():
                    return Response(
                        {
                            'error': (
                                f'Cannot delete tier "{tier.name}": existing '
                                f'tickets reference it.'
                            )
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                tier.delete()

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
            .prefetch_related('tiers', 'sessions', 'templates__template_type')
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

        # Pass request so get_template_images can build absolute URLs.
        serializer = PublicEventSerializer(
            events_list,
            many=True,
            context={'request': request},
        )
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
            event = (
                Event.objects
                .select_related('venue')
                .prefetch_related('tiers', 'sessions', 'templates__template_type')
                .get(
                    id=pk,
                    status__in=['active', 'published'],
                    is_public=True,
                    end_date__gte=now,
                )
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

        # Pass request so get_template_images can build absolute URLs.
        serializer = PublicEventDetailSerializer(
            event,
            context={'request': request},
        )
        data = serializer.data
        data['total_tickets_sold'] = active_tickets_count

        data = _apply_effective_status(data, event, now=now)

        return Response(data)