"""
Billing / finance endpoints for tenant Admin and Staff.

Scope:
  • Super Admin  → every organization, with optional ?organization_id=
  • Owner/Admin  → their organization(s)
  • Staff        → their organization(s) (read-only billing)
  • Everyone else → 403

Ticket revenue, donations and refunds are derived from Bookings so the
numbers always agree with the Bookings and Analytics pages.
"""
from django.db.models import Q, Sum
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services.booking_emails import send_billing_receipt

from ..managers import (
    PENDING_BOOKING_STATUSES,
    SOLD_BOOKING_STATUSES,
)
from ..models import Booking
from ..services.tenancy import (
    filter_organization_param,
    is_platform_admin,
    user_operator_org_ids,
    visible_bookings,
)


class BillingTransactionSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source='event.title', read_only=True)
    event_id = serializers.UUIDField(source='event.id', read_only=True)
    net_amount = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'booking_reference', 'event_id', 'event_title',
            'customer_name', 'customer_email', 'customer_phone',
            'total_amount', 'discount_applied', 'net_amount',
            'donation_amount', 'donation_currency_code',
            'donation_tax_eligible', 'donation_tax_receipt_number',
            'donation_tax_receipt_issued_at',
            'status', 'payment_method', 'paid_at', 'created_at',
            'refund_amount',
        ]
        read_only_fields = fields

    def get_net_amount(self, obj):
        return obj.total_amount - (obj.discount_applied or 0)


class BillingPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


def _require_billing_access(user):
    if is_platform_admin(user):
        return
    if not user or not user.is_authenticated:
        raise PermissionDenied('Authentication required.')
    if not user_operator_org_ids(user):
        raise PermissionDenied(
            'Only organization Admins or Staff can access billing.'
        )


def _billing_queryset(user, request):
    qs = visible_bookings(user)
    return filter_organization_param(
        qs,
        request.query_params.get('organization_id'),
        field='event__organization',
    )


class BillingSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _require_billing_access(request.user)
        qs = _billing_queryset(request.user, request)

        sold = qs.filter(status__in=SOLD_BOOKING_STATUSES)
        gross = sold.aggregate(total=Sum('total_amount')).get('total') or 0
        donations = sold.aggregate(total=Sum('donation_amount')).get('total') or 0
        refunds = sold.aggregate(total=Sum('refund_amount')).get('total') or 0

        tax_receipts = (
            sold
            .exclude(donation_tax_receipt_number__isnull=True)
            .exclude(donation_tax_receipt_number='')
            .count()
        )
        eligible = sold.filter(
            donation_amount__gt=2000,
            donation_currency_code__iexact='HKD',
        )
        eligible_donations = (
            eligible.aggregate(total=Sum('donation_amount')).get('total') or 0
        )

        return Response({
            'gross_revenue': gross,
            'ticket_revenue': gross - donations,
            'donations': donations,
            'eligible_donations': eligible_donations,
            'tax_receipts_issued': tax_receipts,
            'refunds': refunds,
            'pending_bookings': qs.filter(
                status__in=PENDING_BOOKING_STATUSES
            ).count(),
            'sold_bookings': sold.count(),
            'total_bookings': qs.count(),
        })


class BillingTransactionsView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = BillingPagination

    def get(self, request):
        _require_billing_access(request.user)
        qs = _billing_queryset(request.user, request)

        status_filter = (request.query_params.get('status') or '').strip()
        if status_filter and status_filter != 'all':
            qs = qs.filter(status=status_filter)

        if request.query_params.get('donations') in ('1', 'true', 'yes'):
            qs = qs.filter(donation_amount__gt=0)

        search = (request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(booking_reference__icontains=search)
                | Q(customer_name__icontains=search)
                | Q(customer_email__icontains=search)
                | Q(event__title__icontains=search)
            )

        qs = qs.select_related('event').order_by('-created_at')

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = BillingTransactionSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class BillingSendEmailView(APIView):
    """Email billing receipts to one or many customers.

    POST body: {"booking_ids": ["<uuid>", ...]}
    Max 100 per request. Tax-receipt numbers are issued automatically
    for eligible donations before the email is sent.
    """
    permission_classes = [IsAuthenticated]

    MAX_BATCH = 100

    def post(self, request):
        _require_billing_access(request.user)

        raw_ids = request.data.get('booking_ids') or []
        if not isinstance(raw_ids, list) or not raw_ids:
            return Response(
                {'error': 'booking_ids must be a non-empty list.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(raw_ids) > self.MAX_BATCH:
            return Response(
                {'error': f'A maximum of {self.MAX_BATCH} bookings can be emailed at once.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = _billing_queryset(request.user, request).filter(id__in=raw_ids)
        bookings = list(
            qs.select_related('event', 'event__organization').order_by('created_at')
        )
        found_ids = {str(booking.id) for booking in bookings}
        missing = [str(bid) for bid in raw_ids if str(bid) not in found_ids]

        results = []
        sent = 0
        failed = 0

        for booking in bookings:
            result = send_billing_receipt(booking)
            if result.get('success'):
                sent += 1
            else:
                failed += 1
            results.append({
                'booking_id': str(booking.id),
                'booking_reference': booking.booking_reference,
                'email': booking.customer_email,
                'success': bool(result.get('success')),
                'message': result.get('message') or '',
                'tax_receipt_number': result.get('tax_receipt_number') or '',
            })

        for bid in missing:
            failed += 1
            results.append({
                'booking_id': bid,
                'success': False,
                'message': 'Booking not found in your billing scope.',
            })

        return Response({
            'sent': sent,
            'failed': failed,
            'results': results,
        }, status=status.HTTP_200_OK)
