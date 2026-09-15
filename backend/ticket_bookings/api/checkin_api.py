# backend/ticket_bookings/api/checkin_api.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Q
from ticket_bookings.models import Ticket, CheckInLog, Event, Booking
from ticket_bookings.constants import TicketStatus, BookingStatus
import logging
import json

logger = logging.getLogger(__name__)


def _is_organizer(user):
    return (
        (hasattr(user, 'profile') and getattr(user.profile, 'is_organizer', False))
        or hasattr(user, 'organizer')
    )


class CheckInViewSet(viewsets.ViewSet):
    """
    ViewSet for handling ticket check-ins.
    Throttled under the 'checkin' scope (120/min by default).
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'checkin'

    # ==================== HELPERS ====================

    def _extract_ticket_code(self, code_data):
        """Extract the actual ticket code from various formats."""
        if not code_data:
            return None

        if isinstance(code_data, str):
            if code_data.strip().startswith('{'):
                try:
                    parsed = json.loads(code_data)
                    return (
                        parsed.get('code')
                        or parsed.get('ticket_id')
                        or parsed.get('unique_code')
                        or code_data
                    )
                except json.JSONDecodeError:
                    return code_data
            return code_data

        if isinstance(code_data, dict):
            return (
                code_data.get('code')
                or code_data.get('ticket_id')
                or code_data.get('unique_code')
            )

        return str(code_data)

    def _get_ticket_status_message(self, status):
        status_messages = {
            TicketStatus.REFUNDED: 'This ticket has been refunded and is no longer valid',
            TicketStatus.CANCELLED: 'This ticket has been cancelled and is no longer valid',
            TicketStatus.USED: 'This ticket has already been used',
            TicketStatus.EXPIRED: 'This ticket has expired',
            TicketStatus.ACTIVE: 'This ticket is active and valid',
        }
        return status_messages.get(status, f'Ticket status: {status}')

    def _user_can_manage_event(self, user, event):
        """
        Admins/staff: any event.
        Organizers: only their own events.
        Others: no.
        """
        if user.is_staff or user.is_superuser:
            return True
        if _is_organizer(user) and event is not None:
            return event.organizer_id == user.id
        return False

    def _check_and_complete_booking(self, booking):
        """Mark booking COMPLETED when all its tickets are used."""
        if not booking:
            return False

        total_tickets = booking.tickets.count()
        used_tickets = booking.tickets.filter(status=TicketStatus.USED).count()

        if total_tickets > 0 and total_tickets == used_tickets:
            if booking.status != BookingStatus.COMPLETED:
                booking.status = BookingStatus.COMPLETED
                booking.save(update_fields=['status'])
                logger.info(
                    f"✅ Booking {booking.booking_reference} automatically marked "
                    f"as COMPLETED (all {total_tickets} tickets used)"
                )
                return True
        return False

    # ==================== CREATE ====================

    def create(self, request, *args, **kwargs):
        """
        POST /checkin/
        {
            "code": "TIXKE0TU5PJ13E0",
            "device_id": "android-scanner",
            "latitude": null,
            "longitude": null
        }
        """
        raw_code = request.data.get('code') or request.data.get('ticket_code')
        device_id = request.data.get('device_id', 'unknown')[:255]
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        scanner_ip = request.META.get('REMOTE_ADDR', None)

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

        logger.info(f"🔄 Processing check-in for code: {ticket_code}")

        try:
            ticket = get_object_or_404(Ticket, unique_code=ticket_code)

            # Authorization: only admin/staff or the event organizer may check in.
            if not self._user_can_manage_event(request.user, ticket.event):
                return Response(
                    {'detail': 'You do not have permission to check in this ticket.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

            existing_checkin = CheckInLog.objects.filter(
                ticket=ticket, status='success'
            ).first()

            if existing_checkin:
                return Response(
                    {
                        'detail': 'Ticket already checked in',
                        'code': 'ALREADY_CHECKED_IN',
                        'ticket': {
                            'code': ticket.unique_code,
                            'attendee_name': ticket.attendee_name or 'Guest',
                            'event': ticket.event.title if ticket.event else 'Event',
                            'checked_in_at': existing_checkin.scanned_at.isoformat(),
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if ticket.status in [
                TicketStatus.REFUNDED,
                TicketStatus.CANCELLED,
                TicketStatus.EXPIRED,
            ]:
                return Response(
                    {
                        'detail': f'This ticket has been {ticket.status} and is no longer valid',
                        'code': f'TICKET_{ticket.status.upper()}',
                        'ticket': {
                            'code': ticket.unique_code,
                            'attendee_name': ticket.attendee_name or 'Guest',
                            'event': ticket.event.title if ticket.event else 'Event',
                            'status': ticket.status,
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if ticket.status == TicketStatus.USED:
                return Response(
                    {
                        'detail': 'Ticket has already been used',
                        'code': 'TICKET_USED',
                        'ticket': {
                            'code': ticket.unique_code,
                            'attendee_name': ticket.attendee_name or 'Guest',
                            'event': ticket.event.title if ticket.event else 'Event',
                        },
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
                        'ticket': {
                            'code': ticket.unique_code,
                            'attendee_name': ticket.attendee_name or 'Guest',
                            'event': ticket.event.title if ticket.event else 'Event',
                            'event_end_time': ticket.event.end_date.isoformat(),
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

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
                f"✅ Ticket {ticket_code} checked in by {request.user.email} "
                f"using {device_id}"
            )

            attendee_name = ticket.attendee_name or 'Guest'
            if not ticket.attendee_name and ticket.booking:
                attendee_name = ticket.booking.customer_name

            booking_completed = False
            if ticket.booking:
                booking_completed = self._check_and_complete_booking(ticket.booking)

            return Response(
                {
                    'success': True,
                    'message': 'Check-in successful',
                    'ticket': {
                        'code': ticket.unique_code,
                        'attendee_name': attendee_name,
                        'event': ticket.event.title if ticket.event else 'Event',
                        'event_id': str(ticket.event.id) if ticket.event else None,
                        'status': ticket.status,
                    },
                    'checkin_time': checkin_log.scanned_at.isoformat(),
                    'device_id': device_id,
                    'booking_completed': booking_completed,
                    'booking_status': ticket.booking.status if ticket.booking else None,
                },
                status=status.HTTP_200_OK,
            )

        except Ticket.DoesNotExist:
            logger.warning(f"❌ Ticket not found: {ticket_code}")
            return Response(
                {
                    'detail': f'Ticket not found: {ticket_code}',
                    'code': 'TICKET_NOT_FOUND',
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            logger.exception(f"❌ Error checking in ticket {ticket_code}")
            return Response(
                {'detail': 'An unexpected error occurred.', 'code': 'INTERNAL_ERROR'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ==================== VALIDATE ====================

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def validate(self, request):
        """Validate a ticket without checking it in."""
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
            ticket = get_object_or_404(Ticket, unique_code=ticket_code)

            if not self._user_can_manage_event(request.user, ticket.event):
                return Response(
                    {'valid': False, 'code': 'PERMISSION_DENIED',
                     'detail': 'You do not have permission to validate this ticket.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if ticket.status in [
                TicketStatus.REFUNDED,
                TicketStatus.CANCELLED,
                TicketStatus.EXPIRED,
            ]:
                return Response(
                    {
                        'valid': False,
                        'code': f'TICKET_{ticket.status.upper()}',
                        'detail': f'This ticket has been {ticket.status} and is no longer valid',
                        'ticket': {
                            'code': ticket.unique_code,
                            'attendee_name': ticket.attendee_name or 'Guest',
                            'event': ticket.event.title if ticket.event else 'Event',
                            'status': ticket.status,
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            existing_checkin = CheckInLog.objects.filter(
                ticket=ticket, status='success'
            ).first()

            if existing_checkin:
                return Response(
                    {
                        'valid': False,
                        'code': 'ALREADY_CHECKED_IN',
                        'detail': 'Ticket already checked in',
                        'ticket': {
                            'code': ticket.unique_code,
                            'attendee_name': ticket.attendee_name or 'Guest',
                            'event': ticket.event.title if ticket.event else 'Event',
                            'checked_in_at': existing_checkin.scanned_at.isoformat(),
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if ticket.status == TicketStatus.USED:
                return Response(
                    {
                        'valid': False,
                        'code': 'TICKET_USED',
                        'detail': 'Ticket has already been used',
                        'ticket': {
                            'code': ticket.unique_code,
                            'attendee_name': ticket.attendee_name or 'Guest',
                            'event': ticket.event.title if ticket.event else 'Event',
                            'status': ticket.status,
                        },
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
                        'valid': False,
                        'code': 'EVENT_ENDED',
                        'detail': 'This event has already ended',
                        'ticket': {
                            'code': ticket.unique_code,
                            'attendee_name': ticket.attendee_name or 'Guest',
                            'event': ticket.event.title if ticket.event else 'Event',
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            attendee_name = ticket.attendee_name or 'Guest'
            if not ticket.attendee_name and ticket.booking:
                attendee_name = ticket.booking.customer_name

            return Response(
                {
                    'valid': True,
                    'message': 'Ticket is valid',
                    'ticket': {
                        'code': ticket.unique_code,
                        'attendee_name': attendee_name,
                        'event': ticket.event.title if ticket.event else 'Event',
                        'status': ticket.status,
                    },
                },
                status=status.HTTP_200_OK,
            )

        except Ticket.DoesNotExist:
            return Response(
                {'valid': False, 'detail': f'Ticket not found: {ticket_code}',
                 'code': 'TICKET_NOT_FOUND'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            logger.exception(f"Error validating ticket {ticket_code}")
            return Response(
                {'valid': False, 'detail': 'An unexpected error occurred.',
                 'code': 'ERROR'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ==================== BULK ====================

    @action(detail=False, methods=['post'])
    def bulk(self, request):
        codes = request.data.get('codes', [])
        device_id = request.data.get('device_id', 'unknown')[:255]
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        scanner_ip = request.META.get('REMOTE_ADDR', None)

        if not codes or not isinstance(codes, list):
            return Response(
                {'detail': 'List of ticket codes is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Cap bulk size to prevent abuse
        if len(codes) > 200:
            return Response(
                {'detail': 'Maximum 200 codes per bulk request'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = []
        for code in codes:
            try:
                ticket_code = self._extract_ticket_code(code)
                if not ticket_code:
                    results.append({
                        'code': code,
                        'status': 'invalid',
                        'code_type': 'INVALID_FORMAT',
                        'message': 'Invalid ticket code format',
                    })
                    continue

                ticket = Ticket.objects.get(unique_code=ticket_code)

                # Authorization check per ticket
                if not self._user_can_manage_event(request.user, ticket.event):
                    results.append({
                        'code': ticket_code,
                        'status': 'permission_denied',
                        'code_type': 'PERMISSION_DENIED',
                        'message': 'You do not have permission to check in this ticket.',
                    })
                    continue

                if ticket.status in [
                    TicketStatus.REFUNDED,
                    TicketStatus.CANCELLED,
                    TicketStatus.EXPIRED,
                ]:
                    results.append({
                        'code': ticket_code,
                        'status': ticket.status,
                        'code_type': f'TICKET_{ticket.status.upper()}',
                        'message': f'Ticket has been {ticket.status} and is no longer valid',
                        'attendee_name': ticket.attendee_name or 'Guest',
                        'event': ticket.event.title if ticket.event else 'Event',
                    })
                    continue

                existing_checkin = CheckInLog.objects.filter(
                    ticket=ticket, status='success'
                ).first()

                if existing_checkin:
                    results.append({
                        'code': ticket_code,
                        'status': 'already_checked_in',
                        'code_type': 'ALREADY_CHECKED_IN',
                        'message': 'Ticket already checked in',
                        'attendee_name': ticket.attendee_name or 'Guest',
                        'event': ticket.event.title if ticket.event else 'Event',
                        'checked_in_at': existing_checkin.scanned_at.isoformat(),
                    })
                    continue

                if ticket.status == TicketStatus.USED:
                    results.append({
                        'code': ticket_code,
                        'status': 'already_used',
                        'code_type': 'TICKET_USED',
                        'message': 'Ticket has already been used',
                        'attendee_name': ticket.attendee_name or 'Guest',
                        'event': ticket.event.title if ticket.event else 'Event',
                    })
                    continue

                CheckInLog.objects.create(
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

                booking_completed = False
                if ticket.booking:
                    booking_completed = self._check_and_complete_booking(ticket.booking)

                results.append({
                    'code': ticket_code,
                    'status': 'success',
                    'code_type': 'SUCCESS',
                    'message': 'Ticket checked in successfully',
                    'attendee_name': ticket.attendee_name or 'Guest',
                    'event': ticket.event.title if ticket.event else 'Event',
                    'booking_completed': booking_completed,
                })

            except Ticket.DoesNotExist:
                results.append({
                    'code': code,
                    'status': 'not_found',
                    'code_type': 'TICKET_NOT_FOUND',
                    'message': 'Ticket not found',
                })
            except Exception as e:
                logger.exception(f"Bulk check-in failed for code {code}")
                results.append({
                    'code': code,
                    'status': 'error',
                    'code_type': 'ERROR',
                    'message': 'An error occurred processing this ticket.',
                })

        return Response(
            {
                'results': results,
                'total': len(results),
                'successful': len([r for r in results if r['status'] == 'success']),
            },
            status=status.HTTP_200_OK,
        )

    # ==================== VERIFY ====================

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
            ticket = Ticket.objects.get(unique_code=ticket_code)

            if not self._user_can_manage_event(request.user, ticket.event):
                return Response(
                    {'valid': False, 'code': 'PERMISSION_DENIED',
                     'detail': 'You do not have permission to verify this ticket.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

            attendee_name = ticket.attendee_name or 'Guest'
            if not ticket.attendee_name and ticket.booking:
                attendee_name = ticket.booking.customer_name

            if ticket.status in [
                TicketStatus.REFUNDED,
                TicketStatus.CANCELLED,
                TicketStatus.EXPIRED,
            ]:
                return Response(
                    {
                        'valid': False,
                        'code': f'TICKET_{ticket.status.upper()}',
                        'detail': f'This ticket has been {ticket.status} and is no longer valid',
                        'ticket': {
                            'code': ticket.unique_code,
                            'attendee_name': attendee_name,
                            'event': ticket.event.title if ticket.event else 'Event',
                            'status': ticket.status,
                            'is_checked_in': False,
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            existing_checkin = CheckInLog.objects.filter(
                ticket=ticket, status='success'
            ).first()

            is_checked_in = existing_checkin is not None

            return Response(
                {
                    'valid': True,
                    'ticket': {
                        'code': ticket.unique_code,
                        'attendee_name': attendee_name,
                        'event': ticket.event.title if ticket.event else 'Event',
                        'status': ticket.status,
                        'is_checked_in': is_checked_in,
                        'checked_in_at': (
                            existing_checkin.scanned_at.isoformat()
                            if existing_checkin else None
                        ),
                    },
                },
                status=status.HTTP_200_OK,
            )

        except Ticket.DoesNotExist:
            return Response(
                {'valid': False, 'code': 'TICKET_NOT_FOUND', 'detail': 'Ticket not found'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            logger.exception(f"Error verifying ticket {ticket_code}")
            return Response(
                {'valid': False, 'code': 'ERROR',
                 'detail': 'An unexpected error occurred.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ==================== UNDO ====================

    @action(detail=False, methods=['delete'])
    def undo(self, request):
        """Undo a check-in (superuser only)."""
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
            ticket = Ticket.objects.get(unique_code=ticket_code)

            checkin_log = CheckInLog.objects.filter(
                ticket=ticket, status='success'
            ).first()

            if not checkin_log:
                return Response(
                    {'detail': 'No check-in found for this ticket'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if ticket.status in [TicketStatus.REFUNDED, TicketStatus.CANCELLED]:
                return Response(
                    {
                        'detail': f'Cannot undo check-in for a {ticket.status} ticket',
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
                    f"🔄 Booking {ticket.booking.booking_reference} reverted "
                    f"from completed to confirmed"
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
        except Exception as e:
            logger.exception(f"Error undoing check-in for {ticket_code}")
            return Response(
                {'detail': 'An unexpected error occurred.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ==================== STATS (SCOPED) ====================

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Get check-in statistics for an event.

        Authorization:
          - Admins/staff: any event
          - Organizers:   only their own events
          - Others:       denied
        """
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

            refunded_count = tickets.filter(status=TicketStatus.REFUNDED).count()
            cancelled_count = tickets.filter(status=TicketStatus.CANCELLED).count()
            expired_count = tickets.filter(status=TicketStatus.EXPIRED).count()
            active_count = tickets.filter(status=TicketStatus.ACTIVE).count()

            percentage = (
                (checked_in_count / total_tickets * 100) if total_tickets > 0 else 0
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
                            'active': active_count,
                            'used': used_tickets,
                            'refunded': refunded_count,
                            'cancelled': cancelled_count,
                            'expired': expired_count,
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
        except Exception as e:
            logger.exception("Error getting check-in stats")
            return Response(
                {'detail': 'An error occurred while fetching stats'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ==================== HISTORY (SCOPED) ====================

    @action(detail=False, methods=['get'])
    def history(self, request):
        """
        Get recent check-in history.

        Authorization scoping:
          - Admins/staff: all check-ins.
          - Organizers:   only check-ins for events they organize.
          - Regular users: only check-ins they personally performed
                           (scanner_user = request.user).

        Optional query params:
          - limit (default 10, max 100)
          - event (filter to a specific event UUID)
        """
        try:
            limit_raw = request.query_params.get('limit', 10)
            try:
                limit = int(limit_raw)
            except (TypeError, ValueError):
                limit = 10
            limit = max(1, min(limit, 100))

            event_id = request.query_params.get('event')

            user = request.user
            query = CheckInLog.objects.filter(status='success')

            # ---- Row-level authorization ----
            if not (user.is_staff or user.is_superuser):
                if _is_organizer(user):
                    # Organizer: only their own events
                    query = query.filter(event__organizer=user)
                else:
                    # Regular user: only their own scans
                    query = query.filter(scanner_user=user)

            if event_id:
                # Additional filter; combined with the scoping above.
                query = query.filter(event_id=event_id)

            recent_checkins = (
                query
                .select_related('ticket', 'event', 'scanner_user', 'ticket__booking')
                .order_by('-scanned_at')[:limit]
            )

            history = []
            for log in recent_checkins:
                attendee_name = 'Guest'
                if log.ticket and log.ticket.attendee_name:
                    attendee_name = log.ticket.attendee_name
                elif log.ticket and log.ticket.booking:
                    attendee_name = log.ticket.booking.customer_name

                history.append({
                    'code': log.ticket.unique_code if log.ticket else None,
                    'attendee_name': attendee_name,
                    'event': log.event.title if log.event else 'Event',
                    'checked_in_at': log.scanned_at.isoformat(),
                    'device_id': log.scanner_device_id,
                    'scanned_by': log.scanner_user.email if log.scanner_user else 'Unknown',
                })

            return Response(
                {'history': history, 'count': len(history)},
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            logger.exception("Error getting check-in history")
            return Response(
                {'detail': 'An error occurred while fetching history'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )