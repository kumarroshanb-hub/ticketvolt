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
from django.contrib.auth.models import User
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

from ..models_tenancy import Organization, OrganizationMembership
from ..services.tenancy import (
    can_manage_org,
    can_manage_event_data,
    is_platform_admin,
    user_org_ids,
    visible_events,
)
from rest_framework.exceptions import PermissionDenied


VALID_EVENT_FLOWS = {c[0] for c in Event.EventFlow.choices}


# ---------------------------------------------------------------------------
# Canonical "active ticket" definition
# ---------------------------------------------------------------------------
# Single source of truth for what counts as an active (sold) ticket.
# Used by list(), retrieve(), public() and public_detail() so their numbers
# cannot drift. A ticket counts as "active" iff:
#   * its own status is not in EXCLUDED_TICKET_STATUSES, AND
#   * its booking status is in SOLD_BOOKING_STATUSES.
# This intentionally excludes tickets on pending/processing bookings, matching
# the canonical revenue definition (canonical_revenue) and the semantics
# that a pending booking is not yet a sale.
def _active_ticket_q():
    return (
        ~Q(status__in=EXCLUDED_TICKET_STATUSES)
        & Q(booking__status__in=SOLD_BOOKING_STATUSES)
    )
# For use inside Count('tickets', filter=...) / Sum('tickets__...') on an
# Event queryset. Because Django resolves the filter from the Event side,
# every Ticket field must be reached through the `tickets__` / `tickets__booking__`
# prefix.
def _active_ticket_q_via_event():
    return (
        ~Q(tickets__status__in=EXCLUDED_TICKET_STATUSES)
        & Q(tickets__booking__status__in=SOLD_BOOKING_STATUSES)
    )

def _active_ticket_count(event_or_queryset):
    if hasattr(event_or_queryset, 'tickets'):
        return event_or_queryset.tickets.filter(_active_ticket_q()).count()
    return Ticket.objects.filter(
        _active_ticket_q(), event__in=event_or_queryset,
    ).count()

def _normalise_event_flow(raw):
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None
    if value not in VALID_EVENT_FLOWS:
        return False
    return value


def _is_manager(user):
    if not user or not user.is_authenticated:
        return False
    if is_platform_admin(user):
        return True
    return bool(user_org_ids(user))


def _safe_int(value, default):
    try:
        n = int(value)
        return n if n > 0 else default
    except (TypeError, ValueError):
        return default


def _apply_effective_status(serialized, event_objs, now=None):
    now = now or timezone.now()

    def _patch_one(d, event_obj):
        d['stored_status'] = event_obj.status
        d['status'] = event_obj.get_effective_status(now=now)
        return d

    if isinstance(serialized, list):
        for i, event_obj in enumerate(event_objs):
            if i < len(serialized):
                _patch_one(serialized[i], event_obj)
        return serialized

    return _patch_one(serialized, event_objs)


_PUBLIC_PREFETCH = ('tiers', 'sessions', 'templates__template_type')


class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'public_read'

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'public', 'public_detail'):
            return [AllowAny()]
        return [IsAuthenticated()]

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

    def get_queryset(self):
        return visible_events(self.request.user)

    @staticmethod
    def _parse_dt(value):
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
        if not can_manage_org(user, policy.organization):
            return None, Response(
                {'cancellation_policy_id':
                 'You can only attach your own cancellation policies.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return policy, None

    @staticmethod
    def _resolve_target_organizer(request_user, raw_organizer_id, *, fallback):
        if raw_organizer_id in (None, '', 'null'):
            return fallback, None

        if not is_platform_admin(request_user):
            if str(raw_organizer_id) != str(request_user.id):
                return None, Response(
                    {'organizer_id':
                     'Only administrators can assign an event to another organizer.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return request_user, None

        try:
            candidate = User.objects.get(id=raw_organizer_id)
        except (User.DoesNotExist, ValueError, TypeError):
            return None, Response(
                {'organizer_id': 'Organizer not found.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return candidate, None

    def _resolve_organization(self, user, raw_org_id):
        if raw_org_id not in (None, '', 'null'):
            try:
                organization = Organization.objects.get(id=raw_org_id)
            except (Organization.DoesNotExist, ValueError, TypeError):
                return None, Response(
                    {'organization_id': 'Organization not found.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not can_manage_org(user, organization):
                return None, Response(
                    {'organization_id':
                     'You do not have permission to create events in this organization.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return organization, None

        orgs = user_org_ids(user)
        if not orgs:
            return None, Response(
                {'organization_id':
                 'You are not an organizer of any organization. '
                 'Create an organization first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(orgs) == 1:
            return Organization.objects.get(id=orgs[0]), None
        return None, Response(
            {'organization_id':
             'You manage multiple organizations; organization_id is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @staticmethod
    def _default_organizer_for(user, organization):
        """Pick the default organizer when organizer_id is omitted.

        Bug 5 fix: a platform superuser is not necessarily a member of the
        organization. Defaulting them as organizer would break the invariant
        that ``event.organizer`` is a member of ``event.organization``.

        - Platform superuser      -> ``organization.owner`` (member by
                                     construction).
        - Regular org admin       -> ``user`` (preserves existing UX; the
                                     membership check downstream still
                                     validates it).
        """
        if is_platform_admin(user):
            return organization.owner
        return user

    def create(self, request, *args, **kwargs):
        user = request.user
        if not _is_manager(user):
            return Response(
                {'error': 'You do not have permission to create events.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data

        raw_flow = data.get('event_flow')
        normalised_flow = _normalise_event_flow(raw_flow)
        if normalised_flow is False:
            return Response(
                {
                    'event_flow': (
                        f'Invalid event_flow: {raw_flow!r}. '
                        f'Valid values: {sorted(VALID_EVENT_FLOWS)}.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        event_flow_to_save = (
            normalised_flow
            if normalised_flow is not None
            else Event.EventFlow.TICKETED
        )

        if event_flow_to_save == Event.EventFlow.FREE_REGISTRATION:
            incoming_tiers = data.get('tiers') or []
            for i, tier in enumerate(incoming_tiers):
                if not isinstance(tier, dict):
                    continue
                try:
                    price = float(tier.get('price', 0) or 0)
                except (TypeError, ValueError):
                    price = 0
                if price > 0:
                    return Response(
                        {
                            'tiers': (
                                f'Free registration events cannot have priced '
                                f'tiers. Tier #{i + 1} has price {price}.'
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        organization, org_err = self._resolve_organization(
            user, data.get('organization_id'),
        )
        if org_err is not None:
            return org_err

        # ------------------------------------------------------------------
        # Bug 5 fix: default organizer + membership invariant.
        #
        # - When organizer_id is omitted, fall back to a user who is
        #   guaranteed to be a member of `organization`:
        #     * platform superuser -> organization.owner
        #     * everyone else      -> request.user (unchanged UX)
        # - The membership check below now runs for ALL callers, including
        #   platform superusers. A superuser who needs a different organizer
        #   must pass organizer_id of a real member (or add membership
        #   first). Defaulting the superuser themselves as organizer is no
        #   longer possible, because it violated the invariant.
        # ------------------------------------------------------------------
        default_organizer = self._default_organizer_for(user, organization)

        target_organizer, target_err = self._resolve_target_organizer(
            user, data.get('organizer_id'), fallback=default_organizer,
        )
        if target_err is not None:
            return target_err

        # Invariant: event.organizer MUST be a member of event.organization.
        # Enforced unconditionally (superusers included).
        if not OrganizationMembership.objects.filter(
            organization=organization, user=target_organizer,
        ).exists():
            if is_platform_admin(user):
                message = (
                    'The specified organizer is not a member of this '
                    'organization. Add an OrganizationMembership for them '
                    'first, or omit organizer_id to default to the '
                    'organization owner.'
                )
            else:
                message = 'Organizer is not a member of this organization.'
            return Response(
                {'organizer_id': message},
                status=status.HTTP_400_BAD_REQUEST,
            )

        venue = None
        venue_id = data.get('venue_id')
        if venue_id:
            try:
                venue = Venue.objects.get(id=venue_id, organization=organization)
            except (Venue.DoesNotExist, ValueError):
                return Response(
                    {'venue_id': 'Venue not found in this organization.'},
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

        tickets_per_page = _safe_int(data.get('tickets_per_page', 4), 4)

        try:
            with transaction.atomic():
                event = Event.objects.create(
                    organization=organization,
                    organizer=target_organizer,
                    title=data.get('title', 'Untitled'),
                    description=data.get('description', ''),
                    short_description=data.get('short_description', ''),
                    event_type=data.get('event_type', 'single'),
                    category=data.get('category', 'other'),
                    event_flow=event_flow_to_save,
                    start_date=start_date,
                    end_date=end_date,
                    timezone=data.get('timezone', 'Asia/Kolkata'),
                    venue=venue,
                    metadata=data.get('metadata', {}) or {},
                    status=data.get('status', 'draft'),
                    is_public=data.get('is_public', True),
                    ticket_format=data.get('ticket_format', 'pdf'),
                    combine_tickets=bool(data.get('combine_tickets', False)),
                    tickets_per_page=max(1, tickets_per_page),
                    cancellation_policy=cancellation_policy,
                    cancellation_policy_text=data.get('cancellation_policy_text', '') or '',
                )

                tiers_created = 0
                if event.event_flow == Event.EventFlow.FREE_REGISTRATION:
                    TicketTier.objects.create(
                        event=event,
                        name='General Registration',
                        price=0,
                        quantity_total=_safe_int(
                            data.get('capacity') or event.max_tickets_per_order,
                            1000,
                        ),
                        ticket_type='ga',
                    )
                    tiers_created = 1

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
                        capacity=_safe_int(session_data.get('capacity'), 100),
                    )
                    sessions_created += 1

                if event.event_flow != Event.EventFlow.FREE_REGISTRATION:
                    for tier_data in data.get('tiers', []) or []:
                        try:
                            TicketTier.objects.create(
                                event=event,
                                name=tier_data.get('name', 'General'),
                                price=tier_data.get('price', 0) or 0,
                                quantity_total=_safe_int(
                                    tier_data.get('quantity_total'), 100,
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
                    "Event %s created (org=%s, organizer=%s, flow=%s, sessions=%d, tiers=%d)",
                    event.id, organization.id, target_organizer.id,
                    event.event_flow, sessions_created, tiers_created,
                )

        except Exception as exc:
            logger.exception("Event creation failed; transaction rolled back")
            return Response(
                {'error': f'Could not create event: {exc}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            serialized = EventDetailSerializer(
                event, context={'request': request},
            ).data
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

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        manager = _is_manager(request.user)

        queryset = (
            queryset
            .select_related('venue', 'cancellation_policy', 'organizer', 'organization')
            .prefetch_related('tiers', 'sessions', 'templates__template_type')
        )

        if manager:
            queryset = queryset.annotate(
                # Canonical active ticket definition — see _active_ticket_q().
                # Kept as an annotation (instead of a per-row .count()) so the
                # list endpoint stays a single query.
                active_tickets_count=Count(
                    'tickets',
                    filter=_active_ticket_q_via_event(),
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
                if i >= len(data):
                    break
                data[i]['total_tickets_sold'] = event_obj.active_tickets_count or 0
                data[i]['total_revenue'] = float(event_obj.active_revenue or 0)
                data[i]['total_bookings'] = event_obj.active_bookings_count or 0

        data = _apply_effective_status(data, events_list)

        return Response(data)

    def retrieve(self, request, *args, **kwargs):
        queryset = self.get_queryset().prefetch_related(*_PUBLIC_PREFETCH)
        instance = get_object_or_404(queryset, pk=kwargs.get('pk'))
        user = request.user

        serializer = self.get_serializer(instance, context={'request': request})
        data = serializer.data

        if _is_manager(user):
            # Canonical active ticket count — same definition as list().
            active_tickets_count = _active_ticket_count(instance)
            actual_revenue = canonical_revenue(instance.bookings.all())
            active_bookings_count = instance.bookings.exclude(
                status__in=EXCLUDED_BOOKING_STATUSES
            ).count()

            data['total_tickets_sold'] = active_tickets_count
            data['total_revenue'] = float(actual_revenue)
            data['total_bookings'] = active_bookings_count

        data = _apply_effective_status(data, instance)

        return Response(data)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        data = request.data
        user = request.user

        if not can_manage_event_data(user, instance):
            return Response(
                {'error': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if 'event_flow' in data:
            normalised_flow = _normalise_event_flow(data.get('event_flow'))
            if normalised_flow is False:
                return Response(
                    {
                        'event_flow': (
                            f'Invalid event_flow: {data.get("event_flow")!r}. '
                            f'Valid values: {sorted(VALID_EVENT_FLOWS)}.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

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

        if instance.end_date and instance.end_date < timezone.now():
            if not is_platform_admin(user):
                return Response(
                    {'error': 'Cannot edit past events'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        if 'organizer_id' in data:
            target_organizer, org_err = self._resolve_target_organizer(
                user, data.get('organizer_id'), fallback=instance.organizer,
            )
            if org_err is not None:
                return org_err

            if target_organizer.id != instance.organizer_id:
                active_bookings = instance.bookings.exclude(
                    status__in=['cancelled', 'refunded'],
                ).count()
                if active_bookings > 0:
                    return Response(
                        {
                            'organizer_id': (
                                f'Cannot reassign an event that has '
                                f'{active_bookings} active booking(s). '
                                f'Cancel or refund them first.'
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                # Invariant: new organizer must be a member of the org.
                # Enforced for all callers, superusers included.
                if not OrganizationMembership.objects.filter(
                    organization=instance.organization,
                    user=target_organizer,
                ).exists():
                    return Response(
                        {'organizer_id':
                         'Organizer is not a member of this organization.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                instance.organizer = target_organizer
                instance.save(update_fields=['organizer'])
                logger.info(
                    "Event %s reassigned from user=%s to user=%s by=%s",
                    instance.id, instance.organizer_id, target_organizer.id, user.id,
                )

        if data.get('venue_id'):
            try:
                instance.venue = Venue.objects.get(
                    id=data['venue_id'], organization=instance.organization,
                )
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

        if 'sessions' in data and isinstance(data['sessions'], list):
            incoming = data['sessions'] or []
            existing_by_id = {str(s.id): s for s in instance.sessions.all()}
            seen_ids = set()

            for sess_payload in incoming:
                sess_id = str(sess_payload.get('id') or '').strip()
                s_start = self._parse_dt(sess_payload.get('start_time'))
                s_end = self._parse_dt(sess_payload.get('end_time'))
                s_capacity = _safe_int(sess_payload.get('capacity'), 100)

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

        if 'tiers' in data and isinstance(data['tiers'], list):
            incoming = data['tiers'] or []
            existing_by_id = {str(t.id): t for t in instance.tiers.all()}
            seen_ids = set()

            for tier_payload in incoming:
                tier_id = str(tier_payload.get('id') or '').strip()
                name = tier_payload.get('name', 'General')
                price = tier_payload.get('price', 0) or 0
                quantity_total = _safe_int(tier_payload.get('quantity_total'), 100)
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

        serialized = EventDetailSerializer(
            instance, context={'request': request},
        ).data
        serialized = _apply_effective_status(serialized, instance)
        return Response(serialized)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        user = request.user

        if not can_manage_event_data(user, instance):
            return Response(
                {'error': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if instance.end_date and instance.end_date < timezone.now():
            if not is_platform_admin(user):
                return Response(
                    {'error': 'Cannot delete past events'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        event = self.get_object()
        user = request.user

        if not can_manage_event_data(user, event):
            return Response(
                {'error': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if event.end_date and event.end_date < timezone.now():
            if not is_platform_admin(user):
                return Response(
                    {'error': 'Cannot publish past events'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        event.status = 'active'
        event.save(update_fields=['status'])
        return Response({'message': 'Event published successfully'})

    @action(
        detail=False,
        methods=['get'],
        permission_classes=[AllowAny],
        throttle_classes=[ScopedRateThrottle],
        throttle_scope='public_read',
    )
    def public(self, request):
        now = timezone.now()

        queryset = (
            Event.objects
            .filter(
                status__in=['active', 'published'],
                is_public=True,
                end_date__gte=now,
            )
            .select_related('venue', 'organization')
            .prefetch_related('tiers', 'sessions', 'templates__template_type')
            .order_by('-start_date')
            .annotate(
                # Canonical active ticket definition — see _active_ticket_q().
                active_tickets_count=Count(
                    'tickets',
                    filter=_active_ticket_q_via_event(),
                    distinct=True,
                )
            )
        )

        events_list = list(queryset)

        serializer = PublicEventSerializer(
            events_list,
            many=True,
            context={'request': request},
        )
        data = list(serializer.data)
        for i, event_obj in enumerate(events_list):
            if i < len(data):
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
        now = timezone.now()

        try:
            event = (
                Event.objects
                .select_related('venue', 'organization')
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

        # Canonical active ticket count — same definition as list()/public()/retrieve().
        active_tickets_count = _active_ticket_count(event)

        serializer = PublicEventDetailSerializer(
            event,
            context={'request': request},
        )
        data = serializer.data
        data['total_tickets_sold'] = active_tickets_count

        data = _apply_effective_status(data, event, now=now)

        return Response(data)