from rest_framework_simplejwt.views import TokenBlacklistView

from ticket_bookings.models import UserProfile


class LogoutView(TokenBlacklistView):
    """Blacklist the refresh token and mark the JWT session inactive."""

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        user = getattr(request, 'user', None)
        if user is not None and user.is_authenticated:
            UserProfile.objects.filter(user=user).update(last_active=None)
        return response
