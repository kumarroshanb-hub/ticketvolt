# backend/ticket_bookings/utils/money.py
"""
Single entry point for formatting a money value with the deployment
currency. Every place that would previously have written
`f'₹{amount}'` should call `format_money(amount)` instead.

Uses `babel` if installed (best-in-class formatting per locale), and
falls back to a simple implementation otherwise.
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

try:
    from babel.numbers import format_currency as _babel_format_currency
    _HAS_BABEL = True
except ImportError:
    _HAS_BABEL = False

from ..models import SystemSettings


def _to_decimal(amount):
    if amount is None:
        return Decimal('0.00')
    if isinstance(amount, Decimal):
        return amount
    try:
        return Decimal(str(amount))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal('0.00')


def format_money(amount, settings_obj=None) -> str:
    """
    Return a localized currency string, e.g. 'HK$1,234.50'.

    `settings_obj` may be passed to avoid a DB hit in a loop. If
    omitted, SystemSettings.get() is called (it is cached by pk=1).
    """
    s = settings_obj or SystemSettings.get()
    value = _to_decimal(amount)

    if _HAS_BABEL:
        try:
            return _babel_format_currency(
                value, s.currency_code, locale=s.currency_locale or 'en-US',
            )
        except Exception:
            pass

    # Fallback: symbol + thousands-separated number.
    rounded = value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    sign = '-' if rounded < 0 else ''
    rounded = abs(rounded)
    whole, frac = divmod(rounded, 1)
    return f"{sign}{s.currency_symbol}{int(whole):,}.{int(frac * 100):02d}"


def currency_context(settings_obj=None) -> dict:
    """
    Return a dict suitable for injecting into template render contexts,
    e.g. `context.update(currency_context())`.
    """
    s = settings_obj or SystemSettings.get()
    return {
        'currency_code': s.currency_code,
        'currency_symbol': s.currency_symbol,
        'currency_locale': s.currency_locale,
        'org_name': s.org_name,
        'org_email': s.org_email,
        'email_from_name': s.email_from_name or s.org_name or 'TicketVolt',
    }