# backend/ticket_bookings/api/checkin_api.py
import logging
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from ticket_bookings.constants import BookingStatus, TicketStatus
from ticket_bookings.models import CheckInLog, Event, Ticket
from ticket_bookings.services.qr_service import QRCodeService
from ticket_bookings.services.tenancy import (
    can_operate_event_data,
    is_platform_admin,
    user_operator_org_ids,
    visible_bookings,
)

logger = logging.getLogger(__name__)


# ============================================================
# SLOT TIME VALIDATION
# ============================================================
CHECKIN_EARLY_GRACE = timedelta(minutes=30)
CHECKIN_LATE_GRACE = timedelta(minutes=15)


def _validate_checkin_window(ticket, now=None):
    now = now or timezone.now()
    if not ticket.session:
        return True, None

    session = ticket.session
    window_start = session.start_time - CHECKIN_EARLY_GRACE
    window_end = session.end_time + CHECKIN_LATE_GRACE

    if now < window_start:
        reason = (
            f"Too early for this slot. Check-in opens at "
            f"{timezone.localtime(window_start).strftime('%I:%M %p')}."
        )
        return False, reason

    if now > window_end:
        reason = (
            f"Too late for this slot. Check-in closed at "
            f"{timezone.localtime(window_end).strftime('%I:%M %p')}."
        )
        return False, reason

    return True, None


# =========================================================================
# AUTHORIZATION NOTE
# -------------------------------------------------------------------------
# This ViewSet backs the SCANNER. STAFF operators must be able to reach
# every action here (create, validate, bulk, verify, stats, history).
# The scanner uses `can_operate_event_data` (OWNER/ADMIN/STAFF), which is
# exactly the intended scope for STAFF.
#
# `BookingViewSet` is the inverse: mutating actions there require
# `can_manage_event_data` (OWNER/ADMIN). STAFF scanning is fine; STAFF
# changing money is not.
#
# The `undo` action is the ONE exception: it is `is_superuser`-only and
# will remain so. Undo reverses a completed check-in and can invalidate
# the audit trail.
# =========================================================================

class CheckInViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'checkin'

    def _extract_ticket_code(self, code_data):
        decoded = QRCodeService.decode_ticket_qr(code_data)
        return decoded.get('code')

    def _user_can_manage_event(self, user, event):
        if not user or not user.is_authenticated:
            return False
        if is_platform_admin(user):
            return True
        if event is None:
            return False
        return can_operate_event_data(user, event)

    def _check_and_complete_booking(self, booking):
        if not booking:
            return False

        if booking.status in (
            BookingStatus.COMPLETED,
            BookingStatus.CANCELLED,
            BookingStatus.REFUNDED,
        ):
            return False

        terminal_states = (
            TicketStatus.USED,
            TicketStatus.CANCELLED,
            TicketStatus.REFUNDED,
            TicketStatus.EXPIRED,
        )

        total_tickets = booking.tickets.count()
        if total_tickets == 0:
            return False

        used_tickets = booking.tickets.filter(status=TicketStatus.USED).count()
        actionable_tickets = booking.tickets.exclude(
            status__in=terminal_states,
        ).count()

        if used_tickets == 0:
            return False
        if actionable_tickets > 0:
            return False

        booking.status = BookingStatus.COMPLETED
        booking.save(update_fields=['status'])
        logger.info(
            "Booking %s auto-completed (%s used, %s total, %s actionable)",
            booking.booking_reference,
            used_tickets,
            total_tickets,
            actionable_tickets,
        )
        return True

    def _ticket_payload(self, ticket):
        attendee_name = ticket.attendee_name or 'Guest'
        if not ticket.attendee_name and ticket.booking:
            attendee_name = ticket.booking.customer_name

        return {
            'code': ticket.unique_code,
            'attendee_name': attendee_name,
            'event': ticket.event.title if ticket.event else 'Event',
            'event_id': str(ticket.event.id) if ticket.event else None,
            'status': ticket.status,
        }

    def _existing_checkin(self, ticket):
        return CheckInLog.objects.filter(ticket=ticket, status='success').first()

    def _rejection_for(self, ticket):
        if ticket.status in (
            TicketStatus.REFUNDED,
            TicketStatus.CANCELLED,
            TicketStatus.EXPIRED,
        ):
            return Response(
                {
                    'detail': (
                        f'This ticket has been {ticket.status} '
                        f'and is no longer valid'
                    ),
                    'code': f'TICKET_{ticket.status.upper()}',
                    'ticket': self._ticket_payload(ticket),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if ticket.status == TicketStatus.USED:
            return Response(
                {
                    'detail': 'Ticket has already been used',
                    'code': 'TICKET_USED',
                    'ticket': self._ticket_payload(ticket),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            ticket.event
            and ticket.event.end_date
            and ticket.event.end_date < timezone.now()
        ):
            return Response(
                {
                    'detail': 'This event has already ended',
                    'code': 'EVENT_ENDED',
                    'ticket': self._ticket_payload(ticket),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return None

    def _already_checked_in_response(self, ticket, existing):
        return Response(
            {
                'detail': 'Ticket already checked in',
                'code': 'ALREADY_CHECKED_IN',
                'ticket': {
                    **self._ticket_payload(ticket),
                    'checked_in_at': existing.scanned_at.isoformat(),
                },
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    def _slot_window_response(self, ticket, reason):
        return Response(
            {
                'detail': reason,
                'code': 'OUTSIDE_SLOT_WINDOW',
                'ticket': self._ticket_payload(ticket),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ============================================================
    # CREATE
    # ============================================================

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        raw_code = request.data.get('code') or request.data.get('ticket_code')
        device_id = (request.data.get('device_id') or 'unknown')[:255]
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        scanner_ip = request.META.get('REMOTE_ADDR')

        if not raw_code:
            return Response(
                {'detail': 'Ticket code is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ticket_code = self._extract_ticket_code(raw_code)
        if not ticket_code:
            return Response(
                {'detail': 'Invalid ticket code format'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info("Processing check-in for code: %s", ticket_code)

        try:
            ticket = get_object_or_404(
                Ticket.objects.select_related('session', 'event', 'booking', 'event__organization'),
                unique_code=ticket_code,
            )

            if not self._user_can_manage_event(request.user, ticket.event):
                return Response(
                    {'detail': 'You do not have permission to check in this ticket.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

            existing = self._existing_checkin(ticket)
            if existing:
                return self._already_checked_in_response(ticket, existing)

            rejection = self._rejection_for(ticket)
            if rejection is not None:
                return rejection

            is_within_window, reason = _validate_checkin_window(ticket)
            if not is_within_window:
                logger.warning(
                    "Check-in rejected for ticket %s (slot window): %s",
                    ticket_code,
                    reason,
                )
                return self._slot_window_response(ticket, reason)

            checkin_log = CheckInLog.objects.create(
                ticket=ticket,
                event=ticket.event,
                session=ticket.session,
                scanner_user=request.user,
                scanner_device_id=device_id,
                scanner_ip=scanner_ip,
                status='success',
                latitude=latitude,
                longitude=longitude,
                is_offline=False,
                synced_at=timezone.now(),
            )

            ticket.status = TicketStatus.USED
            ticket.check_in_time = timezone.now()
            ticket.save(update_fields=['status', 'check_in_time'])

            logger.info(
                "Ticket %s checked in by %s via %s",
                ticket_code, request.user.email, device_id,
            )

            booking_completed = False
            if ticket.booking:
                booking_completed = self._check_and_complete_booking(ticket.booking)

            return Response(
                {
                    'success': True,
                    'message': 'Check-in successful',
                    'ticket': self._ticket_payload(ticket),
                    'checkin_time': checkin_log.scanned_at.isoformat(),
                    'device_id': device_id,
                    'booking_completed': booking_completed,
                    'booking_status': ticket.booking.status if ticket.booking else None,
                },
                status=status.HTTP_200_OK,
            )

        except Ticket.DoesNotExist:
            logger.warning("Ticket not found: %s", ticket_code)
            return Response(
                {
                    'detail': f'Ticket not found: {ticket_code}',
                    'code': 'TICKET_NOT_FOUND',
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception:
            logger.exception("Error checking in ticket %s", ticket_code)
            return Response(
                {'detail': 'An unexpected error occurred.', 'code': 'INTERNAL_ERROR'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ============================================================
    # VALIDATE
    # ============================================================

    @action(detail=False, methods=['post'])
    def validate(self, request):
        raw_code = request.data.get('code') or request.data.get('ticket_code')
        if not raw_code:
            return Response(
                {'detail': 'Ticket code is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ticket_code = self._extract_ticket_code(raw_code)
        if not ticket_code:
            return Response(
                {'detail': 'Invalid ticket code format'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            ticket = get_object_or_404(
                Ticket.objects.select_related('session', 'event', 'booking', 'event__organization'),
                unique_code=ticket_code,
            )

            if not self._user_can_manage_event(request.user, ticket.event):
                return Response(
                    {
                        'valid': False,
                        'code': 'PERMISSION_DENIED',
                        'detail': 'You do not have permission to validate this ticket.',
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            existing = self._existing_checkin(ticket)
            if existing:
                return Response(
                    {
                        'valid': False,
                        'code': 'ALREADY_CHECKED_IN',
                        'detail': 'Ticket already checked in',
                        'ticket': {
                            **self._ticket_payload(ticket),
                            'checked_in_at': existing.scanned_at.isoformat(),
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            rejection = self._rejection_for(ticket)
            if rejection is not None:
                return Response(
                    {
                        'valid': False,
                        'code': rejection.data.get('code'),
                        'detail': rejection.data.get('detail'),
                        'ticket': rejection.data.get('ticket'),
                    },
                    status=rejection.status_code,
                )

            is_within_window, reason = _validate_checkin_window(ticket)
            if not is_within_window:
                return Response(
                    {
                        'valid': False,
                        'code': 'OUTSIDE_SLOT_WINDOW',
                        'detail': reason,
                        'ticket': self._ticket_payload(ticket),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            return Response(
                {
                    'valid': True,
                    'message': 'Ticket is valid',
                    'ticket': self._ticket_payload(ticket),
                },
                status=status.HTTP_200_OK,
            )

        except Ticket.DoesNotExist:
            return Response(
                {
                    'valid': False,
                    'detail': f'Ticket not found: {ticket_code}',
                    'code': 'TICKET_NOT_FOUND',
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception:
            logger.exception("Error validating ticket %s", ticket_code)
            return Response(
                {
                    'valid': False,
                    'detail': 'An unexpected error occurred.',
                    'code': 'ERROR',
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ============================================================
    # BULK
    # ============================================================

    @action(detail=False, methods=['post'])
    def bulk(self, request):
        codes = request.data.get('codes', [])
        device_id = (request.data.get('device_id') or 'unknown')[:255]
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        scanner_ip = request.META.get('REMOTE_ADDR')

        if not codes or not isinstance(codes, list):
            return Response(
                {'detail': 'List of ticket codes is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(codes) > 200:
            return Response(
                {'detail': 'Maximum 200 codes per bulk request'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = [
            self._bulk_process_one(
                code, request.user, device_id,
                latitude, longitude, scanner_ip,
            )
            for code in codes
        ]

        return Response(
            {
                'results': results,
                'total': len(results),
                'successful': sum(1 for r in results if r['status'] == 'success'),
            },
            status=status.HTTP_200_OK,
        )

    def _bulk_process_one(
        self, code, user, device_id, latitude, longitude, scanner_ip,
    ):
        ticket_code = self._extract_ticket_code(code)
        if not ticket_code:
            return {
                'code': code,
                'status': 'invalid',
                'code_type': 'INVALID_FORMAT',
                'message': 'Invalid ticket code format',
            }

        try:
            with transaction.atomic():
                ticket = (
                    Ticket.objects
                    .select_for_update()
                    .select_related('session', 'event', 'booking', 'event__organization')
                    .get(unique_code=ticket_code)
                )

                if not self._user_can_manage_event(user, ticket.event):
                    return {
                        'code': ticket_code,
                        'status': 'permission_denied',
                        'code_type': 'PERMISSION_DENIED',
                        'message': 'You do not have permission to check in this ticket.',
                    }

                if ticket.status in (
                    TicketStatus.REFUNDED,
                    TicketStatus.CANCELLED,
                    TicketStatus.EXPIRED,
                ):
                    return {
                        'code': ticket_code,
                        'status': ticket.status,
                        'code_type': f'TICKET_{ticket.status.upper()}',
                        'message': (
                            f'Ticket has been {ticket.status} '
                            f'and is no longer valid'
                        ),
                        'attendee_name': ticket.attendee_name or 'Guest',
                        'event': ticket.event.title if ticket.event else 'Event',
                    }

                existing = self._existing_checkin(ticket)
                if existing:
                    return {
                        'code': ticket_code,
                        'status': 'already_checked_in',
                        'code_type': 'ALREADY_CHECKED_IN',
                        'message': 'Ticket already checked in',
                        'attendee_name': ticket.attendee_name or 'Guest',
                        'event': ticket.event.title if ticket.event else 'Event',
                        'checked_in_at': existing.scanned_at.isoformat(),
                    }

                if ticket.status == TicketStatus.USED:
                    return {
                        'code': ticket_code,
                        'status': 'already_used',
                        'code_type': 'TICKET_USED',
                        'message': 'Ticket has already been used',
                        'attendee_name': ticket.attendee_name or 'Guest',
                        'event': ticket.event.title if ticket.event else 'Event',
                    }

                is_within_window, reason = _validate_checkin_window(ticket)
                if not is_within_window:
                    return {
                        'code': ticket_code,
                        'status': 'outside_slot_window',
                        'code_type': 'OUTSIDE_SLOT_WINDOW',
                        'message': reason,
                        'attendee_name': ticket.attendee_name or 'Guest',
                        'event': ticket.event.title if ticket.event else 'Event',
                    }

                CheckInLog.objects.create(
                    ticket=ticket,
                    event=ticket.event,
                    session=ticket.session,
                    scanner_user=user,
                    scanner_device_id=device_id,
                    scanner_ip=scanner_ip,
                    status='success',
                    latitude=latitude,
                    longitude=longitude,
                    is_offline=False,
                    synced_at=timezone.now(),
                )

                ticket.status = TicketStatus.USED
                ticket.check_in_time = timezone.now()
                ticket.save(update_fields=['status', 'check_in_time'])

                booking_completed = False
                if ticket.booking:
                    booking_completed = self._check_and_complete_booking(ticket.booking)

                return {
                    'code': ticket_code,
                    'status': 'success',
                    'code_type': 'SUCCESS',
                    'message': 'Ticket checked in successfully',
                    'attendee_name': ticket.attendee_name or 'Guest',
                    'event': ticket.event.title if ticket.event else 'Event',
                    'booking_completed': booking_completed,
                }

        except Ticket.DoesNotExist:
            return {
                'code': code,
                'status': 'not_found',
                'code_type': 'TICKET_NOT_FOUND',
                'message': 'Ticket not found',
            }
        except Exception:
            logger.exception("Bulk check-in failed for code %s", code)
            return {
                'code': code,
                'status': 'error',
                'code_type': 'ERROR',
                'message': 'An error occurred processing this ticket.',
            }

    # ============================================================
    # VERIFY
    # ============================================================

    @action(detail=False, methods=['get'])
    def verify(self, request):
        code = request.query_params.get('code')
        if not code:
            return Response(
                {'detail': 'Ticket code is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ticket_code = self._extract_ticket_code(code)

        try:
            ticket = (
                Ticket.objects
                .select_related('session', 'event', 'booking', 'event__organization')
                .get(unique_code=ticket_code)
            )

            if not self._user_can_manage_event(request.user, ticket.event):
                return Response(
                    {
                        'valid': False,
                        'code': 'PERMISSION_DENIED',
                        'detail': 'You do not have permission to verify this ticket.',
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            rejection = self._rejection_for(ticket)
            if rejection is not None:
                return Response(
                    {
                        'valid': False,
                        'code': rejection.data.get('code'),
                        'detail': rejection.data.get('detail'),
                        'ticket': {
                            **rejection.data.get('ticket', {}),
                            'is_checked_in': False,
                        },
                    },
                    status=rejection.status_code,
                )

            existing = self._existing_checkin(ticket)
            is_within_window, reason = _validate_checkin_window(ticket)

            return Response(
                {
                    'valid': True,
                    'ticket': {
                        **self._ticket_payload(ticket),
                        'is_checked_in': existing is not None,
                        'checked_in_at': (
                            existing.scanned_at.isoformat() if existing else None
                        ),
                    },
                    'slot_window': {
                        'open': is_within_window,
                        'message': reason if not is_within_window else None,
                    },
                },
                status=status.HTTP_200_OK,
            )

        except Ticket.DoesNotExist:
            return Response(
                {
                    'valid': False,
                    'code': 'TICKET_NOT_FOUND',
                    'detail': 'Ticket not found',
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception:
            logger.exception("Error verifying ticket %s", ticket_code)
            return Response(
                {
                    'valid': False,
                    'code': 'ERROR',
                    'detail': 'An unexpected error occurred.',
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ============================================================
    # UNDO
    # ============================================================

    @action(detail=False, methods=['delete'])
    @transaction.atomic
    def undo(self, request):
        if not request.user.is_superuser:
            return Response(
                {'detail': 'Only superusers can undo check-ins'},
                status=status.HTTP_403_FORBIDDEN,
            )

        code = request.query_params.get('code')
        if not code:
            return Response(
                {'detail': 'Ticket code is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ticket_code = self._extract_ticket_code(code)

        try:
            ticket = (
                Ticket.objects
                .select_for_update()
                .get(unique_code=ticket_code)
            )

            checkin_log = self._existing_checkin(ticket)
            if not checkin_log:
                return Response(
                    {'detail': 'No check-in found for this ticket'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if ticket.status in (TicketStatus.REFUNDED, TicketStatus.CANCELLED):
                return Response(
                    {
                        'detail': (
                            f'Cannot undo check-in for a {ticket.status} ticket'
                        ),
                        'code': 'INVALID_OPERATION',
                        'ticket_status': ticket.status,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            checkin_log.status = 'cancelled'
            checkin_log.save(update_fields=['status'])

            ticket.status = TicketStatus.ACTIVE
            ticket.check_in_time = None
            ticket.save(update_fields=['status', 'check_in_time'])

            if ticket.booking and ticket.booking.status == BookingStatus.COMPLETED:
                ticket.booking.status = BookingStatus.CONFIRMED
                ticket.booking.save(update_fields=['status'])
                logger.info(
                    "Booking %s reverted from completed to confirmed",
                    ticket.booking.booking_reference,
                )

            return Response(
                {
                    'detail': 'Check-in undone successfully',
                    'ticket': {'code': ticket.unique_code, 'status': ticket.status},
                },
                status=status.HTTP_200_OK,
            )

        except Ticket.DoesNotExist:
            return Response(
                {'detail': 'Ticket not found'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception:
            logger.exception("Error undoing check-in for %s", ticket_code)
            return Response(
                {'detail': 'An unexpected error occurred.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ============================================================
    # STATS
    # ============================================================

    @action(detail=False, methods=['get'])
    def stats(self, request):
        event_id = request.query_params.get('event')
        if not event_id:
            return Response(
                {'detail': 'Event ID is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            event = get_object_or_404(Event, id=event_id)

            if not self._user_can_manage_event(request.user, event):
                return Response(
                    {'detail': 'You do not have permission to view stats for this event.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

            tickets = Ticket.objects.filter(event=event)
            total_tickets = tickets.count()

            checked_in_logs = (
                CheckInLog.objects
                .filter(event=event, status='success')
                .values('ticket')
                .distinct()
                .count()
            )

            used_tickets = tickets.filter(status=TicketStatus.USED).count()
            checked_in_count = max(checked_in_logs, used_tickets)
            remaining = total_tickets - checked_in_count

            percentage = (
                (checked_in_count / total_tickets * 100) if total_tickets else 0
            )

            return Response(
                {
                    'event': {
                        'id': str(event.id),
                        'title': event.title,
                        'total_tickets': total_tickets,
                        'checked_in': checked_in_count,
                        'remaining': remaining,
                        'percentage': round(percentage, 2),
                        'breakdown': {
                            'active': tickets.filter(status=TicketStatus.ACTIVE).count(),
                            'used': used_tickets,
                            'refunded': tickets.filter(status=TicketStatus.REFUNDED).count(),
                            'cancelled': tickets.filter(status=TicketStatus.CANCELLED).count(),
                            'expired': tickets.filter(status=TicketStatus.EXPIRED).count(),
                        },
                    }
                },
                status=status.HTTP_200_OK,
            )

        except Event.DoesNotExist:
            return Response(
                {'detail': 'Event not found'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception:
            logger.exception("Error getting check-in stats")
            return Response(
                {'detail': 'An error occurred while fetching stats'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ============================================================
    # HISTORY
    # ============================================================

    @action(detail=False, methods=['get'])
    def history(self, request):
        try:
            limit_raw = request.query_params.get('limit', 10)
            try:
                limit = int(limit_raw)
            except (TypeError, ValueError):
                limit = 10
            limit = max(1, min(limit, 100))

            event_id = request.query_params.get('event')
            user = request.user

            query = CheckInLog.objects.all()

            if not is_platform_admin(user):
                org_ids = user_operator_org_ids(user)
                query = query.filter(event__organization_id__in=org_ids)

            if event_id:
                query = query.filter(event_id=event_id)

            recent = (
                query
                .select_related('ticket', 'event', 'scanner_user', 'ticket__booking')
                .order_by('-scanned_at')[:limit]
            )

            history = []
            for log in recent:
                attendee_name = 'Guest'
                if log.ticket and log.ticket.attendee_name:
                    attendee_name = log.ticket.attendee_name
                elif log.ticket and log.ticket.booking:
                    attendee_name = log.ticket.booking.customer_name

                if log.scanner_user:
                    scanned_by = (
                        log.scanner_user.get_full_name()
                        or log.scanner_user.username
                        or 'Unknown'
                    )
                else:
                    scanned_by = 'Unknown'

                history.append({
                    'id': str(log.id),
                    'code': log.ticket.unique_code if log.ticket else None,
                    'attendee_name': attendee_name,
                    'event': log.event.title if log.event else 'Event',
                    'status': log.status,
                    'checked_in_at': log.scanned_at.isoformat(),
                    'device_id': log.scanner_device_id,
                    'scanned_by': scanned_by,
                    'is_offline': log.is_offline,
                })

            return Response(
                {'history': history, 'count': len(history)},
                status=status.HTTP_200_OK,
            )

        except Exception:
            logger.exception("Error getting check-in history")
            return Response(
                {'detail': 'An error occurred while fetching history'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )