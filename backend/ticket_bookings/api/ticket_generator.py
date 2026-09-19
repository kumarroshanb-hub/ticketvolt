# backend/ticket_bookings/api/ticket_generator.py
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import qrcode
import os
import logging
from django.conf import settings
from django.utils import timezone
import base64
import random

logger = logging.getLogger(__name__)


class TicketGenerator:
    """
    Generate tickets by overlaying database content on template images.

    ✅ Storage-agnostic: uses `template.image.open()` instead of
       `template.image.path`. This works with local filesystem, Tigris,
       Backblaze B2, S3, R2, and any other Django storage backend.
    """

    def __init__(self, template=None, format_type='png'):
        self.template = template
        self.format_type = format_type
        self.font_path = self._get_font_path()

    def _get_font_path(self):
        """Get path to a suitable font (local filesystem — fine, fonts
        are shipped with the container, not stored on object storage)."""
        font_paths = [
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
            '/System/Library/Fonts/Helvetica.ttc',
            os.path.join(settings.BASE_DIR, 'fonts', 'arial.ttf'),
        ]

        for path in font_paths:
            if os.path.exists(path):
                return path
        return None

    def _get_font(self, size, bold=False):
        """Get font for given size"""
        if self.font_path and os.path.exists(self.font_path):
            try:
                return ImageFont.truetype(self.font_path, size)
            except Exception:
                pass
        return ImageFont.load_default()

    def _get_text_size(self, draw, text, font):
        """Get text bounding box size"""
        try:
            bbox = draw.textbbox((0, 0), text, font=font)
            return bbox[2] - bbox[0], bbox[3] - bbox[1]
        except Exception:
            return draw.textsize(text, font=font)

    def _get_event_template(self, event, template_type='ticket'):
        """Get the template for an event by type"""
        from ..models import EventTemplate

        try:
            template = EventTemplate.objects.get(
                event=event,
                template_type__slug=template_type,
                is_default=True,
                is_active=True
            )
            return template
        except EventTemplate.DoesNotExist:
            template = EventTemplate.objects.filter(
                event=event,
                template_type__slug=template_type,
                is_active=True
            ).first()
            if template:
                return template
            return None
        except Exception as e:
            logger.error(f"❌ Error getting event template: {str(e)}")
            return None

    def _open_template_image(self, template):
        """
        ✅ Storage-agnostic image loader.

        Returns a PIL Image object, or None if the file can't be opened.
        Works with local filesystem, Tigris, B2, S3, R2, and any other
        Django storage backend.
        """
        if not template or not template.image:
            return None

        try:
            # `.open('rb')` tells the storage backend to fetch the file
            # stream from wherever it lives (local disk OR object storage).
            # PIL then reads directly from that stream.
            template.image.open('rb')
            img = Image.open(template.image)
            img = img.convert('RGB')
            return img
        except FileNotFoundError:
            logger.error(
                f"❌ Template image not found on storage: {template.image.name}"
            )
            return None
        except NotImplementedError:
            # Defensive: some storage backends don't support `open()`.
            # (All mainstream S3-compatible backends do, including Tigris.)
            logger.error(
                f"❌ Storage backend does not support open(): {template.image.name}"
            )
            return None
        except Exception as e:
            logger.error(f"❌ Failed to open template image: {e}")
            return None
        finally:
            # Close the file handle once PIL has read it, to free
            # the connection back to the storage backend.
            try:
                template.image.close()
            except Exception:
                pass

    def _format_date_for_ticket(self, start_date, end_date):
        """
        Format date for ticket display - shows range or single date.
        Returns: formatted date string
        """
        if not start_date:
            return ""

        # Convert to local timezone
        if timezone.is_naive(start_date):
            start_date = timezone.make_aware(
                start_date, timezone.get_current_timezone()
            )
        else:
            start_date = timezone.localtime(start_date)

        # Check if multi-day
        if end_date:
            if timezone.is_naive(end_date):
                end_date = timezone.make_aware(
                    end_date, timezone.get_current_timezone()
                )
            else:
                end_date = timezone.localtime(end_date)

            start_date_only = start_date.date()
            end_date_only = end_date.date()

            if start_date_only != end_date_only:
                # Multi-day: "06 - 07 Sep 2026"
                start_day = start_date.day
                end_day = end_date.day
                start_month = start_date.strftime('%b')
                end_month = end_date.strftime('%b')
                year = start_date.strftime('%Y')

                if start_month == end_month:
                    return f"{start_day} - {end_day} {end_month} {year}"
                else:
                    return f"{start_day} {start_month} - {end_day} {end_month} {year}"

        # Single day: "6th September 2026"
        day = start_date.day
        if 4 <= day <= 20 or 24 <= day <= 30:
            suffix = 'th'
        else:
            suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(day % 10, 'th')
        return f"{day}{suffix} {start_date.strftime('%B %Y')}"

    def generate_ticket_image(self, ticket, booking, event, custom_config=None):
        """
        Generate a ticket image with overlaid content from database.
        """
        try:
            # Get event-specific template
            template = self._get_event_template(event, 'ticket')

            if not template or not template.image:
                logger.warning(f"⚠️ No template found for event {event.id}")
                return self._generate_fallback_ticket(ticket, booking, event)

            # ✅ Load template image from storage (Tigris / B2 / local / etc.)
            img = self._open_template_image(template)
            if img is None:
                logger.warning(
                    f"⚠️ Falling back to plain ticket for event {event.id}"
                )
                return self._generate_fallback_ticket(ticket, booking, event)

            draw = ImageDraw.Draw(img)

            # Get image dimensions
            width, height = img.size

            # ============================================
            # DYNAMIC OVERLAY DATA
            # ============================================

            # 1. Event Title
            title_y = int(height * 0.28) if height > 500 else 130
            self._draw_text_px(
                draw, img, event.title.upper(), width // 2, title_y,
                32, '#D69E2E', 'center'
            )

            # 2. Date - Single or Range
            date_display = self._format_date_for_ticket(
                event.start_date, event.end_date
            )
            date_y = int(height * 0.38) if height > 500 else 190
            self._draw_text_px(
                draw, img, date_display, width // 2, date_y,
                34, '#1A202C', 'center'
            )

            # 3. Secondary date (if multi-day)
            date_secondary = ""
            if event and event.end_date and event.start_date:
                start_date_only = timezone.localtime(event.start_date).date()
                end_date_only = timezone.localtime(event.end_date).date()
                if start_date_only != end_date_only:
                    date_secondary = timezone.localtime(
                        event.start_date
                    ).strftime('%B %Y').upper()
            sec_y = int(height * 0.45) if height > 500 else 235
            self._draw_text_px(
                draw, img, date_secondary, width // 2, sec_y,
                22, '#4A5568', 'center'
            )

            # ============================================
            # TICKET DETAILS
            # ============================================
            details_y = int(height * 0.58) if height > 500 else 275
            label_x = int(width * 0.1) if width > 700 else 80
            value_x = int(width * 0.27) if width > 700 else 220

            # Labels
            self._draw_text_px(draw, img, "Ticket Code:", label_x, details_y, 16, '#4A5568', 'left')
            self._draw_text_px(draw, img, "Attendee:", label_x, details_y + 38, 16, '#4A5568', 'left')
            self._draw_text_px(draw, img, "Booking Ref:", label_x, details_y + 76, 16, '#4A5568', 'left')

            # Values
            ticket_code = ticket.unique_code if ticket else ""
            self._draw_text_px(draw, img, ticket_code, value_x, details_y, 16, '#1A202C', 'left')

            attendee_name = ticket.attendee_name or booking.customer_name or "Guest"
            self._draw_text_px(draw, img, attendee_name, value_x, details_y + 38, 16, '#1A202C', 'left')

            booking_ref = booking.booking_reference if booking else ""
            self._draw_text_px(draw, img, booking_ref, value_x, details_y + 76, 16, '#1A202C', 'left')

            # ============================================
            # VENUE
            # ============================================
            venue_text = ""
            if event and event.venue:
                venue_parts = []
                if event.venue.name: venue_parts.append(event.venue.name)
                if event.venue.address_line1: venue_parts.append(event.venue.address_line1)
                if event.venue.address_line2: venue_parts.append(event.venue.address_line2)
                if event.venue.city: venue_parts.append(event.venue.city)
                if event.venue.state: venue_parts.append(event.venue.state)
                venue_text = ", ".join(venue_parts)

            venue_lines = self._wrap_text(venue_text, 45)
            venue_y = details_y + 130

            self._draw_text_px(draw, img, "📍", label_x, venue_y - 5, 18, '#D69E2E', 'left')
            self._draw_text_px(draw, img, "Venue:", label_x + 30, venue_y - 5, 16, '#4A5568', 'left')

            for i, line in enumerate(venue_lines):
                self._draw_text_px(
                    draw, img, line, label_x, venue_y + 25 + (i * 22),
                    14, '#2D3748', 'left'
                )

            # ============================================
            # QR CODE
            # ============================================
            qr_img = self._generate_qr_code(ticket)
            if qr_img:
                qr_size = 140
                qr_img = qr_img.resize((qr_size, qr_size))
                qr_x = width - qr_size - int(width * 0.08)
                qr_y = int(height * 0.55)
                img.paste(qr_img, (qr_x, qr_y))

            # Save to buffer
            buffer = BytesIO()
            img.save(buffer, format='PNG', quality=95)
            buffer.seek(0)

            logger.info(f"✅ Ticket image generated for {ticket.unique_code}")
            return buffer

        except Exception as e:
            logger.error(f"❌ Error generating ticket image: {str(e)}")
            import traceback
            traceback.print_exc()
            return self._generate_fallback_ticket(ticket, booking, event)

    def _wrap_text(self, text, max_chars):
        """Wrap text to max_chars per line"""
        if not text:
            return []
        words = text.split()
        lines = []
        line = ""
        for word in words:
            if len(line) + len(word) < max_chars:
                line += word + " "
            else:
                lines.append(line.strip())
                line = word + " "
        if line:
            lines.append(line.strip())
        return lines

    def _generate_fallback_ticket(self, ticket, booking, event):
        """Generate a simple fallback ticket if template is not available"""
        try:
            width, height = 800, 500
            img = Image.new('RGB', (width, height), 'white')
            draw = ImageDraw.Draw(img)
            font = self._get_font(24)
            font_small = self._get_font(16)

            draw.rectangle([20, 20, width - 20, height - 20], outline='#2D3748', width=3)
            draw.rectangle([25, 25, width - 25, height - 25], outline='#D69E2E', width=1)

            event_title = event.title if event else "EVENT"
            draw.text((width // 2, 50), event_title.upper(), fill='#D69E2E', font=font, anchor='mt')

            date_display = self._format_date_for_ticket(event.start_date, event.end_date)
            draw.text((width // 2, 95), date_display, fill='#1A202C', font=font, anchor='mt')

            venue_text = ""
            if event and event.venue:
                venue_parts = []
                if event.venue.name: venue_parts.append(event.venue.name)
                if event.venue.city: venue_parts.append(event.venue.city)
                venue_text = ", ".join(venue_parts)
            if venue_text:
                draw.text((width // 2, 140), venue_text, fill='#4A5568', font=font_small, anchor='mt')

            draw.line([80, 175, width - 80, 175], fill='#E2E8F0', width=1)

            draw.text((80, 200), f"Ticket Code: {ticket.unique_code}", fill='#1A202C', font=font_small)
            attendee_name = ticket.attendee_name or booking.customer_name or "Guest"
            draw.text((80, 230), f"Attendee: {attendee_name}", fill='#1A202C', font=font_small)
            draw.text((80, 260), f"Booking Ref: {booking.booking_reference}", fill='#1A202C', font=font_small)

            qr_img = self._generate_qr_code(ticket)
            if qr_img:
                qr_img = qr_img.resize((150, 150))
                img.paste(qr_img, (width - 190, 190))

            draw.text((width // 2, height - 50), "ADMIT ONE", fill='#E53E3E', font=font, anchor='mt')

            buffer = BytesIO()
            img.save(buffer, format='PNG', quality=95)
            buffer.seek(0)
            return buffer

        except Exception as e:
            logger.error(f"❌ Error generating fallback ticket: {str(e)}")
            return None

    def _draw_text_px(self, draw, img, text, x, y, font_size, color, align='center'):
        """Draw text on image with exact pixel coordinates"""
        try:
            if not text:
                return

            font = self._get_font(font_size)
            text_width, text_height = self._get_text_size(draw, text, font)

            if align == 'center':
                x = x - text_width // 2
            elif align == 'right':
                x = x - text_width

            draw.text((x, y), text, font=font, fill=color)

        except Exception as e:
            logger.error(f"❌ Error drawing text: {str(e)}")

    def _generate_qr_code(self, ticket):
        """Generate QR code for ticket"""
        try:
            qr = qrcode.QRCode(
                version=2,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=6,
                border=2,
            )
            qr_data = {
                'code': ticket.unique_code,
                'ticket_id': str(ticket.id),
                'event': ticket.event.title if ticket.event else 'Event',
                'attendee': ticket.attendee_name or 'Guest',
                'booking': ticket.booking.booking_reference if ticket.booking else ''
            }
            qr.add_data(str(qr_data))
            qr.make(fit=True)

            return qr.make_image(fill_color="black", back_color="white")

        except Exception as e:
            logger.error(f"❌ Error generating QR code: {str(e)}")
            return None

    def generate_ticket_png(self, ticket, booking, event):
        """Generate ticket as PNG image"""
        try:
            buffer = self.generate_ticket_image(ticket, booking, event)
            if buffer:
                buffer.seek(0)
                img = Image.open(buffer)
                png_buffer = BytesIO()
                img.save(png_buffer, format='PNG', quality=95)
                png_buffer.seek(0)
                return png_buffer
            return None
        except Exception as e:
            logger.error(f"❌ Error generating PNG ticket: {str(e)}")
            return None

    def generate_ticket_pdf(self, ticket, booking, event):
        """Generate ticket as PDF"""
        try:
            from reportlab.lib.pagesizes import letter, landscape
            from reportlab.pdfgen import canvas
            from reportlab.lib.utils import ImageReader

            png_buffer = self.generate_ticket_image(ticket, booking, event)
            if not png_buffer:
                return None

            pdf_buffer = BytesIO()
            png_buffer.seek(0)
            img = Image.open(png_buffer)

            c = canvas.Canvas(pdf_buffer, pagesize=landscape(letter))
            width, height = landscape(letter)

            img_width, img_height = img.size
            scale_x = width / img_width
            scale_y = height / img_height
            scale = min(scale_x, scale_y) * 0.9

            new_width = img_width * scale
            new_height = img_height * scale
            x_pos = (width - new_width) / 2
            y_pos = (height - new_height) / 2

            png_buffer.seek(0)
            img_reader = ImageReader(png_buffer)
            c.drawImage(img_reader, x_pos, y_pos, width=new_width, height=new_height)
            c.save()

            pdf_buffer.seek(0)
            return pdf_buffer

        except Exception as e:
            logger.error(f"❌ Error generating PDF ticket: {str(e)}")
            return None