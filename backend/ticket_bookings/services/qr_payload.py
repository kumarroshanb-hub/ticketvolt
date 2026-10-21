# backend/ticket_bookings/services/qr_payload.py
"""
Canonical QR payload builder.

Every QR code rendered for a Ticket MUST go through
`serialise_ticket_qr_payload` so that all scanners (Expo app, admin web UI,
future integrations) see the same signed JSON envelope.

Contract (v2 — current):

    {
      "v": 2,
      "type": "ticket" | "registration",
      "code": "TIX...|REG...",
      "sig": "<hex HMAC-SHA256>"
    }

Legacy (v1 — accepted on read only):

    {
      "v": 1,
      "type": "ticket",
      "code": "TIX...",
      "sig": "<hex>"
    }

Rules:
  - Exactly four keys. No extras. No None values.
  - `sig` = HMAC-SHA256 over the canonical byte string of
    {"v": <version>, "type": <type>, "code": "<code>"} using
    TICKET_SIGNING_SECRET, rendered as lowercase hex.
  - Canonicalization is `json.dumps(..., separators=(",", ":"), sort_keys=True)`
    — the exact same call the server-side verifier uses. Any deviation
    breaks verification.
"""
import hashlib
import hmac
import json
import os

from django.conf import settings

# Bump this when the payload shape changes in a backwards-incompatible way.
QR_PAYLOAD_VERSION = 2
QR_PAYLOAD_VERSION_V1 = 1

QR_PAYLOAD_TYPE_TICKET = 'ticket'
QR_PAYLOAD_TYPE_REGISTRATION = 'registration'

VALID_PAYLOAD_TYPES = (QR_PAYLOAD_TYPE_TICKET, QR_PAYLOAD_TYPE_REGISTRATION)


# ---------------------------------------------------------------------------
# Signing
# ---------------------------------------------------------------------------

def _resolve_signing_secret() -> str:
    """
    Resolve TICKET_SIGNING_SECRET from Django settings, falling back to the
    process environment. Must match ticket_bookings.views._get_ticket_signing_secret().
    """
    secret = getattr(settings, 'TICKET_SIGNING_SECRET', None)
    if not secret:
        secret = os.environ.get('TICKET_SIGNING_SECRET', '')
    secret = (secret or '').strip()

    if not secret:
        raise RuntimeError(
            "TICKET_SIGNING_SECRET is not set. QR payloads cannot be signed."
        )
    if len(secret) < 32:
        raise RuntimeError(
            "TICKET_SIGNING_SECRET must be at least 32 characters."
        )
    return secret


def _canonical_message(code: str, payload_type: str, version: int) -> bytes:
    """
    Rebuild the exact byte string the server verifies against.

    MUST stay in lockstep with
    ticket_bookings.views._canonical_ticket_message().
    """
    return json.dumps(
        {
            'v': version,
            'type': payload_type,
            'code': code,
        },
        separators=(',', ':'),
        sort_keys=True,
    ).encode('utf-8')


def sign_ticket_code(
    code: str,
    payload_type: str = QR_PAYLOAD_TYPE_TICKET,
    version: int = QR_PAYLOAD_VERSION,
) -> str:
    """Return the lowercase-hex HMAC-SHA256 for a ticket code + type."""
    return hmac.new(
        _resolve_signing_secret().encode('utf-8'),
        _canonical_message(code, payload_type, version),
        hashlib.sha256,
    ).hexdigest()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_ticket_qr_payload(ticket, *, include_ids: bool = False) -> dict:
    """
    Build the canonical SIGNED QR payload for a ticket.

    Args:
        ticket: a Ticket instance (must have `unique_code`).
        include_ids: retained for backwards compatibility with existing
            callers, but IGNORED.

    Returns:
        A JSON-serialisable dict with exactly:
            {"v": 2, "type": "<ticket|registration>", "code": "<code>", "sig": "<hex>"}
    """
    if not ticket or not getattr(ticket, 'unique_code', None):
        raise ValueError("Ticket must have a unique_code to build a QR payload.")

    code = ticket.unique_code

    payload_type = (
        QR_PAYLOAD_TYPE_REGISTRATION
        if code.startswith('REG')
        else QR_PAYLOAD_TYPE_TICKET
    )

    return {
        'v': QR_PAYLOAD_VERSION,
        'type': payload_type,
        'code': code,
        'sig': sign_ticket_code(code, payload_type, QR_PAYLOAD_VERSION),
    }


def serialise_ticket_qr_payload(ticket, *, include_ids: bool = False) -> str:
    """Return the JSON string to embed in a QR code."""
    return json.dumps(
        build_ticket_qr_payload(ticket, include_ids=include_ids),
        separators=(',', ':'),
        ensure_ascii=False,
    )