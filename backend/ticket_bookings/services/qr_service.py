# ticket_bookings/services/qr_service.py
import qrcode
import base64
import json
from io import BytesIO
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.conf import settings
import os
import uuid

class QRCodeService:
    @classmethod
    def generate_ticket_qr(cls, ticket):
        """Generate QR code for a ticket and return as data URL"""
        # Data to encode in QR
        qr_data = {
            'ticket_id': str(ticket.id),
            'code': ticket.unique_code,
            'event': ticket.event.title if ticket.event else 'Event',
            'event_id': str(ticket.event.id) if ticket.event else None,
            'attendee': ticket.attendee_name or 'Guest',
            'booking': ticket.booking.booking_reference if ticket.booking else None
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
        
        # Convert to base64
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        qr_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        # Return as data URL
        return f"data:image/png;base64,{qr_base64}"
    
    @classmethod
    def generate_qr_image_file(cls, ticket):
        """Generate QR code and save as image file for WhatsApp"""
        try:
            # Data to encode in QR
            qr_data = {
                'ticket_id': str(ticket.id),
                'code': ticket.unique_code,
                'event': ticket.event.title if ticket.event else 'Event',
                'event_id': str(ticket.event.id) if ticket.event else None,
                'attendee': ticket.attendee_name or 'Guest',
                'booking': ticket.booking.booking_reference if ticket.booking else None
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
            
            # Generate unique filename
            filename = f"qr_{ticket.unique_code}_{uuid.uuid4().hex[:8]}.png"
            
            # Save to media directory
            from django.core.files.base import ContentFile
            from io import BytesIO
            
            # Create the file in memory
            buffered = BytesIO()
            img.save(buffered, format="PNG")
            
            # Save using Django's storage system
            from django.core.files.storage import default_storage
            from django.core.files.base import ContentFile
            
            # Save the file
            file_path = f"qr_codes/{filename}"
            saved_path = default_storage.save(file_path, ContentFile(buffered.getvalue()))
            
            # Get the full URL
            full_url = default_storage.url(saved_path)
            
            return {
                'file_path': saved_path,
                'url': full_url,
                'filename': filename
            }
            
        except Exception as e:
            print(f"❌ QR image file generation error: {e}")
            return None
    
    @classmethod
    def decode_ticket_qr(cls, qr_data):
        """Decode QR data from scanned code"""
        try:
            data = json.loads(qr_data)
            return {
                'ticket_id': data.get('ticket_id'),
                'code': data.get('code'),
                'event_id': data.get('event_id')
            }
        except:
            return {'code': qr_data}