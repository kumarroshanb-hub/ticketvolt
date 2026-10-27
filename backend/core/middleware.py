# backend/core/middleware.py
from django.utils.deprecation import MiddlewareMixin
from django.utils import timezone
from datetime import timedelta

class HealthCheckMiddleware(MiddlewareMixin):
    def process_request(self, request):
        if request.path == '/health/':
            from django.http import HttpResponse
            return HttpResponse("OK")
        return None


class ActivityTrackingMiddleware(MiddlewareMixin):
    """
    ✅ Tracks active JWT users for the SuperAdmin "Active Sessions" page.
    
    IMPORTANT: We use process_response, NOT process_request.
    DRF's JWT authentication happens inside the view. By the time the
    request enters middleware, request.user is still AnonymousUser.
    process_response guarantees the view has finished and request.user
    is fully populated.
    """
    def process_response(self, request, response):
        if request.user and request.user.is_authenticated:
            from ticket_bookings.models import UserProfile
            
            now = timezone.now()
            
            # Only update if the last stamp is older than 2 minutes,
            # to avoid spamming the DB on every poll / auto-refresh.
            two_minutes_ago = now - timedelta(minutes=2)
            
            updated = UserProfile.objects.filter(
                user=request.user,
                last_active__lt=two_minutes_ago,
            ).update(last_active=now)
            
            # Catch the very first request (or rows where last_active is NULL)
            if updated == 0:
                UserProfile.objects.filter(
                    user=request.user,
                    last_active__isnull=True,
                ).update(last_active=now)
        return response