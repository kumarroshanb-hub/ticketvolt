# backend/ticket_bookings/api/qr_api.py
from io import BytesIO

import qrcode
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ticket_bookings.models import Ticket
from ticket_bookings.services.qr_payload import serialise_ticket_qr_payload
from ticket_bookings.services.qr_service import QRCodeService
from ticket_bookings.services.tenancy import (
    can_operate_event_data,
    is_platform_admin,
)


def _authorise_ticket(request, ticket):
    """
    Reject unless the caller may view this ticket's QR.

    Access rules (matches the two-tier booking predicate):
      • Platform admin             → always.
      • Booking owner (customer)   → their own tickets.
      • OPERATOR of the org        → OWNER/ADMIN/STAFF may view QRs for
        scanning and support; this is the same set that can read the
        booking via BookingViewSet's READ predicate.
    """
    user = request.user
    if is_platform_admin(user):
        return
    if ticket.booking and ticket.booking.user_id == user.id:
        return
    if can_operate_event_data(user, ticket.event):
        return
    raise PermissionDenied(
        "You do not have permission to access this ticket."
    )


class QRCodeDownloadView(APIView):
    """
    Download a ticket's QR as a PNG attachment.

    Uses the canonical payload builder so the downloaded PNG is
    byte-for-byte consistent with what the scanner expects.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, ticket_id):
        ticket = get_object_or_404(
            Ticket.objects.select_related(
                'booking', 'event', 'event__organization',
            ),
            id=ticket_id,
        )
        _authorise_ticket(request, ticket)

        payload = serialise_ticket_qr_payload(ticket, include_ids=True)

        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(payload)
        qr.make(fit=True)
        img = qr.make_image(fill_color='black', back_color='white')

        buffered = BytesIO()
        img.save(buffered, format='PNG')
        buffered.seek(0)

        response = FileResponse(
            buffered,
            content_type='image/png',
            filename=f'ticket_{ticket.unique_code}.png',
        )
        response['Content-Disposition'] = (
            f'attachment; filename="ticket_{ticket.unique_code}.png"'
        )
        return response


class QRCodeImageView(APIView):
    """
    Return a URL pointing to a stored PNG of the ticket's QR.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, ticket_id):
        ticket = get_object_or_404(
            Ticket.objects.select_related(
                'booking', 'event', 'event__organization',
            ),
            id=ticket_id,
        )
        _authorise_ticket(request, ticket)

        qr_result = QRCodeService.generate_qr_image_file(ticket)
        if not qr_result:
            return Response(
                {'error': 'Failed to generate QR code'},
                status=500,
            )

        return Response({
            'image_url': qr_result['url'],
            'ticket_code': ticket.unique_code,
            'file_path': qr_result['file_path'],
        })