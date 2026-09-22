# backend/core/settings/local.py
"""
Local development settings — Docker PostgreSQL.

Notes:
  • SECRET_KEY, JWT_SIGNING_KEY, and TICKET_SIGNING_SECRET are REQUIRED
    in EVERY environment, including local. Provide them via
    backend/.env.local.

  • This file intentionally does NOT provide hardcoded fallbacks.
    A missing env var must fail loudly at startup so the same code path
    that protects production also protects your laptop.

  • To set up a fresh local environment:
      cd backend
      cp .env.local.example .env.local
      # Then paste generated values for SECRET_KEY, JWT_SIGNING_KEY, and
      # TICKET_SIGNING_SECRET:
      #   python -c "from django.core.management.utils import get_random_secret_key as k; print(k())"
      #   openssl rand -base64 64
      #   openssl rand -base64 48

  • ALLOWED_HOSTS is explicit. Add extra hosts via the env var.
"""
import os

from .base import *


# ============================================
# DEBUG
# ============================================
DEBUG = True


# ============================================
# 🔐 SECRET_KEY / JWT_SIGNING_KEY / TICKET_SIGNING_SECRET
# ============================================
# base.py already requires these env vars and enforces they are ≥ the
# min length and different from each other. We deliberately do NOT
# provide fallback constants here.
#
# If you're seeing an ImproperlyConfigured error at startup, that is
# BY DESIGN. Set the env vars in backend/.env.local (gitignored).


# ============================================
# HOSTS — explicit, NOT wildcard
# ============================================
_allowed = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '[::1]',
    'backend',
    'host.docker.internal',
]

_extra = os.environ.get('ALLOWED_HOSTS_EXTRA', '').strip()
if _extra:
    _allowed.extend([h.strip() for h in _extra.split(',') if h.strip()])

ALLOWED_HOSTS = _allowed


# ============================================
# LOCAL DOCKER DATABASE
# ============================================
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'ticketvolt'),
        'USER': os.environ.get('DB_USER', 'ticketvolt'),
        'PASSWORD': os.environ.get('DB_PASSWORD'),
        'HOST': os.environ.get('DB_HOST', 'postgres'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

if not DATABASES['default']['PASSWORD']:
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured(
        "DB_PASSWORD environment variable is required. "
        "Set it in backend/.env.local (see .env.local.example)."
    )


# ============================================
# CORS — allowlist based, NOT wildcard
# ============================================
_cors_defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
]

_cors_env = os.environ.get('CORS_ALLOWED_ORIGINS', '').strip()
if _cors_env:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_env.split(',') if o.strip()]
else:
    CORS_ALLOWED_ORIGINS = _cors_defaults

CORS_ALLOW_ALL_ORIGINS = os.environ.get('CORS_ALLOW_ALL_ORIGINS', 'False') == 'True'
CORS_ALLOW_CREDENTIALS = True


# ============================================
# STATIC FILES — no WhiteNoise locally
# ============================================
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
    },
}


# ============================================
# EMAIL — print to console locally (opt-in)
# ============================================
# EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'


# ============================================
# STARTUP LOG (no secret values echoed)
# ============================================
print("🔧 Using LOCAL settings (Docker PostgreSQL)")
print(f"🔑 SECRET_KEY length: {len(SECRET_KEY)}")
print(f"🔑 JWT_SIGNING_KEY length: {len(JWT_SIGNING_KEY)}")
print(f"🔑 TICKET_SIGNING_SECRET length: {len(TICKET_SIGNING_SECRET)}")
print(
    "🔐 All three secrets are independent: "
    f"{len({SECRET_KEY, JWT_SIGNING_KEY, TICKET_SIGNING_SECRET}) == 3}"
)
print(f"🌐 ALLOWED_HOSTS: {ALLOWED_HOSTS}")
print(f"🌐 CORS_ALLOWED_ORIGINS: {CORS_ALLOWED_ORIGINS}")