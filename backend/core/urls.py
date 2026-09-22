# backend/core/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework_simplejwt.views import TokenBlacklistView
from ticket_bookings.views import LoginView, MeView


def health_check(request):
    """Lightweight healthcheck for Render. No auth, no DB hit."""
    return HttpResponse("OK")


def home(request):
    """Minimal landing page. Does not leak endpoint names or internals."""
    return HttpResponse(
        "<h1>TicketVolt API</h1>"
        "<p>Service is running.</p>"
    )


urlpatterns = [
    # Home and health
    path('', home, name='home'),

    # Root-level health check — used by Render and other infrastructure.
    # Keep this; the production platform health probe hits /health/.
    path('health/', health_check, name='health_check'),

    # Alias under /api/ so mobile clients that normalize their base URL to
    # "http://host:8000/api" can probe the same health endpoint without
    # having to know about the root-level path. Both routes hit the same
    # view — no duplication of logic.
    path('api/health/', health_check, name='api_health_check'),

    # ============================================
    # Django Admin — served under a secret path.
    # ADMIN_URL is set via env on Render (e.g. "manage-a3f9c2b1/").
    # ============================================
    path(settings.ADMIN_URL, admin.site.urls),

    # Admin action URLs from the ticket_bookings app
    path(settings.ADMIN_URL, include('ticket_bookings.admin_urls')),

    # ============================================
    # JWT
    # ============================================
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/logout/', TokenBlacklistView.as_view(), name='token_blacklist'),

    # Custom Auth
    path('api/auth/login/', LoginView.as_view(), name='auth_login'),
    path('api/auth/me/', MeView.as_view(), name='auth_me'),

    # ============================================
    # App APIs
    # ============================================
    path('api/', include('ticket_bookings.urls')),
    path('api/whatsapp/', include('ticket_whatsapp.urls')),
]


# Serve media/static in development only
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)