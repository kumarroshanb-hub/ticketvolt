# ticket_bookings/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .api.event_api import EventViewSet
from .api.venue_api import VenueViewSet
from .api.booking_api import BookingViewSet
from .api.discount_api import DiscountViewSet
from .api.dashboard_api import DashboardStatsView
from .api.analytics_api import AnalyticsView
from .api.qr_api import QRCodeDownloadView, QRCodeImageView
from .api.template_api import TemplateTypeViewSet, EventTemplateViewSet
from .api.user_api import UserViewSet
from .api.cancellation_policy_api import CancellationPolicyViewSet

# Scanner views.
# - checkin_verify / checkin_perform: signed-payload (mobile app)
# - checkin_manual_verify / checkin_manual: bare-code (admin web UI)
# - checkin_history: shared
from .views import (
    checkin_verify,
    checkin_perform,
    checkin_history,
    checkin_manual_verify,
    checkin_manual,
)

# Create router and register all view sets
router = DefaultRouter()
router.register(r'events', EventViewSet, basename='event')
router.register(r'venues', VenueViewSet, basename='venue')
router.register(r'bookings', BookingViewSet, basename='booking')
router.register(r'discounts', DiscountViewSet, basename='discount')
router.register(r'template-types', TemplateTypeViewSet, basename='template-type')
router.register(r'templates', EventTemplateViewSet, basename='template')
router.register(r'users', UserViewSet, basename='user')
router.register(
    r'cancellation-policies',
    CancellationPolicyViewSet,
    basename='cancellation-policy',
)

urlpatterns = [
    # ============ SCANNER ENDPOINTS ============
    # Order matters: Django matches top-to-bottom, so the more specific
    # paths must come before the bare `checkin/` prefix.
    #
    # Signed-payload endpoints (mobile app):
    path('checkin/verify/', checkin_verify, name='checkin-verify'),
    path('checkin/history/', checkin_history, name='checkin-history'),
    path('checkin/', checkin_perform, name='checkin'),

    # Manual-entry endpoints (admin web UI):
    path('checkin/manual-verify/', checkin_manual_verify, name='checkin-manual-verify'),
    path('checkin/manual/', checkin_manual, name='checkin-manual'),

    # ============ API Router URLs ============
    path('', include(router.urls)),

    # ============ BULK ACTION ============
    path(
        'bookings/bulk_action/',
        BookingViewSet.as_view({'post': 'bulk_action'}),
        name='booking-bulk-action',
    ),

    # Dashboard & Analytics
    path('dashboard/stats/', DashboardStatsView.as_view(), name='dashboard_stats'),
    path('analytics/', AnalyticsView.as_view(), name='analytics'),

    # QR Code URLs
    path('qr/download/<uuid:ticket_id>/', QRCodeDownloadView.as_view(), name='qr-download'),
    path('qr/image/<uuid:ticket_id>/', QRCodeImageView.as_view(), name='qr-image'),

    # ============ BOOKING ADMIN ACTIONS ============
    path(
        'bookings/<uuid:pk>/confirm_payment_and_issue_tickets/',
        BookingViewSet.as_view({'post': 'confirm_payment_and_issue_tickets'}),
        name='booking-confirm-payment-issue',
    ),
    path(
        'bookings/<uuid:pk>/mark_payment_received/',
        BookingViewSet.as_view({'post': 'mark_payment_received'}),
        name='booking-mark-payment',
    ),
    path(
        'bookings/<uuid:pk>/issue_tickets/',
        BookingViewSet.as_view({'post': 'issue_tickets'}),
        name='booking-issue-tickets',
    ),
    path(
        'bookings/<uuid:pk>/regenerate_ticket_qr/',
        BookingViewSet.as_view({'post': 'regenerate_ticket_qr'}),
        name='booking-regenerate-qr',
    ),
    path(
        'bookings/<uuid:pk>/cancel_booking/',
        BookingViewSet.as_view({'post': 'cancel_booking'}),
        name='booking-cancel',
    ),
    path(
        'bookings/<uuid:pk>/refund_booking/',
        BookingViewSet.as_view({'post': 'refund_booking'}),
        name='booking-refund',
    ),
    path(
        'bookings/<uuid:pk>/tickets/',
        BookingViewSet.as_view({'get': 'tickets'}),
        name='booking-tickets',
    ),
    path(
        'bookings/<uuid:pk>/checkins/',
        BookingViewSet.as_view({'get': 'checkins'}),
        name='booking-checkins',
    ),

    # ============ LEGACY/COMPATIBILITY URLS ============
    path(
        'bookings/<uuid:pk>/confirm_payment/',
        BookingViewSet.as_view({'post': 'confirm_payment'}),
        name='booking-confirm-payment',
    ),
    path(
        'bookings/<uuid:pk>/refund/',
        BookingViewSet.as_view({'post': 'refund'}),
        name='booking-refund-legacy',
    ),
    path(
        'bookings/<uuid:pk>/apply_discount/',
        BookingViewSet.as_view({'post': 'apply_discount'}),
        name='booking-apply-discount',
    ),
    path(
        'bookings/<uuid:pk>/resend_tickets/',
        BookingViewSet.as_view({'post': 'resend_tickets'}),
        name='booking-resend-tickets',
    ),

    # ============ PUBLIC ENDPOINTS (No Auth Required) ============
    path(
        'events/public/',
        EventViewSet.as_view({'get': 'public'}),
        name='events-public',
    ),
    path(
        'events/public/<uuid:pk>/',
        EventViewSet.as_view({'get': 'public_detail'}),
        name='events-public-detail',
    ),
    path(
        'bookings/<uuid:pk>/cancel_tickets/',
        BookingViewSet.as_view({'post': 'cancel_tickets'}),
        name='booking-cancel-tickets',
    ),
]