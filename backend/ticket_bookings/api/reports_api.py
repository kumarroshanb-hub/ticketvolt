"""
Tenant-scoped Reports API.

One endpoint returns a compact report bundle for the selected date range
and (optional) organization. Org managers only; platform superusers may
select any organization.
"""
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAnyOrgFinance

from ..managers import (
    EXCLUDED_TICKET_STATUSES,
    PENDING_BOOKING_STATUSES,
    SOLD_BOOKING_STATUSES,
)
from ..models import Booking, Discount, DiscountUsage, Event, Ticket, CheckInLog
from ..models_membership import Membership
from ..models_tenancy import Organization
from ..services.tenancy import (
    can_view_finance, visible_bookings, visible_events, visible_organizations,
    visible_tickets,
)


def _dec(value):
    return float(value or Decimal('0.00'))


def _parse_range(request):
    now = timezone.now()
    raw_start = request.query_params.get('start')
    raw_end = request.query_params.get('end')

    start = parse_datetime(raw_start) if raw_start else None
    if start is None and raw_start:
        d = parse_date(raw_start)
        if d:
            start = timezone.make_aware(
                datetime.combine(d, time.min), timezone.get_current_timezone(),
            )
    end = parse_datetime(raw_end) if raw_end else None
    if end is None and raw_end:
        d = parse_date(raw_end)
        if d:
            end = timezone.make_aware(
                datetime.combine(d, time.max), timezone.get_current_timezone(),
            )
    if start is None:
        start = now - timedelta(days=30)
    if end is None:
        end = now
    return start, end


class ReportsView(APIView):
    permission_classes = [IsAuthenticated, IsAnyOrgFinance]

    def get(self, request):
        user = request.user
        org_id = request.query_params.get('organization_id')
        organization = None

        if org_id:
            organization = Organization.objects.filter(pk=org_id).first()
            if organization is None:
                return Response({'error': 'Organization not found.'}, status=404)
            if not can_view_finance(user, organization):
                return Response({'error': 'Permission denied.'}, status=403)

        start, end = _parse_range(request)

        events_qs = visible_events(user)
        if organization is not None:
            events_qs = events_qs.filter(organization=organization)

        bookings_qs = visible_bookings(user).filter(
            event__in=events_qs,
            created_at__gte=start,
            created_at__lte=end,
        )
        tickets_qs = visible_tickets(user).filter(booking__in=bookings_qs)
        sold = bookings_qs.filter(status__in=SOLD_BOOKING_STATUSES)
        sold_tickets = tickets_qs.filter(booking__in=sold).exclude(
            status__in=EXCLUDED_TICKET_STATUSES,
        )
        used_tickets = tickets_qs.filter(status='used')

        revenue = sold.aggregate(
            gross=Sum('total_amount'),
            discounts=Sum('discount_applied'),
            refunds=Sum('refund_amount'),
            donations=Sum('donation_amount'),
        )
        gross = _dec(revenue['gross'])
        discounts = _dec(revenue['discounts'])
        refunds = _dec(revenue['refunds'])
        donations = _dec(revenue['donations'])
        net = gross - discounts - refunds
        tickets_sold = sold_tickets.count()
        attended = used_tickets.count()

        sales_by_event = list(
            sold.values('event__id', 'event__title')
            .annotate(
                bookings=Count('id', distinct=True),
                gross=Sum('total_amount'),
                discounts=Sum('discount_applied'),
                refunds=Sum('refund_amount'),
                donations=Sum('donation_amount'),
            )
            .order_by('-gross')[:100]
        )
        sales_by_event = [
            {
                'event_id': str(r['event__id']),
                'event': r['event__title'],
                'bookings': r['bookings'],
                'gross': _dec(r['gross']),
                'discounts': _dec(r['discounts']),
                'refunds': _dec(r['refunds']),
                'donations': _dec(r['donations']),
                'net': _dec(r['gross']) - _dec(r['discounts']) - _dec(r['refunds']),
            }
            for r in sales_by_event
        ]

        by_day = list(
            sold.annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(bookings=Count('id'), gross=Sum('total_amount'), donations=Sum('donation_amount'))
            .order_by('day')
        )
        by_day = [
            {
                'date': r['day'].isoformat() if r['day'] else None,
                'bookings': r['bookings'],
                'gross': _dec(r['gross']),
                'donations': _dec(r['donations']),
            }
            for r in by_day
        ]

        attendance_rows = (
            sold_tickets.values('event__id', 'event__title')
            .annotate(
                issued=Count('id', distinct=True),
                used=Count('id', filter=Q(status='used'), distinct=True),
            )
            .order_by('-issued')[:100]
        )
        attendance_by_event = [
            {
                'event_id': str(r['event__id']),
                'event': r['event__title'],
                'issued': r['issued'],
                'used': r['used'],
                'rate': round((r['used'] / r['issued']) * 100, 2) if r['issued'] else 0,
            }
            for r in attendance_rows
        ]

        # Memberships (org-scoped, independent of event date range).
        #
        # Do NOT derive this from events_qs: an organisation with no events
        # (very common for a new tenant) must still contribute its
        # membership counts and revenue to the "All Organizations" report.
        if organization is not None:
            org_ids = [organization.id]
        elif user.is_superuser:
            org_ids = list(Organization.objects.values_list('id', flat=True))
        else:
            org_ids = [
                org.id for org in visible_organizations(user)
                if can_view_finance(user, org)
            ]
        memberships = Membership.objects.filter(organization_id__in=org_ids)
        active_memberships = memberships.filter(
            status=Membership.Status.ACTIVE,
        ).filter(Q(valid_until__isnull=True) | Q(valid_until__gte=timezone.now()))
        membership_by_tier = list(
            active_memberships.values('tier__name')
            .annotate(count=Count('id'), revenue=Sum('price_paid'))
            .order_by('-count')[:50]
        )
        expiring = memberships.filter(
            status=Membership.Status.ACTIVE,
            valid_until__gte=timezone.now(),
            valid_until__lte=timezone.now() + timedelta(days=30),
        ).count()

        donation_rows = (
            sold.filter(donation_amount__gt=0)
            .values('event__id', 'event__title')
            .annotate(
                total=Sum('donation_amount'),
                donations=Count('id'),
                eligible=Count(
                    'id',
                    filter=Q(donation_amount__gt=2000, donation_currency_code='HKD'),
                ),
                receipts=Count(
                    'id', filter=Q(donation_tax_receipt_issued_at__isnull=False),
                ),
            )
            .order_by('-total')[:100]
        )
        donation_by_event = [
            {
                'event_id': str(r['event__id']),
                'event': r['event__title'],
                'total': _dec(r['total']),
                'donations': r['donations'],
                'eligible': r['eligible'],
                'receipts': r['receipts'],
            }
            for r in donation_rows
        ]

        usage = DiscountUsage.objects.filter(
            discount__organization_id__in=org_ids,
            applied_at__gte=start,
            applied_at__lte=end,
        )
        discount_usage = list(
            usage.values('discount__code')
            .annotate(count=Count('id'), total=Sum('amount_applied'))
            .order_by('-total')[:50]
        )

        pending = list(
            bookings_qs.filter(status__in=PENDING_BOOKING_STATUSES)
            .select_related('event')
            .order_by('-created_at')[:25]
            .values(
                'id', 'booking_reference', 'customer_name', 'customer_email',
                'status', 'total_amount', 'created_at', 'event__title',
            )
        )
        pending_rows = [
            {
                'id': str(r['id']),
                'reference': r['booking_reference'],
                'customer': r['customer_name'],
                'email': r['customer_email'],
                'event': r['event__title'],
                'status': r['status'],
                'amount': _dec(r['total_amount']),
                'created_at': r['created_at'].isoformat() if r['created_at'] else None,
            }
            for r in pending
        ]

        return Response({
            'range': {'start': start.isoformat(), 'end': end.isoformat()},
            'organization': (
                {'id': str(organization.id), 'name': organization.name}
                if organization else None
            ),
            'summary': {
                'bookings': sold.count(),
                'tickets_sold': tickets_sold,
                'attended': attended,
                'attendance_rate': round((attended / tickets_sold) * 100, 2) if tickets_sold else 0,
                'gross_revenue': gross,
                'discounts': discounts,
                'refunds': refunds,
                'donations': donations,
                'net_revenue': net,
                'pending_bookings': bookings_qs.filter(status__in=PENDING_BOOKING_STATUSES).count(),
                'checkins': CheckInLog.objects.filter(
                    status='success', event__in=events_qs,
                    created_at__gte=start, created_at__lte=end,
                ).count(),
            },
            'sales_by_event': sales_by_event,
            'sales_by_day': by_day,
            'attendance_by_event': attendance_by_event,
            'memberships': {
                'active': active_memberships.count(),
                'expiring_30d': expiring,
                'revenue': _dec(active_memberships.aggregate(v=Sum('price_paid'))['v']),
                'by_tier': [
                    {
                        'tier': r['tier__name'],
                        'count': r['count'],
                        'revenue': _dec(r['revenue']),
                    }
                    for r in membership_by_tier
                ],
            },
            'donations_by_event': donation_by_event,
            'discount_usage': [
                {'code': r['discount__code'], 'count': r['count'], 'total': _dec(r['total'])}
                for r in discount_usage
            ],
            'pending_bookings': pending_rows,
        })
