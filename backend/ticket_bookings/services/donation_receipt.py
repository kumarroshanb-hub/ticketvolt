"""
HK donation tax-receipt generation.

Eligibility is a booking-level rule:
  • donation strictly above HKD 2,000
  • donation currency snapshot is HKD
  • booking is paid/confirmed/completed (not cancelled/refunded)

The receipt number is generated once and reused for subsequent downloads.
"""
import io
from django.db import transaction
from django.utils import timezone

from ..models import Booking

RECEIPT_PREFIX = 'TV-DR'


class DonationReceiptError(ValueError):
    pass


@transaction.atomic
def ensure_tax_receipt_number(booking):
    locked = Booking.objects.select_for_update().get(pk=booking.pk)
    if not locked.donation_tax_eligible:
        raise DonationReceiptError(
            'This booking is not eligible for a donation tax receipt.'
        )
    if locked.donation_tax_receipt_number:
        return locked

    locked.donation_tax_receipt_number = (
        f'{RECEIPT_PREFIX}-{timezone.localdate():%Y%m}-'
        f'{locked.booking_reference}'
    )
    locked.donation_tax_receipt_issued_at = timezone.now()
    locked.save(update_fields=[
        'donation_tax_receipt_number',
        'donation_tax_receipt_issued_at',
        'updated_at',
    ])
    return locked


def build_tax_receipt_pdf(booking):
    """Return an in-memory PDF for the donation receipt."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 28 * mm

    org = booking.event.organization
    issued = booking.donation_tax_receipt_issued_at or timezone.now()

    c.setFont('Helvetica-Bold', 18)
    c.drawString(24 * mm, y, 'Official Donation Receipt')
    y -= 8 * mm

    c.setFont('Helvetica', 10)
    c.drawString(24 * mm, y, 'Eligible for tax deduction in Hong Kong')
    y -= 14 * mm

    rows = [
        ('Receipt No.', booking.donation_tax_receipt_number or '—'),
        ('Issued on', issued.strftime('%d %b %Y, %H:%M')),
        ('Organisation', org.name),
        ('Event', booking.event.title),
        ('Donor', f'{booking.customer_name} <{booking.customer_email}>'),
        ('Donation amount', f'HKD {booking.donation_amount:,.2f}'),
        ('Booking reference', booking.booking_reference),
        ('Payment method', booking.payment_method or 'online'),
    ]
    for label, value in rows:
        c.setFont('Helvetica-Bold', 10)
        c.drawString(24 * mm, y, f'{label}:')
        c.setFont('Helvetica', 10)
        c.drawString(70 * mm, y, str(value))
        y -= 8 * mm

    y -= 6 * mm
    c.setFont('Helvetica-Bold', 11)
    c.drawString(24 * mm, y, 'Tax-deduction statement')
    y -= 6 * mm
    c.setFont('Helvetica', 9)
    text = c.beginText(24 * mm, y)
    text.setLeading(13)
    for line in [
        'This receipt acknowledges a voluntary donation made above the ticket price.',
        'Donations above HKD 2,000 to an eligible organisation may qualify for',
        'tax deduction under the Inland Revenue Ordinance (Cap. 112) of Hong Kong.',
        'Please retain this receipt for your tax records.',
    ]:
        text.textLine(line)
    c.drawText(text)

    y -= 30 * mm
    c.setFont('Helvetica', 9)
    c.drawString(24 * mm, y, f'{org.name}')
    if org.org_email:
        c.drawString(24 * mm, y - 5 * mm, org.org_email)
    c.drawString(24 * mm, y - 10 * mm, 'Authorised signature: ______________________')

    c.showPage()
    c.save()
    buf.seek(0)
    return buf
