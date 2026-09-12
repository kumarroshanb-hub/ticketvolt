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

logger = logging.getLogger(__name__)


class SendTicketView(APIView):
    """Send a single ticket via WhatsApp"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        ticket_id = request.data.get('ticket_id')
        phone_number = request.data.get('phone_number')
        
        if not ticket_id:
            return Response(
                {'error': 'ticket_id is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Format phone number
        if phone_number:
            # Remove any spaces, dashes, or plus signs
            phone_number = ''.join(filter(str.isdigit, phone_number))
            # Add country code if missing (assuming India +91)
            if len(phone_number) == 10:
                phone_number = f"91{phone_number}"
            # Add plus sign for WhatsApp
            phone_number = f"+{phone_number}"
        
        try:
            ticket = Ticket.objects.get(id=ticket_id)
        except Ticket.DoesNotExist:
            return Response(
                {'error': 'Ticket not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get phone from booking if not provided
        if not phone_number:
            phone_number = ticket.booking.whatsapp_number or ticket.booking.customer_phone
            # Format the phone number
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
    """Send all tickets in a booking via WhatsApp (Bulk)"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        booking_id = request.data.get('booking_id')
        booking_ids = request.data.get('booking_ids', [])
        phone_number = request.data.get('phone_number')
        
        # Handle single booking
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
        
        # Handle multiple bookings (bulk)
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
    """Send booking confirmation via WhatsApp"""
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
    """Send ticket as PDF via WhatsApp"""
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
    """Send all tickets in a booking as PDF via WhatsApp"""
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
    """Send event reminder via WhatsApp"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        booking_id = request.data.get('booking_id')
        if not booking_id:
            return Response({'error': 'Booking ID required'}, status=400)
        
        booking = get_object_or_404(Booking, id=booking_id)
        result = WhatsAppService.send_event_reminder(booking)
        
        return Response(result)

class SendCheckinConfirmationView(APIView):
    """Send check-in confirmation via WhatsApp"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        ticket_id = request.data.get('ticket_id')
        if not ticket_id:
            return Response({'error': 'Ticket ID required'}, status=400)
        
        ticket = get_object_or_404(Ticket, id=ticket_id)
        result = WhatsAppService.send_checkin_confirmation(ticket)
        
        return Response(result)

class SendTestQRView(APIView):
    """Test sending a QR code"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        phone_number = request.data.get('phone_number')
        
        if not phone_number:
            return Response(
                {'error': 'phone_number is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            import qrcode
            import base64
            from io import BytesIO
            import json
            
            test_data = {
                'test': 'QR Code Test',
                'timestamp': str(timezone.now())
            }
            
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=4,
            )
            qr.add_data(json.dumps(test_data))
            qr.make(fit=True)
            
            img = qr.make_image(fill_color="black", back_color="white")
            buffered = BytesIO()
            img.save(buffered, format="PNG")
            img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
            
            result = WhatsAppService.send_image_base64(
                phone_number,
                img_base64,
                "🧪 Test QR Code\n\nThis is a test to verify QR code sending works."
            )
            
            if result and 'error' not in result:
                return Response({
                    'success': True,
                    'message': 'Test QR sent successfully',
                    'phone_number': phone_number
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

# ============ NEW PDF VIEWS ============

class SendTicketPDFView(APIView):
    """Send ticket as PDF via WhatsApp"""
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
    """Send all tickets in a booking as PDF via WhatsApp"""
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
        
class WhatsAppWebhookView(APIView):
    """Handle incoming WhatsApp messages"""
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