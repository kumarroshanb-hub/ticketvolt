# backend/ticket_whatsapp/api/whatsapp_api.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ..services.whatsapp_service import WhatsAppService
from ticket_bookings.models import Booking, Ticket
import hmac
import logging
import os

# ✅ Canonical signed QR payload builder.
from ticket_bookings.services.qr_payload import serialise_ticket_qr_payload

logger = logging.getLogger(__name__)


def _ticket_visible_to(user, ticket):
    """Object-level authorization for ticket reads (pentest F10).

    A ticket may be used by its booking owner, an operator of the event's
    organization, or a platform admin. Everyone else gets a 404 so the
    endpoint cannot be used as a ticket-existence oracle.
    """
    from ticket_bookings.services import tenancy

    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    booking = getattr(ticket, 'booking', None)
    if booking is not None and booking.user_id == user.id:
        return True
    event = getattr(ticket, 'event', None)
    org = getattr(event, 'organization', None) if event is not None else None
    if org is not None and tenancy.can_operate_org(user, org):
        return True
    return False


class SendTicketView(APIView):
    """Send a single ticket via WhatsApp."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ticket_id = request.data.get('ticket_id')
        phone_number = request.data.get('phone_number')

        if not ticket_id:
            return Response(
                {'error': 'ticket_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if phone_number:
            phone_number = ''.join(filter(str.isdigit, phone_number))
            if len(phone_number) == 10:
                phone_number = f"91{phone_number}"
            phone_number = f"+{phone_number}"

        try:
            ticket = Ticket.objects.select_related(
                'booking', 'event__organization',
            ).get(id=ticket_id)
        except Ticket.DoesNotExist:
            return Response(
                {'error': 'Ticket not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not _ticket_visible_to(request.user, ticket):
            return Response(
                {'error': 'Ticket not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not phone_number:
            phone_number = ticket.booking.whatsapp_number or ticket.booking.customer_phone
            if phone_number:
                phone_number = ''.join(filter(str.isdigit, phone_number))
                if len(phone_number) == 10:
                    phone_number = f"91{phone_number}"
                phone_number = f"+{phone_number}"

        if not phone_number:
            return Response(
                {'error': 'No phone number available'},
                status=status.HTTP_400_BAD_REQUEST
            )

        qr_base64 = WhatsAppService._get_qr_base64(ticket)

        if not qr_base64:
            return Response(
                {'error': 'Failed to generate QR code'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        caption = f"🎫 Ticket: {ticket.unique_code}\nAttendee: {ticket.attendee_name or 'Guest'}\nEvent: {ticket.event.title if ticket.event else 'Event'}"

        result = WhatsAppService.send_image_base64(phone_number, qr_base64, caption)

        if result and 'error' not in result:
            return Response({
                'success': True,
                'message': 'QR code sent successfully',
                'ticket_code': ticket.unique_code,
                'phone_number': phone_number
            }, status=status.HTTP_200_OK)
        else:
            return Response({
                'success': False,
                'error': result.get('error', 'Failed to send QR code')
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SendBulkTicketsView(APIView):
    """Send all tickets in a booking via WhatsApp (Bulk)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        booking_id = request.data.get('booking_id')
        booking_ids = request.data.get('booking_ids', [])
        phone_number = request.data.get('phone_number')

        if booking_id:
            try:
                booking = Booking.objects.get(id=booking_id)
                result = WhatsAppService.send_ticket(booking)

                if result.get('success'):
                    return Response({
                        'success': True,
                        'message': 'Tickets sent successfully',
                        'booking_id': booking_id,
                        'ticket_count': booking.tickets.count()
                    }, status=status.HTTP_200_OK)
                else:
                    return Response({
                        'success': False,
                        'error': result.get('error', 'Failed to send tickets')
                    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            except Booking.DoesNotExist:
                return Response(
                    {'error': 'Booking not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

        elif booking_ids:
            results = []
            for bid in booking_ids:
                try:
                    booking = Booking.objects.get(id=bid)
                    result = WhatsAppService.send_ticket(booking)
                    results.append({
                        'booking_id': bid,
                        'success': result.get('success', False),
                        'ticket_count': booking.tickets.count() if result.get('success') else 0,
                        'error': result.get('error') if not result.get('success') else None
                    })
                except Booking.DoesNotExist:
                    results.append({
                        'booking_id': bid,
                        'success': False,
                        'error': 'Booking not found'
                    })

            success_count = sum(1 for r in results if r['success'])

            return Response({
                'success': True,
                'message': f'Sent {success_count} of {len(results)} bookings',
                'results': results
            }, status=status.HTTP_200_OK)

        else:
            return Response(
                {'error': 'booking_id or booking_ids required'},
                status=status.HTTP_400_BAD_REQUEST
            )


class SendConfirmationView(APIView):
    """Send booking confirmation via WhatsApp."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        booking_id = request.data.get('booking_id')
        phone_number = request.data.get('phone_number')

        if not booking_id:
            return Response({'error': 'Booking ID required'}, status=400)

        booking = get_object_or_404(Booking, id=booking_id)

        if phone_number:
            booking.whatsapp_number = phone_number

        result = WhatsAppService.send_booking_confirmation(booking)

        return Response(result)


class SendTicketPDFView(APIView):
    """Send ticket as PDF via WhatsApp."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ticket_id = request.data.get('ticket_id')
        phone_number = request.data.get('phone_number')

        if not ticket_id:
            return Response(
                {'error': 'ticket_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            ticket = Ticket.objects.select_related(
                'booking', 'event__organization',
            ).get(id=ticket_id)
        except Ticket.DoesNotExist:
            return Response(
                {'error': 'Ticket not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not _ticket_visible_to(request.user, ticket):
            return Response(
                {'error': 'Ticket not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        result = WhatsAppService.send_ticket_as_pdf(ticket, phone_number)

        if result.get('success'):
            return Response(result, status=status.HTTP_200_OK)
        else:
            return Response(
                {'error': result.get('error', 'Failed to send PDF')},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SendBookingPDFView(APIView):
    """Send all tickets in a booking as PDF via WhatsApp."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        booking_id = request.data.get('booking_id')
        phone_number = request.data.get('phone_number')

        if not booking_id:
            return Response(
                {'error': 'booking_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            booking = Booking.objects.get(id=booking_id)
        except Booking.DoesNotExist:
            return Response(
                {'error': 'Booking not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        result = WhatsAppService.send_booking_as_pdf(booking, phone_number)

        if result.get('success'):
            return Response(result, status=status.HTTP_200_OK)
        else:
            return Response(
                {'error': result.get('error', 'Failed to send PDF')},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SendEventReminderView(APIView):
    """Send event reminder via WhatsApp."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        booking_id = request.data.get('booking_id')
        if not booking_id:
            return Response({'error': 'Booking ID required'}, status=400)

        booking = get_object_or_404(Booking, id=booking_id)
        result = WhatsAppService.send_event_reminder(booking)

        return Response(result)


class SendCheckinConfirmationView(APIView):
    """Send check-in confirmation via WhatsApp."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ticket_id = request.data.get('ticket_id')
        if not ticket_id:
            return Response({'error': 'Ticket ID required'}, status=400)

        ticket = get_object_or_404(Ticket, id=ticket_id)
        result = WhatsAppService.send_checkin_confirmation(ticket)

        return Response(result)


class SendTestQRView(APIView):
    """
    Test sending a QR code.

    ⚠️ This endpoint now requires a real `ticket_id`. The QR is generated
    from the canonical signed payload builder — no arbitrary test data.
    This means the QR a tester receives is exactly the QR a real attendee
    would get, so the scan-to-verify flow can be exercised end-to-end.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        phone_number = request.data.get('phone_number')
        ticket_id = request.data.get('ticket_id')

        if not phone_number:
            return Response(
                {'error': 'phone_number is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not ticket_id:
            return Response(
                {'error': 'ticket_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            ticket = Ticket.objects.select_related(
                'booking', 'event__organization',
            ).get(id=ticket_id)
        except Ticket.DoesNotExist:
            return Response(
                {'error': 'Ticket not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not _ticket_visible_to(request.user, ticket):
            return Response(
                {'error': 'Ticket not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            import base64
            from io import BytesIO
            import qrcode

            # ✅ Canonical signed payload — the QR is scannable and verifiable.
            payload = serialise_ticket_qr_payload(ticket)

            qr = qrcode.QRCode(
                version=None,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=4,
            )
            qr.add_data(payload)
            qr.make(fit=True)

            img = qr.make_image(fill_color="black", back_color="white")
            buffered = BytesIO()
            img.save(buffered, format="PNG")
            img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')

            result = WhatsAppService.send_image_base64(
                phone_number,
                img_base64,
                f"🧪 Test QR for ticket {ticket.unique_code}\n\nThis QR is signed and can be scanned by the TicketVolt scanner."
            )

            if result and 'error' not in result:
                return Response({
                    'success': True,
                    'message': 'Test QR sent successfully',
                    'phone_number': phone_number,
                    'ticket_code': ticket.unique_code,
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'success': False,
                    'error': result.get('error', 'Failed to send test QR')
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class WhatsAppWebhookView(APIView):
    """Handle inbound WhatsApp events forwarded by the Baileys gateway.

    SECURITY (pentest F5): this endpoint drives outbound messages and is
    reachable from the network, so it must never accept anonymous posts.
    The caller proves itself with a shared secret in X-Webhook-Token (or
    Authorization: Bearer). When WHATSAPP_WEBHOOK_SECRET is not configured
    the endpoint fails closed rather than silently allowing anyone to make
    the bot send messages to arbitrary numbers.
    """

    permission_classes = [AllowAny]

    @staticmethod
    def _provided_token(request):
        token = request.headers.get('X-Webhook-Token', '')
        if token:
            return token.strip()
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            return auth[7:].strip()
        return ''

    def post(self, request):
        expected = (os.environ.get('WHATSAPP_WEBHOOK_SECRET') or '').strip()
        if not expected:
            logger.error(
                'WHATSAPP_WEBHOOK_SECRET is not configured; rejecting inbound '
                'WhatsApp webhook. Set it in the backend environment.'
            )
            return Response(
                {'error': 'Webhook not configured.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if not hmac.compare_digest(self._provided_token(request), expected):
            logger.warning('Rejected unauthenticated WhatsApp webhook request.')
            return Response(
                {'error': 'Unauthorized.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        data = request.data
        message_type = data.get('type')
        phone_number = data.get('phone_number')
        message = data.get('message', '')

        # PII: log the event type and a masked destination only.
        masked = ('*' * max(len(str(phone_number or '')) - 4, 0)) + str(phone_number or '')[-4:]
        logger.info('Received WhatsApp webhook type=%s to=%s', message_type, masked)

        # Only phone-number shapes we can actually reply to.
        if not phone_number or not isinstance(phone_number, str):
            return Response({'error': 'phone_number is required.'}, status=400)
        if not 7 <= len([c for c in phone_number if c.isdigit()]) <= 15:
            return Response({'error': 'Invalid phone_number.'}, status=400)

        if message_type == 'text':
            return self._handle_text_message(phone_number, message)
        elif message_type == 'interactive':
            return self._handle_interactive(phone_number, data)

        return Response({'status': 'received'})

    def _handle_text_message(self, phone_number, message):
        if 'help' in message.lower():
            response = """
📱 *WhatsApp Help*

Commands:
1. /bookings - View my bookings
2. /ticket [code] - Get ticket info
3. /support - Contact support
4. /help - Show this menu

Thank you for using TiketVault! 🎫
            """
            WhatsAppService.send_message(phone_number, response)

        elif 'booking' in message.lower():
            response = """
📋 *Bookings*

To view your bookings, please visit:
https://tiketvault.com/my-bookings

Or reply with your booking reference number.
            """
            WhatsAppService.send_message(phone_number, response)

        return Response({'status': 'processed'})

    def _handle_interactive(self, phone_number, data):
        interactive_type = data.get('interactive_type')

        if interactive_type == 'list':
            selected = data.get('selected')
            response = f"You selected: {selected}"
            WhatsAppService.send_message(phone_number, response)

        return Response({'status': 'processed'})