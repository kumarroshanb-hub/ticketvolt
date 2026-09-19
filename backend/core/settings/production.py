# backend/core/settings/production.py
"""
Production settings - Neon + Tigris Object Storage + Cloud services (Render, etc.)

Media storage:
  - Event template images and generated tickets are stored on Tigris
    (S3-compatible object storage).
  - Tigris was chosen because:
      • No credit card required to sign up
      • 5 GB free storage, 10,000 write requests, 100,000 read requests per month
      • Zero egress fees (free data transfer out)
      • S3-compatible API (works with django-storages + boto3)
      • Single global endpoint at https://t3.storage.dev
  - Render's filesystem is ephemeral, so files written locally are lost on
    every deploy. Tigris provides persistent storage.
"""
from .base import *
import os


# ============================================
# DEBUG — MUST be False
# ============================================
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

if DEBUG:
    raise ImproperlyConfigured(
        "SECURITY: DEBUG must be False in production. "
        "Unset or set DEBUG=False on Render."
    )


# ============================================
# ALLOWED_HOSTS — REQUIRED from env, no localhost default
# ============================================
_hosts_raw = os.environ.get('ALLOWED_HOSTS', '').strip()
if not _hosts_raw:
    raise ImproperlyConfigured(
        "SECURITY: ALLOWED_HOSTS must be set in production.\n"
        "Example: ALLOWED_HOSTS=ticketvault-backend-service.onrender.com"
    )
ALLOWED_HOSTS = [h.strip() for h in _hosts_raw.split(',') if h.strip()]


# ============================================
# NEON DATABASE
# ============================================
_db_required = ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST']
_missing = [k for k in _db_required if not os.environ.get(k)]
if _missing:
    raise ImproperlyConfigured(
        f"SECURITY: Missing required DB env vars in production: {_missing}"
    )

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ['DB_NAME'],
        'USER': os.environ['DB_USER'],
        'PASSWORD': os.environ['DB_PASSWORD'],
        'HOST': os.environ['DB_HOST'],
        'PORT': os.environ.get('DB_PORT', '5432'),
        'OPTIONS': {
            'sslmode': os.environ.get('DB_SSL_MODE', 'require'),
            'connect_timeout': 10,
        },
        'CONN_MAX_AGE': 60,   # Persistent connections behind a pooler
    }
}


# ============================================
# SSL/HTTPS
# ============================================
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True


# ============================================
# CORS & CSRF — REQUIRED from env, no localhost default
# ============================================
CORS_ALLOW_ALL_ORIGINS = False   # NEVER in production

_cors_env = os.environ.get('CORS_ALLOWED_ORIGINS', '').strip()
if not _cors_env:
    raise ImproperlyConfigured(
        "SECURITY: CORS_ALLOWED_ORIGINS must be set in production.\n"
        "Example: CORS_ALLOWED_ORIGINS=https://your-frontend.onrender.com"
    )
CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_env.split(',') if o.strip()]

_csrf_env = os.environ.get('CSRF_TRUSTED_ORIGINS', '').strip()
if not _csrf_env:
    raise ImproperlyConfigured(
        "SECURITY: CSRF_TRUSTED_ORIGINS must be set in production.\n"
        "Example: CSRF_TRUSTED_ORIGINS=https://your-frontend.onrender.com,"
        "https://ticketvault-backend-service.onrender.com"
    )
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf_env.split(',') if o.strip()]

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]


# ============================================
# STATIC FILES - WhiteNoise
# ============================================
if 'whitenoise.middleware.WhiteNoiseMiddleware' not in MIDDLEWARE:
    MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')

STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'


# ============================================
# TIGRIS MEDIA STORAGE
# ============================================
# Media files (event templates, generated ticket PDFs/PNGs) are stored
# on Tigris via the S3-compatible API.
#
# Required env vars on Render:
#   TIGRIS_ACCESS_KEY_ID       — Access Key ID (starts with tid_)
#   TIGRIS_SECRET_ACCESS_KEY   — Secret Access Key (starts with tsec_)
#   TIGRIS_BUCKET_NAME         — Bucket name
#
# Tigris uses a single global endpoint and "auto" region.
# No region-specific endpoint is needed.
#
# If any of the required values are missing, we raise at startup so the
# deploy fails loudly rather than silently falling back to ephemeral
# local storage (which would lose files on every redeploy).

TIGRIS_ACCESS_KEY_ID = os.environ.get('TIGRIS_ACCESS_KEY_ID', '').strip()
TIGRIS_SECRET_ACCESS_KEY = os.environ.get('TIGRIS_SECRET_ACCESS_KEY', '').strip()
TIGRIS_BUCKET_NAME = os.environ.get('TIGRIS_BUCKET_NAME', '').strip()

_missing_tigris = [
    name for name, value in [
        ('TIGRIS_ACCESS_KEY_ID', TIGRIS_ACCESS_KEY_ID),
        ('TIGRIS_SECRET_ACCESS_KEY', TIGRIS_SECRET_ACCESS_KEY),
        ('TIGRIS_BUCKET_NAME', TIGRIS_BUCKET_NAME),
    ] if not value
]

if _missing_tigris:
    raise ImproperlyConfigured(
        "SECURITY: Missing required Tigris env vars: "
        f"{', '.join(_missing_tigris)}\n"
        "Get these from https://console.storage.dev\n"
        "and set them in Render's Environment tab."
    )

# Tigris uses a single global endpoint and "auto" region.
TIGRIS_ENDPOINT_URL = 'https://t3.storage.dev'
TIGRIS_REGION = 'auto'

# Build the base storage options shared by both 'default' and any
# future aliases.
_TIGRIS_STORAGE_OPTIONS = {
    'access_key': TIGRIS_ACCESS_KEY_ID,
    'secret_key': TIGRIS_SECRET_ACCESS_KEY,
    'bucket_name': TIGRIS_BUCKET_NAME,
    'region_name': TIGRIS_REGION,
    'endpoint_url': TIGRIS_ENDPOINT_URL,
    'signature_version': 's3v4',
    'addressing_style': 'virtual',
    'default_acl': 'public-read',
    'querystring_auth': False,
    'file_overwrite': False,
}

# Media URL — how Django/DRF will construct URLs for media files.
# Tigris provides a global URL format: https://<bucket>.t3.storage.dev/
MEDIA_URL = f'https://{TIGRIS_BUCKET_NAME}.t3.storage.dev/'

# Django 4.2+ storage configuration.
# `default` is used for FileField / ImageField (media files).
# `staticfiles` continues to use WhiteNoise so static assets ship
# with the container and don't need Tigris.
STORAGES = {
    'default': {
        'BACKEND': 'storages.backends.s3boto3.S3Boto3Storage',
        'OPTIONS': _TIGRIS_STORAGE_OPTIONS,
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

# Sanity check: make sure django-storages + boto3 are installed.
try:
    import storages  # noqa: F401
    import boto3     # noqa: F401
except ImportError as exc:
    raise ImproperlyConfigured(
        "SECURITY: django-storages and boto3 are required for Tigris storage. "
        "Add 'django-storages' and 'boto3' to requirements.txt.\n"
        f"Underlying error: {exc}"
    )


# ============================================
# LOGGING
# ============================================
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{levelname}] {asctime} {name}: {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django.security': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        # boto3/botocore logs every request at DEBUG. Keep them quiet.
        'boto3': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        'botocore': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        's3transfer': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}


# ============================================
# STARTUP BANNER
# ============================================
print(
    f"🚀 Using PRODUCTION settings "
    f"(DB: {os.environ.get('DB_HOST', 'not set')}, "
    f"DEBUG: {DEBUG}, "
    f"Tigris bucket: {TIGRIS_BUCKET_NAME}, "
    f"MEDIA_URL: {MEDIA_URL})"
)