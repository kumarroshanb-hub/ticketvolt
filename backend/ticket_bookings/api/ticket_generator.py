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
# ---------------------------------------------------------------------------
# These defaults reproduce the ORIGINAL hardcoded behaviour, so any template
# that has no `config` (or a partial one) renders identically to before.
#
# All four numeric properties (`x`, `y`, `font_size`, `size`) accept EITHER
# a fraction OR an absolute pixel value:
#
#     x, y:          0.0 – 1.0 → fraction of width/height
#                    > 1.0     → absolute pixels
#     font_size:     0.0 – 1.0 → fraction of canvas WIDTH (scales with image)
#                    > 1.0     → absolute pixels
#     size (QR):     0.0 – 1.0 → fraction of canvas WIDTH
#                    > 1.0     → absolute pixels
#
# Using fractions makes a config portable across different canvas sizes —
# a 2400×960 wide-stub template and an 1800×1273 A4 template can share the
# same fractional config and both render correctly.
#
# The three stub-* fields are DISABLED by default so that an A4-landscape
# template without a config renders exactly as it always has. Enable them
# in the config by setting `"enabled": true`.
# ===========================================================================
DEFAULT_FIELD_CONFIG = {
    'organizer': {
        'x': 0.5, 'y': 0.08, 'font_size': 22,
        'color': '#2D3748', 'align': 'center', 'enabled': False,
    },
    'organizer_sub': {
        'x': 0.5, 'y': 0.13, 'font_size': 16,
        'color': '#4A5568', 'align': 'center', 'enabled': False,
    },
    'event_title': {
        'x': 0.5, 'y': 0.28, 'font_size': 32,
        'color': '#D69E2E', 'align': 'center',
    },
    'event_date': {
        'x': 0.5, 'y': 0.38, 'font_size': 34,
        'color': '#1A202C', 'align': 'center',
    },
    'event_date_secondary': {
        'x': 0.5, 'y': 0.45, 'font_size': 22,
        'color': '#4A5568', 'align': 'center',
    },
    'ticket_code_label': {
        'x': 0.10, 'y': 0.58, 'font_size': 16,
        'color': '#4A5568', 'align': 'left',
    },
    'ticket_code_value': {
        'x': 0.27, 'y': 0.58, 'font_size': 16,
        'color': '#1A202C', 'align': 'left',
    },
    'attendee_label': {
        'x': 0.10, 'y': 0.65, 'font_size': 16,
        'color': '#4A5568', 'align': 'left',
    },
    'attendee_value': {
        'x': 0.27, 'y': 0.65, 'font_size': 16,
        'color': '#1A202C', 'align': 'left',
    },
    'booking_label': {
        'x': 0.10, 'y': 0.72, 'font_size': 16,
        'color': '#4A5568', 'align': 'left',
    },
    'booking_value': {
        'x': 0.27, 'y': 0.72, 'font_size': 16,
        'color': '#1A202C', 'align': 'left',
    },
    'venue_label': {
        'x': 0.10, 'y': 0.82, 'font_size': 16,
        'color': '#4A5568', 'align': 'left',
    },
    'venue_value': {
        'x': 0.10, 'y': 0.86, 'font_size': 14,
        'color': '#2D3748', 'align': 'left',
    },
    'admit_one': {
        'x': 0.5, 'y': 0.93, 'font_size': 28,
        'color': '#E53E3E', 'align': 'center', 'enabled': False,
    },
    'qr_code': {
        'x': 0.88, 'y': 0.55, 'size': 140,
    },

    # ---------------------------------------------------------------
    # WIDE-STUB FIELDS (off by default)
    # ---------------------------------------------------------------
    'ticket_number': {
        'x': 0.84, 'y': 0.14, 'font_size': 48,
        'color': '#8B1A1A', 'align': 'center', 'enabled': False,
    },
    'slot_time_label': {
        'x': 0.84, 'y': 0.76, 'font_size': 16,
        'color': '#4A5568', 'align': 'center', 'enabled': False,
    },
    'slot_time_value': {
        'x': 0.84, 'y': 0.81, 'font_size': 28,
        'color': '#1A202C', 'align': 'center', 'enabled': False,
    },
}

# Sub-keys we accept from a template's `config.fields.<name>`.
_ALLOWED_FIELD_KEYS = (
    'x', 'y', 'font_size', 'size', 'color', 'align', 'enabled',
)


# ===========================================================================
# DIMENSION RESOLUTION
# ---------------------------------------------------------------------------
# One function to rule them all. Every dimension in every field goes through
# this, so the "fraction or pixels" rule is enforced in exactly one place.
# ===========================================================================
def _resolve_dimension(value, canvas_dimension, default):
    """
    Resolve a numeric field value to an absolute pixel count.

    Args:
        value:              The config value (int or float). May be None.
        canvas_dimension:   The canvas width (for x / font_size / QR size)
                            or height (for y).
        default:            Value to fall back to if `value` is None or
                            unparseable.

    Returns:
        Integer pixel value.

    Rules:
        • value in [0, 1] inclusive → fraction of canvas_dimension
        • value > 1                 → treated as absolute pixels
        • value None or invalid     → default (passed through the same rules)
    """
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
    """
    Merge a template's `config.fields` over DEFAULT_FIELD_CONFIG.

    Returns a dict: { field_name: {x, y, font_size, color, align, ...}, ... }

    Rules:
      • Unknown field names in the template config are ignored.
      • Missing fields fall back to DEFAULT_FIELD_CONFIG.
      • Sub-keys are merged individually — a template can override ONLY
        `color` without losing the default `x`/`y`.
      • `None` and empty dicts are treated as "no config".
    """
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
            if sub_key in _ALLOWED_FIELD_KEYS and sub_val is not None:
                merged[key][sub_key] = sub_val

    return merged


class TicketGenerator:
    """
    Generate tickets by overlaying database content on template images.

    Storage-agnostic: uses `template.image.open()` instead of
    `template.image.path`. This works with local filesystem, Tigris,
    Backblaze B2, S3, R2, and any other Django storage backend.

    Layout is driven by `template.config.fields` (a JSON blob set when
    uploading the template). Any field not present in the config falls
    back to DEFAULT_FIELD_CONFIG.
    """

    def __init__(self, template=None, format_type='png'):
        self.template = template
        self.format_type = format_type
        self.font_path = self._get_font_path()
        # Cache fonts by (size, bold) so we don't hit disk on every draw.
        self._font_cache = {}

    # ------------------------------------------------------------------
    # Font helpers
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # Template retrieval / opening
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # Date formatting
    # ------------------------------------------------------------------
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

    # ==================================================================
    # CONFIG-AWARE DRAWING
    # ==================================================================

    def _resolve_field_position(self, field_cfg, width, height):
        """
        Convert a field's (x, y) to absolute pixel coordinates using the
        shared `_resolve_dimension` helper.
        """
        x = _resolve_dimension(field_cfg.get('x'), width, default=0.5)
        y = _resolve_dimension(field_cfg.get('y'), height, default=0.5)
        return x, y

    def _resolve_font_size(self, field_cfg, width, default_font_size):
        """
        Resolve a field's font_size to absolute pixels.

        - 0 < size <= 1  → fraction of canvas WIDTH
        - size > 1       → absolute pixels
        - missing/None   → default_font_size (treated as pixels)
        """
        raw = field_cfg.get('font_size', default_font_size)
        return _resolve_dimension(raw, width, default=default_font_size)

    def _draw_field(
        self, draw, img, field_cfg, text,
        default_color='#1A202C', default_align='left',
        default_font_size=16,
    ):
        """
        Draw a single field using its resolved config.

        Skips silently if `enabled` is explicitly False or text is empty.
        """
        if field_cfg.get('enabled') is False:
            return
        if not text:
            return

        width, height = img.size
        x, y = self._resolve_field_position(field_cfg, width, height)
        font_size = self._resolve_font_size(field_cfg, width, default_font_size)

        color = field_cfg.get('color', default_color)
        align = field_cfg.get('align', default_align)

        self._draw_text_px(draw, img, str(text), x, y, font_size, color, align)

    def _draw_qr_field(self, draw, img, field_cfg, qr_img):
        """
        Paste the QR image at the configured position.

        `x` is the horizontal CENTRE of the QR box.
        `y` is the TOP of the QR box.
        `size` is the side length of the box (fraction or pixels).

        The QR is always clamped to stay inside the canvas, and a small
        white pad is drawn behind it so it's legible on any background.
        """
        if qr_img is None:
            return

        width, height = img.size

        qr_size = _resolve_dimension(
            field_cfg.get('size'), width, default=140,
        )
        # Guard against nonsense values that would make the QR invisible
        # or larger than the canvas itself.
        qr_size = max(20, min(qr_size, min(width, height)))
        qr_img = qr_img.resize((qr_size, qr_size))

        center_x = _resolve_dimension(
            field_cfg.get('x'), width, default=0.88,
        )
        top_y = _resolve_dimension(
            field_cfg.get('y'), height, default=0.55,
        )

        qr_x = center_x - qr_size // 2
        qr_y = top_y

        # Clamp inside the canvas
        qr_x = max(0, min(qr_x, width - qr_size))
        qr_y = max(0, min(qr_y, height - qr_size))

        # White padding behind the QR so it stays legible on any background
        pad = 8
        draw.rectangle(
            [qr_x - pad, qr_y - pad, qr_x + qr_size + pad, qr_y + qr_size + pad],
            fill='white',
        )
        img.paste(qr_img, (qr_x, qr_y))

    # ==================================================================
    # MAIN ENTRY POINT
    # ==================================================================

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

            # ----------------------------------------------------------
            # Resolve layout from the template's config
            # ----------------------------------------------------------
            layout = resolve_template_config(template)

            # Caller-supplied overrides win (useful for one-off previews
            # or per-ticket tweaks without re-uploading the template).
            if isinstance(custom_config, dict):
                for key, overrides in custom_config.items():
                    if key in layout and isinstance(overrides, dict):
                        layout[key].update(overrides)

            # ----------------------------------------------------------
            # Draw each field
            # ----------------------------------------------------------

            # Event title
            self._draw_field(
                draw, img, layout['event_title'],
                (event.title or '').upper(),
                default_color='#D69E2E', default_align='center',
                default_font_size=32,
            )

            # Event date (primary)
            date_display = self._format_date_for_ticket(
                event.start_date, event.end_date
            )
            self._draw_field(
                draw, img, layout['event_date'],
                date_display,
                default_color='#1A202C', default_align='center',
                default_font_size=34,
            )

            # Event date (secondary — month/year when spanning)
            date_secondary = ''
            if event.end_date and event.start_date:
                if (
                    timezone.localtime(event.start_date).date()
                    != timezone.localtime(event.end_date).date()
                ):
                    date_secondary = timezone.localtime(
                        event.start_date
                    ).strftime('%B %Y').upper()
            if date_secondary:
                self._draw_field(
                    draw, img, layout['event_date_secondary'],
                    date_secondary,
                    default_color='#4A5568', default_align='center',
                    default_font_size=22,
                )

            # Ticket code (label + value)
            self._draw_field(
                draw, img, layout['ticket_code_label'],
                'Ticket Code:',
                default_color='#4A5568', default_align='left',
            )
            self._draw_field(
                draw, img, layout['ticket_code_value'],
                ticket.unique_code,
                default_color='#1A202C', default_align='left',
            )

            # Attendee (label + value)
            attendee_name = (
                ticket.attendee_name
                or booking.customer_name
                or 'Guest'
            )
            self._draw_field(
                draw, img, layout['attendee_label'],
                'Attendee:',
                default_color='#4A5568', default_align='left',
            )
            self._draw_field(
                draw, img, layout['attendee_value'],
                attendee_name,
                default_color='#1A202C', default_align='left',
            )

            # Booking reference (label + value)
            self._draw_field(
                draw, img, layout['booking_label'],
                'Booking Ref:',
                default_color='#4A5568', default_align='left',
            )
            self._draw_field(
                draw, img, layout['booking_value'],
                booking.booking_reference,
                default_color='#1A202C', default_align='left',
            )

            # Venue (label + multi-line value)
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

            if venue_text:
                self._draw_field(
                    draw, img, layout['venue_label'],
                    'Venue:',
                    default_color='#4A5568', default_align='left',
                )

                # Wrap and draw each line beneath the label position.
                # Font size may be fractional, so resolve it first, then
                # derive the wrap width from the resolved pixel value.
                venue_cfg = layout['venue_value']
                if venue_cfg.get('enabled') is not False:
                    width, height = img.size
                    vx, vy = self._resolve_field_position(venue_cfg, width, height)
                    v_size = self._resolve_font_size(venue_cfg, width, 14)
                    v_color = venue_cfg.get('color', '#2D3748')
                    v_align = venue_cfg.get('align', 'left')

                    # 0.6 * font_size ≈ average character width in most
                    # sans-serif fonts.
                    estimated_char_width = max(1, int(v_size * 0.6))
                    available_px = width - vx - 40
                    max_chars = max(20, available_px // estimated_char_width)

                    venue_lines = self._wrap_text(venue_text, max_chars)
                    line_height = int(v_size * 1.5)

                    for i, line in enumerate(venue_lines):
                        self._draw_text_px(
                            draw, img, line,
                            vx, vy + (i * line_height),
                            v_size, v_color, v_align,
                        )

            # ----------------------------------------------------------
            # Wide-stub fields (only render when enabled in config)
            # ----------------------------------------------------------

            # Ticket number — last 6 characters of the unique code, upper.
            ticket_number = (ticket.unique_code or '')[-6:].upper()
            self._draw_field(
                draw, img, layout['ticket_number'],
                ticket_number,
                default_color='#8B1A1A', default_align='center',
                default_font_size=48,
            )

            # Slot time — prefer the ticket's session, fall back to booking.
            slot_time = ''
            if ticket.session and ticket.session.start_time:
                slot_time = timezone.localtime(
                    ticket.session.start_time
                ).strftime('%I:%M %p').lstrip('0')
            elif booking.session and booking.session.start_time:
                slot_time = timezone.localtime(
                    booking.session.start_time
                ).strftime('%I:%M %p').lstrip('0')

            if slot_time:
                self._draw_field(
                    draw, img, layout['slot_time_label'],
                    'Slot Time',
                    default_color='#4A5568', default_align='center',
                )
                self._draw_field(
                    draw, img, layout['slot_time_value'],
                    slot_time,
                    default_color='#1A202C', default_align='center',
                    default_font_size=28,
                )

            # ----------------------------------------------------------
            # QR code — always drawn if the config has a `qr_code` entry
            # ----------------------------------------------------------
            qr_img = self._generate_qr_code(ticket)
            self._draw_qr_field(draw, img, layout['qr_code'], qr_img)

            # Admit One (optional — off by default)
            self._draw_field(
                draw, img, layout['admit_one'],
                'ADMIT ONE',
                default_color='#E53E3E', default_align='center',
                default_font_size=28,
            )

            # ----------------------------------------------------------
            # Output
            # ----------------------------------------------------------
            buffer = BytesIO()
            img.save(buffer, format='PNG', quality=95)
            buffer.seek(0)
            logger.info('Ticket image generated for %s', ticket.unique_code)
            return buffer

        except Exception:
            logger.exception('Error generating ticket image')
            return self._generate_fallback_ticket(ticket, booking, event)

    # ==================================================================
    # FALLBACK
    # ==================================================================

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
        """
        Used when there is no template, or the template cannot be opened.

        Intentionally minimal — the goal is a printable ticket with the
        essential info and a QR code, not a beautiful one.
        """
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

    # ==================================================================
    # LOW-LEVEL TEXT DRAWING
    # ==================================================================

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

    # ==================================================================
    # QR CODE GENERATION
    # ==================================================================

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

    # ==================================================================
    # PUBLIC CONVENIENCE WRAPPERS
    # ==================================================================

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