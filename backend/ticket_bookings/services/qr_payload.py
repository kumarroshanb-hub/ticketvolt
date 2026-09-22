# backend/ticket_bookings/services/qr_payload.py
"""
Canonical QR payload builder.

Every QR code rendered for a Ticket MUST go through
`serialise_ticket_qr_payload` so that all scanners (Expo app, admin web UI,
future integrations) see the same signed JSON envelope.

Contract (must match the mobile scanner and the server-side verifier):

    {
      "v": 1,
      "type": "ticket",
      "code": "TIX<8-32 uppercase alnum>",
      "sig": "<hex HMAC-SHA256>"
    }

Rules:
  - Exactly these four keys. No extras. No None values.
  - `sig` = HMAC-SHA256 over the canonical byte string of
    {"v": 1, "type": "ticket", "code": "<code>"} using
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
QR_PAYLOAD_VERSION = 1
QR_PAYLOAD_TYPE = 'ticket'


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


def _canonical_message(code: str) -> bytes:
    """
    Rebuild the exact byte string the server verifies against.

    MUST stay in lockstep with
    ticket_bookings.views._canonical_ticket_message().
    """
    return json.dumps(
        {
            'v': QR_PAYLOAD_VERSION,
            'type': QR_PAYLOAD_TYPE,
            'code': code,
        },
        separators=(',', ':'),
        sort_keys=True,
    ).encode('utf-8')


def sign_ticket_code(code: str) -> str:
    """Return the lowercase-hex HMAC-SHA256 for a ticket code."""
    return hmac.new(
        _resolve_signing_secret().encode('utf-8'),
        _canonical_message(code),
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
            callers, but IGNORED. The scanner and server expect exactly
            four keys; adding extras causes the scan to be rejected.

    Returns:
        A JSON-serialisable dict with exactly:
            {"v": 1, "type": "ticket", "code": "<code>", "sig": "<hex>"}

    Serialize with `json.dumps(payload, separators=(",", ":"))` — NOT
    `str(payload)` — when embedding into a QR code.
    """
    if not ticket or not getattr(ticket, 'unique_code', None):
        raise ValueError("Ticket must have a unique_code to build a QR payload.")

    code = ticket.unique_code

    return {
        'v': QR_PAYLOAD_VERSION,
        'type': QR_PAYLOAD_TYPE,
        'code': code,
        'sig': sign_ticket_code(code),
    }


def serialise_ticket_qr_payload(ticket, *, include_ids: bool = False) -> str:
    """Return the JSON string to embed in a QR code."""
    return json.dumps(
        build_ticket_qr_payload(ticket, include_ids=include_ids),
        separators=(',', ':'),   # compact — QR capacity is finite
        ensure_ascii=False,      # codes are ASCII anyway; harmless either way
    )