# backend/core/permissions.py
from rest_framework import permissions

class IsOrganizerOrAdmin(permissions.BasePermission):
    """
    Permission check for Organizer or Admin users.
    - Admin: is_staff = True
    - Organizer: UserProfile.is_organizer = True
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Super admin or staff have access
        if request.user.is_staff:
            return True
        
        # Check if user has organizer profile with is_organizer=True
        if hasattr(request.user, 'profile') and request.user.profile.is_organizer:
            return True
        
        # Fallback: check if organizer attribute exists (for backward compatibility)
        if hasattr(request.user, 'organizer'):
            return True
        
        return False

class IsEventOrganizer(permissions.BasePermission):
    """
    Permission check for event organizers.
    - Admin: can access all events
    - Organizer: can only access their own events
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Super admin or staff can access everything
        if request.user.is_staff:
            return True
        
        # Check if user is the event organizer
        if hasattr(obj, 'organizer'):
            return obj.organizer == request.user
        
        # Check if user's profile has is_organizer=True and is the event owner
        if hasattr(request.user, 'profile') and request.user.profile.is_organizer:
            # For event objects, check if this user is the organizer
            if hasattr(obj, 'organizer_id'):
                return obj.organizer_id == request.user.id
        
        return False

class IsOrganizerUser(permissions.BasePermission):
    """
    Simple permission to check if user has organizer role.
    Used for filtering views to show only organizer data.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        if request.user.is_staff:
            return True
        
        if hasattr(request.user, 'profile') and request.user.profile.is_organizer:
            return True
        
        return False