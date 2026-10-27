# backend/ticket_bookings/api/settings_api.py
#
# Deployment-wide settings.
#
#   GET  /api/settings/    — PUBLIC (read-only display config)
#   PATCH /api/settings/   — superusers only
#
# Why GET is public:
#   The response contains ONLY display-level configuration —
#   currency code / symbol / locale, country, default timezone,
#   org name / email / logo URL, email from-name, and the full
#   country → currency catalog. Nothing in it is secret, sensitive,
#   tenant-scoped, or user-scoped.
#
#   The landing page is fully public (no auth) and must render
#   prices in the platform currency even for anonymous visitors.
#   Requiring auth for GET caused every anonymous visit to 401
#   six times (initial load + one per route change via
#   SettingsContext), which also tripped the axios interceptor's
#   "force logout / redirect to /login" path on the landing page.
#
#   Making GET public fixes both.
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ..data.currencies import (
    COUNTRY_CURRENCIES,
    CURRENCY_CODES,
    FALLBACK_CURRENCY,
    get_country_by_code,
    get_country_config,
    get_currency_config,
)
from ..models import SystemSettings


class SystemSettingsSerializer(serializers.ModelSerializer):
    # Read-only convenience fields so the frontend gets everything it
    # needs for `Intl.NumberFormat` in one response.
    currency_name = serializers.SerializerMethodField()
    effective_country = serializers.SerializerMethodField()

    class Meta:
        model = SystemSettings
        fields = [
            'currency_code', 'currency_symbol', 'currency_locale',
            'currency_name', 'effective_country',
            'country', 'country_code', 'default_timezone',
            'org_name', 'org_email', 'org_logo_url', 'email_from_name',
            'updated_at',
        ]
        read_only_fields = ['currency_name', 'effective_country', 'updated_at']

    def get_currency_name(self, obj):
        cfg = get_currency_config(obj.currency_code) or FALLBACK_CURRENCY
        return cfg.get('currency_name', obj.currency_code)

    def get_effective_country(self, obj):
        # Prefer the stored country; fall back to the code; else fallback.
        return (
            get_country_config(obj.country)
            or get_country_by_code(obj.country_code)
            or FALLBACK_CURRENCY
        )

    def validate_currency_code(self, value):
        code = (value or '').strip().upper()
        if code not in CURRENCY_CODES:
            raise serializers.ValidationError(
                f'Unsupported currency code: {value!r}. '
                f'Choose one from the catalog.'
            )
        return code

    def validate(self, attrs):
        # If the country changed but the caller didn't explicitly
        # change the currency, auto-derive the matching currency +
        # locale + symbol. This is what makes the settings page a
        # single-click action for the operator.
        country = attrs.get('country', getattr(self.instance, 'country', None))
        incoming_currency = attrs.get('currency_code')
        instance_currency = getattr(self.instance, 'currency_code', None)

        if country:
            cfg = get_country_config(country)
            if cfg:
                attrs['country_code'] = cfg['country_code']
                if (
                    'default_timezone' not in attrs
                    or not attrs.get('default_timezone')
                ):
                    attrs['default_timezone'] = cfg['timezone']

                # Auto-sync currency ONLY when the caller did not
                # explicitly send a currency_code.
                if incoming_currency is None or incoming_currency == instance_currency:
                    attrs['currency_code'] = cfg['currency_code']
                    attrs['currency_symbol'] = cfg['symbol']
                    attrs['currency_locale'] = cfg['locale']

        # If the currency changed, refresh symbol + locale from the
        # catalog (so `HKD` always pairs with `HK$` / `en-HK`).
        final_currency = attrs.get('currency_code')
        if final_currency and final_currency != instance_currency:
            cfg = get_currency_config(final_currency) or FALLBACK_CURRENCY
            attrs['currency_symbol'] = cfg['symbol']
            attrs['currency_locale'] = cfg['locale']

        return attrs


class SystemSettingsView(APIView):
    """
    GET is public. PATCH is superuser-only (enforced in `patch()`
    below, unchanged).

    The class-level `permission_classes = [IsAuthenticated]` is kept
    so that any future method we add (DELETE, PUT, etc.) defaults to
    secure. Only GET is explicitly opened up via `get_permissions`.
    """

    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        # ✅ FIX [SETTINGS-401-LANDING]:
        # GET /api/settings/ is safe to expose publicly — it returns
        # only display config and the currency catalog. Everything
        # else stays authenticated.
        if self.request.method == 'GET':
            return [AllowAny()]
        return super().get_permissions()

    def get(self, request):
        s = SystemSettings.get()
        return Response({
            **SystemSettingsSerializer(s).data,
            # Catalog — frontend uses this to populate its selects.
            'catalog': {
                'countries': COUNTRY_CURRENCIES,
                'currency_codes': CURRENCY_CODES,
                'fallback': FALLBACK_CURRENCY,
            },
        })

    def patch(self, request):
        if not request.user.is_superuser:
            return Response(
                {'error': 'Only super admins can change system settings.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        s = SystemSettings.get()
        ser = SystemSettingsSerializer(s, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save(updated_by=request.user)
        return Response({
            **ser.data,
            'catalog': {
                'countries': COUNTRY_CURRENCIES,
                'currency_codes': CURRENCY_CODES,
                'fallback': FALLBACK_CURRENCY,
            },
        })