# backend/ticket_bookings/api/ticket_generator.py
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import logging
import os

import qrcode
from django.conf import settings
from django.utils import timezone

from ..services.qr_payload import serialise_ticket_qr_payload

logger = logging.getLogger(__name__)


class TicketGenerator:
    """
    Generate tickets by overlaying database content on template images.

    Storage-agnostic: uses `template.image.open()` instead of
    `template.image.path`. This works with local filesystem, Tigris,
    Backblaze B2, S3, R2, and any other Django storage backend.
    """

    def __init__(self, template=None, format_type='png'):
        self.template = template
        self.format_type = format_type
        self.font_path = self._get_font_path()

    def _get_font_path(self):
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
        if self.font_path and os.path.exists(self.font_path):
            try:
                return ImageFont.truetype(self.font_path, size)
            except Exception:
                pass
        return ImageFont.load_default()

    def _get_text_size(self, draw, text, font):
        try:
            bbox = draw.textbbox((0, 0), text, font=font)
            return bbox[2] - bbox[0], bbox[3] - bbox[1]
        except Exception:
            return draw.textsize(text, font=font)

    def _get_event_template(self, event, template_type='ticket'):
        from ..models import EventTemplate
        try:
            template = EventTemplate.objects.get(
                event=event,
                template_type__slug=template_type,
                is_default=True,
                is_active=True,
            )
            return template
        except EventTemplate.DoesNotExist:
            return EventTemplate.objects.filter(
                event=event,
                template_type__slug=template_type,
                is_active=True,
            ).first()
        except Exception:
            logger.exception('Error getting event template for event %s', event.pk)
            return None

    def _open_template_image(self, template):
        if not template or not template.image:
            return None
        try:
            template.image.open('rb')
            return Image.open(template.image).convert('RGB')
        except FileNotFoundError:
            logger.error(
                'Template image not found on storage: %s', template.image.name
            )
            return None
        except NotImplementedError:
            logger.error(
                'Storage backend does not support open(): %s', template.image.name
            )
            return None
        except Exception:
            logger.exception('Failed to open template image')
            return None
        finally:
            try:
                template.image.close()
            except Exception:
                pass

    def _format_date_for_ticket(self, start_date, end_date):
        if not start_date:
            return ''

        if timezone.is_naive(start_date):
            start_date = timezone.make_aware(
                start_date, timezone.get_current_timezone()
            )
        else:
            start_date = timezone.localtime(start_date)

        if end_date:
            if timezone.is_naive(end_date):
                end_date = timezone.make_aware(
                    end_date, timezone.get_current_timezone()
                )
            else:
                end_date = timezone.localtime(end_date)

            if start_date.date() != end_date.date():
                sd, ed = start_date, end_date
                if sd.strftime('%b') == ed.strftime('%b'):
                    return f'{sd.day} - {ed.day} {sd.strftime("%b")} {sd.year}'
                return (
                    f'{sd.day} {sd.strftime("%b")} - '
                    f'{ed.day} {ed.strftime("%b")} {sd.year}'
                )

        day = start_date.day
        if 4 <= day <= 20 or 24 <= day <= 30:
            suffix = 'th'
        else:
            suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(day % 10, 'th')
        return f'{day}{suffix} {start_date.strftime("%B %Y")}'

    def generate_ticket_image(self, ticket, booking, event, custom_config=None):
        try:
            template = self._get_event_template(event, 'ticket')
            if not template or not template.image:
                logger.warning('No template found for event %s', event.id)
                return self._generate_fallback_ticket(ticket, booking, event)

            img = self._open_template_image(template)
            if img is None:
                logger.warning(
                    'Falling back to plain ticket for event %s', event.id
                )
                return self._generate_fallback_ticket(ticket, booking, event)

            draw = ImageDraw.Draw(img)
            width, height = img.size

            title_y = int(height * 0.28) if height > 500 else 130
            self._draw_text_px(
                draw, img, event.title.upper(), width // 2, title_y,
                32, '#D69E2E', 'center',
            )

            date_display = self._format_date_for_ticket(
                event.start_date, event.end_date
            )
            date_y = int(height * 0.38) if height > 500 else 190
            self._draw_text_px(
                draw, img, date_display, width // 2, date_y,
                34, '#1A202C', 'center',
            )

            date_secondary = ''
            if event.end_date and event.start_date:
                if (
                    timezone.localtime(event.start_date).date()
                    != timezone.localtime(event.end_date).date()
                ):
                    date_secondary = timezone.localtime(
                        event.start_date
                    ).strftime('%B %Y').upper()
            sec_y = int(height * 0.45) if height > 500 else 235
            self._draw_text_px(
                draw, img, date_secondary, width // 2, sec_y,
                22, '#4A5568', 'center',
            )

            details_y = int(height * 0.58) if height > 500 else 275
            label_x = int(width * 0.1) if width > 700 else 80
            value_x = int(width * 0.27) if width > 700 else 220

            self._draw_text_px(draw, img, 'Ticket Code:', label_x, details_y, 16, '#4A5568', 'left')
            self._draw_text_px(draw, img, 'Attendee:', label_x, details_y + 38, 16, '#4A5568', 'left')
            self._draw_text_px(draw, img, 'Booking Ref:', label_x, details_y + 76, 16, '#4A5568', 'left')

            self._draw_text_px(draw, img, ticket.unique_code, value_x, details_y, 16, '#1A202C', 'left')
            attendee_name = ticket.attendee_name or booking.customer_name or 'Guest'
            self._draw_text_px(draw, img, attendee_name, value_x, details_y + 38, 16, '#1A202C', 'left')
            self._draw_text_px(draw, img, booking.booking_reference, value_x, details_y + 76, 16, '#1A202C', 'left')

            venue_text = ''
            if event.venue:
                parts = [
                    event.venue.name,
                    event.venue.address_line1,
                    event.venue.address_line2,
                    event.venue.city,
                    event.venue.state,
                ]
                venue_text = ', '.join(p for p in parts if p)

            venue_lines = self._wrap_text(venue_text, 45)
            venue_y = details_y + 130
            self._draw_text_px(draw, img, '📍', label_x, venue_y - 5, 18, '#D69E2E', 'left')
            self._draw_text_px(draw, img, 'Venue:', label_x + 30, venue_y - 5, 16, '#4A5568', 'left')
            for i, line in enumerate(venue_lines):
                self._draw_text_px(
                    draw, img, line, label_x, venue_y + 25 + (i * 22),
                    14, '#2D3748', 'left',
                )

            qr_img = self._generate_qr_code(ticket)
            if qr_img:
                qr_size = 140
                qr_img = qr_img.resize((qr_size, qr_size))
                qr_x = width - qr_size - int(width * 0.08)
                qr_y = int(height * 0.55)
                img.paste(qr_img, (qr_x, qr_y))

            buffer = BytesIO()
            img.save(buffer, format='PNG', quality=95)
            buffer.seek(0)
            logger.info('Ticket image generated for %s', ticket.unique_code)
            return buffer
        except Exception:
            logger.exception('Error generating ticket image')
            return self._generate_fallback_ticket(ticket, booking, event)

    def _wrap_text(self, text, max_chars):
        if not text:
            return []
        words = text.split()
        lines, line = [], ''
        for word in words:
            if len(line) + len(word) < max_chars:
                line += word + ' '
            else:
                lines.append(line.strip())
                line = word + ' '
        if line:
            lines.append(line.strip())
        return lines

    def _generate_fallback_ticket(self, ticket, booking, event):
        try:
            width, height = 800, 500
            img = Image.new('RGB', (width, height), 'white')
            draw = ImageDraw.Draw(img)
            font = self._get_font(24)
            font_small = self._get_font(16)

            draw.rectangle([20, 20, width - 20, height - 20], outline='#2D3748', width=3)
            draw.rectangle([25, 25, width - 25, height - 25], outline='#D69E2E', width=1)

            event_title = event.title if event else 'EVENT'
            draw.text((width // 2, 50), event_title.upper(), fill='#D69E2E', font=font, anchor='mt')

            date_display = self._format_date_for_ticket(event.start_date, event.end_date)
            draw.text((width // 2, 95), date_display, fill='#1A202C', font=font, anchor='mt')

            venue_text = ''
            if event and event.venue:
                parts = [event.venue.name, event.venue.city]
                venue_text = ', '.join(p for p in parts if p)
            if venue_text:
                draw.text((width // 2, 140), venue_text, fill='#4A5568', font=font_small, anchor='mt')

            draw.line([80, 175, width - 80, 175], fill='#E2E8F0', width=1)

            draw.text((80, 200), f'Ticket Code: {ticket.unique_code}', fill='#1A202C', font=font_small)
            attendee_name = ticket.attendee_name or booking.customer_name or 'Guest'
            draw.text((80, 230), f'Attendee: {attendee_name}', fill='#1A202C', font=font_small)
            draw.text((80, 260), f'Booking Ref: {booking.booking_reference}', fill='#1A202C', font=font_small)

            qr_img = self._generate_qr_code(ticket)
            if qr_img:
                qr_img = qr_img.resize((150, 150))
                img.paste(qr_img, (width - 190, 190))

            draw.text((width // 2, height - 50), 'ADMIT ONE', fill='#E53E3E', font=font, anchor='mt')

            buffer = BytesIO()
            img.save(buffer, format='PNG', quality=95)
            buffer.seek(0)
            return buffer
        except Exception:
            logger.exception('Error generating fallback ticket')
            return None

    def _draw_text_px(self, draw, img, text, x, y, font_size, color, align='center'):
        try:
            if not text:
                return
            font = self._get_font(font_size)
            text_width, _ = self._get_text_size(draw, text, font)
            if align == 'center':
                x = x - text_width // 2
            elif align == 'right':
                x = x - text_width
            draw.text((x, y), text, font=font, fill=color)
        except Exception:
            logger.exception('Error drawing text')

    def _generate_qr_code(self, ticket):
        """Return a PIL image of the QR, using the CANONICAL payload."""
        try:
            payload = serialise_ticket_qr_payload(ticket, include_ids=True)
            qr = qrcode.QRCode(
                version=None,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=6,
                border=2,
            )
            qr.add_data(payload)
            qr.make(fit=True)
            return qr.make_image(fill_color='black', back_color='white')
        except Exception:
            logger.exception('Error generating QR code')
            return None

    def generate_ticket_png(self, ticket, booking, event):
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
        except Exception:
            logger.exception('Error generating PNG ticket')
            return None

    def generate_ticket_pdf(self, ticket, booking, event):
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
            scale = min(width / img_width, height / img_height) * 0.9
            new_width, new_height = img_width * scale, img_height * scale
            x_pos = (width - new_width) / 2
            y_pos = (height - new_height) / 2

            png_buffer.seek(0)
            c.drawImage(
                ImageReader(png_buffer),
                x_pos, y_pos,
                width=new_width, height=new_height,
            )
            c.save()
            pdf_buffer.seek(0)
            return pdf_buffer
        except Exception:
            logger.exception('Error generating PDF ticket')
            return None