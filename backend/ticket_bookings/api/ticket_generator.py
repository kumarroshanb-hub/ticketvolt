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
# DEFAULT FIELD LAYOUT
# These are fallbacks if an event doesn't have a custom template applied.
# They assume a 2000x650 landscape canvas.
# ===========================================================================
DEFAULT_FIELD_CONFIG = {
    # Labels
    'ticket_code_label': {'x': 150, 'y': 160, 'font_size': 24, 'color': '#718096', 'align': 'left', 'enabled': True}, # EVENT
    'booking_label':     {'x': 700, 'y': 160, 'font_size': 24, 'color': '#718096', 'align': 'left', 'enabled': True}, # DATE
    'organizer':         {'x': 1200, 'y': 160, 'font_size': 24, 'color': '#718096', 'align': 'left', 'enabled': True}, # TIME
    
    'venue_label':       {'x': 150, 'y': 360, 'font_size': 24, 'color': '#718096', 'align': 'left', 'enabled': True}, # VENUE
    'attendee_label':    {'x': 700, 'y': 360, 'font_size': 24, 'color': '#718096', 'align': 'left', 'enabled': True}, # TICKET NO.
    'slot_time_label':   {'x': 1200, 'y': 360, 'font_size': 24, 'color': '#718096', 'align': 'left', 'enabled': True}, # TICKET TYPE

    # Values
    'event_title':       {'x': 150, 'y': 210, 'font_size': 40, 'color': '#1A202C', 'align': 'left'},
    'event_date':        {'x': 700, 'y': 210, 'font_size': 36, 'color': '#1A202C', 'align': 'left'},
    'slot_time_value':   {'x': 1200, 'y': 210, 'font_size': 36, 'color': '#1A202C', 'align': 'left', 'enabled': True},
    
    'venue_value':       {'x': 150, 'y': 410, 'font_size': 28, 'color': '#1A202C', 'align': 'left'},
    'ticket_number':     {'x': 700, 'y': 410, 'font_size': 32, 'color': '#1A202C', 'align': 'left', 'enabled': True},
    'attendee_value':    {'x': 1200, 'y': 410, 'font_size': 32, 'color': '#1A202C', 'align': 'left'},

    # QR Code
    'qr_code': {'x': 1700, 'y': 220, 'size': 340},

    # Unused
    'organizer_sub': {'enabled': False},
    'event_date_secondary': {'enabled': False},
    'booking_value': {'enabled': False},
    'admit_one': {'enabled': False},
    'ticket_code_value': {'enabled': False},
}

_ALLOWED_FIELD_KEYS = ('x', 'y', 'font_size', 'size', 'color', 'align', 'enabled')

def _resolve_dimension(value, canvas_dimension, default):
    if value is None:
        value = default
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = float(default)
    # If the value is a fraction (0-1), multiply by canvas dimension.
    # Otherwise, treat it as an absolute pixel value.
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

        # Format as "1 November 2026"
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
            
            # ✅ FIX: Always use a standardized 2000x650 canvas if no template is found
            if not template or not template.image:
                logger.warning('No template found for event %s, using 2000x650 blank canvas', event.id)
                img = Image.new('RGB', (2000, 650), 'white')
                draw = ImageDraw.Draw(img)
            else:
                img = self._open_template_image(template)
                if img is None:
                    img = Image.new('RGB', (2000, 650), 'white')
                draw = ImageDraw.Draw(img)

            layout = resolve_template_config(template)
            if isinstance(custom_config, dict):
                for key, overrides in custom_config.items():
                    if key in layout and isinstance(overrides, dict):
                        layout[key].update(overrides)

            # ---------------- Row 1 Labels ----------------
            self._draw_field(draw, img, layout['ticket_code_label'], 'EVENT', default_color='#718096', default_align='left', default_font_size=24)
            self._draw_field(draw, img, layout['booking_label'], 'DATE', default_color='#718096', default_align='left', default_font_size=24)
            self._draw_field(draw, img, layout['organizer'], 'TIME', default_color='#718096', default_align='left', default_font_size=24)

            # ---------------- Row 1 Values ----------------
            self._draw_field(draw, img, layout['event_title'], (event.title or '').upper(), default_color='#1A202C', default_align='left', default_font_size=40)
            self._draw_field(draw, img, layout['event_date'], self._format_date_for_ticket(event.start_date, event.end_date), default_color='#1A202C', default_align='left', default_font_size=36)
            
            time_text = timezone.localtime(event.start_date).strftime('%I:%M %p').lstrip('0') if event.start_date else ''
            self._draw_field(draw, img, layout['slot_time_value'], time_text, default_color='#1A202C', default_align='left', default_font_size=36)

            # ---------------- Row 2 Labels ----------------
            self._draw_field(draw, img, layout['venue_label'], 'VENUE', default_color='#718096', default_align='left', default_font_size=24)
            self._draw_field(draw, img, layout['attendee_label'], 'TICKET NO.', default_color='#718096', default_align='left', default_font_size=24)
            self._draw_field(draw, img, layout['slot_time_label'], 'TICKET TYPE', default_color='#718096', default_align='left', default_font_size=24)

            # ---------------- Row 2 Values ----------------
            venue_text = ''
            if event.venue:
                parts = [event.venue.name, event.venue.address_line1, event.venue.city]
                venue_text = ', '.join([str(p).strip() for p in parts if p and str(p).strip()])
            self._draw_field(draw, img, layout['venue_value'], venue_text, default_color='#1A202C', default_align='left', default_font_size=28)
            
            self._draw_field(draw, img, layout['ticket_number'], ticket.unique_code, default_color='#1A202C', default_align='left', default_font_size=32)
            
            tier_name = ticket.tier.name if ticket.tier else 'General Admission'
            self._draw_field(draw, img, layout['attendee_value'], tier_name, default_color='#1A202C', default_align='left', default_font_size=32)

            # ---------------- QR code ----------------
            qr_img = self._generate_qr_code(ticket)
            self._draw_qr_field(draw, img, layout['qr_code'], qr_img)

            # ---------------- Output ----------------
            buffer = BytesIO()
            img.save(buffer, format='PNG', quality=95)
            buffer.seek(0)
            return buffer

        except Exception:
            logger.exception('Error generating ticket image')
            return self._generate_fallback_ticket(ticket, booking, event)

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