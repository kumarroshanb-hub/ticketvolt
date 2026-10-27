# backend/ticket_bookings/services/settings_cache.py
from django.core.cache import cache
from ..models import SystemSettings

_CACHE_KEY = 'system_settings:v1'

def get_settings_cached():
    s = cache.get(_CACHE_KEY)
    if s is None:
        s = SystemSettings.get()
        cache.set(_CACHE_KEY, s, timeout=300)
    return s

def invalidate_settings_cache():
    cache.delete(_CACHE_KEY)