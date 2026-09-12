from django.conf import settings
import requests
import logging
from ticket_bookings.services.qr_service import QRCodeService

logger = logging.getLogger(__name__)

class MessageService:
    @staticmethod
    def send_ticket_message(booking):
        """Send ticket via WhatsApp through Baileys Gateway"""
        gateway_url = getattr(settings, 'WHATSAPP_GATEWAY_URL', 'http://localhost:3002')
        
        tickets = booking.tickets.all()
        ticket_data = []

        for ticket in tickets:
            if not ticket.qr_code:
                ticket.qr_code = QRCodeService.generate_ticket_qr(ticket)
                ticket.save()
            
            ticket_data.append({
                'code': ticket.unique_code,
                'tier': ticket.tier.name if ticket.tier else 'General',
                'attendee_name': ticket.attendee_name or booking.customer_name,
                'qr_code': ticket.qr_code
            })

        payload = {
            'phone_number': booking.whatsapp_number or booking.customer_phone,
            'ticket_data': ticket_data,
            'event_title': booking.event.title,
            'venue': booking.event.metadata.get('venue', 'TBD'),
            'date': booking.event.start_date.isoformat()
        }

        try:
            response = requests.post(
                f"{gateway_url}/api/send_ticket",
                json=payload,
                timeout=30
            )
            if response.status_code == 200:
                logger.info(f"Tickets sent to {payload['phone_number']} for booking {booking.booking_reference}")
                return {'success': True, 'message': 'Tickets sent successfully'}
            else:
                logger.error(f"Failed to send tickets: {response.text}")
                return {'success': False, 'error': response.text}
        except requests.exceptions.ConnectionError:
            logger.error(f"Could not connect to Baileys Gateway at {gateway_url}")
            return {'success': False, 'error': 'Gateway not available'}
        except Exception as e:
            logger.error(f"Error sending tickets: {str(e)}")
            return {'success': False, 'error': str(e)}

    @staticmethod
    def send_booking_confirmation(booking):
        """Send booking confirmation message"""
        gateway_url = getattr(settings, 'WHATSAPP_GATEWAY_URL', 'http://localhost:3002')
        
        message = f"""
✅ *Booking Confirmed!*

*Booking Reference:* {booking.booking_reference}
*Event:* {booking.event.title}
*Date:* {booking.event.start_date.strftime('%d %b %Y, %I:%M %p')}
*Tickets:* {booking.tickets.count()}
*Total Amount:* ₹{booking.total_amount}

You will receive your tickets shortly.
Thank you for booking with TicketVolt! 🎫
        """
        
        payload = {
            'phone_number': booking.whatsapp_number or booking.customer_phone,
            'message': message
        }
        
        try:
            response = requests.post(
                f"{gateway_url}/api/send_message",
                json=payload,
                timeout=30
            )
            return {'success': response.status_code == 200}
        except Exception as e:
            logger.error(f"Error sending confirmation: {str(e)}")
            return {'success': False, 'error': str(e)}

    @staticmethod
    def send_event_reminder(booking):
        """Send event reminder"""
        gateway_url = getattr(settings, 'WHATSAPP_GATEWAY_URL', 'http://localhost:3002')
        
        message = f"""
⏰ *Event Reminder!*

Don't forget your event tomorrow!

*Event:* {booking.event.title}
*Date:* {booking.event.start_date.strftime('%d %b %Y, %I:%M %p')}
*Venue:* {booking.event.metadata.get('venue', 'TBD')}

*Booking:* {booking.booking_reference}

Please scan your QR code at the entrance.
See you there! 🎉
        """
        
        payload = {
            'phone_number': booking.whatsapp_number or booking.customer_phone,
            'message': message
        }
        
        try:
            response = requests.post(
                f"{gateway_url}/api/send_message",
                json=payload,
                timeout=30
            )
            return {'success': response.status_code == 200}
        except Exception as e:
            logger.error(f"Error sending reminder: {str(e)}")
            return {'success': False, 'error': str(e)}

    @staticmethod
    def send_checkin_confirmation(ticket):
        """Send confirmation when ticket is scanned"""
        gateway_url = getattr(settings, 'WHATSAPP_GATEWAY_URL', 'http://localhost:3002')
        
        message = f"""
✅ *Check-in Successful!*

*Event:* {ticket.event.title}
*Ticket:* {ticket.unique_code}
*Attendee:* {ticket.attendee_name or 'Guest'}
*Time:* {ticket.check_in_time.strftime('%d %b %Y, %I:%M %p') if ticket.check_in_time else 'Just now'}

Thank you for attending! 🎉
        """
        
        phone = ticket.booking.whatsapp_number or ticket.booking.customer_phone
        if not phone:
            logger.warning(f"No WhatsApp number for booking {ticket.booking.booking_reference}")
            return {'success': False, 'error': 'No WhatsApp number'}
        
        payload = {
            'phone_number': phone,
            'message': message
        }
        
        try:
            response = requests.post(
                f"{gateway_url}/api/send_message",
                json=payload,
                timeout=30
            )
            if response.status_code == 200:
                logger.info(f"✅ Check-in confirmation sent to {phone}")
                return {'success': True}
            else:
                logger.error(f"Failed to send check-in confirmation: {response.text}")
                return {'success': False, 'error': response.text}
        except Exception as e:
            logger.error(f"Error sending check-in confirmation: {str(e)}")
            return {'success': False, 'error': str(e)}

    @staticmethod
    def send_ticket_image(phone_number, ticket):
        """Send ticket QR code as image"""
        gateway_url = getattr(settings, 'WHATSAPP_GATEWAY_URL', 'http://localhost:3002')
        
        if not ticket.qr_code:
            ticket.qr_code = QRCodeService.generate_ticket_qr(ticket)
            ticket.save()
        
        payload = {
            'phone_number': phone_number,
            'qr_code': ticket.qr_code,
            'caption': f"🎫 Ticket: {ticket.unique_code}\nAttendee: {ticket.attendee_name or 'Guest'}"
        }
        
        try:
            response = requests.post(
                f"{gateway_url}/api/send_qr",
                json=payload,
                timeout=30
            )
            return {'success': response.status_code == 200}
        except Exception as e:
            logger.error(f"Error sending ticket image: {str(e)}")
            return {'success': False, 'error': str(e)}
