# backend/core/settings/local.py
"""
Local development settings - Docker PostgreSQL
"""
from .base import *

DEBUG = True

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-local-dev-key')

ALLOWED_HOSTS = ['*']

# ============================================
# LOCAL DOCKER DATABASE
# ============================================
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'ticketvolt'),
        'USER': os.environ.get('DB_USER', 'ticketvolt'),
        'PASSWORD': os.environ.get('DB_PASSWORD', 'ticketvolt123'),
        'HOST': os.environ.get('DB_HOST', 'postgres'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

# CORS - Allow everything in local
CORS_ALLOW_ALL_ORIGINS = True

# Static files - no WhiteNoise needed
STATICFILES_STORAGE = 'django.contrib.staticfiles.storage.StaticFilesStorage'

# Email - print to console in local (optional)
# Uncomment to test emails without sending:
# EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

print("🔧 Using LOCAL settings (Docker PostgreSQL)")