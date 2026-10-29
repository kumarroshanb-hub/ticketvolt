# backend/core/settings/base.py
"""
Base settings shared across all environments.

Hardening principles:
  • Secrets are REQUIRED in every environment. No silent fallbacks.
  • SECRET_KEY, JWT_SIGNING_KEY, and TICKET_SIGNING_SECRET are all
    independent and enforced to differ from each other.
  • Defaults are secure; public endpoints must opt in explicitly.

Internationalization notes
--------------------------
  • LANGUAGE_CODE and LANGUAGES are declared EXACTLY ONCE in this file.
    A previous version re-declared LANGUAGE_CODE = 'en-us' further down,
    which silently shadowed the first declaration and made Django
    default to en-US while the frontend expected 'en'.
  • USE_L10N is deliberately NOT set. It was deprecated in Django 4.0
    and removed in 5.0; setting it in 4.2 is a no-op and misleads
    readers into thinking it does something.
  • LocaleMiddleware sits AFTER SessionMiddleware and BEFORE
    CommonMiddleware. Placing it elsewhere silently disables
    per-request language switching.
  • LANGUAGE_COOKIE_* are declared explicitly so the custom
    set_language_view (core/i18n_views.py) can rely on them.
"""
import os
from pathlib import Path
from datetime import timedelta

from django.core.exceptions import ImproperlyConfigured

from django.utils.translation import gettext_lazy as _

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# ============================================
# ENVIRONMENT DETECTION
# ============================================
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'local').lower()
IS_PRODUCTION = ENVIRONMENT in ('production', 'prod', 'render', 'cloud')


# ============================================
# 🔐 SECRET_KEY — REQUIRED, MIN LENGTH, NO FALLBACK
# ============================================
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    raise ImproperlyConfigured(
        "SECRET_KEY environment variable is required (all environments).\n"
        "Generate one with:\n"
        "  python -c \"from django.core.management.utils import "
        "get_random_secret_key as k; print(k())\""
    )
_MIN_SECRET_KEY_LEN = 32 if IS_PRODUCTION else 24
if len(SECRET_KEY) < _MIN_SECRET_KEY_LEN:
    raise ImproperlyConfigured(
        f"SECRET_KEY must be at least {_MIN_SECRET_KEY_LEN} characters. "
        f"Current length: {len(SECRET_KEY)}."
    )


# ============================================
# 🔐 JWT_SIGNING_KEY — REQUIRED, INDEPENDENT, MIN LENGTH
# ============================================
JWT_SIGNING_KEY = os.environ.get('JWT_SIGNING_KEY')

if not JWT_SIGNING_KEY:
    raise ImproperlyConfigured(
        "JWT_SIGNING_KEY environment variable is required (all environments).\n"
        "Generate one with:\n"
        "  openssl rand -base64 64"
    )
_MIN_JWT_KEY_LEN = 32 if IS_PRODUCTION else 24
if len(JWT_SIGNING_KEY) < _MIN_JWT_KEY_LEN:
    raise ImproperlyConfigured(
        f"JWT_SIGNING_KEY must be at least {_MIN_JWT_KEY_LEN} characters. "
        f"Current length: {len(JWT_SIGNING_KEY)}."
    )
if JWT_SIGNING_KEY == SECRET_KEY:
    raise ImproperlyConfigured(
        "SECURITY: JWT_SIGNING_KEY must NOT equal SECRET_KEY.\n"
        "They must be independently generated. Rotate BOTH if you have "
        "been running with them equal."
    )


# ============================================
# 🔐 TICKET_SIGNING_SECRET — REQUIRED, INDEPENDENT, MIN LENGTH
# ============================================
# Used to HMAC-sign QR ticket payloads. The scanner backend re-verifies
# every scanned payload against this secret before trusting the code.
#
# The mobile app MUST NOT embed this value — signing happens only on the
# server at issue time, and verification only on the server at scan time.
TICKET_SIGNING_SECRET = os.environ.get('TICKET_SIGNING_SECRET')

if not TICKET_SIGNING_SECRET:
    raise ImproperlyConfigured(
        "TICKET_SIGNING_SECRET environment variable is required "
        "(all environments).\n"
        "Generate one with:\n"
        "  openssl rand -base64 48"
    )
_MIN_TICKET_SECRET_LEN = 32 if IS_PRODUCTION else 24
if len(TICKET_SIGNING_SECRET) < _MIN_TICKET_SECRET_LEN:
    raise ImproperlyConfigured(
        f"TICKET_SIGNING_SECRET must be at least "
        f"{_MIN_TICKET_SECRET_LEN} characters. "
        f"Current length: {len(TICKET_SIGNING_SECRET)}."
    )
if TICKET_SIGNING_SECRET in (SECRET_KEY, JWT_SIGNING_KEY):
    raise ImproperlyConfigured(
        "SECURITY: TICKET_SIGNING_SECRET must be independent from "
        "SECRET_KEY and JWT_SIGNING_KEY. Rotate it if it has been shared."
    )


# ============================================
# DEBUG — safe default, overridden per-environment
# ============================================
DEBUG = False
ALLOWED_HOSTS = []


# ============================================
# APPLICATIONS
# ============================================
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',

    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',   # Enables revocation
    'corsheaders',
    'django_filters',
    'axes',                                       # Brute-force lockout

    # Local
    'ticket_bookings',
    'ticket_whatsapp',
]


# ============================================
# 🌏 INTERNATIONALIZATION — MULTILINGUAL
# ============================================
# Supported languages. English is the default; Traditional Chinese
# (zh-hant) covers the Hong Kong market.
#
# IMPORTANT: use lowercase 'zh-hant' (matching the frontend i18n.js).
# Django canonicalises this to the 'zh_Hant' locale directory on disk.
# LANGUAGES and LANGUAGE_CODE must be declared EXACTLY ONCE in this file.
LANGUAGES = [
    ('en',      _('English')),
    ('zh-hant', _('Traditional Chinese')),
]

# Default language when no Accept-Language header is supplied.
LANGUAGE_CODE = 'en'

USE_I18N = True
USE_TZ = True

# NOTE: USE_L10N was deprecated in Django 4.0 and removed in 5.0.
# Do NOT set it here.

# Where Django looks for locale folders.
LOCALE_PATHS = [
    BASE_DIR / 'locale',
]

TIME_ZONE = 'Asia/Hong_Kong'

# Language cookie — used by core.i18n_views.set_language_view and by
# LocaleMiddleware. Declared explicitly so behaviour does not vary
# across Django versions.
LANGUAGE_COOKIE_NAME = 'django_language'
LANGUAGE_COOKIE_AGE = 60 * 60 * 24 * 365          # 1 year
LANGUAGE_COOKIE_PATH = '/'
LANGUAGE_COOKIE_DOMAIN = None
LANGUAGE_COOKIE_SECURE = IS_PRODUCTION
LANGUAGE_COOKIE_HTTPONLY = False
LANGUAGE_COOKIE_SAMESITE = 'Lax'


# ============================================
# MIDDLEWARE
# ============================================
# LocaleMiddleware MUST sit after SessionMiddleware and before
# CommonMiddleware. Placing it elsewhere silently disables per-request
# language switching.
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.locale.LocaleMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'axes.middleware.AxesMiddleware',             # Must be last
    # ✅ Track JWT user activity for Active Sessions dashboard
    'core.middleware.ActivityTrackingMiddleware',
]

# Axes must be first in the authentication backends list.
AUTHENTICATION_BACKENDS = [
    'axes.backends.AxesStandaloneBackend',
    'django.contrib.auth.backends.ModelBackend',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'


# ============================================
# PASSWORD VALIDATION
# ============================================
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 10},
    },
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ============================================
# STATIC & MEDIA
# ============================================
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'


# ============================================
# UPLOAD LIMITS — DoS defense
# ============================================
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FIELDS = 2000


# ============================================
# REST FRAMEWORK — SECURE BY DEFAULT
# ============================================
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
    ),
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/min',
        'user': '600/min',
        'login': '20/min',           # Applied via ScopedRateThrottle on LoginView
        'checkin': '120/min',
        'checkin_verify': '240/min', # read-only verify — allow more
        'register': '3/hour',
        'booking_create': '30/hour',
        'public_read': '120/min',
        'booking_resend': '5/hour',
        'cron': '20/hour',           # for the GitHub Actions trigger endpoint
    },
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
    'DEFAULT_PAGINATION_CLASS': None,
}


# ============================================
# JWT — SHORT-LIVED, ROTATING, BLACKLISTED
# ============================================
#
# ✅ Absolute session cap.
#
# Previously REFRESH_TOKEN_LIFETIME was timedelta(days=7). Combined with
# ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION, that meant a user who
# kept a tab open (and made any request periodically) could stay logged
# in for up to 7 days. That is a server-side lifetime, not an idle
# timeout — but it is the hard ceiling we want to enforce on top of the
# client's idle timer.
#
# Now:
#   • 12 hours by default (env-overridable via JWT_REFRESH_HOURS).
#   • Overridable per-deployment without a code change:
#       JWT_REFRESH_HOURS=8
#   • Minimum 1 hour, maximum 168 (7 days) — refuse obviously-wrong
#     values at boot so a typo can't silently give everyone a 1-minute
#     session or a year-long one.
#
# The client-side idle timer (AuthContext.js) still does the "tab sat
# open untouched" logout at 30 min. This setting only controls the
# absolute cap the server will accept.
# ============================================
_JWT_REFRESH_HOURS = int(os.environ.get('JWT_REFRESH_HOURS', '12'))
if not (1 <= _JWT_REFRESH_HOURS <= 168):
    raise ImproperlyConfigured(
        f"JWT_REFRESH_HOURS must be between 1 and 168 (got {_JWT_REFRESH_HOURS}). "
        "12 is the recommended default."
    )

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(hours=_JWT_REFRESH_HOURS),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': JWT_SIGNING_KEY,
    'VERIFYING_KEY': None,
    'AUDIENCE': None,
    'ISSUER': 'ticketvolt',
    'JWK_URL': None,
    'LEEWAY': 10,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_HEADER_NAME': 'HTTP_AUTHORIZATION',
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'USER_AUTHENTICATION_RULE':
        'rest_framework_simplejwt.authentication.default_user_authentication_rule',
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
    'TOKEN_TYPE_CLAIM': 'token_type',
    'JTI_CLAIM': 'jti',
    'SLIDING_TOKEN_REFRESH_EXP_CLAIM': 'refresh_exp',
    'SLIDING_TOKEN_LIFETIME': timedelta(minutes=5),
    'SLIDING_TOKEN_REFRESH_LIFETIME': timedelta(days=1),
    'TOKEN_OBTAIN_SERIALIZER': 'ticket_bookings.api.serializers.CustomTokenObtainPairSerializer',
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# ============================================
# CELERY
# ============================================
CELERY_BROKER_URL = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
CELERY_ACCEPT_CONTENT = ['application/json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'Asia/Hong_Kong'


# ============================================
# WHATSAPP
# ============================================
WHATSAPP_GATEWAY_URL = os.environ.get(
    'WHATSAPP_GATEWAY_URL', 'http://baileys-gateway:3002'
)
WHATSAPP_ENABLED = os.environ.get('WHATSAPP_ENABLED', 'False') == 'True'
WHATSAPP_TICKET_DELIVERY_ENABLED = (
    os.environ.get('WHATSAPP_TICKET_DELIVERY_ENABLED', 'False') == 'True'
)


# ============================================
# EMAIL
# ============================================
EMAIL_PROVIDER = os.environ.get('EMAIL_PROVIDER', 'smtp').lower()

if EMAIL_PROVIDER == 'resend':
    EMAIL_BACKEND = 'ticket_bookings.services.email_backend.ResendEmailBackend'
    RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
    if not RESEND_API_KEY:
        raise ImproperlyConfigured(
            "EMAIL_PROVIDER=resend but RESEND_API_KEY is not set. "
            "Get one at https://resend.com/api-keys"
        )
else:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
    EMAIL_PORT = int(os.environ.get('EMAIL_PORT', 587))
    EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True') == 'True'
    EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
    EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')

DEFAULT_FROM_EMAIL = os.environ.get(
    'DEFAULT_FROM_EMAIL', 'TiketVault <noreply@tiketvault.com>'
)
EMAIL_TIMEOUT = 30


# ============================================
# URLS
# ============================================
BASE_URL = os.environ.get('BASE_URL', 'http://localhost:8000')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

_ADMIN_URL_RAW = os.environ.get('ADMIN_URL', 'admin/').strip('/')
ADMIN_URL = _ADMIN_URL_RAW + '/'

if IS_PRODUCTION and _ADMIN_URL_RAW == 'admin':
    raise ImproperlyConfigured(
        "SECURITY: ADMIN_URL must NOT be the default 'admin/' in production.\n"
        "Set ADMIN_URL on Render to a secret string, e.g.:\n"
        "  ADMIN_URL=manage-a3f9c2b1/"
    )


# ============================================
# AXES — BRUTE-FORCE PROTECTION
# ============================================
# Raise the threshold so a single bad actor cannot lock out a known user
# by hammering their username, and lock out per IP + username.
AXES_FAILURE_LIMIT = 10
AXES_COOLOFF_TIME = 1
AXES_LOCKOUT_PARAMETERS = [['username', 'ip_address'], ['ip_address']]
AXES_ENABLE_ACCESS_FAILURE_LOG = True
AXES_LOCKOUT_TEMPLATE = None
AXES_LOCKOUT_CALLABLE = None
AXES_VERBOSE = False
AXES_ENABLE_ADMIN = False
AXES_RESET_ON_SUCCESS = True


# ============================================
# SECURITY HEADERS (defense-in-depth)
# ============================================
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'same-origin'

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_AGE = 60 * 60 * 8
SESSION_EXPIRE_AT_BROWSER_CLOSE = False

CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = 'Lax'

SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'

PERMISSIONS_POLICY = {
    'accelerometer': [],
    'camera': [],
    'geolocation': [],
    'gyroscope': [],
    'magnetometer': [],
    'microphone': [],
    'payment': [],
    'usb': [],
}