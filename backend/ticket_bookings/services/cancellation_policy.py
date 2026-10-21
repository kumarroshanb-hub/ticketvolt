# backend/ticket_bookings/services/cancellation_policy.py
"""
Cancellation policy engine.

This module is the single place that knows how to:
  • validate a policy's rules dict
  • snapshot a policy onto a booking (frozen at booking time)
  • compute the refund for a single ticket at cancellation time

It is intentionally pure: no HTTP, no DRF, no request objects. That
makes it unit-testable and reusable from admin actions, CLI jobs, or
future batch refund scripts.

Policy schema (version 1):

    {
      "version": 1,
      "refund_tiers": [
        {
          "min_hours_before": 168,   # hours until event start
          "refund_percent": 100,     # 0-100
          "label": "7+ days before"  # optional, for UI
        },
        ...
      ],
      "cancellation_fee": 0,           # flat currency amount
      "allow_partial_cancellation": true,
      "allow_after_checkin": false,
      "reschedule_allowed": false,
      "notes": "Free-text shown to customer at booking time."
    }

Ordering rules
--------------
`refund_tiers` MUST be sorted most-generous-first, i.e. each tier's
`min_hours_before` must be strictly less than the previous one's.
The engine picks the FIRST tier whose `min_hours_before` is <= the
hours remaining until the event. If the ordering were reversed, a
customer cancelling 5 days before an event could match a "within 24h"
tier before a "7+ days" tier — silently losing them their refund.

`validate_cancellation_rules` enforces this ordering so an invalid
policy cannot be saved.
"""
from __future__ import annotations

import copy
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.core.exceptions import ValidationError
from django.utils import timezone


# The only supported schema version today. Bump this only when you make
# a backwards-incompatible change to the rules shape. Existing snapshots
# on Bookings stay on their original version; new policies use this one.
POLICY_VERSION = 1

# Hard cap to keep a rules list from growing unbounded.
MAX_TIERS = 10

# Allowed boolean flags. Centralized so validate() and any future
# default-handling stay in sync.
_BOOL_FLAGS = (
    'allow_partial_cancellation',
    'allow_after_checkin',
    'reschedule_allowed',
)


# ===========================================================================
# Validation
# ===========================================================================

def validate_cancellation_rules(rules: Any) -> None:
    """
    Raise Django's ValidationError if `rules` doesn't match the schema.

    Called from:
      • CancellationPolicy.clean()  — on every save
      • CancellationPolicySerializer.validate_rules()  — on every API write

    Never mutates `rules`. Never returns anything on success.
    """
    if not isinstance(rules, dict):
        raise ValidationError('rules must be a JSON object.')

    # -------- version --------
    version = rules.get('version')
    if version != POLICY_VERSION:
        raise ValidationError(
            f'Unsupported policy version: {version!r}. '
            f'Expected {POLICY_VERSION}.'
        )

    # -------- refund_tiers --------
    tiers = rules.get('refund_tiers')
    if not isinstance(tiers, list) or not tiers:
        raise ValidationError('refund_tiers must be a non-empty list.')

    if len(tiers) > MAX_TIERS:
        raise ValidationError(
            f'At most {MAX_TIERS} refund tiers are allowed.'
        )

    prev_hours = float('inf')
    for i, tier in enumerate(tiers):
        if not isinstance(tier, dict):
            raise ValidationError(f'Tier {i} must be an object.')

        hours = tier.get('min_hours_before')
        if not isinstance(hours, (int, float)) or isinstance(hours, bool):
            raise ValidationError(
                f'Tier {i}: min_hours_before must be a number.'
            )
        if hours < 0:
            raise ValidationError(
                f'Tier {i}: min_hours_before must be non-negative.'
            )
        if hours >= prev_hours:
            raise ValidationError(
                f'Tier {i}: min_hours_before must be strictly less than '
                f'the previous tier ({hours} >= {prev_hours}). '
                f'Tiers must be ordered most-generous-first.'
            )
        prev_hours = hours

        pct = tier.get('refund_percent')
        if not isinstance(pct, (int, float)) or isinstance(pct, bool):
            raise ValidationError(
                f'Tier {i}: refund_percent must be a number.'
            )
        if not (0 <= pct <= 100):
            raise ValidationError(
                f'Tier {i}: refund_percent must be between 0 and 100.'
            )

        label = tier.get('label')
        if label is not None and not isinstance(label, str):
            raise ValidationError(
                f'Tier {i}: label must be a string if provided.'
            )

    # -------- cancellation_fee --------
    fee = rules.get('cancellation_fee', 0)
    if not isinstance(fee, (int, float)) or isinstance(fee, bool):
        raise ValidationError('cancellation_fee must be a number.')
    if fee < 0:
        raise ValidationError('cancellation_fee must be non-negative.')

    # -------- boolean flags --------
    for flag in _BOOL_FLAGS:
        if flag in rules and not isinstance(rules[flag], bool):
            raise ValidationError(f'{flag} must be a boolean.')

    # -------- notes --------
    notes = rules.get('notes')
    if notes is not None and not isinstance(notes, str):
        raise ValidationError('notes must be a string if provided.')


# ===========================================================================
# Snapshotting
# ===========================================================================

def snapshot_policy(policy) -> dict:
    """
    Return an immutable, self-contained copy of a policy for storage on
    a Booking.

    The returned dict includes metadata (id, name, timestamp) as well as
    the full rules. Deep-copies the rules so a later edit to the policy
    cannot mutate a booking's snapshot.

    Passing None returns an empty dict — used when an event has no
    policy attached.
    """
    if policy is None:
        return {}

    return {
        'version': POLICY_VERSION,
        'policy_id': str(policy.id),
        'policy_name': policy.name,
        'snapshotted_at': timezone.now().isoformat(),
        'rules': copy.deepcopy(policy.rules or {}),
    }


def rules_from_snapshot(snapshot: dict) -> dict:
    """
    Extract the rules dict from a booking's snapshot.

    Returns {} if the snapshot is missing or malformed. Never raises —
    callers can then decide how to handle "no policy" on their own.
    """
    if not isinstance(snapshot, dict):
        return {}
    rules = snapshot.get('rules')
    return rules if isinstance(rules, dict) else {}


# ===========================================================================
# Refund computation
# ===========================================================================

@dataclass(frozen=True)
class RefundDecision:
    """
    The result of evaluating a policy for one ticket at one moment.

    Fields are always present, even when `allowed` is False — this
    keeps the preview endpoint simple (it can render a partial row
    with a reason instead of a whole block).
    """
    allowed: bool
    refund_percent: int
    refund_amount: Decimal          # gross refund before fees
    cancellation_fee: Decimal       # flat fee from the policy
    net_refund: Decimal             # amount the customer actually receives
    tier_label: str
    hours_until_event: float
    reason: str = ''                # populated when allowed is False


def compute_refund(
    *,
    policy_rules: dict,
    event_start: datetime | None,
    ticket_status: str,
    net_paid_amount: Decimal,
    now: datetime | None = None,
) -> RefundDecision:
    """
    Compute the refund owed for a single ticket.

    Args:
        policy_rules:    The rules dict (from the booking's snapshot).
        event_start:     When the event begins. `None` is treated as
                         "event has started" and yields no refund.
        ticket_status:   Current ticket status ('active', 'used', ...).
        net_paid_amount: What the customer actually paid for this ticket
                         (after discount proration).
        now:             Override for tests. Defaults to `timezone.now()`.

    Returns:
        RefundDecision. Never raises.
    """
    now = now or timezone.now()

    # No policy → no refund.
    if not policy_rules or not policy_rules.get('refund_tiers'):
        return RefundDecision(
            allowed=False,
            refund_percent=0,
            refund_amount=Decimal('0.00'),
            cancellation_fee=Decimal('0.00'),
            net_refund=Decimal('0.00'),
            tier_label='No policy',
            hours_until_event=0.0,
            reason='No cancellation policy is attached to this booking.',
        )

    # Used tickets require an explicit opt-in.
    if ticket_status == 'used' and not policy_rules.get('allow_after_checkin'):
        return RefundDecision(
            allowed=False,
            refund_percent=0,
            refund_amount=Decimal('0.00'),
            cancellation_fee=Decimal('0.00'),
            net_refund=Decimal('0.00'),
            tier_label='After check-in',
            hours_until_event=0.0,
            reason='Ticket has been checked in and cannot be refunded.',
        )

    # If the event has already started, no tier matches (all tiers have
    # min_hours_before >= 0), so we can short-circuit here for clarity.
    if event_start is None:
        return RefundDecision(
            allowed=False,
            refund_percent=0,
            refund_amount=Decimal('0.00'),
            cancellation_fee=Decimal('0.00'),
            net_refund=Decimal('0.00'),
            tier_label='Event has started',
            hours_until_event=0.0,
            reason='The event has already started.',
        )

    hours_until_event = (event_start - now).total_seconds() / 3600.0

    tier = _tier_for_hours(policy_rules, hours_until_event)
    if tier is None:
        return RefundDecision(
            allowed=False,
            refund_percent=0,
            refund_amount=Decimal('0.00'),
            cancellation_fee=Decimal('0.00'),
            net_refund=Decimal('0.00'),
            tier_label='Event has started',
            hours_until_event=hours_until_event,
            reason='The event has already started.',
        )

    refund_percent = int(tier['refund_percent'])

    net_paid = _to_decimal(net_paid_amount)
    refund_amount = (net_paid * Decimal(refund_percent) / Decimal(100)).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP,
    )

    cancellation_fee = _to_decimal(
        policy_rules.get('cancellation_fee', 0)
    ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    net_refund = refund_amount - cancellation_fee
    if net_refund < 0:
        net_refund = Decimal('0.00')

    return RefundDecision(
        allowed=True,
        refund_percent=refund_percent,
        refund_amount=refund_amount,
        cancellation_fee=cancellation_fee,
        net_refund=net_refund,
        tier_label=tier.get('label') or f'{refund_percent}% refund',
        hours_until_event=hours_until_event,
    )


# ===========================================================================
# Internals
# ===========================================================================

def _tier_for_hours(rules: dict, hours_until_event: float) -> dict | None:
    """
    Return the first tier whose min_hours_before <= hours_until_event.

    Assumes tiers are ordered most-generous-first (validated at save).
    Iterates in order; first match wins.
    """
    for tier in rules.get('refund_tiers', []):
        if hours_until_event >= tier['min_hours_before']:
            return tier
    return None


def _to_decimal(value) -> Decimal:
    """Convert a number/Decimal/str to Decimal, defaulting to 0.00."""
    if value is None:
        return Decimal('0.00')
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (ValueError, TypeError):
        return Decimal('0.00')


# ===========================================================================
# Convenience: human-readable summary
# ===========================================================================

def describe_policy(rules: dict) -> list[str]:
    """
    Return a list of human-readable lines describing the policy.

    Useful for admin preview, booking confirmation emails, and the
    events UI. Returns [] for a malformed policy so callers don't need
    to guard against exceptions.
    """
    try:
        validate_cancellation_rules(rules)
    except ValidationError:
        return []

    lines = []
    for tier in rules['refund_tiers']:
        hours = tier['min_hours_before']
        pct = tier['refund_percent']
        label = tier.get('label')

        # Format the window in the friendliest unit available.
        if hours == 0:
            window = 'Any time before the event'
        elif hours < 24:
            window = f'At least {int(hours)} hours before'
        elif hours % 24 == 0:
            days = int(hours / 24)
            window = f'{days} day{"s" if days > 1 else ""} or more before'
        else:
            window = f'At least {int(hours)} hours before'

        if pct == 0:
            line = f'{window}: no refund'
        elif pct == 100:
            line = f'{window}: full refund'
        else:
            line = f'{window}: {pct}% refund'

        if label:
            line = f'{line} ({label})'
        lines.append(line)

    fee = rules.get('cancellation_fee', 0)
    if fee and fee > 0:
        lines.append(f'A flat cancellation fee of ₹{fee} applies to any refund.')

    if not rules.get('allow_partial_cancellation', False):
        lines.append('Cancellation is all-or-nothing — the whole booking must be cancelled.')

    return lines