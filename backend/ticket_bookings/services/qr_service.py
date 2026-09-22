# backend/ticket_bookings/services/qr_service.py
import base64
import json
import logging
import uuid
from io import BytesIO

import qrcode
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from .qr_payload import serialise_ticket_qr_payload

logger = logging.getLogger(__name__)


class QRCodeService:
    """
    QR generation for tickets.

    Two public methods:
      - generate_ticket_qr()       → data URL (base64 PNG) for inline embedding
                                     in HTML/PDF/email.
      - generate_qr_image_file()   → saves a PNG to object storage and returns
                                     its URL. USE SPARINGLY — every call writes
                                     a new object. Prefer the data URL.
    """

    @classmethod
    def _build_qr_image(cls, ticket, *, include_ids: bool):
        """Return a PIL image of the QR code for `ticket`."""
        payload_str = serialise_ticket_qr_payload(ticket, include_ids=include_ids)

        qr = qrcode.QRCode(
            version=None,  # let qrcode pick the smallest version that fits
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(payload_str)
        qr.make(fit=True)
        return qr.make_image(fill_color='black', back_color='white')

    @classmethod
    def generate_ticket_qr(cls, ticket):
        """Return a `data:image/png;base64,...` URL. Does NOT touch storage."""
        img = cls._build_qr_image(ticket, include_ids=True)
        buffered = BytesIO()
        img.save(buffered, format='PNG')
        encoded = base64.b64encode(buffered.getvalue()).decode('ascii')
        return f'data:image/png;base64,{encoded}'

    @classmethod
    def generate_qr_image_file(cls, ticket, *, reuse: bool = True):
        """
        Write a PNG of the ticket's QR to the configured storage backend.

        Filename is DETERMINISTIC by default (`qr_codes/<unique_code>.png`)
        so repeated calls do not create orphan objects. Pass `reuse=False`
        to force a new, uuid-suffixed object (rarely wanted).

        Returns a dict {file_path, url, filename} or None on failure.
        """
        try:
            if reuse:
                filename = f'{ticket.unique_code}.png'
            else:
                filename = f'{ticket.unique_code}_{uuid.uuid4().hex[:8]}.png'

            file_path = f'qr_codes/{filename}'

            # If the object already exists and we're in reuse mode, don't
            # re-upload — just return its URL.
            if reuse and default_storage.exists(file_path):
                return {
                    'file_path': file_path,
                    'url': default_storage.url(file_path),
                    'filename': filename,
                }

            img = cls._build_qr_image(ticket, include_ids=True)
            buffered = BytesIO()
            img.save(buffered, format='PNG')
            buffered.seek(0)

            saved_path = default_storage.save(
                file_path, ContentFile(buffered.getvalue())
            )
            return {
                'file_path': saved_path,
                'url': default_storage.url(saved_path),
                'filename': filename,
            }
        except Exception:
            logger.exception(
                'QR image file generation failed for ticket %s', ticket.unique_code
            )
            return None

    @classmethod
    def decode_ticket_qr(cls, qr_data):
        """
        Best-effort decode of a scanned QR string.

        Tolerates:
          - JSON payloads (current format)
          - Python-repr payloads from older builds (`{'code': '...'}`)
          - Bare ticket codes (`TIX...`)
        """
        if not isinstance(qr_data, str):
            return {'code': None}

        trimmed = qr_data.strip()

        # Fast path: bare ticket code.
        if trimmed.startswith('TIX'):
            return {'code': trimmed}

        # JSON.
        if trimmed.startswith('{'):
            try:
                data = json.loads(trimmed)
            except json.JSONDecodeError:
                # Legacy: Python repr from str(dict) — single quotes.
                try:
                    import ast
                    data = ast.literal_eval(trimmed)
                except (ValueError, SyntaxError):
                    data = None

            if isinstance(data, dict):
                return {
                    'ticket_id': data.get('ticket_id'),
                    'code': data.get('code') or data.get('unique_code'),
                    'event_id': data.get('event_id'),
                }

        # Fallback regex.
        import re
        m = re.search(r'TIX[A-Z0-9]+', trimmed)
        if m:
            return {'code': m.group(0)}

        return {'code': trimmed or None}