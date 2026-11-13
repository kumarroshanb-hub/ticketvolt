"""Advanced ticketing, payouts and audit APIs (MVP)."""
from datetime import date
from decimal import Decimal

from django.http import FileResponse
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAnyOrgFinance, IsAnyOrgManager, IsPlatformAdmin

from ..models import (
    AuditLog, Booking, Organization, OrganizerPayout, PatronContact,
    SOLD_BOOKING_STATUSES, Ticket, TicketTransfer,
)
from ..services import commercial, tenancy
from ..services.audit import verify_chain


class CreateTicketTransferView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, ticket_id):
        ticket = Ticket.objects.select_related('booking').filter(pk=ticket_id).first()
        if ticket is None:
            return Response({'error': 'Ticket not found.'}, status=404)
        if ticket.booking.user_id != request.user.id and not request.user.is_superuser:
            return Response({'error': 'You do not own this ticket.'}, status=403)
        try:
            transfer = commercial.create_ticket_transfer(
                ticket, ticket.booking.user, request.data.get('to_email'),
                days=int(request.data.get('days') or 7),
            )
        except (ValueError, PermissionError) as exc:
            return Response({'error': str(exc)}, status=400)
        return Response({
            'id': str(transfer.id),
            'token': str(transfer.token),
            'to_email': transfer.to_email,
            'expires_at': transfer.expires_at,
        }, status=201)


class AcceptTicketTransferView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, token):
        transfer = TicketTransfer.objects.select_related('ticket').filter(token=token).first()
        if transfer is None:
            return Response({'error': 'Transfer not found.'}, status=404)
        try:
            transfer = commercial.accept_ticket_transfer(transfer, request.user)
        except (ValueError, PermissionError) as exc:
            return Response({'error': str(exc)}, status=400)
        return Response({'status': transfer.status, 'ticket': str(transfer.ticket_id)})


class OrganizerPayoutViewSet(viewsets.ModelViewSet):
    queryset = OrganizerPayout.objects.select_related('organization')
    permission_classes = [permissions.IsAuthenticated, IsAnyOrgFinance]
    serializer_class = None

    def get_serializer_class(self):
        class PayoutSerializer(serializers.ModelSerializer):
            organization_name = serializers.CharField(
                source='organization.name', read_only=True,
            )

            class Meta:
                model = OrganizerPayout
                fields = [
                    'id', 'organization', 'organization_name', 'reference',
                    'period_start', 'period_end', 'gross_sales', 'refunds',
                    'platform_fee', 'net_payout', 'status', 'paid_at',
                    'notes', 'created_at',
                ]
                read_only_fields = fields

        return PayoutSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        org_id = self.request.query_params.get('organization_id')
        if self.request.user.is_superuser:
            return qs.filter(organization_id=org_id) if org_id else qs
        managed = [
            org.id for org in Organization.objects.filter(
                id__in=tenancy.user_org_ids(self.request.user),
            ) if tenancy.can_view_finance(self.request.user, org)
        ]
        return qs.filter(organization_id__in=managed)

    def create(self, request, *args, **kwargs):
        org_id = request.data.get('organization_id')
        org = Organization.objects.filter(pk=org_id).first()
        if org is None or not tenancy.can_view_finance(request.user, org):
            return Response({'error': 'Permission denied.'}, status=403)
        try:
            start = date.fromisoformat(request.data.get('period_start'))
            end = date.fromisoformat(request.data.get('period_end'))
        except (TypeError, ValueError):
            return Response({'error': 'Valid period_start and period_end are required.'}, status=400)
        payout = commercial.calculate_payout(org, start, end, actor=request.user)
        return Response(self.get_serializer(payout).data, status=201)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        payout = self.get_object()
        if not tenancy.can_view_finance(request.user, payout.organization):
            return Response({'error': 'Permission denied.'}, status=403)
        from django.utils import timezone
        payout.status = OrganizerPayout.Status.PAID
        payout.paid_at = timezone.now()
        payout.save(update_fields=['status', 'paid_at', 'updated_at'])
        return Response(self.get_serializer(payout).data)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAnyOrgFinance]

    def get_queryset(self):
        qs = AuditLog.objects.select_related('organization', 'actor')
        if self.request.user.is_superuser:
            org_id = self.request.query_params.get('organization_id')
            return qs.filter(organization_id=org_id) if org_id else qs
        managed = [
            org.id for org in Organization.objects.filter(
                id__in=tenancy.user_org_ids(self.request.user),
            ) if tenancy.can_view_finance(self.request.user, org)
        ]
        return qs.filter(organization_id__in=managed)

    @action(detail=False, methods=['get'], url_path='verify')
    def verify(self, request):
        qs = self.get_queryset()
        return Response(verify_chain(qs))

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        import csv
        from django.http import HttpResponse
        qs = self.get_queryset().order_by('sequence')
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="audit-log.csv"'
        writer = csv.writer(response)
        writer.writerow([
            'Sequence', 'Created at', 'Organization', 'Actor', 'Action',
            'Method', 'Path', 'Status', 'IP', 'Prev hash', 'Entry hash',
        ])
        for log in qs:
            writer.writerow([
                log.sequence, log.created_at.isoformat() if log.created_at else '',
                log.organization.name if log.organization else '',
                log.actor.username if log.actor else '',
                log.action, log.method, log.path, log.status_code,
                log.ip_address or '', log.prev_hash, log.entry_hash,
            ])
        return response

    def get_serializer_class(self):
        class AuditSerializer(serializers.ModelSerializer):
            actor_name = serializers.CharField(source='actor.username', read_only=True, default='')
            organization_name = serializers.CharField(
                source='organization.name', read_only=True, default='',
            )

            class Meta:
                model = AuditLog
                fields = [
                    'id', 'organization', 'organization_name', 'actor',
                    'actor_name', 'action', 'method', 'path', 'status_code',
                    'ip_address', 'detail', 'created_at',
                ]
                read_only_fields = fields

        return AuditSerializer


class AnnualDonationStatementView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAnyOrgFinance]

    def get(self, request):
        org_id = request.query_params.get('organization_id')
        org = Organization.objects.filter(pk=org_id).first()
        if org is None:
            return Response({'error': 'organization_id is required.'}, status=400)
        if not tenancy.can_view_finance(request.user, org) and not request.user.is_superuser:
            return Response({'error': 'Permission denied.'}, status=403)
        try:
            year = int(request.query_params.get('year'))
        except (TypeError, ValueError):
            return Response({'error': 'year is required.'}, status=400)

        bookings = Booking.objects.filter(
            event__organization=org,
            status__in=SOLD_BOOKING_STATUSES,
            donation_amount__gt=0,
            paid_at__year=year,
        ).select_related('event').order_by('paid_at')
        if not bookings.exists():
            return Response({'error': 'No donations found for this year.'}, status=404)

        total = sum((b.donation_amount for b in bookings), Decimal('0.00'))
        eligible = sum(
            (b.donation_amount for b in bookings if b.donation_tax_eligible),
            Decimal('0.00'),
        )
        import io
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        width, height = A4
        y = height - 25 * mm
        c.setFont('Helvetica-Bold', 16)
        c.drawString(22 * mm, y, f'Annual Donation Statement {year}')
        y -= 8 * mm
        c.setFont('Helvetica', 9)
        c.drawString(22 * mm, y, f'{org.name} · {org.org_email}')
        y -= 12 * mm
        c.setFont('Helvetica-Bold', 9)
        for header, x in [('Date', 22), ('Booking', 50), ('Donor', 92), ('Amount', 155)]:
            c.drawString(x * mm, y, header)
        y -= 5 * mm
        c.setFont('Helvetica', 8)
        for b in bookings[:200]:
            if y < 30 * mm:
                c.showPage(); y = height - 25 * mm; c.setFont('Helvetica', 8)
            c.drawString(22 * mm, y, b.paid_at.strftime('%Y-%m-%d') if b.paid_at else '')
            c.drawString(50 * mm, y, b.booking_reference)
            c.drawString(92 * mm, y, (b.customer_name or '')[:30])
            c.drawString(155 * mm, y, f'{b.donation_amount:,.2f}')
            y -= 5 * mm
        y -= 5 * mm
        c.setFont('Helvetica-Bold', 10)
        c.drawString(22 * mm, y, f'Total donations: HKD {total:,.2f}')
        c.drawString(22 * mm, y - 5 * mm, f'Tax-eligible portion: HKD {eligible:,.2f}')
        c.showPage(); c.save(); buf.seek(0)
        return FileResponse(
            buf, as_attachment=True,
            filename=f'donation-statement-{org.slug}-{year}.pdf',
            content_type='application/pdf',
        )


class DonationReceiptExportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAnyOrgFinance]

    def get(self, request):
        import csv
        from django.http import HttpResponse

        org_id = request.query_params.get('organization_id')
        org = Organization.objects.filter(pk=org_id).first()
        if org is None:
            return Response({'error': 'organization_id is required.'}, status=400)
        if not tenancy.can_view_finance(request.user, org) and not request.user.is_superuser:
            return Response({'error': 'Permission denied.'}, status=403)
        qs = Booking.objects.filter(
            event__organization=org,
            donation_tax_receipt_number__isnull=False,
        ).select_related('event').order_by('donation_tax_receipt_issued_at')
        year = request.query_params.get('year')
        if year:
            qs = qs.filter(donation_tax_receipt_issued_at__year=year)

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="donation-receipts-{org.slug}.csv"'
        writer = csv.writer(response)
        writer.writerow([
            'Receipt No', 'Issued At', 'Donor', 'Email', 'Amount', 'Currency',
            'Booking Reference', 'Event', 'Booking Status', 'Voided',
        ])
        for b in qs:
            writer.writerow([
                b.donation_tax_receipt_number,
                b.donation_tax_receipt_issued_at.isoformat() if b.donation_tax_receipt_issued_at else '',
                b.customer_name, b.customer_email, b.donation_amount,
                b.donation_currency_code, b.booking_reference, b.event.title,
                b.status, 'yes' if b.status in ('refunded', 'cancelled') else 'no',
            ])
        return response


class PatronsExportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAnyOrgFinance]

    def get(self, request):
        import csv
        from django.http import HttpResponse
        from django.utils.dateparse import parse_date

        org = Organization.objects.filter(pk=request.query_params.get('organization_id')).first()
        if org is None:
            return Response({'error': 'organization_id is required.'}, status=400)
        if not tenancy.can_view_finance(request.user, org) and not request.user.is_superuser:
            return Response({'error': 'Permission denied.'}, status=403)
        from ..services import features as feature_service
        if not feature_service.has_feature(org, 'patrons_tracking'):
            return Response({'error': 'Patrons tracking is not enabled.'}, status=403)

        qs = Booking.objects.filter(
            event__organization=org,
            status__in=SOLD_BOOKING_STATUSES,
        ).select_related('event', 'patron_contact').prefetch_related('tickets__tier').order_by('-created_at')
        since = parse_date(request.query_params.get('since') or '')
        if since:
            qs = qs.filter(created_at__date__gte=since)

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="patrons-{org.slug}.csv"'
        writer = csv.writer(response)
        writer.writerow([
            'Buyer name', 'Email', 'Mobile', 'Tiers', 'Tickets', 'Donation',
            'Order date', 'Booking reference', 'Course answer', 'Marketing opt-in',
            'Patron contacted', 'Contacted by', 'Contacted at',
        ])
        for b in qs:
            tiers = ', '.join(sorted({
                t.tier.name for t in b.tickets.all() if t.tier
            }))
            writer.writerow([
                b.customer_name, b.customer_email, b.customer_phone, tiers,
                b.tickets.count(), b.donation_amount,
                b.created_at.isoformat() if b.created_at else '',
                b.booking_reference, b.course_answer or '', 'yes' if b.marketing_opt_in else 'no',
                'yes' if hasattr(b, 'patron_contact') else 'no',
                b.patron_contact.contacted_by.username if hasattr(b, 'patron_contact') and b.patron_contact.contacted_by else '',
                b.patron_contact.contacted_at.isoformat() if hasattr(b, 'patron_contact') else '',
            ])
        return response


class ExportPackView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAnyOrgFinance]

    def get(self, request):
        import csv
        import io
        import zipfile
        from django.http import HttpResponse
        from django.utils.dateparse import parse_date
        from ..models import CheckInLog, Ticket
        from ..services import features

        org = Organization.objects.filter(pk=request.query_params.get('organization_id')).first()
        if org is None:
            return Response({'error': 'organization_id is required.'}, status=400)
        if not tenancy.can_view_finance(request.user, org) and not request.user.is_superuser:
            return Response({'error': 'Permission denied.'}, status=403)
        if not features.has_feature(org, 'advanced_exports'):
            return Response({'error': 'Advanced exports are not enabled for this organisation.'}, status=403)

        start = parse_date(request.query_params.get('start') or '')
        end = parse_date(request.query_params.get('end') or '')
        bookings = Booking.objects.filter(event__organization=org)
        if start:
            bookings = bookings.filter(created_at__date__gte=start)
        if end:
            bookings = bookings.filter(created_at__date__lte=end)
        tickets = Ticket.objects.filter(booking__in=bookings).select_related('tier', 'event')
        checkins = CheckInLog.objects.filter(event__organization=org)
        if start:
            checkins = checkins.filter(created_at__date__gte=start)
        if end:
            checkins = checkins.filter(created_at__date__lte=end)

        def csv_bytes(header, rows):
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(header)
            writer.writerows(rows)
            return buf.getvalue().encode('utf-8-sig')

        orders = csv_bytes(
            ['Reference', 'Buyer', 'Email', 'Phone', 'Status', 'Total', 'Donation', 'Invoice', 'Created'],
            [[b.booking_reference, b.customer_name, b.customer_email, b.customer_phone,
              b.status, b.total_amount, b.donation_amount, b.invoice_number,
              b.created_at.isoformat()] for b in bookings],
        )
        attendees = csv_bytes(
            ['Ticket code', 'Booking', 'Attendee', 'Email', 'Tier', 'Status', 'Seat'],
            [[t.unique_code, t.booking.booking_reference, t.attendee_name, t.attendee_email,
              t.tier.name if t.tier else '', t.status,
              f'{t.seat.row_label}-{t.seat.seat_number}' if t.seat else ''] for t in tickets],
        )
        checkin_rows = csv_bytes(
            ['Ticket code', 'Event', 'Status', 'Scanned at', 'Scanner'],
            [[c.ticket.unique_code, c.event.title, c.status, c.scanned_at.isoformat(),
              c.scanner_user.username if c.scanner_user else ''] for c in checkins.select_related('ticket', 'event', 'scanner_user')],
        )
        donations = csv_bytes(
            ['Receipt No', 'Donor', 'Email', 'Amount', 'Booking', 'Issued', 'Status'],
            [[b.donation_tax_receipt_number or '', b.donor_name or b.customer_name,
              b.customer_email, b.donation_amount, b.booking_reference,
              b.donation_tax_receipt_issued_at.isoformat() if b.donation_tax_receipt_issued_at else '',
              b.status] for b in bookings.filter(donation_amount__gt=0)],
        )

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('orders.csv', orders)
            zf.writestr('attendees.csv', attendees)
            zf.writestr('checkins.csv', checkin_rows)
            zf.writestr('donations.csv', donations)
        buf.seek(0)
        response = HttpResponse(buf.getvalue(), content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="export-pack-{org.slug}.zip"'
        return response


class PatronContactView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAnyOrgFinance]

    def _booking(self, request, booking_id):
        from ..services import features
        booking = Booking.objects.select_related('event__organization', 'patron_contact').filter(pk=booking_id).first()
        if booking is None:
            return None, Response({'error': 'Booking not found.'}, status=404)
        org = booking.event.organization
        if not tenancy.can_view_finance(request.user, org) and not request.user.is_superuser:
            return None, Response({'error': 'Permission denied.'}, status=403)
        if not features.has_feature(org, 'patrons_tracking'):
            return None, Response({'error': 'Patrons tracking is not enabled.'}, status=403)
        return booking, None

    def get(self, request, booking_id):
        booking, err = self._booking(request, booking_id)
        if err:
            return err
        contact = getattr(booking, 'patron_contact', None)
        if contact is None:
            return Response({'contacted': False})
        return Response({
            'contacted': True,
            'contacted_by': contact.contacted_by.username if contact.contacted_by else '',
            'contacted_at': contact.contacted_at,
            'notes': contact.notes,
        })

    def post(self, request, booking_id):
        booking, err = self._booking(request, booking_id)
        if err:
            return err
        contact, _ = PatronContact.objects.update_or_create(
            booking=booking,
            defaults={
                'contacted_by': request.user,
                'notes': request.data.get('notes', ''),
            },
        )
        return Response({'contacted': True, 'contacted_at': contact.contacted_at})

    def delete(self, request, booking_id):
        booking, err = self._booking(request, booking_id)
        if err:
            return err
        PatronContact.objects.filter(booking=booking).delete()
        return Response(status=204)
