# backend/core/i18n_views.py
"""
CSRF-exempt, JSON-friendly wrapper around Django's set_language.

WHY THIS EXISTS
---------------
Django's stock `django.views.i18n.set_language` is:

  • CSRF-protected   → axios POST from the frontend with no CSRF token
                       gets a silent 403
  • form-oriented    → expects `language=...` in the POST body
                       (or querystring), not JSON
  • redirect-oriented→ returns a 302 to `next` instead of a JSON body

The frontend LanguageSwitcher does:

    await api.post('/i18n/setlang/', { language: normalized });

That is a JSON POST with no CSRF token. Calling the stock view produced
a silent 403 every time, so the `django_language` cookie was NEVER set.
Result: every server-rendered string (Django admin panel, email
templates, DRF validation messages) stayed English regardless of what
the frontend showed.

This wrapper:

  • accepts JSON  `{"language": "zh-hant"}`
  • accepts form  `language=zh-hant`
  • falls back to the Accept-Language header
  • validates against settings.LANGUAGES
  • maps every plausible variant to the canonical code
      'zh-Hant'    -> 'zh-hant'
      'zh_hant'    -> 'zh-hant'
      'zh-hant-hk' -> 'zh-hant'
      'zh_HK'      -> 'zh-hant'
      'en-US'      -> 'en'
  • sets django_language on the response using settings.LANGUAGE_COOKIE_*
  • returns 200 JSON, never redirects
"""
import json

from django.conf import settings
from django.http import JsonResponse
from django.utils import translation
from django.utils.translation import get_language_from_request
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST


def _supported_codes():
    """Canonical, lowercase, hyphen-separated codes from settings."""
    return {code.lower().replace('_', '-') for code, _label in settings.LANGUAGES}


def _canonical(code):
    """
    Map any reasonable variant to the canonical code from
    settings.LANGUAGES. Returns None if nothing matches.

    Examples (with LANGUAGES = [('en', ...), ('zh-hant', ...)]):
        'en', 'en-US', 'en_GB'          -> 'en'
        'zh', 'zh-hant', 'zh_Hant',
        'zh-Hant-HK', 'zh_HK', 'zh_TW'  -> 'zh-hant'
    """
    if not code:
        return None
    wanted = str(code).replace('_', '-').strip().lower()
    supported = _supported_codes()

    # Exact match.
    if wanted in supported:
        return wanted

    # Base-language match (zh-hant-hk -> zh-hant, en-us -> en).
    base = wanted.split('-')[0]
    for s in supported:
        if s == base or s.startswith(base + '-'):
            return s
    return None


@csrf_exempt
@require_POST
def set_language_view(request):
    """
    POST /i18n/setlang/

    Accepts:
      • JSON  {"language": "zh-hant"}  or  {"lang": "zh-hant"}
      • Form  language=zh-hant         or  lang=zh-hant
      • (fallback) Accept-Language header

    Returns:
      200 {"ok": true, "language": "<canonical>", "requested": "<raw>"}
      Sets the django_language cookie.
    """
    raw = ''

    # ---- 1. JSON body ----
    if request.content_type == 'application/json':
        try:
            payload = json.loads(request.body or b'{}')
            if isinstance(payload, dict):
                raw = payload.get('language') or payload.get('lang') or ''
        except (ValueError, TypeError):
            raw = ''

    # ---- 2. Form body ----
    if not raw:
        raw = (
            request.POST.get('language')
            or request.POST.get('lang')
            or ''
        )

    # ---- 3. Accept-Language header ----
    if not raw:
        raw = get_language_from_request(request, check_path=False) or ''

    canonical = _canonical(raw) or settings.LANGUAGE_CODE

    # Activate for THIS request so any translated strings rendered during
    # this response use the new language.
    translation.activate(canonical)

    response = JsonResponse({
        'ok': True,
        'language': canonical,
        'requested': raw,
    })

    response.set_cookie(
        settings.LANGUAGE_COOKIE_NAME,
        canonical,
        max_age=settings.LANGUAGE_COOKIE_AGE,
        path=settings.LANGUAGE_COOKIE_PATH,
        domain=settings.LANGUAGE_COOKIE_DOMAIN,
        secure=settings.LANGUAGE_COOKIE_SECURE,
        httponly=settings.LANGUAGE_COOKIE_HTTPONLY,
        samesite=settings.LANGUAGE_COOKIE_SAMESITE,
    )
    return response