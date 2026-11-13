# backend/ticket_bookings/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter, SimpleRouter

from .api.event_api import EventViewSet
from .api.venue_api import VenueViewSet
from .api.booking_api import BookingViewSet
from .api.discount_api import DiscountViewSet
from .api.dashboard_api import DashboardStatsView
from .api.analytics_api import AnalyticsView
from .api.reports_api import ReportsView
from .api.billing_api import BillingSendEmailView, BillingSummaryView, BillingTransactionsView
from .api.qr_api import QRCodeDownloadView, QRCodeImageView
from .api.template_api import TemplateTypeViewSet, EventTemplateViewSet
from .api.user_api import UserViewSet
from .api.cancellation_policy_api import CancellationPolicyViewSet
from .api.settings_api import SystemSettingsView
from .api.organization_api import OrganizationViewSet
from .api.payment_config_api import OrganizationPaymentConfigView
from .api.domain_api import VerifyOrganizationDomainView
from .api.upload_api import EventImageUploadView, OrganizationLogoUploadView, OrganizationSlugAvailabilityView, PublicOrganizationView
from .api.security_api import SecurityStatusView
from .api.features_api import (
    FeatureDefinitionViewSet, FeaturePackageViewSet,
    MyFeaturesView, OrganizationFeatureViewSet,
)
from .api.commercial_api import (
    AcceptTicketTransferView, AnnualDonationStatementView,
    AuditLogViewSet, CreateTicketTransferView, DonationReceiptExportView,
    ExportPackView, OrganizerPayoutViewSet, PatronContactView, PatronsExportView,
)

from .api.feedback_api import EventFeedbackSendView, public_feedback
from .api.google_oauth_api import google_start, google_callback, google_exchange
from .api.auth_api import (
    auth_method_config,
    request_magic_link,
    verify_magic_link,
    send_organization_invite,
    request_otp,
    verify_otp,
)

from .api.active_sessions_api import ActiveSessionsView

from .views import (
    checkin_verify,
    checkin_perform,
    checkin_offline_pack,
    checkin_offline_sync,
    checkin_history,
    checkin_manual_verify,
    checkin_manual,
    run_scheduled_tasks,
    cron_health,
    EventSeatMapViewSet,
    # ✅ NEW: read-only venue master snapshots used by the Create Event
    # wizard's seat-plan step.
    VenueMasterViewSet,
)

from .api.payments_api import (
    create_checkout, verify_checkout, checkout_status,
    razorpay_webhook, stripe_webhook, organization_webhook, refund_payment,
)

from .api.venue_layout_api import (
    get_venue_layout,
    upload_venue_layout,
    set_seat_accessible,
    venue_categories,
    assign_seats_to_category,
    clear_seat_category,
)

# ✅ Membership — checkout/verify are @actions on MembershipViewSet
# (wired by the router). Only the module-level review views and the
# two viewsets are imported here.
from .api.membership_api import (
    MembershipTierViewSet,
    MembershipViewSet,
    list_pending_offline,
    bulk_upload_offline_members,
    review_offline_membership,
    bulk_review_offline_memberships,
)

from .api.event_venue_plan_api import (
    EventSeatAssignBulkView,
    EventSeatCategoryCreateView,
    EventSeatCategoryUpdateView,
    EventSeatUnassignView,
    EventVenuePlanView,
)

# ============================================================
# ROUTER
# ============================================================
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
router.register(
    r'organizations',
    OrganizationViewSet,
    basename='organization',
)
router.register(r'membership-tiers', MembershipTierViewSet, basename='membership-tier')
router.register(r'memberships', MembershipViewSet, basename='membership')
router.register(r'payouts', OrganizerPayoutViewSet, basename='payout')
router.register(r'audit-logs', AuditLogViewSet, basename='audit-log')
router.register(r'platform/features', FeatureDefinitionViewSet, basename='platform-feature')
router.register(r'platform/feature-packages', FeaturePackageViewSet, basename='platform-feature-package')
router.register(r'platform/organization-features', OrganizationFeatureViewSet, basename='platform-organization-feature')

# ✅ FIX: this was missing. Without this line, `/api/venue-masters/` and
# `/api/venue-masters/<id>/` do not exist, so the Create Event wizard's
# seat-plan step can never fetch a master snapshot and the canvas
# never renders.
router.register(
    r'venue-masters',
    VenueMasterViewSet,
    basename='venue-master',
)


# ============================================================
# URL PATTERNS
# ============================================================
urlpatterns = [
    # ============ CRON ============
    path('cron/health/', cron_health, name='cron-health'),
    path('cron/run-tasks/', run_scheduled_tasks, name='cron-run-tasks'),

    # ============ ADMIN: ACTIVE SESSIONS ============
    path(
        'admin/active-sessions/',
        ActiveSessionsView.as_view(),
        name='admin-active-sessions',
    ),

    # ============ SCANNER ============
    path('checkin/verify/', checkin_verify, name='checkin-verify'),
    path('checkin/offline-pack/', checkin_offline_pack, name='checkin-offline-pack'),
    path('checkin/offline-sync/', checkin_offline_sync, name='checkin-offline-sync'),
    path('checkin/history/', checkin_history, name='checkin-history'),
    path('checkin/', checkin_perform, name='checkin'),
    path('checkin/manual-verify/', checkin_manual_verify, name='checkin-manual-verify'),
    path('checkin/manual/', checkin_manual, name='checkin-manual'),

    # ============ SEAT MAP ============
    # ⚠️ FIX: this used to be `router.register(r'events/(?P<event_pk>[^/.]+)/seat-map', ...)`.
    # DRF's router.register() accepts a URL prefix, NOT a regex, so
    # `(?P<event_pk>[^/.]+)` was being treated as a literal segment —
    # the route never matched anything. Worse, registering a second
    # prefix starting with `events/` pushes the router's `/events/<pk>/`
    # detail routes below it and can shadow them. A plain `path()`
    # with a `<uuid:…>` converter is both correct and unambiguous.
    path(
        'events/<uuid:event_pk>/seat-map/',
        EventSeatMapViewSet.as_view({'get': 'list'}),
        name='event-seat-map',
    ),
    # ============ MEMBERSHIP OFFLINE REVIEW ============
    # Checkout and verify are exposed by the router via
    # MembershipViewSet.checkout / .verify. Only the review endpoints
    # remain explicit — they are plain function views, not viewset
    # actions.
    path(
        'memberships/pending-offline/',
        list_pending_offline,
        name='membership-pending-offline',
    ),
    path(
        'memberships/offline-upload/',
        bulk_upload_offline_members,
        name='membership-offline-upload',
    ),
    path(
        'memberships/<uuid:membership_id>/review/',
        review_offline_membership,
        name='membership-review',
    ),
    path(
        'memberships/bulk-review/',
        bulk_review_offline_memberships,
        name='membership-bulk-review',
    ),
    # Must be declared BEFORE the router so `organizations/payment-config`
    # is not captured as an Organization detail pk.
    path('tickets/<uuid:ticket_id>/transfer/', CreateTicketTransferView.as_view(), name='ticket-transfer'),
    path('ticket-transfers/<uuid:token>/accept/', AcceptTicketTransferView.as_view(), name='ticket-transfer-accept'),
    path('donations/annual-statement/', AnnualDonationStatementView.as_view(), name='annual-donation-statement'),
    path('donations/receipts/export/', DonationReceiptExportView.as_view(), name='donation-receipt-export'),
    path('bookings/patrons-export/', PatronsExportView.as_view(), name='patrons-export'),
    path('bookings/<uuid:booking_id>/patron-contact/', PatronContactView.as_view(), name='patron-contact'),
    path('reports/export-pack/', ExportPackView.as_view(), name='export-pack'),
    path('features/mine/', MyFeaturesView.as_view(), name='my-features'),
    path('security/status/', SecurityStatusView.as_view(), name='security-status'),
    path('uploads/event-image/', EventImageUploadView.as_view(), name='event-image-upload'),
    path('uploads/organization-logo/', OrganizationLogoUploadView.as_view(), name='organization-logo-upload'),
    path('organizations/slug-available/', OrganizationSlugAvailabilityView.as_view(), name='organization-slug-available'),
    path('organizations/public/<slug:slug>/', PublicOrganizationView.as_view(), name='public-organization'),
    path('organizations/payment-config/', OrganizationPaymentConfigView.as_view(), name='organization-payment-config'),
    path('organizations/<uuid:org_id>/verify-domain/', VerifyOrganizationDomainView.as_view(), name='organization-verify-domain'),
    # ============ ROUTER ============
    path('', include(router.urls)),


    # ============ DASHBOARD / ANALYTICS / SETTINGS ============
    # NOTE: `bookings/bulk_action/` is NOT declared here — it is an
    # @action(detail=False) on BookingViewSet and is already exposed by
    # the router above at `/api/bookings/bulk_action/`. Declaring it
    # again here was a duplicate URL registration.
    path('dashboard/stats/', DashboardStatsView.as_view(), name='dashboard_stats'),
    path('analytics/', AnalyticsView.as_view(), name='analytics'),
    path('reports/', ReportsView.as_view(), name='reports'),
    path('payments/webhook/<uuid:org_id>/<str:gateway>/', organization_webhook, name='organization-payment-webhook'),
    path('billing/summary/', BillingSummaryView.as_view(), name='billing_summary'),
    path('billing/transactions/', BillingTransactionsView.as_view(), name='billing_transactions'),
    path('billing/send-email/', BillingSendEmailView.as_view(), name='billing_send_email'),
    path('settings/', SystemSettingsView.as_view(), name='system-settings'),

    # ============ QR ============
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

    # ============ LEGACY / COMPATIBILITY ============
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

    # ============ PUBLIC ============
    path('events/public/', EventViewSet.as_view({'get': 'public'}), name='events-public'),
    path('events/public/<uuid:pk>/', EventViewSet.as_view({'get': 'public_detail'}), name='events-public-detail'),
    path(
        'bookings/<uuid:pk>/cancel_tickets/',
        BookingViewSet.as_view({'post': 'cancel_tickets'}),
        name='booking-cancel-tickets',
    ),

    # ============ AUTH ============
    path('auth/config/', auth_method_config, name='auth-method-config'),
    path('events/<uuid:event_id>/feedback-send/', EventFeedbackSendView.as_view(), name='event-feedback-send'),
    path('feedback/<str:token>/', public_feedback, name='public-feedback'),
    path('auth/google/start/', google_start, name='google-auth-start'),
    path('auth/google/callback/', google_callback, name='google-auth-callback'),
    path('auth/google/exchange/', google_exchange, name='google-auth-exchange'),
    path('auth/request-magic-link/', request_magic_link, name='request-magic-link'),
    path('auth/verify-magic-link/', verify_magic_link, name='verify-magic-link'),
    path('organizations/<uuid:org_id>/invite/', send_organization_invite, name='send-org-invite'),
    path('auth/request-otp/', request_otp, name='request-otp'),
    path('auth/verify-otp/', verify_otp, name='verify-otp'),

    # ============ PAYMENTS ============
    path('payments/checkout/', create_checkout, name='payment-checkout'),
    path('payments/verify/', verify_checkout, name='payment-verify'),
    path('payments/<uuid:payment_id>/status/', checkout_status, name='payment-status'),
    path('payments/<uuid:payment_id>/refund/', refund_payment, name='payment-refund'),
    path('webhooks/razorpay/', razorpay_webhook, name='webhook-razorpay'),
    path('webhooks/stripe/', stripe_webhook, name='webhook-stripe'),

    # ============ VENUE LAYOUT ============
    path('venues/<uuid:venue_id>/layout/', get_venue_layout, name='venue-layout-get'),
    path('venues/<uuid:venue_id>/layout/upload/', upload_venue_layout, name='venue-layout-upload'),
    path('venues/<uuid:venue_id>/categories/', venue_categories, name='venue-categories'),
    path('venues/<uuid:venue_id>/categories/assign/', assign_seats_to_category, name='assign-seats-to-category'),
    path('venues/<uuid:venue_id>/categories/clear/', clear_seat_category, name='clear-seat-category'),
    path('seats/<uuid:seat_id>/accessibility/', set_seat_accessible, name='seat-accessibility'),


    path(
        'events/<uuid:event_id>/venue-plan/',
        EventVenuePlanView.as_view(),
        name='event-venue-plan',
    ),
    path(
        'events/<uuid:event_id>/venue-plan/categories/',
        EventSeatCategoryCreateView.as_view(),
        name='event-venue-plan-category-create',
    ),
    path(
        'events/<uuid:event_id>/venue-plan/categories/<uuid:category_id>/',
        EventSeatCategoryUpdateView.as_view(),
        name='event-venue-plan-category',
    ),
    path(
        'events/<uuid:event_id>/venue-plan/assign/',
        EventSeatAssignBulkView.as_view(),
        name='event-venue-plan-assign',
    ),
    path(
        'events/<uuid:event_id>/venue-plan/unassign/',
        EventSeatUnassignView.as_view(),
        name='event-venue-plan-unassign',
    ),

]