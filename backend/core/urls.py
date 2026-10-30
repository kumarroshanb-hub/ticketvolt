# backend/core/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse, HttpResponseForbidden

from core.i18n_views import set_language_view

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


def _superuser_admin_gate(view):
    """
    Reject non-superusers BEFORE Django admin's login page renders.

    Belt-and-braces on top of `SuperuserOnlyAdminSite` (core/admin_site.py):

      • The swapped AdminSite prevents anyone but a superuser from
        ever getting a working admin session.
      • This URL-level gate also prevents the login page HTML from
        being served to non-superusers — so a tenant Admin doesn't
        even see a login form they can attempt to brute-force.

    Unauthenticated requests are redirected to the login page so a
    superuser landing on the URL still sees the form; authenticated
    non-superusers get an explicit 403.
    """
    from django.contrib.auth.views import redirect_to_login

    def wrapper(request, *args, **kwargs):
        if not request.user.is_active:
            return HttpResponseForbidden('Account inactive.')

        if not request.user.is_authenticated:
            return redirect_to_login(request.get_full_path())

        if not request.user.is_superuser:
            return HttpResponseForbidden(
                'Django admin is restricted to Platform Admin accounts.'
            )

        return view(request, *args, **kwargs)

    return wrapper


urlpatterns = [
    # ============================================
    # PUBLIC — no authentication required
    # ============================================
    path('', home, name='home'),
    path('health/', health_check, name='health_check'),
    path('api/health/', health_check, name='api_health_check'),

    # i18n — public (anonymous visitors must be able to switch the
    # landing-page language, and the cookie must persist server-side).
    path('i18n/setlang/', set_language_view, name='set_language'),
    path('api/i18n/setlang/', set_language_view, name='api_set_language'),

    # Auth — login is public by necessity; refresh + logout operate on
    # tokens the caller already holds.
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/logout/', TokenBlacklistView.as_view(), name='token_blacklist'),
    path('api/auth/login/', LoginView.as_view(), name='auth_login'),

    # ============================================
    # DJANGO ADMIN — Platform Admin (superuser) ONLY
    # ============================================
    # `settings.ADMIN_URL` is set via env (see core/settings/base.py).
    # The gate below rejects non-superusers before Django's login view
    # is even reached. `SuperuserOnlyAdminSite` (core/admin_site.py)
    # enforces the same rule a second time inside Django itself.
    path(
        settings.ADMIN_URL,
        _superuser_admin_gate(admin.site.urls),
        name='admin_root',
    ),

    # Admin action URLs from ticket_bookings. These are protected by
    # @staff_member_required on each view, and `is_staff` is now only
    # set for users a Platform Admin explicitly promoted — so a tenant
    # Admin promoted by a superuser still reaches them, but a demoted
    # user does not.
    path(settings.ADMIN_URL, include('ticket_bookings.admin_urls')),

    # ============================================
    # AUTHENTICATED — every view here enforces its own permission
    # ============================================
    path('api/auth/me/', MeView.as_view(), name='auth_me'),

    # ============================================
    # APP APIs — tenant-scoped viewsets
    # ============================================
    path('api/', include('ticket_bookings.urls')),
    path('api/whatsapp/', include('ticket_whatsapp.urls')),
]


# Serve media/static in development only
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)