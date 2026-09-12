# ticket_bookings/api/qr_api.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.http import HttpResponse, FileResponse
from ticket_bookings.models import Ticket
from ticket_bookings.services.qr_service import QRCodeService
from io import BytesIO
import qrcode
import json

class QRCodeDownloadView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, ticket_id):
        """Download QR code as image file"""
        ticket = get_object_or_404(Ticket, id=ticket_id)
        
        # Generate QR code data
        qr_data = {
            'ticket_id': str(ticket.id),
            'code': ticket.unique_code,
            'event': ticket.event.title if ticket.event else 'Event',
            'attendee': ticket.attendee_name or 'Guest',
        }
        
        # Create QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(json.dumps(qr_data))
        qr.make(fit=True)
        
        # Create image
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Save to bytes
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        buffered.seek(0)
        
        # Return as file download
        response = FileResponse(
            buffered,
            content_type='image/png',
            filename=f"ticket_{ticket.unique_code}.png"
        )
        response['Content-Disposition'] = f'attachment; filename="ticket_{ticket.unique_code}.png"'
        return response

class QRCodeImageView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, ticket_id):
        """Get QR code image URL for WhatsApp"""
        ticket = get_object_or_404(Ticket, id=ticket_id)
        
        # Check if QR image URL exists
        if ticket.qr_image_url:
            return Response({
                'image_url': ticket.qr_image_url,
                'ticket_code': ticket.unique_code
            })
        
        # Generate QR image file
        qr_result = QRCodeService.generate_qr_image_file(ticket)
        
        if qr_result:
            # Save the URL to the ticket
            ticket.qr_image_url = qr_result['url']
            ticket.save()
            
            return Response({
                'image_url': qr_result['url'],
                'ticket_code': ticket.unique_code,
                'file_path': qr_result['file_path']
            })
        
        return Response(
            {'error': 'Failed to generate QR code'},
            status=500
        )