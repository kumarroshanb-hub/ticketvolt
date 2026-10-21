# backend/ticket_bookings/api/qr_api.py
import json
from io import BytesIO

import qrcode
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ticket_bookings.models import Ticket
from ticket_bookings.services.qr_payload import serialise_ticket_qr_payload
from ticket_bookings.services.qr_service import QRCodeService


class QRCodeDownloadView(APIView):
    """
    Download a ticket's QR as a PNG attachment.

    Uses the CANONICAL payload builder so the downloaded PNG is byte-for-byte
    consistent with what the scanner expects.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, ticket_id):
        ticket = get_object_or_404(Ticket, id=ticket_id)

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

    NOTE: This endpoint writes to object storage (one object per unique ticket,
    deterministically named). It does NOT cache the URL on the Ticket model —
    the model has no such field, and adding one would require a migration for
    a value that is already derivable. Storage `exists()` + `url()` is cheap.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, ticket_id):
        ticket = get_object_or_404(Ticket, id=ticket_id)

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