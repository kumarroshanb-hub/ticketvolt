# ticket_bookings/services/email_service.py
from django.core.mail import EmailMultiAlternatives, get_connection
from django.conf import settings
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from io import BytesIO
import qrcode
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
import logging
import base64
from django.utils import timezone

# ✅ Canonical signed QR payload builder — single source of truth.
from .qr_payload import serialise_ticket_qr_payload

logger = logging.getLogger(__name__)


class EmailTicketService:
    """Service to send ticket emails to customers"""

    @staticmethod
    def generate_ticket_pdf(ticket):
        """Generate a PDF ticket with QR code using reportlab."""
        try:
            # ✅ Canonical signed payload — no local dict, no str() wrapper.
            payload = serialise_ticket_qr_payload(ticket)

            qr = qrcode.QRCode(version=None, box_size=8, border=2)
            qr.add_data(payload)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")

            qr_buffer = BytesIO()
            img.save(qr_buffer, format="PNG")
            qr_buffer.seek(0)

            pdf_buffer = BytesIO()
            doc = SimpleDocTemplate(pdf_buffer, pagesize=A4)
            styles = getSampleStyleSheet()

            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontSize=24,
                textColor=colors.HexColor('#6366f1'),
                alignment=TA_CENTER,
                spaceAfter=30
            )

            header_style = ParagraphStyle(
                'Header',
                parent=styles['Heading2'],
                fontSize=16,
                textColor=colors.white,
                alignment=TA_CENTER,
                backColor=colors.HexColor('#6366f1'),
                spaceAfter=20
            )

            label_style = ParagraphStyle(
                'Label',
                parent=styles['Normal'],
                fontSize=12,
                textColor=colors.HexColor('#475569'),
                fontName='Helvetica-Bold'
            )

            value_style = ParagraphStyle(
                'Value',
                parent=styles['Normal'],
                fontSize=12,
                textColor=colors.HexColor('#0f172a')
            )

            story = []
            story.append(Paragraph("🎫 TicketVolt", title_style))
            story.append(Spacer(1, 10))
            story.append(Paragraph("Event Ticket", header_style))
            story.append(Spacer(1, 20))

            ticket_info = [
                ["Ticket Code:", ticket.unique_code],
                ["Event:", ticket.event.title if ticket.event else 'Event'],
                ["Date:", ticket.event.start_date.strftime('%d %B %Y, %I:%M %p') if ticket.event and ticket.event.start_date else 'TBD'],
                ["Venue:", ticket.event.venue.name if ticket.event and ticket.event.venue else 'TBD'],
                ["Attendee:", ticket.attendee_name or 'Guest'],
                ["Ticket Type:", ticket.tier.name if ticket.tier else 'General']
            ]

            table_data = []
            for label, value in ticket_info:
                table_data.append([
                    Paragraph(label, label_style),
                    Paragraph(str(value), value_style)
                ])

            table = Table(table_data, colWidths=[1.5*inch, 3.5*inch])
            table.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8fafc')),
                ('PADDING', (0, 0), (-1, -1), 10),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            story.append(table)
            story.append(Spacer(1, 20))

            qr_img = Image(qr_buffer, width=1.5*inch, height=1.5*inch)
            qr_img.hAlign = 'CENTER'
            story.append(qr_img)
            story.append(Spacer(1, 5))
            story.append(Paragraph("Scan this QR code at the entrance", styles['Italic']))
            story.append(Spacer(1, 20))

            footer_style = ParagraphStyle(
                'Footer',
                parent=styles['Normal'],
                fontSize=10,
                textColor=colors.HexColor('#94a3b8'),
                alignment=TA_CENTER
            )
            story.append(Paragraph("Thank you for choosing TicketVolt!", footer_style))
            story.append(Spacer(1, 5))
            story.append(Paragraph("This ticket is non-transferable. Please present this ticket at the entrance.", footer_style))

            doc.build(story)
            pdf_buffer.seek(0)
            return pdf_buffer

        except Exception as e:
            logger.error(f"PDF generation error: {e}")
            return None

    @staticmethod
    def send_ticket_email(booking):
        """Send tickets via email using HTML template."""
        try:
            tickets = booking.tickets.all()
            if not tickets:
                return {'success': False, 'error': 'No tickets found'}

            if not booking.customer_email:
                return {'success': False, 'error': 'No email address available'}

            # ✅ Canonical signed payload for the first ticket.
            first_ticket = tickets.first()
            payload = serialise_ticket_qr_payload(first_ticket)

            qr_buffer = BytesIO()
            qr = qrcode.QRCode(version=None, box_size=8, border=2)
            qr.add_data(payload)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            img.save(qr_buffer, format="PNG")
            qr_base64 = base64.b64encode(qr_buffer.getvalue()).decode()

            for ticket in tickets:
                ticket.qr_base64 = qr_base64

            context = {
                'booking': booking,
                'tickets': tickets,
                'event': booking.event,
                'customer_name': booking.customer_name,
                'ticket_url': f"{settings.FRONTEND_URL}/tickets/{first_ticket.id}",
                'now': timezone.now(),
            }

            html_content = render_to_string('emails/ticket_email.html', context)
            text_content = strip_tags(html_content)

            subject = f"🎫 Your Tickets for {booking.event.title if booking.event else 'Event'}"

            connection = get_connection(
                host=settings.EMAIL_HOST,
                port=settings.EMAIL_PORT,
                username=settings.EMAIL_HOST_USER,
                password=settings.EMAIL_HOST_PASSWORD,
                use_tls=settings.EMAIL_USE_TLS,
                timeout=30
            )

            email = EmailMultiAlternatives(
                subject=subject,
                body=text_content,
                from_email=settings.DEFAULT_FROM_EMAIL or 'noreply@ticketvolt.com',
                to=[booking.customer_email],
                connection=connection
            )
            email.attach_alternative(html_content, "text/html")

            for ticket in tickets:
                pdf_file = EmailTicketService.generate_ticket_pdf(ticket)
                if pdf_file:
                    filename = f"ticket_{ticket.unique_code}.pdf"
                    email.attach(filename, pdf_file.getvalue(), 'application/pdf')

            email.send()

            logger.info(f"✅ Ticket email sent to {booking.customer_email}")
            return {'success': True, 'message': 'Tickets sent via email'}

        except Exception as e:
            error_message = str(e)
            logger.error(f"Email send error: {error_message}")

            if '5.7.0' in error_message:
                return {
                    'success': False,
                    'error': 'Gmail authentication failed. Please check your app password configuration.'
                }
            if 'connection refused' in error_message.lower():
                return {
                    'success': False,
                    'error': 'Email server connection refused. Please check your email settings.'
                }
            return {
                'success': False,
                'error': f'Email sending failed: {error_message}'
            }

    @staticmethod
    def send_booking_confirmation_email(booking):
        """Send booking confirmation email (without tickets)."""
        try:
            if not booking.customer_email:
                return {'success': False, 'error': 'No email address available'}

            context = {
                'booking': booking,
                'event': booking.event,
                'customer_name': booking.customer_name,
            }

            html_content = render_to_string('emails/booking_confirmation.html', context)
            text_content = strip_tags(html_content)

            subject = f"✅ Booking Confirmed - {booking.booking_reference}"

            email = EmailMultiAlternatives(
                subject=subject,
                body=text_content,
                from_email=settings.DEFAULT_FROM_EMAIL or 'noreply@ticketvolt.com',
                to=[booking.customer_email]
            )
            email.attach_alternative(html_content, "text/html")
            email.send()

            logger.info(f"✅ Confirmation email sent to {booking.customer_email}")
            return {'success': True, 'message': 'Confirmation email sent'}

        except Exception as e:
            logger.error(f"Confirmation email error: {e}")
            return {'success': False, 'error': str(e)}