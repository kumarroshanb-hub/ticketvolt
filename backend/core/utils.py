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
    """Get client IP from request"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip