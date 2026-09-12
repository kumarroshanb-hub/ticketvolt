# backend/core/decorators.py
from functools import wraps
from django.http import JsonResponse
from django.contrib.auth.models import User

def role_required(allowed_roles):
    """
    Decorator to restrict access based on user role
    allowed_roles: list of roles allowed to access the view
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return JsonResponse(
                    {'error': 'Authentication required'},
                    status=401
                )
            
            # Determine user role
            user = request.user
            role = 'user'
            if user.is_superuser:
                role = 'super_admin'
            elif user.is_staff:
                role = 'admin'
            elif hasattr(user, 'organizer_profile'):
                role = 'organizer'
            
            # Super admin can access everything
            if role == 'super_admin':
                return view_func(request, *args, **kwargs)
            
            # Check if user has required role
            if role not in allowed_roles:
                return JsonResponse(
                    {'error': 'Permission denied', 'required_roles': allowed_roles},
                    status=403
                )
            
            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator

def organizer_required(view_func):
    """Organizer or above can access"""
    return role_required(['organizer', 'admin', 'super_admin'])(view_func)

def admin_required(view_func):
    """Admin or above can access"""
    return role_required(['admin', 'super_admin'])(view_func)

def super_admin_required(view_func):
    """Super admin only can access"""
    return role_required(['super_admin'])(view_func)