import random
import string
import uuid

def generate_unique_code(prefix='TIX', length=12):
    """Generate a unique code for tickets"""
    return prefix + ''.join(random.choices(string.digits + string.ascii_uppercase, k=length))

def generate_booking_reference():
    """Generate a unique booking reference"""
    return 'BK' + ''.join(random.choices(string.digits, k=10))

def get_client_ip(request):
    """Return the client IP, trusting X-Forwarded-For only when configured.

    SECURITY (pentest F9): a client can send any X-Forwarded-For value, so
    the header must never be trusted by default. Set TRUSTED_PROXY_COUNT to
    the number of reverse proxies in front of the app (e.g. 1 for a single
    nginx) to read the correct hop; otherwise the TCP peer address
    (REMOTE_ADDR) is authoritative.
    """
    from django.conf import settings

    remote_addr = request.META.get('REMOTE_ADDR')
    proxy_count = int(getattr(settings, 'TRUSTED_PROXY_COUNT', 0) or 0)
    if proxy_count <= 0:
        return remote_addr

    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    hops = [part.strip() for part in forwarded.split(',') if part.strip()]
    # nginx appends the peer address, so the last proxy_count entries are
    # trustworthy; the client-supplied prefix is not.
    if len(hops) >= proxy_count:
        return hops[-proxy_count]
    return remote_addr