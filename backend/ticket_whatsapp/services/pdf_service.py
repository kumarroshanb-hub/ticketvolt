# backend/ticket_whatsapp/services/pdf_service.py
import io
import base64
import qrcode
from PIL import Image
from reportlab.lib.pagesizes import A4, letter, landscape
from reportlab.lib.units import mm, inch
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
import logging
from django.conf import settings
import os

# ✅ Canonical signed QR payload builder — single source of truth.
from ticket_bookings.services.qr_payload import serialise_ticket_qr_payload

logger = logging.getLogger(__name__)


class PDFService:
    """Service to generate PDF tickets with QR codes"""

    @classmethod
    def generate_ticket_pdf(cls, ticket, booking):
        """
        Generate a PDF ticket with QR code.
        Returns: PDF as base64 string
        """
        try:
            # ✅ Canonical signed payload.
            payload = serialise_ticket_qr_payload(ticket)

            qr = qrcode.QRCode(
                version=None,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=8,
                border=2,
            )
            qr.add_data(payload)
            qr.make(fit=True)

            qr_img = qr.make_image(fill_color="#1a1a1a", back_color="white")

            qr_buffer = io.BytesIO()
            qr_img.save(qr_buffer, format='PNG')
            qr_buffer.seek(0)

            pdf_buffer = io.BytesIO()

            doc = SimpleDocTemplate(
                pdf_buffer,
                pagesize=A4,
                rightMargin=20*mm,
                leftMargin=20*mm,
                topMargin=20*mm,
                bottomMargin=20*mm,
            )

            styles = getSampleStyleSheet()
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontSize=24,
                textColor=colors.HexColor('#6366f1'),
                alignment=TA_CENTER,
                spaceAfter=20
            )

            heading_style = ParagraphStyle(
                'CustomHeading',
                parent=styles['Heading2'],
                fontSize=16,
                textColor=colors.HexColor('#1a1a1a'),
                spaceAfter=10
            )

            body_style = ParagraphStyle(
                'CustomBody',
                parent=styles['Normal'],
                fontSize=12,
                textColor=colors.HexColor('#333333'),
                spaceAfter=6
            )

            elements = []

            elements.append(Paragraph("🎫 TICKET", title_style))
            elements.append(Spacer(1, 10))

            elements.append(Paragraph("Event Details", heading_style))
            elements.append(Paragraph(f"<b>Event:</b> {ticket.event.title if ticket.event else 'N/A'}", body_style))
            if ticket.event and ticket.event.start_date:
                elements.append(Paragraph(f"<b>Date:</b> {ticket.event.start_date.strftime('%d %B %Y, %I:%M %p')}", body_style))
            if ticket.event and ticket.event.venue:
                elements.append(Paragraph(f"<b>Venue:</b> {ticket.event.venue.name}", body_style))
            elements.append(Spacer(1, 10))

            elements.append(Paragraph("Ticket Details", heading_style))
            elements.append(Paragraph(f"<b>Ticket Code:</b> {ticket.unique_code}", body_style))
            elements.append(Paragraph(f"<b>Attendee:</b> {ticket.attendee_name or 'Guest'}", body_style))
            elements.append(Paragraph(f"<b>Booking Reference:</b> {booking.booking_reference if booking else 'N/A'}", body_style))
            elements.append(Spacer(1, 15))

            elements.append(Paragraph("Scan to Check-in", heading_style))

            qr_image = RLImage(qr_buffer, width=120*mm, height=120*mm)
            qr_image.hAlign = 'CENTER'
            elements.append(qr_image)
            elements.append(Spacer(1, 10))

            elements.append(Paragraph(
                "Please present this ticket at the entrance for scanning.",
                body_style
            ))

            elements.append(Spacer(1, 20))
            footer_style = ParagraphStyle(
                'Footer',
                parent=styles['Normal'],
                fontSize=10,
                textColor=colors.HexColor('#999999'),
                alignment=TA_CENTER
            )
            elements.append(Paragraph("© TicketVolt - Your Event Management Partner", footer_style))

            doc.build(elements)
            pdf_buffer.seek(0)

            pdf_base64 = base64.b64encode(pdf_buffer.getvalue()).decode('utf-8')

            logger.info(f"✅ PDF generated for ticket: {ticket.unique_code}")
            return pdf_base64

        except Exception as e:
            logger.error(f"❌ PDF generation error: {e}")
            import traceback
            traceback.print_exc()
            return None

    @classmethod
    def generate_booking_pdf(cls, booking):
        """Generate a PDF with all tickets in a booking."""
        try:
            tickets = booking.tickets.all()

            if not tickets:
                return None

            pdf_buffer = io.BytesIO()

            doc = SimpleDocTemplate(
                pdf_buffer,
                pagesize=A4,
                rightMargin=20*mm,
                leftMargin=20*mm,
                topMargin=20*mm,
                bottomMargin=20*mm,
            )

            styles = getSampleStyleSheet()
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontSize=24,
                textColor=colors.HexColor('#6366f1'),
                alignment=TA_CENTER,
                spaceAfter=20
            )

            heading_style = ParagraphStyle(
                'CustomHeading',
                parent=styles['Heading2'],
                fontSize=16,
                textColor=colors.HexColor('#1a1a1a'),
                spaceAfter=10
            )

            body_style = ParagraphStyle(
                'CustomBody',
                parent=styles['Normal'],
                fontSize=12,
                textColor=colors.HexColor('#333333'),
                spaceAfter=6
            )

            elements = []

            elements.append(Paragraph("🎫 BOOKING TICKETS", title_style))
            elements.append(Spacer(1, 10))

            elements.append(Paragraph("Booking Details", heading_style))
            elements.append(Paragraph(f"<b>Booking Reference:</b> {booking.booking_reference}", body_style))
            elements.append(Paragraph(f"<b>Customer:</b> {booking.customer_name}", body_style))
            elements.append(Paragraph(f"<b>Event:</b> {booking.event.title if booking.event else 'N/A'}", body_style))
            if booking.event and booking.event.start_date:
                elements.append(Paragraph(f"<b>Date:</b> {booking.event.start_date.strftime('%d %B %Y, %I:%M %p')}", body_style))
            elements.append(Paragraph(f"<b>Total Tickets:</b> {tickets.count()}", body_style))
            elements.append(Spacer(1, 15))

            for i, ticket in enumerate(tickets, 1):
                elements.append(Paragraph(f"Ticket #{i}", heading_style))

                # ✅ Canonical signed payload per ticket.
                payload = serialise_ticket_qr_payload(ticket)

                qr = qrcode.QRCode(
                    version=None,
                    error_correction=qrcode.constants.ERROR_CORRECT_H,
                    box_size=6,
                    border=2,
                )
                qr.add_data(payload)
                qr.make(fit=True)

                qr_img = qr.make_image(fill_color="#1a1a1a", back_color="white")
                qr_buffer = io.BytesIO()
                qr_img.save(qr_buffer, format='PNG')
                qr_buffer.seek(0)

                elements.append(Paragraph(f"<b>Ticket Code:</b> {ticket.unique_code}", body_style))
                elements.append(Paragraph(f"<b>Attendee:</b> {ticket.attendee_name or 'Guest'}", body_style))

                qr_image = RLImage(qr_buffer, width=80*mm, height=80*mm)
                qr_image.hAlign = 'CENTER'
                elements.append(qr_image)
                elements.append(Spacer(1, 10))

            elements.append(Spacer(1, 20))
            footer_style = ParagraphStyle(
                'Footer',
                parent=styles['Normal'],
                fontSize=10,
                textColor=colors.HexColor('#999999'),
                alignment=TA_CENTER
            )
            elements.append(Paragraph("© TicketVolt - Your Event Management Partner", footer_style))

            doc.build(elements)
            pdf_buffer.seek(0)

            pdf_base64 = base64.b64encode(pdf_buffer.getvalue()).decode('utf-8')

            logger.info(f"✅ Booking PDF generated for: {booking.booking_reference}")
            return pdf_base64

        except Exception as e:
            logger.error(f"❌ Booking PDF generation error: {e}")
            import traceback
            traceback.print_exc()
            return None