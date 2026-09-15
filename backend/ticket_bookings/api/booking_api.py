# ticket_bookings/api/booking_api.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from django.db.models import F, Q, Count, Case, When, Value, IntegerField, Sum
from django.contrib.auth.models import User
from django.core.mail import send_mail, EmailMultiAlternatives
from django.core.exceptions import ValidationError
from django.conf import settings
from django.template.loader import render_to_string
from django.utils.html import strip_tags
import logging
import uuid
import qrcode
from io import BytesIO
import base64
import json
import re

from ticket_bookings.models import (
    Booking, Ticket, Event, TicketTier,
    Session, CheckInLog
)
from .serializers import (
    BookingSerializer,
    BookingListSerializer,
    BookingAdminSerializer,
    BookingDetailSerializer,
    TicketSerializer,
    CheckInLogSerializer,
    UserSerializer
)
from core.permissions import IsOrganizerOrAdmin

# NEW IMPORTS
from .ticket_generator import TicketGenerator
from .ticket_combiner import TicketCombiner

logger = logging.getLogger(__name__)


def _is_organizer(user):
    return (
        (hasattr(user, 'profile') and getattr(user.profile, 'is_organizer', False))
        or hasattr(user, 'organizer')
    )

# ============================================================
# BULK ACTION WHITELIST
# ------------------------------------------------------------
# Only exact strings from this map are accepted as bulk actions.
# No fuzzy matching. Unknown actions are rejected with HTTP 400.
# ============================================================
BULK_ACTION_MAP = {
    # Frontend name                        -> backend canonical
    'mark_payment_received':                'confirm_payment',
    'confirm_payment':                      'confirm_payment',
    'confirm_payment_and_issue_tickets':    'confirm_payment_and_issue',
    'confirm_payment_and_issue':            'confirm_payment_and_issue',
    'issue_tickets':                        'issue_tickets',
    'regenerate_ticket_qr':                 'regenerate_ticket_qr',
    'cancel_booking':                       'cancel_booking',
    'refund_booking':                       'refund_booking',
}

# Canonical (backend) actions that map to an actual handler.
BULK_ACTION_HANDLERS = {
    'confirm_payment',
    'confirm_payment_and_issue',
    'issue_tickets',
    'regenerate_ticket_qr',
    'cancel_booking',
    'refund_booking',
}

# Import-time sanity check — fail loudly if a mapping is broken.
assert set(BULK_ACTION_MAP.values()) <= BULK_ACTION_HANDLERS, (
    "BULK_ACTION_MAP contains a target with no handler: "
    f"{set(BULK_ACTION_MAP.values()) - BULK_ACTION_HANDLERS}"
)


# ✅ Custom Permission Class for Admin Actions
class IsAdminOrOrganizer(permissions.BasePermission):
    """
    Allows access only to admin/staff or organizer users
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Admin/staff can access
        if request.user.is_staff or request.user.is_superuser:
            return True

        # Organizer can access
        if _is_organizer(request.user):
            return True
        if hasattr(request.user, 'organizer'):
            return True

        return False


class BookingViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing bookings with admin actions.
    All endpoints are throttled via ScopedRateThrottle.
    """
    queryset = Booking.objects.all().order_by('-created_at')
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]

    def get_throttles(self):
        """
        Per-action throttle scopes:
          - create          -> 'booking_create'
          - bulk_action     -> 'user'    (default user rate)
          - everything else -> 'user'
        """
        if self.action == 'create':
            self.throttle_scope = 'booking_create'
        elif self.action in ('resend_tickets',):
            self.throttle_scope = 'booking_resend'
        else:
            self.throttle_scope = 'user'
        return super().get_throttles()

    def get_permissions(self):
        """
        Dynamically set permissions based on action.
        - Admin actions: IsAdminOrOrganizer
        - Regular actions: IsAuthenticated
        """
        admin_actions = [
            'bulk_action', 'confirm_payment_and_issue_tickets',
            'mark_payment_received', 'issue_tickets',
            'cancel_booking', 'refund_booking', 'regenerate_ticket_qr',
            'for_confirm_payment', 'for_mark_payment', 'for_issue_tickets',
            'bulk_action_counts', 'confirm_payment', 'refund', 'apply_discount'
        ]

        if self.action in admin_actions:
            return [IsAdminOrOrganizer()]

        return [permissions.IsAuthenticated()]

    @action(detail=False, methods=['post', 'get'])
    def debug(self, request):
        """
        Debug endpoint to see exactly what data is being sent.

        ⚠️ SECURITY: This endpoint echoes back request headers and body,
        which may include Authorization tokens. It MUST NOT be reachable
        in production. It is left here only for local development.
        """
        if not settings.DEBUG:
            return Response(
                {'error': 'Debug endpoint disabled in production'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # NOTE: We do NOT echo the raw request body, as it may contain
        # passwords or other sensitive data. Keep only a short length
        # indicator for debugging.
        raw_body_len = 0
        try:
            if request.body:
                raw_body_len = len(request.body)
        except Exception:
            raw_body_len = -1

        # Get parsed data
        parsed_data = {}
        if hasattr(request, 'data'):
            if isinstance(request.data, dict):
                parsed_data = request.data
            elif hasattr(request.data, 'dict'):
                parsed_data = request.data.dict()
            else:
                parsed_data = str(request.data)

        # Get content type
        content_type = request.content_type or request.headers.get('Content-Type', 'unknown')

        # ✅ Never echo the Authorization header, even in debug
        headers = dict(request.headers)
        headers.pop('Authorization', None)
        headers.pop('authorization', None)

         # Redact known-sensitive keys from parsed_data
        SENSITIVE_KEYS = {
            'password', 'password_confirm', 'current_password',
            'new_password', 'token', 'refresh', 'access',
            'secret', 'api_key', 'admin_token',
        }
        if isinstance(parsed_data, dict):
            parsed_data = {
                k: ('[REDACTED]' if k.lower() in SENSITIVE_KEYS else v)
                for k, v in parsed_data.items()
            }

        return Response({
            'content_type': content_type,
            'method': request.method,
            'parsed_data': parsed_data,
            'raw_body_length': raw_body_len,
            'headers': headers,
            'query_params': dict(request.query_params) if hasattr(request, 'query_params') else {},
        })

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'list':
            return BookingListSerializer
        elif self.action == 'retrieve':
            return BookingAdminSerializer
        elif self.action in ['bulk_action', 'confirm_payment_and_issue_tickets',
                             'mark_payment_received', 'issue_tickets',
                             'cancel_booking', 'refund_booking']:
            return BookingAdminSerializer
        return BookingSerializer

    def get_queryset(self):
        """Filter bookings based on user role"""
        user = self.request.user

        # Superuser and staff can see all bookings
        if user.is_superuser or user.is_staff:
            return Booking.objects.all().order_by('-created_at')

        # Check if user is an organizer via profile
        is_organizer = False
        if _is_organizer(user):
            is_organizer = True

        # Organizers see bookings for their events
        if is_organizer:
            return Booking.objects.filter(
                event__organizer=user
            ).order_by('-created_at')

        # Regular users see their own bookings
        return Booking.objects.filter(user=user).order_by('-created_at')

    def get_object(self):
        """
        Override to ensure users can only access their own bookings
        (unless they are admin/organizer)
        """
        obj = super().get_object()
        user = self.request.user

        # Admin/staff can access any booking
        if user.is_superuser or user.is_staff:
            return obj

        # Check if user is an organizer
        is_organizer = False
        if _is_organizer(user):
            is_organizer = True
        if hasattr(user, 'organizer'):
            is_organizer = True

        # Organizer can access bookings for their events
        if is_organizer and obj.event.organizer_id == user.id:
            return obj

        # Regular user can only access their own bookings
        if obj.user_id == user.id:
            return obj

        # Permission denied
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("You do not have permission to access this booking.")

    def create(self, request, *args, **kwargs):
        """
        Override create to:
        - map event_id -> event
        - validate event is bookable
        - rate-limit via throttle_scope='booking_create'
        - prevent non-staff users from setting is_organizer / role fields
          indirectly via metadata
        """
        # Defensive: strip any privileged keys from metadata before save
        if isinstance(request.data.get('metadata'), dict):
            md = request.data['metadata']
            for forbidden in ('is_organizer', 'role', 'is_staff', 'is_superuser'):
                md.pop(forbidden, None)

        # Map event_id to event if present (for WhatsApp bookings)
        if 'event_id' in request.data and 'event' not in request.data:
            request.data['event'] = request.data['event_id']

        # ✅ Validate that the event exists and is upcoming
        event_id = request.data.get('event') or request.data.get('event_id')
        if event_id:
            try:
                event = Event.objects.get(id=event_id)

                # Check if event is active/published
                if event.status not in ['active', 'published']:
                    return Response(
                        {'error': 'This event is not available for booking'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # Check if event is upcoming (not ended)
                if event.end_date and event.end_date < timezone.now():
                    return Response(
                        {'error': 'This event has already ended'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # Check if event is public
                if not event.is_public and not (request.user.is_staff or request.user.is_superuser):
                    return Response(
                        {'error': 'This event is not available for public booking'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            except Event.DoesNotExist:
                return Response(
                    {'error': 'Event not found'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Calculate total_amount if missing (for WhatsApp bookings)
        if 'total_amount' not in request.data or request.data['total_amount'] is None:
            tickets = request.data.get('tickets', [])
            total = 0
            for ticket in tickets:
                tier_id = ticket.get('tier_id')
                if tier_id:
                    try:
                        tier = TicketTier.objects.get(id=tier_id)
                        total += float(tier.price)
                    except TicketTier.DoesNotExist:
                        pass
            request.data['total_amount'] = str(total)

        return super().create(request, *args, **kwargs)

    # ==================== HELPER METHOD TO UPDATE EVENT COUNTS ====================

    def _update_event_counts(self, event):
        """
        Update event total_tickets_sold and total_revenue
        Excludes cancelled and refunded bookings
        """
        if event:
            # Calculate active tickets (excluding cancelled/refunded bookings)
            active_tickets_count = event.tickets.exclude(
                booking__status__in=['cancelled', 'refunded']
            ).count()

            # Calculate active revenue (from paid/confirmed/completed bookings only)
            active_revenue = event.bookings.filter(
                status__in=['paid', 'confirmed', 'completed']
            ).aggregate(total=Sum('total_amount'))['total'] or 0

            # Update event fields
            event.total_tickets_sold = active_tickets_count
            event.total_revenue = active_revenue
            event.save(update_fields=['total_tickets_sold', 'total_revenue', 'updated_at'])

            logger.info(f"✅ Updated event {event.id} counts: tickets={active_tickets_count}, revenue={active_revenue}")
            return True
        return False

    # ==================== FILTERED BOOKING LISTS FOR BULK ACTIONS ====================

    @action(detail=False, methods=['get'])
    def for_confirm_payment(self, request):
        """
        Get bookings eligible for 'Confirm Payment & Issue Tickets' action
        Returns bookings with status 'pending' or 'processing' that have NO active tickets
        """
        user = request.user

        # Check if user is an organizer
        is_organizer = False
        if _is_organizer(user):
            is_organizer = True
        if hasattr(user, 'organizer'):
            is_organizer = True

        # Base queryset based on user role
        if user.is_superuser or user.is_staff:
            queryset = Booking.objects.all()
        elif is_organizer:
            queryset = Booking.objects.filter(event__organizer=user)
        else:
            queryset = Booking.objects.filter(user=user)

        # Filter for Confirm Payment & Issue Tickets
        queryset = queryset.filter(
            status__in=['pending', 'processing']
        ).annotate(
            active_ticket_count=Count(
                Case(
                    When(tickets__status='active', then=1),
                    output_field=IntegerField()
                )
            )
        ).filter(active_ticket_count=0)

        queryset = queryset.order_by('-created_at')

        serializer = BookingAdminSerializer(queryset, many=True)

        return Response({
            'action': 'confirm_payment_and_issue',
            'description': 'Bookings eligible for Confirm Payment & Issue Tickets',
            'count': queryset.count(),
            'bookings': serializer.data
        })

    @action(detail=False, methods=['get'])
    def for_mark_payment(self, request):
        """
        Get bookings eligible for 'Mark Payment Received' action
        Returns bookings with status 'pending' or 'processing' (regardless of tickets)
        """
        user = request.user

        is_organizer = False
        if _is_organizer(user):
            is_organizer = True
        if hasattr(user, 'organizer'):
            is_organizer = True

        if user.is_superuser or user.is_staff:
            queryset = Booking.objects.all()
        elif is_organizer:
            queryset = Booking.objects.filter(event__organizer=user)
        else:
            queryset = Booking.objects.filter(user=user)

        queryset = queryset.filter(
            status__in=['pending', 'processing']
        ).annotate(
            active_ticket_count=Count(
                Case(
                    When(tickets__status='active', then=1),
                    output_field=IntegerField()
                )
            ),
            total_ticket_count=Count('tickets')
        ).order_by('-created_at')

        serializer = BookingAdminSerializer(queryset, many=True)

        return Response({
            'action': 'mark_payment_received',
            'description': 'Bookings eligible for Mark Payment Received',
            'count': queryset.count(),
            'bookings': serializer.data,
            'note': 'This action will mark payment as received without generating tickets'
        })

    @action(detail=False, methods=['get'])
    def for_issue_tickets(self, request):
        """
        Get bookings eligible for 'Issue Tickets' action
        Returns bookings with status 'paid' or 'confirmed' that have NO active tickets
        """
        user = request.user

        is_organizer = False
        if _is_organizer(user):
            is_organizer = True
        if hasattr(user, 'organizer'):
            is_organizer = True

        if user.is_superuser or user.is_staff:
            queryset = Booking.objects.all()
        elif is_organizer:
            queryset = Booking.objects.filter(event__organizer=user)
        else:
            queryset = Booking.objects.filter(user=user)

        queryset = queryset.filter(
            status__in=['paid', 'confirmed']
        ).annotate(
            active_ticket_count=Count(
                Case(
                    When(tickets__status='active', then=1),
                    output_field=IntegerField()
                )
            )
        ).filter(active_ticket_count=0).order_by('-created_at')

        serializer = BookingAdminSerializer(queryset, many=True)

        return Response({
            'action': 'issue_tickets',
            'description': 'Bookings eligible for Issue Tickets (Paid status, no active tickets)',
            'count': queryset.count(),
            'bookings': serializer.data,
            'note': 'These bookings are already paid and ready for ticket issuance'
        })

    @action(detail=False, methods=['get'])
    def bulk_action_counts(self, request):
        """
        Get counts for each bulk action type.
        Useful for showing numbers on the UI.
        """
        user = request.user

        is_organizer = False
        if _is_organizer(user):
            is_organizer = True
        if hasattr(user, 'organizer'):
            is_organizer = True

        if user.is_superuser or user.is_staff:
            base_queryset = Booking.objects.all()
        elif is_organizer:
            base_queryset = Booking.objects.filter(event__organizer=user)
        else:
            base_queryset = Booking.objects.filter(user=user)

        confirm_payment_count = base_queryset.filter(
            status__in=['pending', 'processing'],
            tickets__isnull=True
        ).count()

        mark_payment_count = base_queryset.filter(
            status__in=['pending', 'processing']
        ).count()

        issue_tickets_count = base_queryset.filter(
            status__in=['paid', 'confirmed']
        ).annotate(
            active_ticket_count=Count(
                Case(
                    When(tickets__status='active', then=1),
                    output_field=IntegerField()
                )
            )
        ).filter(active_ticket_count=0).count()

        return Response({
            'confirm_payment_and_issue': {
                'count': confirm_payment_count,
                'description': 'Pending bookings ready for payment confirmation and ticket issuance'
            },
            'mark_payment_received': {
                'count': mark_payment_count,
                'description': 'Pending bookings ready for payment confirmation only'
            },
            'issue_tickets': {
                'count': issue_tickets_count,
                'description': 'Paid bookings ready for ticket issuance'
            }
        })

    # ==================== BULK ACTION (STRICT WHITELIST) ====================

    @action(detail=False, methods=['post'])
    def bulk_action(self, request):
        """
        Perform bulk actions on multiple bookings.

        Accepted request body (JSON):
            {
                "booking_ids": ["<uuid>", "<uuid>", ...],
                "action": "<one of BULK_ACTION_MAP keys>"
            }

        Only exact, whitelisted action strings are accepted. No fuzzy matching.
        Returns 400 for unknown or malformed actions.
        """
        logger.info("=" * 80)
        logger.info("📥 BULK ACTION REQUEST")
        logger.info("Method: %s", request.method)
        logger.info("Content-Type: %s", request.content_type)
        logger.info("=" * 80)

        # ---------- 1. Normalize request.data to a dict ----------
        data = request.data

        if isinstance(data, str):
            try:
                data = json.loads(data)
            except json.JSONDecodeError:
                logger.error("❌ Invalid JSON body")
                return Response(
                    {'error': 'Invalid JSON body'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if hasattr(data, 'dict'):
            data = data.dict()

        if not isinstance(data, dict):
            logger.error("❌ Unexpected payload type: %s", type(data))
            return Response(
                {'error': 'Request body must be a JSON object'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info("📊 Data keys: %s", list(data.keys()))

        # ---------- 2. Strictly validate the action ----------
        original_action = data.get('action')
        if original_action is None:
            original_action = data.get('type') or data.get('operation')

        if not isinstance(original_action, str):
            logger.warning("❌ Missing or non-string action: %r", original_action)
            return Response(
                {
                    'error': 'action is required and must be a string',
                    'allowed_actions': sorted(BULK_ACTION_MAP.keys()),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        original_action = original_action.strip()
        backend_action = BULK_ACTION_MAP.get(original_action)

        if backend_action is None:
            logger.warning("❌ Invalid action: %r", original_action)
            return Response(
                {
                    'error': f'Invalid action: {original_action!r}',
                    'allowed_actions': sorted(BULK_ACTION_MAP.keys()),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info("📊 Action mapped: %r -> %r", original_action, backend_action)

        # ---------- 3. Extract booking IDs ----------
        booking_ids_raw = None
        for key in ('booking_ids', 'bookingIds', 'ids', 'selected_ids', 'selectedIds', 'bookings'):
            if key in data:
                booking_ids_raw = data[key]
                break

        if booking_ids_raw is None:
            return Response(
                {
                    'error': 'booking_ids is required',
                    'expected_format': {
                        'booking_ids': ['<uuid>', '<uuid>'],
                        'action': 'mark_payment_received',
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Accept list, comma-separated string, or a single value.
        if isinstance(booking_ids_raw, str):
            stripped = booking_ids_raw.strip()
            if stripped.startswith('['):
                try:
                    booking_ids_raw = json.loads(stripped)
                except json.JSONDecodeError:
                    booking_ids_raw = [stripped]
            elif ',' in stripped:
                booking_ids_raw = [p.strip() for p in stripped.split(',') if p.strip()]
            else:
                booking_ids_raw = [stripped]
        elif not isinstance(booking_ids_raw, list):
            booking_ids_raw = [booking_ids_raw]

        booking_ids = []
        for item in booking_ids_raw:
            if isinstance(item, dict):
                item = item.get('id') or item.get('booking_id')
            if item is None:
                continue
            s = str(item).strip()
            if s and s not in ('null', 'undefined'):
                booking_ids.append(s)

        if not booking_ids:
            return Response(
                {'error': 'No valid booking_ids provided'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Cap bulk operations to prevent abuse
        MAX_BULK = 200
        if len(booking_ids) > MAX_BULK:
            return Response(
                {'error': f'Maximum {MAX_BULK} bookings per bulk action.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info("📊 Processing %d booking id(s)", len(booking_ids))

        # ---------- 4. Load bookings + check permissions ----------
        bookings = []
        not_found = []
        permission_denied = []

        for booking_id in booking_ids:
            try:
                booking = Booking.objects.get(id=booking_id)
            except (Booking.DoesNotExist, ValueError, ValidationError):
                not_found.append({'booking_id': booking_id, 'reason': 'Booking not found'})
                continue

            if self._can_manage_booking(request.user, booking):
                bookings.append(booking)
            else:
                permission_denied.append({
                    'booking_id': booking_id,
                    'reference': booking.booking_reference,
                    'reason': 'Permission denied',
                })

        if not bookings:
            return Response(
                {
                    'status': 'failed',
                    'message': 'No valid bookings found',
                    'errors': {'not_found': not_found, 'permission_denied': permission_denied},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ---------- 5. Validate eligibility for the action ----------
        validation_results = self._validate_bookings_for_action(bookings, backend_action)

        if validation_results['invalid']:
            return Response(
                {
                    'status': 'validation_failed',
                    'message': (
                        f'{len(validation_results["invalid"])} booking(s) are not '
                        f'eligible for {original_action}'
                    ),
                    'action': original_action,
                    'mapped_action': backend_action,
                    'validation_results': {
                        'valid_count': len(validation_results['valid']),
                        'invalid_count': len(validation_results['invalid']),
                        'invalid': validation_results['invalid'],
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ---------- 6. Execute with the strict handler map ----------
        handler = {
            'confirm_payment':           self._confirm_payment_for_booking,
            'confirm_payment_and_issue': self._confirm_payment_and_issue_tickets_for_booking,
            'issue_tickets':             self._issue_tickets_for_booking,
            'regenerate_ticket_qr':      self._regenerate_ticket_qr_for_booking,
            'cancel_booking':            self._cancel_booking_action,
            'refund_booking':            self._refund_booking_action,
        }[backend_action]

        results = []
        errors = []

        with transaction.atomic():
            for booking_id in validation_results['valid']:
                try:
                    booking = Booking.objects.get(id=booking_id)
                    result = handler(booking)
                    results.append({
                        'booking_id': str(booking.id),
                        'reference': booking.booking_reference,
                        'customer_name': booking.customer_name,
                        'current_status': booking.status,
                        'result': result,
                        'status': 'success' if 'error' not in result else 'failed',
                    })
                except Exception as exc:
                    logger.exception("Bulk action failed for booking %s", booking_id)
                    errors.append({'booking_id': booking_id, 'error': str(exc)})

        return Response(
            {
                'status': 'completed',
                'action': original_action,
                'mapped_action': backend_action,
                'summary': {
                    'total_processed': len(results),
                    'successful': sum(1 for r in results if r.get('status') == 'success'),
                    'failed': len(errors),
                },
                'results': results,
                'errors': errors or None,
            },
            status=status.HTTP_200_OK,
        )

    def _validate_bookings_for_action(self, bookings, action):
        """
        Validate if bookings are eligible for the given action.
        Note: `action` is the *backend canonical* action, not the frontend string.
        """
        valid = []
        invalid = []

        for booking in bookings:
            is_valid = True
            validation_errors = []

            if action == 'confirm_payment':
                if booking.status not in ['pending', 'processing']:
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': f'Booking must be pending or processing. Current status: {booking.status}'
                    })
                if booking.status == 'cancelled':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Cannot confirm payment for cancelled booking'})
                if booking.status == 'refunded':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Cannot confirm payment for refunded booking'})
                if booking.status == 'completed':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Booking is already completed'})
                if booking.paid_at:
                    is_valid = False
                    validation_errors.append({
                        'field': 'paid_at',
                        'message': 'Payment already confirmed at ' + booking.paid_at.strftime('%Y-%m-%d %H:%M')
                    })

            elif action == 'confirm_payment_and_issue':
                if booking.status not in ['pending', 'processing']:
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': f'Booking must be pending or processing. Current status: {booking.status}'
                    })
                if booking.status == 'cancelled':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Cannot process cancelled booking'})
                if booking.status == 'refunded':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Cannot process refunded booking'})
                if booking.status == 'completed':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Booking is already completed'})

                if is_valid:
                    existing_tickets = booking.tickets.filter(status='active')
                    if existing_tickets.exists():
                        is_valid = False
                        ticket_details = [{
                            'ticket_code': t.unique_code,
                            'tier_name': t.tier.name if t.tier else 'Unknown',
                            'attendee_name': t.attendee_name or 'Guest',
                            'status': t.status,
                        } for t in existing_tickets]
                        validation_errors.append({
                            'field': 'tickets',
                            'message': f'This booking already has {existing_tickets.count()} active ticket(s). New tickets cannot be issued.',
                            'ticket_details': ticket_details,
                        })

                if booking.paid_at:
                    validation_errors.append({
                        'field': 'paid_at',
                        'message': f'Payment already confirmed at {booking.paid_at.strftime("%Y-%m-%d %H:%M")}. Use "Issue Tickets" action instead.'
                    })

            elif action == 'issue_tickets':
                if booking.status not in ['paid', 'confirmed']:
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': f'Booking must be paid or confirmed. Current status: {booking.status}'
                    })
                if booking.status == 'completed':
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': 'Booking is already completed. Tickets have been fully used.'
                    })
                if is_valid:
                    existing_tickets = booking.tickets.filter(status='active')
                    if existing_tickets.exists():
                        is_valid = False
                        ticket_details = [{
                            'ticket_code': t.unique_code,
                            'tier_name': t.tier.name if t.tier else 'Unknown',
                            'attendee_name': t.attendee_name or 'Guest',
                            'status': t.status,
                        } for t in existing_tickets]
                        validation_errors.append({
                            'field': 'tickets',
                            'message': f'This booking already has {existing_tickets.count()} active ticket(s). New tickets cannot be issued.',
                            'ticket_details': ticket_details,
                        })

            elif action == 'regenerate_ticket_qr':
                if booking.status not in ['paid', 'confirmed']:
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': f'Booking must be paid or confirmed. Current status: {booking.status}'
                    })
                if is_valid:
                    if not booking.tickets.filter(status='active').exists():
                        is_valid = False
                        validation_errors.append({
                            'field': 'tickets',
                            'message': 'No active tickets found to regenerate QR codes'
                        })

            elif action == 'cancel_booking':
                if booking.status in ['cancelled', 'refunded', 'completed']:
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': f'Booking is already {booking.status}'
                    })

            elif action == 'refund_booking':
                if booking.status not in ['paid', 'confirmed']:
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': f'Only paid or confirmed bookings can be refunded. Current status: {booking.status}'
                    })
                if booking.status == 'refunded':
                    is_valid = False
                    validation_errors.append({'field': 'status', 'message': 'Booking is already refunded'})
                if booking.status == 'completed':
                    is_valid = False
                    validation_errors.append({
                        'field': 'status',
                        'message': 'Cannot refund a completed booking (all tickets already used)'
                    })

            # Common validations
            if is_valid and not booking.event:
                is_valid = False
                validation_errors.append({'field': 'event', 'message': 'Booking has no associated event'})

            if is_valid and booking.event and booking.event.status == 'cancelled':
                is_valid = False
                validation_errors.append({
                    'field': 'event_status',
                    'message': 'Cannot process booking for cancelled event'
                })

            if is_valid:
                valid.append(str(booking.id))
            else:
                invalid.append({
                    'booking_id': str(booking.id),
                    'reference': booking.booking_reference,
                    'customer_name': booking.customer_name,
                    'current_status': booking.status,
                    'ticket_count': booking.tickets.count(),
                    'active_ticket_count': booking.tickets.filter(status='active').count(),
                    'used_ticket_count': booking.tickets.filter(status='used').count(),
                    'errors': validation_errors,
                })

        return {'valid': valid, 'invalid': invalid}

    def _can_manage_booking(self, user, booking):
        """Check if user can manage this booking."""
        if user.is_superuser or user.is_staff:
            return True
        if _is_organizer(user):
            return booking.event.organizer_id == user.id
        return booking.user_id == user.id

    # ==================== CONFIRM PAYMENT ====================

    def _confirm_payment_for_booking(self, booking):
        """
        Mark payment as confirmed - no tickets generated.
        Status: pending -> paid
        """
        if booking.status in ['paid', 'confirmed', 'completed']:
            return {'warning': f'Booking is already {booking.status}'}

        if booking.status == 'cancelled':
            return {'error': 'Cannot confirm payment for cancelled booking'}

        if booking.status == 'refunded':
            return {'error': 'Cannot confirm payment for refunded booking'}

        booking.status = 'paid'
        booking.paid_at = timezone.now()
        booking.save()

        try:
            self._send_payment_confirmation_email(booking)
        except Exception as e:
            logger.warning(f"⚠️ Payment confirmation email failed (not blocking): {str(e)}")

        return {
            'success': 'Payment confirmed successfully',
            'tickets_generated': 0,
            'note': 'No tickets were generated. Use "Issue Tickets" action separately if needed.'
        }

    def _confirm_payment_and_issue_tickets_for_booking(self, booking):
        """
        Confirm payment AND issue tickets in one step.
        Status: pending -> confirmed (payment + tickets issued)
        """
        if booking.status not in ['pending', 'processing']:
            return {'error': f'Cannot process booking with status: {booking.status}'}

        if booking.status == 'completed':
            return {'error': 'Booking is already completed'}

        if booking.tickets.filter(status='active').exists():
            active_tickets = booking.tickets.filter(status='active')
            ticket_details = [{'code': t.unique_code, 'status': t.status} for t in active_tickets]
            return {
                'error': 'Cannot issue tickets. Booking already has active tickets.',
                'active_tickets': active_tickets.count(),
                'ticket_details': ticket_details,
            }

        booking.status = 'confirmed'
        booking.paid_at = timezone.now()
        booking.save()

        logger.info(f"✅ Booking {booking.booking_reference} status set to confirmed (payment + tickets)")

        tickets_result = self._issue_tickets_for_booking(booking)

        if 'error' in tickets_result:
            booking.status = 'pending'
            booking.save()
            return tickets_result

        self._update_event_counts(booking.event)

        return {
            'success': 'Payment confirmed and tickets issued successfully',
            'tickets_generated': tickets_result.get('tickets_created', 0),
            'email_sent': tickets_result.get('email_sent', False),
            'email_message': tickets_result.get('email_message', ''),
        }

    # ============ SLOT VALIDATION AND RE-ALLOCATION ============

    def _validate_and_allocate_slot(self, booking):
        """
        Validate if the booked slot is still available.
        If not, automatically find the next available slot based on user's preferences.
        Returns: (is_valid, allocated_slot, message)
        """
        if not booking.session:
            logger.info(f"🔄 No session assigned for booking {booking.booking_reference}")
            return self._allocate_best_slot(booking)

        session = booking.session
        session.refresh_from_db()
        remaining_capacity = session.capacity - session.booked

        if remaining_capacity > 0:
            logger.info(f"✅ Slot {session.id} still has {remaining_capacity} capacity for booking {booking.booking_reference}")
            return True, session, "Slot confirmed"

        logger.warning(f"⚠️ Slot {session.id} is full for booking {booking.booking_reference}")
        logger.info(f"🔄 Automatically re-allocating slot for booking {booking.booking_reference}")
        return self._allocate_best_slot(booking)

    def _allocate_best_slot(self, booking):
        """
        Automatically find the best available slot based on user's preferences.
        Returns: (is_valid, allocated_slot, message)
        """
        slot_preferences = []
        if hasattr(booking, 'metadata') and booking.metadata:
            slot_preferences = booking.metadata.get('slot_preferences', [])

        sessions = booking.event.sessions.filter(is_active=True)

        if not sessions.exists():
            logger.error(f"❌ No active sessions found for event {booking.event.id}")
            return False, None, "No sessions available for this event. Please contact support."

        allocated_slot = None
        allocation_message = ""
        checked_slots = []

        if slot_preferences:
            logger.info(f"📋 Checking slot preferences: {slot_preferences}")
            for pref_slot_id in slot_preferences:
                try:
                    pref_slot = sessions.get(id=pref_slot_id)
                    pref_slot.refresh_from_db()
                    remaining_capacity = pref_slot.capacity - pref_slot.booked

                    checked_slots.append({
                        'slot_id': str(pref_slot.id),
                        'available': remaining_capacity > 0,
                        'remaining': remaining_capacity,
                    })

                    if remaining_capacity > 0:
                        allocated_slot = pref_slot
                        preference_rank = slot_preferences.index(pref_slot_id) + 1
                        allocation_message = f"Allocated based on your Preference #{preference_rank}"
                        logger.info(f"✅ Allocated slot {pref_slot_id} based on user preference #{preference_rank}")
                        break
                except sessions.model.DoesNotExist:
                    continue
        else:
            logger.info("📋 No slot preferences found, finding best available slot")

        if not allocated_slot:
            logger.info("🔄 No preferred slots available, finding any available slot")
            for session in sessions:
                session.refresh_from_db()
                remaining_capacity = session.capacity - session.booked
                if remaining_capacity > 0:
                    allocated_slot = session
                    allocation_message = "Allocated to next available slot (your preferred slots were full)"
                    logger.info(f"✅ Allocated slot {session.id} as next available")
                    break

        if not allocated_slot:
            logger.warning("⚠️ No slots with capacity found")
            return False, None, "All slots are currently full. Please contact support."

        booking.session = allocated_slot
        booking.save(update_fields=['session', 'updated_at'])

        if hasattr(booking, 'metadata'):
            if not booking.metadata:
                booking.metadata = {}
            booking.metadata['slot_allocation_message'] = allocation_message
            booking.metadata['slot_allocated_at'] = timezone.now().isoformat()
            booking.metadata['slot_allocation_checked_slots'] = checked_slots
            booking.save(update_fields=['metadata'])

        logger.info(f"✅ Booking {booking.booking_reference} re-allocated to slot {allocated_slot.id}")
        return True, allocated_slot, allocation_message

    def _check_and_update_session_capacity(self, session, tickets_count):
        """
        Check if session has capacity and update booked count.
        Returns: (success, message)
        """
        with transaction.atomic():
            session.refresh_from_db()
            remaining = session.capacity - session.booked

            if remaining < tickets_count:
                return False, f"Not enough capacity. Available: {remaining}, Required: {tickets_count}"

            session.booked += tickets_count
            session.save()

            logger.info(f"✅ Session {session.id} capacity updated: booked={session.booked}, capacity={session.capacity}, remaining={session.capacity - session.booked}")
            return True, "Capacity updated"

    # ==================== ISSUE TICKETS ====================

    def _issue_tickets_for_booking(self, booking):
        """
        Generate tickets for a booking with slot validation and re-allocation.
        """
        logger.info(f"🔍 Starting _issue_tickets_for_booking for {booking.booking_reference}")

        if not booking.session:
            if hasattr(booking, 'metadata') and booking.metadata:
                slot_id = booking.metadata.get('slot_id')
                if slot_id:
                    try:
                        session = Session.objects.get(id=slot_id)
                        booking.session = session
                        booking.save(update_fields=['session'])
                        logger.info(f"✅ Restored session {slot_id} from metadata for booking {booking.booking_reference}")
                    except Session.DoesNotExist:
                        logger.error(f"❌ Session {slot_id} from metadata not found")

        is_valid, allocated_slot, allocation_message = self._validate_and_allocate_slot(booking)

        if not is_valid:
            return {
                'error': 'No slot available for this booking',
                'message': allocation_message,
                'tickets_created': 0,
            }

        if hasattr(booking, 'metadata'):
            if not booking.metadata:
                booking.metadata = {}
            booking.metadata['slot_allocation_message'] = allocation_message
            booking.metadata['slot_allocated_at'] = timezone.now().isoformat()
            booking.save(update_fields=['metadata'])

        existing_tickets = booking.tickets.filter(status='active')
        if existing_tickets.exists():
            ticket_details = [{
                'code': t.unique_code,
                'tier': t.tier.name if t.tier else 'Unknown',
                'attendee': t.attendee_name or 'Guest',
                'status': t.status,
            } for t in existing_tickets]
            return {
                'error': f'Cannot issue tickets. Booking already has {existing_tickets.count()} active ticket(s)',
                'existing_tickets': ticket_details,
                'tickets_created': 0,
            }

        if booking.status == 'completed':
            return {'error': 'Booking is already completed. All tickets have been used.'}

        tickets_created = 0
        created_ticket_ids = []

        session_to_use = booking.session
        if not session_to_use:
            if hasattr(booking, 'metadata') and booking.metadata:
                slot_id = booking.metadata.get('slot_id')
                if slot_id:
                    try:
                        session_to_use = Session.objects.get(id=slot_id)
                        booking.session = session_to_use
                        booking.save(update_fields=['session'])
                        logger.info(f"✅ Restored session {slot_id} for ticket creation")
                    except Session.DoesNotExist:
                        logger.error(f"❌ Session {slot_id} not found")

        tickets_data = []
        if hasattr(booking, 'metadata') and booking.metadata:
            tickets_data = booking.metadata.get('tickets', [])
            logger.info(f"📊 Found {len(tickets_data)} tickets in metadata.tickets for booking {booking.booking_reference}")

            if not tickets_data:
                tickets_data = booking.metadata.get('ticket_types', [])
                logger.info(f"📊 Found {len(tickets_data)} tickets in metadata.ticket_types")

            if not tickets_data:
                tier_ids = booking.metadata.get('tier_ids', [])
                tier_quantities = booking.metadata.get('tier_quantities', {})
                attendee_names = booking.metadata.get('attendee_names', {})

                if tier_ids:
                    for tier_id in tier_ids:
                        quantity = tier_quantities.get(str(tier_id), 1)
                        names = attendee_names.get(str(tier_id), [booking.customer_name] * quantity)
                        for i in range(quantity):
                            attendee_name = names[i] if i < len(names) else booking.customer_name
                            tickets_data.append({
                                'tier_id': tier_id,
                                'attendee_name': attendee_name,
                            })
                    logger.info(f"📊 Reconstructed {len(tickets_data)} tickets from tier_ids")

            if not tickets_data:
                tier_id = booking.metadata.get('tier_id')
                quantity = booking.metadata.get('quantity', 1)
                if tier_id:
                    for i in range(quantity):
                        tickets_data.append({
                            'tier_id': tier_id,
                            'attendee_name': booking.customer_name,
                        })
                    logger.info(f"📊 Created {len(tickets_data)} tickets from single tier_id")

        if tickets_data:
            for ticket_data in tickets_data:
                tier_id = ticket_data.get('tier_id')
                attendee_name = ticket_data.get('attendee_name', booking.customer_name)

                if tier_id:
                    try:
                        tier = TicketTier.objects.get(id=tier_id)
                        ticket = Ticket.objects.create(
                            booking=booking,
                            tier=tier,
                            event=booking.event,
                            session=session_to_use,
                            status='active',
                            attendee_name=attendee_name,
                            attendee_email=booking.customer_email,
                            attendee_phone=booking.customer_phone,
                        )
                        self._generate_qr_code(ticket)

                        tier.quantity_sold += 1
                        tier.save()

                        booking.event.total_tickets_sold += 1
                        booking.event.save()

                        tickets_created += 1
                        created_ticket_ids.append(str(ticket.id))
                        logger.info(f"✅ Created ticket {ticket.unique_code} (ID: {ticket.id}) for {attendee_name} (Tier: {tier.name}, Session: {session_to_use.id if session_to_use else 'None'})")
                    except TicketTier.DoesNotExist:
                        logger.error(f"❌ Ticket tier {tier_id} not found")
                        continue
                    except Exception as e:
                        logger.error(f"❌ Error creating ticket: {str(e)}")
                        continue

            if tickets_created > 0:
                booking.metadata['ticket_created'] = True
                booking.metadata['tickets_created_count'] = tickets_created
                booking.metadata['ticket_ids'] = created_ticket_ids
                booking.save(update_fields=['metadata'])
                logger.info(f"✅ Updated metadata: ticket_created=True, count={tickets_created}, IDs={created_ticket_ids}")

        if tickets_created == 0:
            logger.warning(f"⚠️ No ticket data found in metadata for booking {booking.booking_reference}")
            logger.warning(f"⚠️ Attempting to create tickets from event tiers as fallback")

            if booking.event and booking.event.tiers.exists():
                available_tiers = booking.event.tiers.filter(
                    quantity_total__gt=F('quantity_sold')
                )

                if available_tiers.exists():
                    tier = available_tiers.first()
                    tickets_created = self._generate_tickets(booking, tier, 1, session_to_use)
                    logger.info(f"✅ Created {tickets_created} fallback ticket from tier: {tier.name}")

                    booking.metadata['fallback_ticket_created'] = True
                    booking.metadata['fallback_tier_id'] = str(tier.id)
                    booking.metadata['fallback_tier_name'] = tier.name
                    booking.save(update_fields=['metadata'])
                else:
                    logger.error(f"❌ No available tiers found for event {booking.event.id}")
                    return {
                        'error': 'No available ticket tiers found for this event. Please contact support.',
                        'tickets_created': 0,
                        'debug_info': {
                            'booking_id': str(booking.id),
                            'reference': booking.booking_reference,
                            'metadata': booking.metadata,
                            'event_tiers_count': booking.event.tiers.count() if booking.event else 0,
                        },
                    }
            else:
                logger.error(f"❌ No event or no tiers found for booking {booking.booking_reference}")
                return {
                    'error': 'No ticket information found for this booking. Please contact support.',
                    'tickets_created': 0,
                    'debug_info': {
                        'booking_id': str(booking.id),
                        'reference': booking.booking_reference,
                        'metadata': booking.metadata,
                        'has_event': booking.event is not None,
                        'event_tiers_count': booking.event.tiers.count() if booking.event else 0,
                    },
                }

        if booking.session and tickets_created > 0:
            capacity_success, capacity_message = self._check_and_update_session_capacity(booking.session, tickets_created)
            if not capacity_success:
                logger.error(f"❌ Capacity update failed for session {booking.session.id}: {capacity_message}")
                return {
                    'error': f'Failed to update session capacity: {capacity_message}',
                    'tickets_created': tickets_created,
                }
            logger.info(f"✅ Updated session {booking.session.id} capacity by {tickets_created} tickets")
        else:
            logger.warning(f"⚠️ No session to update capacity for booking {booking.booking_reference}")

        if booking.status == 'paid':
            booking.status = 'confirmed'
            booking.save(update_fields=['status'])
            logger.info(f"✅ Booking {booking.booking_reference} status updated from paid to confirmed")

        booking.refresh_from_db()

        final_ticket_count = booking.tickets.count()
        logger.info(f"✅ Final ticket count for booking {booking.booking_reference}: {final_ticket_count}")

        if final_ticket_count == 0 and tickets_created > 0:
            logger.error(f"❌ CRITICAL: Tickets were created ({tickets_created}) but not found in booking! This is a data integrity issue.")

        try:
            email_result = self._send_tickets_email(booking, allocation_message)
        except Exception as e:
            logger.warning(f"⚠️ Tickets email failed (not blocking): {str(e)}")
            email_result = {'success': False, 'message': str(e)}

        return {
            'success': f'Generated {tickets_created} tickets for slot {booking.session.id if booking.session else "Unknown"}',
            'tickets_created': tickets_created,
            'final_ticket_count': final_ticket_count,
            'ticket_ids': created_ticket_ids,
            'email_sent': email_result.get('success', False),
            'email_message': email_result.get('message', ''),
            'slot_allocation': {
                'slot_id': str(booking.session.id) if booking.session else None,
                'slot_start': booking.session.start_time.isoformat() if booking.session else None,
                'slot_end': booking.session.end_time.isoformat() if booking.session else None,
                'allocation_message': allocation_message,
            },
        }

    # ==================== DEBUG METADATA ENDPOINT ====================

    @action(detail=True, methods=['get'])
    def debug_metadata(self, request, pk=None):
        """
        Debug endpoint to view booking metadata and ticket information.

        ⚠️ SECURITY: returns raw metadata and internal IDs. Only available
        when DEBUG=True.
        """
        if not settings.DEBUG:
            return Response(
                {'error': 'Debug endpoint disabled in production'},
                status=status.HTTP_404_NOT_FOUND,
            )

        booking = self.get_object()
        metadata = booking.metadata or {}

        tickets_data = metadata.get('tickets', [])
        ticket_types = metadata.get('ticket_types', [])
        tier_ids = metadata.get('tier_ids', [])
        tier_quantities = metadata.get('tier_quantities', {})
        attendee_names = metadata.get('attendee_names', {})

        event_tiers = []
        if booking.event:
            for tier in booking.event.tiers.all():
                event_tiers.append({
                    'id': str(tier.id),
                    'name': tier.name,
                    'price': float(tier.price),
                    'available': tier.quantity_total - tier.quantity_sold,
                    'total': tier.quantity_total,
                    'sold': tier.quantity_sold,
                })

        existing_tickets = []
        for ticket in booking.tickets.all():
            existing_tickets.append({
                'id': str(ticket.id),
                'unique_code': ticket.unique_code,
                'tier_id': str(ticket.tier.id) if ticket.tier else None,
                'tier_name': ticket.tier.name if ticket.tier else None,
                'attendee_name': ticket.attendee_name,
                'status': ticket.status,
            })

        return Response({
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'status': booking.status,
            'customer_name': booking.customer_name,
            'customer_email': booking.customer_email,
            'total_amount': booking.total_amount,
            'has_session': booking.session is not None,
            'session_id': str(booking.session.id) if booking.session else None,
            'ticket_count': booking.tickets.count(),
            'existing_tickets': existing_tickets,
            'metadata': {
                'tickets': tickets_data,
                'ticket_types': ticket_types,
                'tier_ids': tier_ids,
                'tier_quantities': tier_quantities,
                'attendee_names': attendee_names,
                'all_metadata_keys': list(metadata.keys()),
            },
            'event_tiers': event_tiers,
            'validation_check': {
                'has_tickets_data': len(tickets_data) > 0,
                'has_ticket_types': len(ticket_types) > 0,
                'has_tier_ids': len(tier_ids) > 0,
                'has_existing_tickets': len(existing_tickets) > 0,
                'can_issue_tickets': len(existing_tickets) == 0 and (len(tickets_data) > 0 or len(ticket_types) > 0 or len(tier_ids) > 0),
            },
        }, status=status.HTTP_200_OK)

    # ==================== ISSUE TICKETS ACTION ====================

    @action(detail=True, methods=['post'])
    def issue_tickets(self, request, pk=None):
        """Issue tickets for a booking (only if no tickets exist)"""
        booking = self.get_object()

        logger.info(f"🔍 issue_tickets called for booking: {booking.booking_reference}")
        logger.info(f"📊 Booking status: {booking.status}")
        logger.info(f"📊 Booking tickets count before: {booking.tickets.count()}")

        existing_tickets = booking.tickets.filter(status='active')
        if existing_tickets.exists():
            return Response({
                'status': 'validation_failed',
                'error': f'Booking already has {existing_tickets.count()} active ticket(s)',
                'booking_id': str(booking.id),
                'reference': booking.booking_reference,
                'existing_tickets': [
                    {'code': t.unique_code, 'attendee': t.attendee_name, 'status': t.status}
                    for t in existing_tickets
                ],
            }, status=status.HTTP_400_BAD_REQUEST)

        if booking.status not in ['paid', 'confirmed']:
            return Response({
                'status': 'validation_failed',
                'error': f'Booking must be paid or confirmed. Current status: {booking.status}',
                'booking_id': str(booking.id),
                'reference': booking.booking_reference,
                'current_status': booking.status,
                'suggestion': 'Use "Mark Payment Received" action first if booking is pending',
            }, status=status.HTTP_400_BAD_REQUEST)

        if booking.status == 'completed':
            return Response({
                'status': 'validation_failed',
                'error': 'Booking is already completed. All tickets have been used.',
                'booking_id': str(booking.id),
                'reference': booking.booking_reference,
            }, status=status.HTTP_400_BAD_REQUEST)

        result = self._issue_tickets_for_booking(booking)

        booking.refresh_from_db()

        if 'error' in result:
            return Response({
                'status': 'failed',
                'error': result.get('error'),
                'booking_id': str(booking.id),
                'reference': booking.booking_reference,
                'debug_info': result.get('debug_info', {}),
                'metadata': booking.metadata,
                'tickets_after_attempt': booking.tickets.count(),
            }, status=status.HTTP_400_BAD_REQUEST)

        final_ticket_count = booking.tickets.count()
        logger.info(f"✅ issue_tickets completed: {final_ticket_count} tickets now associated with booking")

        return Response({
            'status': 'success',
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'tickets_generated': result.get('tickets_created', 0),
            'final_ticket_count': final_ticket_count,
            'ticket_ids': result.get('ticket_ids', []),
            'email_sent': result.get('email_sent', False),
            'email_message': result.get('email_message', ''),
            'result': result,
        }, status=status.HTTP_200_OK)

    # ==================== TICKET GENERATION HELPERS ====================

    def _generate_tickets(self, booking, tier, quantity, session=None):
        """
        Generate individual tickets with explicit session parameter.
        """
        tickets_created = 0
        session_to_use = session or booking.session

        if not session_to_use:
            if hasattr(booking, 'metadata') and booking.metadata:
                slot_id = booking.metadata.get('slot_id')
                if slot_id:
                    try:
                        session_to_use = Session.objects.get(id=slot_id)
                        booking.session = session_to_use
                        booking.save(update_fields=['session'])
                        logger.info(f"✅ Restored session {slot_id} in _generate_tickets")
                    except Session.DoesNotExist:
                        logger.error(f"❌ Session {slot_id} not found in _generate_tickets")

        for i in range(quantity):
            try:
                ticket = Ticket.objects.create(
                    booking=booking,
                    tier=tier,
                    event=booking.event,
                    session=session_to_use,
                    status='active',
                    attendee_name=booking.customer_name,
                    attendee_email=booking.customer_email,
                    attendee_phone=booking.customer_phone,
                )

                self._generate_qr_code(ticket)

                tier.quantity_sold += 1
                tier.save()

                booking.event.total_tickets_sold += 1
                booking.event.save()

                tickets_created += 1

            except Exception as e:
                logger.error(f"Error generating ticket {i}: {str(e)}")
                raise

        return tickets_created

    def _generate_qr_code(self, ticket):
        """Generate QR code for a ticket"""
        try:
            qr_data = {
                'code': ticket.unique_code,
                'ticket_id': str(ticket.id),
                'event': ticket.event.title if ticket.event else 'Event',
                'attendee': ticket.attendee_name or 'Guest',
            }

            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=10,
                border=4,
            )
            qr.add_data(str(qr_data))
            qr.make(fit=True)

            img = qr.make_image(fill_color="black", back_color="white")

            buffered = BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()

            ticket.qr_code = img_str
            ticket.save(update_fields=['qr_code'])

            return True

        except Exception as e:
            logger.error(f"Error generating QR code for ticket {ticket.unique_code}: {str(e)}")
            return False

    def _check_and_complete_booking(self, booking):
        """Check if all tickets in a booking are used and mark COMPLETED."""
        total_tickets = booking.tickets.count()
        used_tickets = booking.tickets.filter(status='used').count()

        if total_tickets > 0 and total_tickets == used_tickets:
            if booking.status != 'completed':
                booking.status = 'completed'
                booking.save(update_fields=['status'])
                logger.info(f"✅ Booking {booking.booking_reference} automatically marked as COMPLETED (all {total_tickets} tickets used)")
                return True
        return False

    def _regenerate_ticket_qr_for_booking(self, booking):
        """Regenerate QR codes for all active tickets in a booking"""
        tickets = booking.tickets.filter(status='active')

        if not tickets.exists():
            return {'error': 'No active tickets found to regenerate QR codes'}

        regenerated_count = 0
        for ticket in tickets:
            try:
                self._generate_qr_code(ticket)
                regenerated_count += 1
            except Exception as e:
                logger.error(f"Error regenerating QR for ticket {ticket.unique_code}: {str(e)}")

        return {
            'success': f'Regenerated QR codes for {regenerated_count} tickets',
            'tickets_regenerated': regenerated_count,
        }

    def _cancel_booking_action(self, booking):
        """Cancel a booking (for bulk action)"""
        if booking.status in ['cancelled', 'refunded', 'completed']:
            return {'error': f'Booking is already {booking.status}'}

        booking.status = 'cancelled'
        booking.save()

        booking.tickets.filter(status='active').update(status='cancelled')

        try:
            email_result = self._send_cancellation_email(booking)
        except Exception as e:
            logger.warning(f"⚠️ Cancellation email failed (not blocking): {str(e)}")
            email_result = {'success': False, 'error': str(e)}

        return {
            'success': 'Booking cancelled successfully',
            'email_sent': email_result.get('success', False),
        }

    def _refund_booking_action(self, booking):
        """Refund a booking (for bulk action)"""
        if booking.status not in ['paid', 'confirmed']:
            return {'error': f'Only paid or confirmed bookings can be refunded. Current status: {booking.status}'}

        if booking.status == 'refunded':
            return {'error': 'Booking is already refunded'}

        if booking.status == 'completed':
            return {'error': 'Cannot refund a completed booking (all tickets already used)'}

        booking.status = 'refunded'
        booking.save()

        booking.tickets.filter(status='active').update(status='refunded')

        try:
            email_result = self._send_refund_email(booking)
        except Exception as e:
            logger.warning(f"⚠️ Refund email failed (not blocking): {str(e)}")
            email_result = {'success': False, 'error': str(e)}

        return {
            'success': 'Booking refunded successfully',
            'email_sent': email_result.get('success', False),
        }

    # ==================== EMAIL METHODS ====================

    def _send_payment_confirmation_email(self, booking):
        """Send payment confirmation email (no tickets)"""
        try:
            subject = f'Payment Confirmed - {booking.booking_reference}'

            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; color: #333; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }}
                    .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                    .booking-details {{ background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }}
                    .status-badge {{ background: #4CAF50; color: white; padding: 5px 15px; border-radius: 20px; display: inline-block; }}
                    .footer {{ text-align: center; margin-top: 20px; color: #888; font-size: 12px; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎫 Payment Confirmed!</h1>
                        <p>Your payment has been received successfully</p>
                    </div>
                    <div class="content">
                        <h2>Dear {booking.customer_name},</h2>
                        <p>Your payment has been confirmed!</p>

                        <div class="booking-details">
                            <h3>📋 Booking Details</h3>
                            <p><strong>Booking Reference:</strong> {booking.booking_reference}</p>
                            <p><strong>Event:</strong> {booking.event.title}</p>
                            <p><strong>Total Amount:</strong> ₹{booking.total_amount}</p>
                            <p><strong>Status:</strong> <span class="status-badge">Paid</span></p>
                        </div>

                        <p><strong>Note:</strong> No tickets have been generated yet. Tickets will be issued separately.</p>

                        <p>Thank you for booking with TicketVolt!</p>
                    </div>
                    <div class="footer">
                        <p>TicketVolt - Your trusted event ticketing platform</p>
                    </div>
                </div>
            </body>
            </html>
            """

            text_content = strip_tags(html_content)

            email = EmailMultiAlternatives(
                subject,
                text_content,
                settings.DEFAULT_FROM_EMAIL,
                [booking.customer_email],
            )
            email.attach_alternative(html_content, "text/html")
            email.send(fail_silently=True)

            logger.info(f"✅ Payment confirmation email sent to {booking.customer_email}")
            return {'success': True}

        except Exception as e:
            logger.warning(f"⚠️ Payment confirmation email failed: {str(e)}")
            return {'success': False, 'error': str(e)}

    def _send_tickets_email(self, booking, allocation_message=None):
        """
        Send tickets via email with format selection (PDF or PNG or Both).
        """
        try:
            from django.core.mail import EmailMultiAlternatives
            from django.utils.html import strip_tags

            tickets = booking.tickets.filter(status='active')

            if not tickets.exists():
                return {'success': False, 'message': 'No active tickets to send'}

            event = booking.event
            ticket_format = event.ticket_format if event else 'pdf'
            combine_tickets = event.combine_tickets if event else False
            tickets_per_page = event.tickets_per_page if event else 4

            ticket_buffers = []

            for ticket in tickets:
                if not ticket.qr_code:
                    self._generate_qr_code(ticket)
                    ticket.refresh_from_db()

                generator = TicketGenerator(format_type='png')
                png_buffer = generator.generate_ticket_png(ticket, booking, event)

                if png_buffer:
                    ticket_buffers.append({
                        'ticket': ticket,
                        'buffer': png_buffer,
                        'filename': f'ticket_{ticket.unique_code}.png',
                    })

            if not ticket_buffers:
                return {'success': False, 'message': 'No ticket images generated'}

            attachments = []
            formats_to_send = []

            if ticket_format == 'pdf':
                formats_to_send.append('pdf')
            elif ticket_format == 'png':
                formats_to_send.append('png')
            elif ticket_format == 'both':
                formats_to_send.append('png')
                formats_to_send.append('pdf')

            for fmt in formats_to_send:
                if fmt == 'png':
                    if combine_tickets and len(ticket_buffers) > 1:
                        combiner = TicketCombiner(tickets_per_row=2, padding=15)
                        combined_buffer = combiner.combine_to_paginated_image(
                            ticket_buffers, booking,
                            tickets_per_page=tickets_per_page,
                            output_format='PNG',
                            quality=95,
                        )
                        if combined_buffer:
                            attachments.append({
                                'buffer': combined_buffer,
                                'filename': f'tickets_{booking.booking_reference}.png',
                                'mimetype': 'image/png',
                                'format': 'PNG',
                            })
                    else:
                        for tb in ticket_buffers:
                            tb['buffer'].seek(0)
                            attachments.append({
                                'buffer': tb['buffer'],
                                'filename': tb['filename'],
                                'mimetype': 'image/png',
                                'format': 'PNG',
                            })

                elif fmt == 'pdf':
                    pdf_buffers = []
                    for tb in ticket_buffers:
                        generator = TicketGenerator(format_type='pdf')
                        pdf_buffer = generator.generate_ticket_pdf(
                            tb['ticket'], booking, event
                        )
                        if pdf_buffer:
                            pdf_buffers.append({
                                'ticket': tb['ticket'],
                                'buffer': pdf_buffer,
                                'filename': f'ticket_{tb["ticket"].unique_code}.pdf',
                            })

                    if combine_tickets and len(pdf_buffers) > 1:
                        combiner = TicketCombiner()
                        combined_buffer = combiner.combine_to_pdf(
                            pdf_buffers, booking, tickets_per_page
                        )
                        if combined_buffer:
                            attachments.append({
                                'buffer': combined_buffer,
                                'filename': f'tickets_{booking.booking_reference}.pdf',
                                'mimetype': 'application/pdf',
                                'format': 'PDF',
                            })
                    else:
                        for pb in pdf_buffers:
                            pb['buffer'].seek(0)
                            attachments.append({
                                'buffer': pb['buffer'],
                                'filename': pb['filename'],
                                'mimetype': 'application/pdf',
                                'format': 'PDF',
                            })

            if not attachments:
                return {'success': False, 'message': 'No attachments generated'}

            format_names = ', '.join(set([a['format'] for a in attachments]))
            is_combined = len(attachments) < len(ticket_buffers)

            subject = f'Your Tickets - {booking.booking_reference}'

            first_attachment = attachments[0] if attachments else None
            first_base64 = None
            if first_attachment and first_attachment['format'] == 'PNG':
                first_attachment['buffer'].seek(0)
                first_base64 = base64.b64encode(first_attachment['buffer'].getvalue()).decode('utf-8')

            html_content = self._build_email_html(
                booking, ticket_buffers, format_names,
                is_combined, attachments, first_base64,
            )

            text_content = strip_tags(html_content)

            email = EmailMultiAlternatives(
                subject,
                text_content,
                settings.DEFAULT_FROM_EMAIL,
                [booking.customer_email],
            )
            email.attach_alternative(html_content, "text/html")

            for attachment in attachments:
                attachment['buffer'].seek(0)
                email.attach(
                    attachment['filename'],
                    attachment['buffer'].getvalue(),
                    attachment['mimetype'],
                )
                logger.info(f"✅ Attached: {attachment['filename']} ({attachment['format']})")

            email.send(fail_silently=True)

            return {
                'success': True,
                'message': f'Tickets sent to {booking.customer_email}',
                'tickets_count': len(ticket_buffers),
                'formats': format_names,
                'combined': is_combined,
                'attachments': len(attachments),
            }

        except Exception as e:
            logger.warning(f"⚠️ Tickets email failed (not blocking): {str(e)}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'message': f'Failed to send tickets email: {str(e)}'}

    def _build_email_html(self, booking, ticket_buffers, format_names, is_combined, attachments, first_base64):
        """Build email HTML content"""
        ticket_items = ''.join([
            f'<span class="ticket-item">#{i+1} {t["ticket"].unique_code}</span>'
            for i, t in enumerate(ticket_buffers)
        ])

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {{ font-family: Arial, sans-serif; padding: 20px; background: #f7fafc; }}
                .container {{ max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }}
                .header {{ text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }}
                .header h2 {{ color: #2d3748; margin: 0; }}
                .header p {{ color: #4a5568; margin: 5px 0 0; }}
                .format-badge {{ display: inline-block; background: #eef2ff; padding: 4px 16px; border-radius: 12px; color: #4f46e5; font-weight: 600; font-size: 14px; margin: 8px 0; }}
                .ticket-info {{ margin: 20px 0; }}
                .info-row {{ display: flex; padding: 8px 0; border-bottom: 1px solid #edf2f7; }}
                .info-label {{ font-weight: 600; color: #4a5568; width: 120px; }}
                .info-value {{ color: #2d3748; }}
                .note {{ background: #fef3c7; padding: 12px 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 20px 0; }}
                .ticket-list {{ margin: 10px 0; }}
                .ticket-item {{ display: inline-block; background: #f7fafc; padding: 8px 16px; border-radius: 6px; margin: 4px; font-size: 12px; font-family: monospace; }}
                .footer {{ text-align: center; font-size: 12px; color: #a0aec0; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; }}
                .badge {{ background: #4f46e5; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; }}
                .attachment-info {{ background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #22c55e; }}
                .ticket-preview {{ text-align: center; margin: 20px 0; }}
                .ticket-preview img {{ max-width: 100%; max-height: 400px; border: 2px solid #2D3748; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>🎫 Your Tickets Are Here!</h2>
                    <p>Booking Reference: <strong>{booking.booking_reference}</strong></p>
                    <div class="format-badge">
                        📄 Format: {format_names}
                    </div>
                </div>

                <div class="ticket-info">
                    <div class="info-row">
                        <span class="info-label">Customer</span>
                        <span class="info-value">{booking.customer_name}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Event</span>
                        <span class="info-value">{booking.event.title if booking.event else 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Tickets</span>
                        <span class="info-value">{len(ticket_buffers)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Date</span>
                        <span class="info-value">{booking.event.start_date.strftime('%d %B %Y') if booking.event and booking.event.start_date else 'N/A'}</span>
                    </div>
                </div>

                <div class="attachment-info">
                    <strong>📎 Attached Tickets ({format_names}):</strong>
                    <ul style="margin: 10px 0 0; padding-left: 20px; color: #334155;">
                        <li>{len(attachments)} file(s) attached</li>
                        <li>{'Combined into single files' if is_combined else 'Individual ticket files'}</li>
                        <li>{len(ticket_buffers)} ticket(s) included</li>
                    </ul>
                </div>

                <div class="ticket-list">
                    <strong>Tickets included:</strong><br>
                    {ticket_items}
                </div>

                {f'''
                <div class="ticket-preview">
                    <h4 style="color: #2d3748;">📱 Ticket Preview</h4>
                    <img src="data:image/png;base64,{first_base64}" alt="Tickets Preview">
                </div>
                ''' if first_base64 else ''}

                <div style="text-align: center; margin-top: 20px;">
                    <p style="color: #4a5568;">📌 <strong>How to use:</strong></p>
                    <p style="color: #64748b; font-size: 14px;">
                        1. Open the attached file(s)<br>
                        2. {'Print the tickets or show them on your device' if 'PDF' in format_names else 'Save the images to your device'}<br>
                        3. Show the QR code at the venue entrance
                    </p>
                </div>

                <div class="footer">
                    <p>TicketVolt - Your trusted event ticketing platform</p>
                    <p>If you have any questions, please contact our support team.</p>
                </div>
            </div>
        </body>
        </html>
        """

    def _send_cancellation_email(self, booking):
        """Send cancellation confirmation email to customer"""
        try:
            subject = f'Booking Cancelled - {booking.booking_reference}'

            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; color: #333; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }}
                    .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                    .booking-details {{ background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }}
                    .status-badge {{ background: #ef4444; color: white; padding: 5px 15px; border-radius: 20px; display: inline-block; }}
                    .footer {{ text-align: center; margin-top: 20px; color: #888; font-size: 12px; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>❌ Booking Cancelled</h1>
                        <p>Your booking has been cancelled</p>
                    </div>
                    <div class="content">
                        <h2>Dear {booking.customer_name},</h2>
                        <p>Your booking has been <strong>cancelled</strong>.</p>

                        <div class="booking-details">
                            <h3>📋 Booking Details</h3>
                            <p><strong>Booking Reference:</strong> {booking.booking_reference}</p>
                            <p><strong>Event:</strong> {booking.event.title}</p>
                            <p><strong>Total Amount:</strong> ₹{booking.total_amount}</p>
                            <p><strong>Status:</strong> <span class="status-badge">Cancelled</span></p>
                            <p><strong>Cancelled At:</strong> {timezone.now().strftime('%d %b %Y, %I:%M %p')}</p>
                        </div>

                        <p>If you have any questions, please contact our support team.</p>

                        <p>We hope to see you at future events!</p>
                    </div>
                    <div class="footer">
                        <p>TicketVolt - Your trusted event ticketing platform</p>
                    </div>
                </div>
            </body>
            </html>
            """

            text_content = strip_tags(html_content)

            email = EmailMultiAlternatives(
                subject,
                text_content,
                settings.DEFAULT_FROM_EMAIL,
                [booking.customer_email],
            )
            email.attach_alternative(html_content, "text/html")
            email.send(fail_silently=True)

            logger.info(f"✅ Cancellation email sent to {booking.customer_email}")
            return {'success': True}

        except Exception as e:
            logger.warning(f"⚠️ Cancellation email failed: {str(e)}")
            return {'success': False, 'error': str(e)}

    def _send_refund_email(self, booking):
        """Send refund confirmation email to customer"""
        try:
            subject = f'Booking Refunded - {booking.booking_reference}'

            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; color: #333; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }}
                    .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                    .booking-details {{ background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }}
                    .status-badge {{ background: #8b5cf6; color: white; padding: 5px 15px; border-radius: 20px; display: inline-block; }}
                    .footer {{ text-align: center; margin-top: 20px; color: #888; font-size: 12px; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔄 Booking Refunded</h1>
                        <p>Your booking has been refunded</p>
                    </div>
                    <div class="content">
                        <h2>Dear {booking.customer_name},</h2>
                        <p>Your booking has been <strong>refunded</strong>.</p>

                        <div class="booking-details">
                            <h3>📋 Booking Details</h3>
                            <p><strong>Booking Reference:</strong> {booking.booking_reference}</p>
                            <p><strong>Event:</strong> {booking.event.title}</p>
                            <p><strong>Refund Amount:</strong> ₹{booking.total_amount}</p>
                            <p><strong>Status:</strong> <span class="status-badge">Refunded</span></p>
                            <p><strong>Refunded At:</strong> {timezone.now().strftime('%d %b %Y, %I:%M %p')}</p>
                        </div>

                        <p>The refund has been processed. Please allow 3-5 business days for the amount to reflect in your account.</p>

                        <p>If you have any questions, please contact our support team.</p>
                    </div>
                    <div class="footer">
                        <p>TicketVolt - Your trusted event ticketing platform</p>
                    </div>
                </div>
            </body>
            </html>
            """

            text_content = strip_tags(html_content)

            email = EmailMultiAlternatives(
                subject,
                text_content,
                settings.DEFAULT_FROM_EMAIL,
                [booking.customer_email],
            )
            email.attach_alternative(html_content, "text/html")
            email.send(fail_silently=True)

            logger.info(f"✅ Refund email sent to {booking.customer_email}")
            return {'success': True}

        except Exception as e:
            logger.warning(f"⚠️ Refund email failed: {str(e)}")
            return {'success': False, 'error': str(e)}

    @action(detail=True, methods=['get'])
    def status_info(self, request, pk=None):
        """
        Get detailed status information for a booking.
        Useful for debugging why a booking can't be processed.
        """
        booking = self.get_object()

        has_active_tickets = booking.tickets.filter(status='active').exists()
        active_ticket_count = booking.tickets.filter(status='active').count()
        used_ticket_count = booking.tickets.filter(status='used').count()
        total_ticket_count = booking.tickets.count()

        is_completed = total_ticket_count > 0 and total_ticket_count == used_ticket_count

        eligibility = {}

        if booking.status in ['pending', 'processing']:
            eligibility['mark_payment_received'] = {
                'eligible': True,
                'reason': 'Booking is pending/processing and ready for payment confirmation',
                'action': 'mark_payment_received',
                'description': 'Mark payment as received (no tickets generated)',
            }
        elif booking.status in ['paid', 'confirmed']:
            eligibility['mark_payment_received'] = {
                'eligible': False,
                'reason': f'Booking is already {booking.status}',
                'suggestion': 'Use "Issue Tickets" action instead',
                'action': 'issue_tickets',
                'description': 'Issue tickets for paid booking',
            }
        elif booking.status == 'cancelled':
            eligibility['mark_payment_received'] = {
                'eligible': False,
                'reason': 'Booking is cancelled',
                'action': None,
                'description': 'Cannot process cancelled booking',
            }
        elif booking.status == 'refunded':
            eligibility['mark_payment_received'] = {
                'eligible': False,
                'reason': 'Booking is refunded',
                'action': None,
                'description': 'Cannot process refunded booking',
            }
        elif booking.status == 'completed':
            eligibility['mark_payment_received'] = {
                'eligible': False,
                'reason': 'Booking is completed (all tickets used)',
                'action': None,
                'description': 'Completed bookings are read-only',
            }
        else:
            eligibility['mark_payment_received'] = {
                'eligible': False,
                'reason': f'Unknown status: {booking.status}',
                'action': None,
            }

        if booking.status in ['pending', 'processing'] and not has_active_tickets and not is_completed:
            eligibility['confirm_payment_and_issue_tickets'] = {
                'eligible': True,
                'reason': 'Booking is pending/processing and has no active tickets',
                'action': 'confirm_payment_and_issue_tickets',
                'description': 'Confirm payment and issue tickets in one step',
            }
        elif booking.status in ['pending', 'processing'] and has_active_tickets:
            eligibility['confirm_payment_and_issue_tickets'] = {
                'eligible': False,
                'reason': f'Booking has {active_ticket_count} active ticket(s)',
                'suggestion': 'Use "Resend Tickets" if needed',
                'action': 'resend_tickets',
                'description': 'Resend existing tickets',
            }
        elif booking.status in ['paid', 'confirmed']:
            eligibility['confirm_payment_and_issue_tickets'] = {
                'eligible': False,
                'reason': f'Booking is already {booking.status}',
                'suggestion': 'Use "Issue Tickets" action instead',
                'action': 'issue_tickets',
                'description': 'Issue tickets for paid booking',
            }
        elif booking.status in ['cancelled', 'refunded']:
            eligibility['confirm_payment_and_issue_tickets'] = {
                'eligible': False,
                'reason': f'Booking is {booking.status}',
                'action': None,
                'description': f'Cannot process {booking.status} booking',
            }
        elif booking.status == 'completed':
            eligibility['confirm_payment_and_issue_tickets'] = {
                'eligible': False,
                'reason': 'Booking is completed (all tickets used)',
                'action': None,
                'description': 'Completed bookings are read-only',
            }
        else:
            eligibility['confirm_payment_and_issue_tickets'] = {
                'eligible': False,
                'reason': f'Booking status is {booking.status}',
                'action': None,
            }

        if booking.status in ['paid', 'confirmed'] and not has_active_tickets and not is_completed:
            eligibility['issue_tickets'] = {
                'eligible': True,
                'reason': 'Booking is paid/confirmed and has no active tickets',
                'action': 'issue_tickets',
                'description': 'Generate and send tickets via email',
            }
        elif booking.status in ['paid', 'confirmed'] and has_active_tickets:
            eligibility['issue_tickets'] = {
                'eligible': False,
                'reason': f'Booking already has {active_ticket_count} active ticket(s)',
                'suggestion': 'Use "Resend Tickets" action to resend existing tickets',
                'action': 'resend_tickets',
                'description': 'Resend existing tickets via email',
            }
        elif booking.status not in ['paid', 'confirmed']:
            eligibility['issue_tickets'] = {
                'eligible': False,
                'reason': f'Booking must be paid or confirmed. Current status: {booking.status}',
                'suggestion': 'Use "Mark Payment Received" action first',
                'action': 'mark_payment_received',
                'description': 'Mark payment as received first',
            }
        elif booking.status == 'completed':
            eligibility['issue_tickets'] = {
                'eligible': False,
                'reason': 'Booking is completed (all tickets used)',
                'action': None,
                'description': 'Completed bookings are read-only',
            }
        else:
            eligibility['issue_tickets'] = {
                'eligible': False,
                'reason': f'Unknown status: {booking.status}',
                'action': None,
            }

        recommended_action = None
        if booking.status in ['pending', 'processing'] and not has_active_tickets and not is_completed:
            recommended_action = 'confirm_payment_and_issue_tickets'
        elif booking.status in ['paid', 'confirmed'] and not has_active_tickets and not is_completed:
            recommended_action = 'issue_tickets'
        elif booking.status in ['paid', 'confirmed'] and has_active_tickets:
            recommended_action = 'resend_tickets'
        elif is_completed:
            recommended_action = None

        return Response({
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'customer_name': booking.customer_name,
            'customer_email': booking.customer_email,
            'current_status': booking.status,
            'total_ticket_count': total_ticket_count,
            'active_ticket_count': active_ticket_count,
            'used_ticket_count': used_ticket_count,
            'has_active_tickets': has_active_tickets,
            'is_completed': is_completed,
            'eligibility': eligibility,
            'recommended_action': recommended_action,
            'available_actions': {
                'frontend_actions': [
                    {'name': 'mark_payment_received', 'description': 'Mark payment as received (no tickets)'},
                    {'name': 'confirm_payment_and_issue_tickets', 'description': 'Confirm payment and issue tickets'},
                    {'name': 'issue_tickets', 'description': 'Generate and send tickets via email'},
                    {'name': 'resend_tickets', 'description': 'Resend existing tickets via email'},
                ],
                'backend_actions': ['confirm_payment', 'confirm_payment_and_issue', 'issue_tickets'],
            },
            'readonly': is_completed or booking.status in ['cancelled', 'refunded'],
        })

    # ==================== INDIVIDUAL BOOKING ACTIONS ====================

    @action(detail=True, methods=['post'])
    def confirm_payment_and_issue_tickets(self, request, pk=None):
        """1-Click: Confirm payment and issue tickets for a single booking"""
        booking = self.get_object()

        validation = self._validate_bookings_for_action([booking], 'confirm_payment_and_issue')
        if validation['invalid']:
            return Response({
                'status': 'validation_failed',
                'errors': validation['invalid'],
            }, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            result = self._confirm_payment_and_issue_tickets_for_booking(booking)

            if 'error' in result:
                return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'status': 'success',
            'booking': {
                'id': str(booking.id),
                'reference': booking.booking_reference,
                'status': booking.status,
            },
            'result': result,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def mark_payment_received(self, request, pk=None):
        """Mark payment as received (no tickets generated) for a single booking"""
        booking = self.get_object()

        validation = self._validate_bookings_for_action([booking], 'confirm_payment')
        if validation['invalid']:
            return Response({
                'status': 'validation_failed',
                'errors': validation['invalid'],
            }, status=status.HTTP_400_BAD_REQUEST)

        result = self._confirm_payment_for_booking(booking)

        if 'error' in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'status': 'success',
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'status': booking.status,
            'result': result,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def regenerate_ticket_qr(self, request, pk=None):
        """Regenerate QR codes for all tickets in a booking"""
        booking = self.get_object()

        tickets = booking.tickets.filter(status='active')
        if not tickets.exists():
            return Response(
                {'error': 'No active tickets found to regenerate QR codes'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            regenerated_count = 0
            for ticket in tickets:
                try:
                    self._generate_qr_code(ticket)
                    regenerated_count += 1
                except Exception as e:
                    logger.error(f"Error regenerating QR for ticket {ticket.unique_code}: {str(e)}")

            return Response({
                'status': 'success',
                'booking_id': str(booking.id),
                'reference': booking.booking_reference,
                'tickets_regenerated': regenerated_count,
                'message': f'Regenerated QR codes for {regenerated_count} tickets',
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error regenerating QR codes: {str(e)}")
            return Response(
                {'error': f'Failed to regenerate QR codes: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'])
    def cancel_booking(self, request, pk=None):
        """Cancel a booking"""
        booking = self.get_object()

        if booking.status in ['cancelled', 'refunded', 'completed']:
            return Response({
                'error': f'Booking is already {booking.status}',
            }, status=status.HTTP_400_BAD_REQUEST)

        booking.status = 'cancelled'
        booking.save()

        booking.tickets.filter(status='active').update(status='cancelled')

        try:
            email_result = self._send_cancellation_email(booking)
        except Exception as e:
            logger.warning(f"⚠️ Cancellation email failed (not blocking): {str(e)}")
            email_result = {'success': False, 'error': str(e)}

        return Response({
            'status': 'success',
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'status': booking.status,
            'email_sent': email_result.get('success', False),
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def refund_booking(self, request, pk=None):
        """Refund a booking"""
        booking = self.get_object()

        if booking.status not in ['paid', 'confirmed']:
            return Response({
                'error': f'Only paid or confirmed bookings can be refunded. Current status: {booking.status}',
            }, status=status.HTTP_400_BAD_REQUEST)

        if booking.status == 'refunded':
            return Response({
                'error': 'Booking is already refunded',
            }, status=status.HTTP_400_BAD_REQUEST)

        if booking.status == 'completed':
            return Response({
                'error': 'Cannot refund a completed booking (all tickets already used)',
            }, status=status.HTTP_400_BAD_REQUEST)

        booking.status = 'refunded'
        booking.save()

        booking.tickets.filter(status='active').update(status='refunded')

        try:
            email_result = self._send_refund_email(booking)
        except Exception as e:
            logger.warning(f"⚠️ Refund email failed (not blocking): {str(e)}")
            email_result = {'success': False, 'error': str(e)}

        return Response({
            'status': 'success',
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'status': booking.status,
            'email_sent': email_result.get('success', False),
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def tickets(self, request, pk=None):
        """Get all tickets for a booking"""
        booking = self.get_object()
        tickets = booking.tickets.all()
        serializer = TicketSerializer(tickets, many=True)
        return Response({
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'tickets': serializer.data,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def checkins(self, request, pk=None):
        """Get all check-ins for a booking"""
        booking = self.get_object()
        tickets = booking.tickets.all()
        checkins = CheckInLog.objects.filter(ticket__in=tickets)
        serializer = CheckInLogSerializer(checkins, many=True)
        return Response({
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'checkins': serializer.data,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def verify_tickets(self, request, pk=None):
        """
        Verify that tickets exist for a booking.
        This is a debug endpoint to check if tickets were created.

        ⚠️ SECURITY: exposes internal IDs. Only available when DEBUG=True.
        """
        if not settings.DEBUG:
            return Response(
                {'error': 'Debug endpoint disabled in production'},
                status=status.HTTP_404_NOT_FOUND,
            )

        booking = self.get_object()
        tickets = booking.tickets.all()

        return Response({
            'booking_id': str(booking.id),
            'reference': booking.booking_reference,
            'status': booking.status,
            'ticket_count': tickets.count(),
            'tickets': [
                {
                    'id': str(t.id),
                    'code': t.unique_code,
                    'attendee': t.attendee_name,
                    'status': t.status,
                    'session_id': str(t.session.id) if t.session else None,
                    'tier_name': t.tier.name if t.tier else None,
                    'created_at': t.created_at.isoformat() if t.created_at else None,
                }
                for t in tickets
            ],
        }, status=status.HTTP_200_OK)

    # ==================== LEGACY METHODS ====================

    @action(detail=True, methods=['post'])
    def confirm_payment(self, request, pk=None):
        """Legacy alias: Confirm payment (routes through the validated single-booking action)."""
        return self.mark_payment_received(request, pk)

    @action(detail=True, methods=['post'])
    def refund(self, request, pk=None):
        """Legacy alias: Refund booking (routes through the validated single-booking action)."""
        return self.refund_booking(request, pk)

    @action(detail=True, methods=['post'])
    def apply_discount(self, request, pk=None):
        """
        Apply a discount to a booking.

        ⚠️ SECURITY: organizers may only apply discounts to bookings for
        their own events. Regular users may only apply discounts to their
        own bookings. Admins/staff may apply to any booking.
        """
        booking = self.get_object()
        discount_code = request.data.get('discount_code')

        # Permission: get_object already enforces ownership for non-admins.
        # Belt-and-suspenders for organizer scoping.
        user = request.user
        if not (user.is_staff or user.is_superuser):
            is_organizer = (
                (hasattr(user, 'profile') and user.profile.is_organizer)
                or hasattr(user, 'organizer')
            )
            if is_organizer and booking.event.organizer_id != user.id:
                return Response(
                    {'error': 'You cannot apply discounts to this booking'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if not is_organizer and booking.user_id != user.id:
                return Response(
                    {'error': 'You cannot apply discounts to this booking'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        if not discount_code:
            return Response(
                {'error': 'discount_code is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from ticket_bookings.models import Discount

        try:
            discount = Discount.objects.get(
                code=discount_code,
                is_active=True,
            )

            # Scope: organizers can only use their own discounts
            if not (user.is_staff or user.is_superuser):
                if discount.organizer_id != user.id:
                    return Response(
                        {'error': 'Invalid discount code'},
                        status=status.HTTP_404_NOT_FOUND,
                    )

            if discount.valid_from and discount.valid_from > timezone.now():
                return Response(
                    {'error': 'Discount is not yet valid'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if discount.valid_to and discount.valid_to < timezone.now():
                return Response(
                    {'error': 'Discount has expired'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if discount.max_uses and discount.used_count >= discount.max_uses:
                return Response(
                    {'error': 'Discount has reached maximum uses'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if discount.type == 'percentage':
                discount_amount = (booking.total_amount * discount.value) / 100
                if discount.max_discount and discount_amount > discount.max_discount:
                    discount_amount = discount.max_discount
            else:
                discount_amount = discount.value
                if discount_amount > booking.total_amount:
                    discount_amount = booking.total_amount

            booking.discount_applied = discount_amount
            booking.discount_code = discount_code
            booking.save()

            discount.used_count += 1
            discount.save()

            return Response({
                'status': 'success',
                'booking_id': str(booking.id),
                'reference': booking.booking_reference,
                'discount_applied': discount_amount,
                'discount_code': discount_code,
                'new_total': booking.total_amount - discount_amount,
            }, status=status.HTTP_200_OK)

        except Discount.DoesNotExist:
            return Response(
                {'error': 'Invalid discount code'},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=True, methods=['post'])
    def resend_tickets(self, request, pk=None):
        """Resend tickets via email with format support"""
        booking = self.get_object()
        tickets = booking.tickets.filter(status='active')

        if not tickets.exists():
            return Response(
                {'error': 'No active tickets to resend'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = self._send_tickets_email(booking)

            if result.get('success'):
                return Response({
                    'status': 'success',
                    'booking_id': str(booking.id),
                    'reference': booking.booking_reference,
                    'tickets_sent': tickets.count(),
                    'formats': result.get('formats', ''),
                    'combined': result.get('combined', False),
                    'attachments': result.get('attachments', 0),
                    'message': f'Tickets resent successfully ({result.get("formats", "")})',
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'status': 'failed',
                    'error': result.get('message', 'Failed to send tickets'),
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        except Exception as e:
            logger.error(f"Error resending tickets: {str(e)}")
            return Response(
                {'error': f'Failed to send tickets: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )