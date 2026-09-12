# backend/core/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from ticket_bookings.views import LoginView, MeView

def health_check(request):
    return HttpResponse("OK")

def home(request):
    return HttpResponse("""
    <h1>🎫 TicketVolt API</h1>
    <p>API is running!</p>
    <ul>
        <li><a href="/admin/">Django Admin</a></li>
        <li><a href="/health/">Health Check</a></li>
        <li><a href="/api/events/">Events API</a></li>
        <li><a href="/api/bookings/">Bookings API</a></li>
        <li><a href="/api/whatsapp/">WhatsApp API</a></li>
    </ul>
    """)

urlpatterns = [
    # Home and health
    path('', home, name='home'),
    path('health/', health_check, name='health_check'),
    
    # Django Admin
    path('admin/', admin.site.urls),
    
    # JWT Authentication
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # Custom Auth
    path('api/auth/login/', LoginView.as_view(), name='auth_login'),
    path('api/auth/me/', MeView.as_view(), name='auth_me'),
    
    # API Routes
    path('api/', include('ticket_bookings.urls')),
    
    # WhatsApp API Routes
    path('api/whatsapp/', include('ticket_whatsapp.urls')),

        # If you want the admin action URLs
    path('admin/', include('ticket_bookings.admin_urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)