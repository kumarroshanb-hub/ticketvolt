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

# Scanner views (signed-QR verification + atomic check-in + history).
# These live in views.py at the ticket_bookings app root.
from .views import checkin_verify, checkin_perform, checkin_history

# Create router and register all view sets
router = DefaultRouter()
router.register(r'events', EventViewSet, basename='event')
router.register(r'venues', VenueViewSet, basename='venue')
router.register(r'bookings', BookingViewSet, basename='booking')
# NOTE: the old `checkin` viewset used to be registered here. It is
# replaced by the explicit signed-QR endpoints below. If you still need
# the DRF list/detail routes for CheckInLog, register that viewset under
# a different prefix, e.g. `router.register(r'checkin-logs', CheckInViewSet, ...)`,
# so it does not shadow `checkin/verify/`, `checkin/history/` and `checkin/`.
router.register(r'discounts', DiscountViewSet, basename='discount')
router.register(r'template-types', TemplateTypeViewSet, basename='template-type')
router.register(r'templates', EventTemplateViewSet, basename='template')
router.register(r'users', UserViewSet, basename='user')


urlpatterns = [
    # ============ SIGNED-QR SCANNER ENDPOINTS ============
    # Explicit paths MUST come before the router include so they are not
    # shadowed by any router-registered `checkin/` route.
    #
    # Order within this block matters: Django matches top-to-bottom, so
    # the more specific `checkin/history/` and `checkin/verify/` must
    # appear before the bare `checkin/` prefix.
    path('checkin/verify/', checkin_verify, name='checkin-verify'),
    path('checkin/history/', checkin_history, name='checkin-history'),
    path('checkin/', checkin_perform, name='checkin'),

    # ============ API Router URLs ============
    path('', include(router.urls)),

    # ============ BULK ACTION - Explicitly added ============
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
        # Renamed from 'booking-refund' to avoid a duplicate reverse() name
        # with the newer refund_booking route above.
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
]