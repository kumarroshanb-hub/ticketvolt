# backend/core/settings/production.py
"""
Production settings - Neon + Cloud services (Render, etc.)
"""
from .base import *


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
    },
}

print(
    f"🚀 Using PRODUCTION settings "
    f"(DB: {os.environ.get('DB_HOST', 'not set')}, DEBUG: {DEBUG})"
)