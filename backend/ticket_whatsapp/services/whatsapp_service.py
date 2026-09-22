# backend/ticket_whatsapp/services/whatsapp_service.py
import requests
import json
import base64
from io import BytesIO
from django.conf import settings
import qrcode
from PIL import Image
import logging
import uuid
import os
import tempfile
import re

# ✅ Canonical signed QR payload builder — single source of truth.
# Every QR sent via WhatsApp must use this so the scanner accepts it.
from ticket_bookings.services.qr_payload import serialise_ticket_qr_payload

logger = logging.getLogger(__name__)


class WhatsAppService:
    """Service to handle WhatsApp messaging through Baileys Gateway"""

    GATEWAY_URL = getattr(settings, 'WHATSAPP_GATEWAY_URL', 'http://baileys-gateway:3002')

    @classmethod
    def _format_phone_number(cls, phone_number):
        """
        Format phone number for WhatsApp API
        - Validates and cleans phone numbers
        - Returns None for invalid numbers
        """
        if not phone_number:
            return None

        # Convert to string and clean
        cleaned = str(phone_number).strip()

        # If it looks like a JID (contains @), extract the number part
        if '@' in cleaned:
            cleaned = cleaned.split('@')[0]

        # Remove all non-digit characters
        cleaned = re.sub(r'\D', '', cleaned)

        if not cleaned:
            return None

        # Remove leading zeros
        if cleaned.startswith('0'):
            cleaned = cleaned[1:]

        # If it's 10 digits and doesn't have country code, add 91 (India default)
        if len(cleaned) == 10:
            cleaned = f"91{cleaned}"

        # Validate length (should be at least 10 digits after formatting)
        if len(cleaned) < 10:
            logger.warning(f"⚠️ Phone number too short: {phone_number} -> {cleaned}")
            return None

        # Validate it's a reasonable length (max 15 digits for international)
        if len(cleaned) > 15:
            logger.warning(f"⚠️ Phone number too long: {phone_number} -> {cleaned}")
            return None

        logger.info(f"📱 Phone formatted: {phone_number} -> {cleaned}")
        return cleaned

    # ============ MESSAGING ============

    @classmethod
    def send_message(cls, phone_number, message):
        """Send a simple WhatsApp message"""
        try:
            formatted_number = cls._format_phone_number(phone_number)
            if not formatted_number:
                error_msg = f"Invalid phone number: {phone_number}"
                logger.error(f"❌ {error_msg}")
                return {'error': error_msg}

            payload = {
                'phone_number': formatted_number,
                'message': message
            }

            logger.info(f"📤 Sending message to: {formatted_number}")

            response = requests.post(
                f"{cls.GATEWAY_URL}/api/send_message",
                json=payload,
                timeout=30
            )

            if response.ok:
                logger.info(f"✅ Message sent to {formatted_number}")
                return response.json()
            else:
                logger.error(f"❌ Failed to send message: {response.status_code} - {response.text}")
                return {'error': response.text}

        except requests.exceptions.ConnectionError:
            logger.error(f"❌ Cannot connect to WhatsApp gateway at {cls.GATEWAY_URL}")
            return {'error': 'Gateway connection failed'}
        except requests.exceptions.Timeout:
            logger.error(f"❌ Gateway timeout")
            return {'error': 'Gateway timeout'}
        except Exception as e:
            logger.error(f"WhatsApp send error: {str(e)}")
            return {'error': str(e)}

    @classmethod
    def send_pdf(cls, phone_number, pdf_base64, filename="ticket.pdf", caption=""):
        """Send PDF via WhatsApp through Baileys Gateway"""
        try:
            formatted_number = cls._format_phone_number(phone_number)
            if not formatted_number:
                error_msg = f"Invalid phone number: {phone_number}"
                logger.error(f"❌ {error_msg}")
                return {'error': error_msg}

            # Validate base64
            try:
                base64.b64decode(pdf_base64)
            except Exception as e:
                logger.error(f"❌ Invalid PDF base64 data: {e}")
                return {'error': 'Invalid PDF data'}

            payload = {
                'phone_number': formatted_number,
                'file': pdf_base64,
                'filename': filename,
                'caption': caption,
                'type': 'pdf'
            }

            logger.info(f"📤 Sending PDF to: {formatted_number}")

            # Try send_document endpoint first
            try:
                response = requests.post(
                    f"{cls.GATEWAY_URL}/api/send_document",
                    json=payload,
                    timeout=60
                )
                if response.ok:
                    logger.info(f"✅ PDF sent to {formatted_number}")
                    return response.json()
            except Exception as e:
                logger.warning(f"⚠️ send_document failed: {e}")

            # If that fails, try send_file
            try:
                logger.info(f"📤 Trying send_file endpoint...")
                response = requests.post(
                    f"{cls.GATEWAY_URL}/api/send_file",
                    json=payload,
                    timeout=60
                )
                if response.ok:
                    logger.info(f"✅ PDF sent to {formatted_number}")
                    return response.json()
            except Exception as e:
                logger.warning(f"⚠️ send_file failed: {e}")

            # Fallback: send_message with file data
            logger.info(f"📤 Trying fallback: send_message with file data...")
            try:
                fallback_payload = {
                    'phone_number': formatted_number,
                    'message': f"📎 {filename}\n\n{caption}\n\n[PDF data attached]",
                    'file_data': pdf_base64,
                    'filename': filename
                }
                response = requests.post(
                    f"{cls.GATEWAY_URL}/api/send_message",
                    json=fallback_payload,
                    timeout=60
                )
                if response.ok:
                    logger.info(f"✅ PDF sent via fallback to {formatted_number}")
                    return response.json()
            except Exception as e:
                logger.error(f"❌ All attempts failed: {e}")

            return {'error': 'All PDF sending methods failed'}

        except requests.exceptions.ConnectionError:
            logger.error(f"❌ Cannot connect to WhatsApp gateway at {cls.GATEWAY_URL}")
            return {'error': 'Gateway connection failed'}
        except requests.exceptions.Timeout:
            logger.error(f"❌ Gateway timeout")
            return {'error': 'Gateway timeout'}
        except Exception as e:
            logger.error(f"Failed to send PDF: {str(e)}")
            return {'error': str(e)}

    # ============ QR CODE GENERATION (CANONICAL) ============

    @classmethod
    def _get_qr_base64(cls, ticket):
        """
        Return a base64-encoded PNG of the ticket's canonical SIGNED QR.

        Uses the shared payload builder so the QR is:
          - scannable by the TicketVolt scanner app
          - verifiable by the server (HMAC-SHA256 over {v,type,code})
          - consistent with QRs rendered by PDF/email/admin paths

        Args:
            ticket: a Ticket instance with `unique_code`.

        Returns:
            base64-encoded PNG string, or None on failure.
        """
        try:
            payload = serialise_ticket_qr_payload(ticket)

            qr = qrcode.QRCode(
                version=None,           # let qrcode pick the smallest version that fits
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=4,
            )
            qr.add_data(payload)
            qr.make(fit=True)

            img = qr.make_image(fill_color="black", back_color="white")

            buffered = BytesIO()
            img.save(buffered, format="PNG")
            return base64.b64encode(buffered.getvalue()).decode('ascii')

        except Exception as e:
            logger.error(
                f"❌ QR generation failed for ticket "
                f"{getattr(ticket, 'unique_code', '<unknown>')}: {e}"
            )
            return None

    @classmethod
    def _generate_qr_base64(cls, ticket):
        """Alias for `_get_qr_base64` — kept for backwards compatibility."""
        return cls._get_qr_base64(ticket)

    # ============ IMAGE (QR) SENDING ============

    @classmethod
    def send_image_base64(cls, phone_number, base64_image, caption=""):
        """
        Send a base64-encoded PNG via WhatsApp.

        Used by SendTicketView and SendTestQRView to deliver the signed QR
        image. Falls back through multiple gateway endpoints, same as
        `send_pdf`.
        """
        try:
            formatted_number = cls._format_phone_number(phone_number)
            if not formatted_number:
                error_msg = f"Invalid phone number: {phone_number}"
                logger.error(f"❌ {error_msg}")
                return {'error': error_msg}

            # Validate base64
            try:
                base64.b64decode(base64_image)
            except Exception as e:
                logger.error(f"❌ Invalid image base64 data: {e}")
                return {'error': 'Invalid image data'}

            payload = {
                'phone_number': formatted_number,
                'file': base64_image,
                'filename': 'ticket_qr.png',
                'caption': caption,
                'type': 'image',
            }

            logger.info(f"📤 Sending QR image to: {formatted_number}")

            # Try the image endpoint first
            try:
                response = requests.post(
                    f"{cls.GATEWAY_URL}/api/send_image",
                    json=payload,
                    timeout=60
                )
                if response.ok:
                    logger.info(f"✅ QR image sent to {formatted_number}")
                    return response.json()
                else:
                    logger.warning(
                        f"⚠️ send_image returned {response.status_code}: {response.text[:200]}"
                    )
            except Exception as e:
                logger.warning(f"⚠️ send_image failed: {e}")

            # Fall back to send_document (Baileys treats PNGs fine here)
            try:
                logger.info(f"📤 Trying send_document for QR image...")
                response = requests.post(
                    f"{cls.GATEWAY_URL}/api/send_document",
                    json=payload,
                    timeout=60
                )
                if response.ok:
                    logger.info(f"✅ QR image sent via send_document to {formatted_number}")
                    return response.json()
            except Exception as e:
                logger.warning(f"⚠️ send_document failed for QR image: {e}")

            # Last resort: send_message with a data URL marker
            try:
                logger.info(f"📤 Trying fallback: send_message...")
                fallback_payload = {
                    'phone_number': formatted_number,
                    'message': f"{caption}\n\n[QR image attached]",
                    'file_data': base64_image,
                    'filename': 'ticket_qr.png',
                }
                response = requests.post(
                    f"{cls.GATEWAY_URL}/api/send_message",
                    json=fallback_payload,
                    timeout=60
                )
                if response.ok:
                    logger.info(f"✅ QR image sent via fallback to {formatted_number}")
                    return response.json()
            except Exception as e:
                logger.error(f"❌ All QR image sending attempts failed: {e}")

            return {'error': 'All QR image sending methods failed'}

        except requests.exceptions.ConnectionError:
            logger.error(f"❌ Cannot connect to WhatsApp gateway at {cls.GATEWAY_URL}")
            return {'error': 'Gateway connection failed'}
        except requests.exceptions.Timeout:
            logger.error(f"❌ Gateway timeout")
            return {'error': 'Gateway timeout'}
        except Exception as e:
            logger.error(f"Failed to send QR image: {str(e)}")
            return {'error': str(e)}

    # ============ BOOKING CONFIRMATION ============

    @classmethod
    def _format_booking_message(cls, booking, tickets):
        """Format booking confirmation message with enhanced details."""
        if not tickets:
            return "⚠️ No tickets found for this booking."

        # Group tickets by tier
        tier_groups = {}
        for ticket in tickets:
            tier_name = ticket.tier.name if ticket.tier else 'General'
            if tier_name not in tier_groups:
                tier_groups[tier_name] = []
            tier_groups[tier_name].append(ticket)

        # Build ticket details section
        ticket_section = ""
        for tier_name, tier_tickets in tier_groups.items():
            ticket_section += f"\n*{tier_name}*: {len(tier_tickets)} ticket(s)"
            for ticket in tier_tickets:
                attendee = ticket.attendee_name or 'Guest'
                ticket_section += f"\n  • *{ticket.unique_code}* - {attendee}"

        # Build slot information
        slot_info = ""
        if booking.session:
            slot_info = f"\n*Slot:* {booking.session.start_time.strftime('%I:%M %p')} - {booking.session.end_time.strftime('%I:%M %p')}"

        # Slot allocation message if available
        allocation_msg = ""
        if hasattr(booking, 'metadata') and booking.metadata:
            allocation_msg = booking.metadata.get('slot_allocation_message', '')
            if allocation_msg:
                allocation_msg = f"\n*Allocation:* {allocation_msg}"

        # Venue information
        venue_info = ""
        if booking.event and booking.event.venue:
            venue_info = f"\n*Venue:* {booking.event.venue.name}"
            if booking.event.venue.city:
                venue_info += f"\n*Location:* {booking.event.venue.city}, {booking.event.venue.state or ''}"

        message = f"""
🎫 *Booking Confirmation!*

*Booking Reference:* {booking.booking_reference}
*Event:* {booking.event.title if booking.event else 'Event'}
*Date:* {booking.event.start_date.strftime('%d %b %Y') if booking.event and booking.event.start_date else 'TBD'}
*Time:* {booking.event.start_date.strftime('%I:%M %p') if booking.event and booking.event.start_date else 'TBD'}{slot_info}{allocation_msg}{venue_info}

*Tickets Details:*{ticket_section}

*Total Amount:* ₹{booking.total_amount}

📌 *Next Steps:*
1. Share your booking reference at the venue
2. Complete payment at the counter
3. You'll receive your tickets after payment confirmation

🔐 *Keep this message safe.*
"""
        return message

    @classmethod
    def send_booking_confirmation(cls, booking):
        """Send booking confirmation with enhanced details."""
        tickets = booking.tickets.all()

        if not tickets:
            logger.warning(f"⚠️ No tickets for booking: {booking.booking_reference}")
            return {'error': 'No tickets found'}

        phone_number = cls._format_phone_number(
            booking.whatsapp_number or booking.customer_phone
        )
        if not phone_number:
            logger.warning(f"⚠️ No valid phone number for booking: {booking.booking_reference}")
            return {'error': 'No valid phone number'}

        message = cls._format_booking_message(booking, tickets)

        logger.info(f"📤 Sending booking confirmation for {booking.booking_reference}")
        logger.info(f"  Tickets: {tickets.count()}")
        logger.info(f"  Total: ₹{booking.total_amount}")

        result = cls.send_message(phone_number, message)

        if result and 'error' not in result:
            logger.info(f"✅ Booking confirmation sent for {booking.booking_reference}")
        else:
            logger.error(f"❌ Failed to send booking confirmation: {result}")

        return result

    @classmethod
    def send_slot_allocation_notification(cls, booking, allocation_message):
        """Send notification about automatic slot allocation."""
        if not booking.session:
            return {'error': 'No slot allocated'}

        phone_number = cls._format_phone_number(
            booking.whatsapp_number or booking.customer_phone
        )
        if not phone_number:
            return {'error': 'No valid phone number'}

        start_time = booking.session.start_time.strftime('%I:%M %p')
        end_time = booking.session.end_time.strftime('%I:%M %p')

        is_reallocated = (
            "based on your preference" not in allocation_message
            and "Slot confirmed" not in allocation_message
        )

        status_emoji = "✅" if not is_reallocated else "🔄"
        status_text = "Confirmed!" if not is_reallocated else "Re-allocated!"

        message = f"""
{status_emoji} *Slot {status_text}*

Your slot for *{booking.event.title}* has been {status_text.lower()}

*Booking Reference:* {booking.booking_reference}
*Slot Time:* {start_time} - {end_time}
*Status:* ✅ Confirmed

{allocation_message}

{f"💡 *Note:* Your original slot was full, so we've automatically allocated the next available slot based on your preferences." if is_reallocated else ""}

Please arrive at the venue on time with your ticket QR code.

Thank you for choosing TicketVolt! 🎉
    """
        return cls.send_message(phone_number, message)

    # ============ TICKET SENDING (PDF) ============

    @classmethod
    def send_ticket(cls, booking):
        """Send ticket details and QR code as PDF via WhatsApp."""
        try:
            from .pdf_service import PDFService

            tickets = booking.tickets.all()

            if not tickets:
                return {'success': False, 'error': 'No tickets found for this booking'}

            phone_number = booking.whatsapp_number or booking.customer_phone

            if not phone_number:
                logger.warning(f"⚠️ No phone number for booking: {booking.booking_reference}")
                return {'success': False, 'error': 'No phone number available'}

            formatted_number = cls._format_phone_number(phone_number)
            if not formatted_number:
                logger.warning(f"⚠️ Invalid phone number for booking {booking.booking_reference}: {phone_number}")
                return {'success': False, 'error': f'Invalid phone number: {phone_number}'}

            logger.info(f"📤 Sending tickets to customer: {formatted_number}")
            logger.info(f"📊 Booking: {booking.booking_reference}, Tickets: {tickets.count()}")

            # Enhanced booking confirmation
            confirmation_result = cls.send_booking_confirmation(booking)

            pdf_sent = False

            # Combined PDF (all tickets)
            try:
                combined_pdf = PDFService.generate_booking_pdf(booking)
                if combined_pdf:
                    result = cls.send_pdf(
                        formatted_number,
                        combined_pdf,
                        f"all_tickets_{booking.booking_reference}.pdf",
                        f"🎫 All Tickets for: {booking.event.title if booking.event else 'Event'}"
                    )
                    if result and 'error' not in result:
                        logger.info(f"✅ Combined PDF sent for booking: {booking.booking_reference}")
                        pdf_sent = True
                    else:
                        logger.warning(f"⚠️ Failed to send combined PDF: {result}")
            except Exception as e:
                logger.warning(f"⚠️ Failed to send combined PDF: {e}")

            # Individual PDFs
            for ticket in tickets:
                try:
                    pdf_base64 = PDFService.generate_ticket_pdf(ticket, booking)

                    if pdf_base64:
                        caption = (
                            f"🎫 Ticket: {ticket.unique_code}\n"
                            f"Attendee: {ticket.attendee_name or booking.customer_name}"
                        )
                        filename = f"ticket_{ticket.unique_code}.pdf"

                        result = cls.send_pdf(formatted_number, pdf_base64, filename, caption)

                        if result and 'error' not in result:
                            logger.info(f"✅ PDF sent for ticket: {ticket.unique_code}")
                            pdf_sent = True
                        else:
                            logger.warning(f"⚠️ Failed to send PDF for {ticket.unique_code}: {result}")
                    else:
                        logger.warning(f"⚠️ No PDF generated for ticket: {ticket.unique_code}")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to process ticket {ticket.unique_code}: {e}")

            return {
                'success': True,
                'message': 'Tickets sent as PDF via WhatsApp',
                'pdf_sent': pdf_sent,
                'ticket_count': tickets.count(),
                'phone_number': formatted_number
            }

        except Exception as e:
            logger.error(f"Failed to send ticket: {str(e)}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}

    @classmethod
    def _format_ticket_message(cls, booking, tickets):
        """Legacy text-only ticket formatting (kept for compatibility)."""
        ticket_details = ""
        for i, ticket in enumerate(tickets, 1):
            ticket_details += f"""
┌──────────────
│ 🎫 Ticket #{i}
├──────────────
│ Code: {ticket.unique_code}
│ Tier: {ticket.tier.name if ticket.tier else 'General'}
│ Attendee: {ticket.attendee_name or booking.customer_name}
└──────────────
"""

        message = f"""
🎫 *Ticket Confirmation*

*Event:* {booking.event.title}
*Date:* {booking.event.start_date.strftime('%d %b %Y, %I:%M %p') if booking.event and booking.event.start_date else 'TBD'}
*Venue:* {booking.event.venue.name if booking.event and booking.event.venue else 'TBD'}

*Booking Reference:* {booking.booking_reference}
*Total Amount:* ₹{booking.total_amount}

{ticket_details}

📌 *How to use:*
1. Open the PDF attached to this message
2. Show the QR code at the entrance
3. Enjoy the event! 🎉

🔐 *Keep this message and PDF safe.*
    """
        return message

    # ============ OTHER METHODS ============

    @classmethod
    def send_event_reminder(cls, booking):
        """Send event reminder 24 hours before."""
        phone_number = cls._format_phone_number(
            booking.whatsapp_number or booking.customer_phone
        )
        if not phone_number:
            return {'error': 'No valid phone number'}

        message = f"""
⏰ *Event Reminder!*

Don't forget about your event tomorrow!

*Event:* {booking.event.title}
*Date:* {booking.event.start_date.strftime('%d %b %Y, %I:%M %p') if booking.event and booking.event.start_date else 'TBD'}
*Venue:* {booking.event.venue.name if booking.event and booking.event.venue else 'TBD'}

*Booking:* {booking.booking_reference}

Open your PDF ticket and scan the QR code at the entrance.
See you there! 🎉
        """
        return cls.send_message(phone_number, message)

    @classmethod
    def send_checkin_confirmation(cls, ticket):
        """Send confirmation when ticket is scanned."""
        if not ticket or not ticket.booking:
            return {'error': 'Invalid ticket or booking'}

        phone_number = cls._format_phone_number(
            ticket.booking.whatsapp_number or ticket.booking.customer_phone
        )
        if not phone_number:
            return {'error': 'No valid phone number'}

        message = f"""
✅ *Check-in Successful!*

*Event:* {ticket.event.title if ticket.event else 'Event'}
*Ticket:* {ticket.unique_code}
*Attendee:* {ticket.attendee_name or 'Guest'}
*Time:* {ticket.check_in_time.strftime('%d %b %Y, %I:%M %p') if ticket.check_in_time else 'Just now'}

Thank you for attending! 🎉
        """
        return cls.send_message(phone_number, message)

    @classmethod
    def test_connection(cls):
        """Test WhatsApp gateway connection."""
        try:
            endpoints = ['/api/health', '/health', '/', '/api/status']
            for endpoint in endpoints:
                try:
                    response = requests.get(
                        f"{cls.GATEWAY_URL}{endpoint}",
                        timeout=10
                    )
                    if response.ok:
                        logger.info(f"✅ Gateway connected at {endpoint}")
                        return True
                except:
                    continue
            return False
        except Exception as e:
            logger.error(f"Gateway connection test failed: {e}")
            return False

    @classmethod
    def get_gateway_status(cls):
        """Get detailed gateway status."""
        try:
            response = requests.get(
                f"{cls.GATEWAY_URL}/api/status",
                timeout=10
            )
            if response.ok:
                return response.json()
            return {'connected': False, 'error': response.text}
        except Exception as e:
            return {'connected': False, 'error': str(e)}

    # ============ DEPRECATED METHODS ============
    # These had no callers in the codebase. Keep them as stubs so any
    # future straggler gets a clear error rather than silent behaviour.

    @classmethod
    def send_image(cls, phone_number, image_data, caption=""):
        """DEPRECATED: use send_image_base64 or send_ticket instead."""
        logger.warning("⚠️ send_image is deprecated. Use send_image_base64 or send_ticket.")
        return {'success': False, 'error': 'Deprecated. Use send_image_base64 or send_ticket.'}

    @classmethod
    def send_qr_code(cls, phone_number, qr_code_data, caption=""):
        """DEPRECATED: use send_image_base64 or send_ticket instead."""
        logger.warning("⚠️ send_qr_code is deprecated. Use send_image_base64 or send_ticket.")
        return {'success': False, 'error': 'Deprecated. Use send_image_base64 or send_ticket.'}

    @classmethod
    def send_test_image(cls, phone_number):
        """DEPRECATED: use SendTestQRView instead."""
        logger.warning("⚠️ send_test_image is deprecated.")
        return {'success': False, 'error': 'Deprecated. Use SendTestQRView.'}

    @classmethod
    def send_image_as_file(cls, phone_number, qr_base64, caption=""):
        """DEPRECATED: use send_image_base64 or send_ticket instead."""
        logger.warning("⚠️ send_image_as_file is deprecated. Use send_image_base64 or send_ticket.")
        return {'success': False, 'error': 'Deprecated. Use send_image_base64 or send_ticket.'}