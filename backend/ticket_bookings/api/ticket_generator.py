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

# ===========================================================================
# DEFAULT FIELD LAYOUT (REVAMPED MINIMALIST)
# ===========================================================================
DEFAULT_FIELD_CONFIG = {
    'event_title': {'x': 0.5, 'y': 0.15, 'font_size': 36, 'color': '#1A202C', 'align': 'center'},
    'event_date': {'x': 0.5, 'y': 0.23, 'font_size': 20, 'color': '#4A5568', 'align': 'center'},
    'event_date_secondary': {'x': 0.5, 'y': 0.28, 'font_size': 16, 'color': '#718096', 'align': 'center'},
    'venue_value': {'x': 0.5, 'y': 0.33, 'font_size': 16, 'color': '#4A5568', 'align': 'center'},
    'qr_code': {'x': 0.5, 'y': 0.45, 'size': 280},
    'attendee_label': {'x': 0.5, 'y': 0.78, 'font_size': 14, 'color': '#718096', 'align': 'center', 'enabled': True},
    'attendee_value': {'x': 0.5, 'y': 0.82, 'font_size': 24, 'color': '#1A202C', 'align': 'center'},
    'ticket_code_value': {'x': 0.5, 'y': 0.88, 'font_size': 16, 'color': '#A0AEC0', 'align': 'center', 'enabled': True},
    'organizer': {'enabled': False}, 'organizer_sub': {'enabled': False},
    'ticket_code_label': {'enabled': False}, 'booking_label': {'enabled': False},
    'booking_value': {'enabled': False}, 'venue_label': {'enabled': False},
    'admit_one': {'enabled': False}, 'ticket_number': {'enabled': False},
    'slot_time_label': {'enabled': False}, 'slot_time_value': {'enabled': False},
}

_ALLOWED_FIELD_KEYS = ('x', 'y', 'font_size', 'size', 'color', 'align', 'enabled')

def _resolve_dimension(value, canvas_dimension, default):
    if value is None:
        value = default
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = float(default)
    if 0 <= numeric <= 1:
        return int(canvas_dimension * numeric)
    return int(numeric)

def resolve_template_config(template):
    merged = {k: dict(v) for k, v in DEFAULT_FIELD_CONFIG.items()}
    if template is None:
        return merged
    cfg = getattr(template, 'config', None)
    if not isinstance(cfg, dict):
        return merged
    fields = cfg.get('fields')
    if not isinstance(fields, dict):
        return merged

    for key, overrides in fields.items():
        if key not in merged or not isinstance(overrides, dict):
            continue
        for sub_key, sub_val in overrides.items():
            if sub_key not in _ALLOWED_FIELD_KEYS or sub_val is None:
                continue
            if sub_key == 'enabled':
                if isinstance(sub_val, str):
                    merged[key]['enabled'] = sub_val.strip().lower() in ('true', '1', 'yes', 'on', 't')
                else:
                    merged[key]['enabled'] = bool(sub_val)
                continue
            if sub_key in ('x', 'y', 'font_size', 'size'):
                try:
                    merged[key][sub_key] = float(sub_val)
                except (TypeError, ValueError):
                    continue
                continue
            if sub_key in ('color', 'align'):
                merged[key][sub_key] = str(sub_val)
                continue
    return merged

class TicketGenerator:
    def __init__(self, template=None, format_type='png'):
        self.template = template
        self.format_type = format_type
        self.font_path = self._get_font_path()
        self._font_cache = {}

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
        cache_key = (int(size), bool(bold))
        if cache_key in self._font_cache:
            return self._font_cache[cache_key]

        font = None
        if self.font_path and os.path.exists(self.font_path):
            try:
                font = ImageFont.truetype(self.font_path, int(size))
            except Exception:
                font = None
        if font is None:
            font = ImageFont.load_default()

        self._font_cache[cache_key] = font
        return font

    def _get_text_size(self, draw, text, font):
        try:
            bbox = draw.textbbox((0, 0), text, font=font)
            return bbox[2] - bbox[0], bbox[3] - bbox[1]
        except Exception:
            try:
                return draw.textsize(text, font=font)
            except Exception:
                return 0, 0

    def _get_event_template(self, event, template_type='ticket'):
        from ..models import EventTemplate
        try:
            template = EventTemplate.objects.get(event=event, template_type__slug=template_type, is_default=True, is_active=True)
            return template
        except EventTemplate.DoesNotExist:
            return EventTemplate.objects.filter(event=event, template_type__slug=template_type, is_active=True).first()
        except Exception:
            logger.exception('Error getting event template for event %s', event.pk)
            return None

    def _open_template_image(self, template):
        if not template or not template.image:
            return None
        try:
            template.image.open('rb')
            return Image.open(template.image).convert('RGB')
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
            start_date = timezone.make_aware(start_date, timezone.get_current_timezone())
        else:
            start_date = timezone.localtime(start_date)

        if end_date:
            if timezone.is_naive(end_date):
                end_date = timezone.make_aware(end_date, timezone.get_current_timezone())
            else:
                end_date = timezone.localtime(end_date)
            if start_date.date() != end_date.date():
                sd, ed = start_date, end_date
                if sd.strftime('%b') == ed.strftime('%b'):
                    return f'{sd.day} - {ed.day} {sd.strftime("%b")} {sd.year}'
                return f'{sd.day} {sd.strftime("%b")} - {ed.day} {ed.strftime("%b")} {sd.year}'

        day = start_date.day
        if 4 <= day <= 20 or 24 <= day <= 30:
            suffix = 'th'
        else:
            suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(day % 10, 'th')
        return f'{day}{suffix} {start_date.strftime("%B %Y")}'

    def _resolve_field_position(self, field_cfg, width, height):
        x = _resolve_dimension(field_cfg.get('x'), width, default=0.5)
        y = _resolve_dimension(field_cfg.get('y'), height, default=0.5)
        return x, y

    def _resolve_font_size(self, field_cfg, width, default_font_size):
        raw = field_cfg.get('font_size', default_font_size)
        return _resolve_dimension(raw, width, default=default_font_size)

    def _draw_field(self, draw, img, field_cfg, text, default_color='#1A202C', default_align='left', default_font_size=16):
        if not field_cfg.get('enabled', True) or not text:
            return
        width, height = img.size
        x, y = self._resolve_field_position(field_cfg, width, height)
        font_size = self._resolve_font_size(field_cfg, width, default_font_size)
        color = field_cfg.get('color', default_color)
        align = field_cfg.get('align', default_align)
        self._draw_text_px(draw, img, str(text), x, y, font_size, color, align)

    def _draw_qr_field(self, draw, img, field_cfg, qr_img):
        if qr_img is None:
            return
        width, height = img.size
        qr_size = _resolve_dimension(field_cfg.get('size'), width, default=140)
        qr_size = max(20, min(qr_size, min(width, height)))
        qr_img = qr_img.resize((qr_size, qr_size))

        center_x = _resolve_dimension(field_cfg.get('x'), width, default=0.88)
        top_y = _resolve_dimension(field_cfg.get('y'), height, default=0.55)

        qr_x = center_x - qr_size // 2
        qr_y = top_y

        qr_x = max(0, min(qr_x, width - qr_size))
        qr_y = max(0, min(qr_y, height - qr_size))

        pad = 8
        draw.rectangle([qr_x - pad, qr_y - pad, qr_x + qr_size + pad, qr_y + qr_size + pad], fill='white')
        img.paste(qr_img, (qr_x, qr_y))

    def generate_ticket_image(self, ticket, booking, event, custom_config=None):
        try:
            template = self._get_event_template(event, 'ticket')
            if not template or not template.image:
                logger.warning('No template found for event %s, using blank canvas', event.id)
                img = Image.new('RGB', (800, 1000), 'white')
                draw = ImageDraw.Draw(img)
            else:
                img = self._open_template_image(template)
                if img is None:
                    img = Image.new('RGB', (800, 1000), 'white')
                draw = ImageDraw.Draw(img)

            layout = resolve_template_config(template)
            if isinstance(custom_config, dict):
                for key, overrides in custom_config.items():
                    if key in layout and isinstance(overrides, dict):
                        layout[key].update(overrides)

            # ---------------- Event title ----------------
            self._draw_field(draw, img, layout['event_title'], (event.title or '').upper(), default_color='#1A202C', default_align='center', default_font_size=36)

            # ---------------- Event date ----------------
            date_display = self._format_date_for_ticket(event.start_date, event.end_date)
            self._draw_field(draw, img, layout['event_date'], date_display, default_color='#4A5568', default_align='center', default_font_size=20)

            # ---------------- Venue (FULL ADDRESS) ----------------
            venue_text = ''
            if event.venue:
                parts = [
                    event.venue.name, event.venue.address_line1, event.venue.address_line2,
                    event.venue.city, event.venue.state, event.venue.postal_code, event.venue.country,
                ]
                venue_text = ', '.join([str(p).strip() for p in parts if p and str(p).strip()])

            if venue_text:
                venue_cfg = layout['venue_value']
                if venue_cfg.get('enabled', True):
                    width, height = img.size
                    vx, vy = self._resolve_field_position(venue_cfg, width, height)
                    v_size = self._resolve_font_size(venue_cfg, width, 20)
                    v_color = venue_cfg.get('color', '#718096')
                    v_align = venue_cfg.get('align', 'center')

                    estimated_char_width = max(1, int(v_size * 0.6))
                    available_px = (width * 0.5) - 40 
                    max_chars = max(20, int(available_px // estimated_char_width))

                    venue_lines = self._wrap_text(venue_text, max_chars)
                    line_height = int(v_size * 1.5)

                    for i, line in enumerate(venue_lines):
                        # Note: y offset pushes the next line down
                        self._draw_text_px(draw, img, line, vx, vy + (i * line_height), v_size, v_color, v_align)

            # ---------------- QR code ----------------
            qr_img = self._generate_qr_code(ticket)
            self._draw_qr_field(draw, img, layout['qr_code'], qr_img)

            # ---------------- Attendee ----------------
            attendee_name = ticket.attendee_name or booking.customer_name or 'Guest'
            self._draw_field(draw, img, layout['attendee_label'], 'ATTENDEE', default_color='#718096', default_align='center', default_font_size=18)
            self._draw_field(draw, img, layout['attendee_value'], attendee_name, default_color='#1A202C', default_align='center', default_font_size=32)

            # ---------------- Ticket code ----------------
            self._draw_field(draw, img, layout['ticket_code_value'], ticket.unique_code, default_color='#A0AEC0', default_align='center', default_font_size=20)

            # ---------------- Output ----------------
            buffer = BytesIO()
            img.save(buffer, format='PNG', quality=95)
            buffer.seek(0)
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
            width, height = 800, 1000
            img = Image.new('RGB', (width, height), 'white')
            draw = ImageDraw.Draw(img)

            event_title = event.title if event else 'EVENT'
            self._draw_text_px(draw, img, event_title.upper(), width // 2, 150, 36, '#1A202C', 'center')

            date_display = self._format_date_for_ticket(event.start_date, event.end_date)
            self._draw_text_px(draw, img, date_display, width // 2, 230, 20, '#4A5568', 'center')
            
            if event and event.venue:
                parts = [event.venue.name, event.venue.address_line1, event.venue.city, event.venue.state, event.venue.country]
                venue_text = ', '.join([str(p).strip() for p in parts if p and str(p).strip()])
                self._draw_text_px(draw, img, venue_text, width // 2, 280, 16, '#4A5568', 'center')

            qr_img = self._generate_qr_code(ticket)
            if qr_img:
                qr_size = 280
                qr_img = qr_img.resize((qr_size, qr_size))
                qr_x = (width - qr_size) // 2
                qr_y = 380
                draw.rectangle([qr_x - 20, qr_y - 20, qr_x + qr_size + 20, qr_y + qr_size + 20], fill='white')
                img.paste(qr_img, (qr_x, qr_y))

            attendee_name = ticket.attendee_name or booking.customer_name or 'Guest'
            self._draw_text_px(draw, img, "ATTENDEE", width // 2, 760, 14, '#718096', 'center')
            self._draw_text_px(draw, img, attendee_name, width // 2, 800, 24, '#1A202C', 'center')
            self._draw_text_px(draw, img, ticket.unique_code, width // 2, 870, 16, '#A0AEC0', 'center')

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
        try:
            payload = serialise_ticket_qr_payload(ticket, include_ids=True)
            qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=6, border=2)
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
            c.drawImage(ImageReader(png_buffer), x_pos, y_pos, width=new_width, height=new_height)
            c.save()
            pdf_buffer.seek(0)
            return pdf_buffer
        except Exception:
            logger.exception('Error generating PDF ticket')
            return None