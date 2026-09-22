# backend/ticket_whatsapp/api/whatsapp_api.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ..services.whatsapp_service import WhatsAppService
from ticket_bookings.models import Booking, Ticket
import logging

# ✅ Canonical signed QR payload builder.
from ticket_bookings.services.qr_payload import serialise_ticket_qr_payload

logger = logging.getLogger(__name__)


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
            ticket = Ticket.objects.get(id=ticket_id)
        except Ticket.DoesNotExist:
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
            ticket = Ticket.objects.get(id=ticket_id)
        except Ticket.DoesNotExist:
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
            ticket = Ticket.objects.get(id=ticket_id)
        except Ticket.DoesNotExist:
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
    """Handle incoming WhatsApp messages."""
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data

        message_type = data.get('type')
        phone_number = data.get('phone_number')
        message = data.get('message', '')

        logger.info(f"Received WhatsApp message from {phone_number}: {message}")

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

Thank you for using TicketVolt! 🎫
            """
            WhatsAppService.send_message(phone_number, response)

        elif 'booking' in message.lower():
            response = """
📋 *Bookings*

To view your bookings, please visit:
https://ticketvolt.com/my-bookings

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