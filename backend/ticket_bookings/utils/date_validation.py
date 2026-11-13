"""
Single source of truth for date-range validation on the backend.

Frontend has `frontend/src/utils/dateValidation.js` for UX-level checks;
this module is the authoritative one. It is deliberately dependency-free
so it can be used from models, services, serializers, and management
commands without import cycles.

Convention: every helper returns ``None`` when the range is valid and a
human-readable error string otherwise. Callers decide whether that is a
400 response, a ``ValidationError``, or an ``EventServiceError``.
"""
from datetime import datetime


def _coerce(value):
    if value is None or value == '':
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        # Accept a trailing Z (JS `toISOString()`), which fromisoformat
        # does not understand on older Python versions.
        if raw.endswith('Z'):
            raw = raw[:-1] + '+00:00'
        try:
            return datetime.fromisoformat(raw)
        except (TypeError, ValueError):
            return False
    return False


def validate_date_range(
    start,
    end,
    *,
    allow_equal=True,
    require_both=False,
    start_label='Start date',
    end_label='End date',
):
    """Validate an ordered start/end pair.

    Returns ``None`` when valid, otherwise an error message. When a value
    cannot be parsed the corresponding label is reported, so callers do not
    need to duplicate parsing checks.
    """
    if not start and not end:
        if require_both:
            return f'{start_label} is required.'
        return None
    if not start:
        return f'{start_label} is required.'
    if not end:
        return f'{end_label} is required.'

    s = _coerce(start)
    e = _coerce(end)

    if s is False:
        return f'{start_label} is not a valid date.'
    if e is False:
        return f'{end_label} is not a valid date.'

    if e < s and not (allow_equal and e == s):
        return (
            f'{end_label} must be '
            f'{"on or " if allow_equal else ""}after '
            f'{start_label.lower()}.'
        )
    return None


def validate_event_dates(start, end, *, allow_equal=True):
    """Event-specific wrapper (keeps call sites readable)."""
    return validate_date_range(
        start,
        end,
        allow_equal=allow_equal,
        require_both=True,
        start_label='Start date',
        end_label='End date',
    )


def validate_session_dates(start, end):
    return validate_date_range(
        start,
        end,
        allow_equal=False,
        require_both=True,
        start_label='Session start time',
        end_label='Session end time',
    )


def validate_booking_window(booking_start, booking_end):
    return validate_date_range(
        booking_start,
        booking_end,
        allow_equal=False,
        start_label='Booking start date',
        end_label='Booking end date',
    )
