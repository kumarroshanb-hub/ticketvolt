# backend/core/settings/__init__.py
"""
Settings selector - Switches between local and production
based on the ENVIRONMENT variable.

Usage:
    ENVIRONMENT=local   → Uses local Docker PostgreSQL
    ENVIRONMENT=production → Uses Neon + Cloud services

Default: local
"""
import os

environment = os.environ.get('ENVIRONMENT', 'local').lower()

if environment in ('production', 'prod', 'render', 'cloud'):
    from .production import *
elif environment in ('local', 'dev', 'development'):
    from .local import *
else:
    raise ValueError(f"Unknown ENVIRONMENT: '{environment}'. Use 'local' or 'production'")