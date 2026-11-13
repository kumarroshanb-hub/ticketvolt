"""
HK donation receipt generation.

Receipt numbers are sequential per organisation and allocated under a
row lock so concurrent payments cannot produce duplicates or gaps.
"""
import io
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from ..models import Booking


class DonationReceiptError(ValueError):
    pass


ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
    'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
    'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
]
TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']


def _under_thousand(n):
    if n == 0:
        return ''
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + (f' {ONES[n % 10]}' if n % 10 else '')
    return ONES[n // 100] + ' Hundred' + (f' {_under_thousand(n % 100)}' if n % 100 else '')


def amount_in_words(amount):
    amount = Decimal(str(amount or 0))
    whole = int(amount)
    cents = int((amount - whole) * 100)
    parts = []
    for value, label in ((1000000, 'Million'), (1000, 'Thousand')):
        if whole >= value:
            parts.append(f'{_under_thousand(whole // value)} {label}')
            whole %= value
    if whole:
        parts.append(_under_thousand(whole))
    words = ' '.join(parts) or 'Zero'
    if cents:
        words += f' and Cents {cents:02d}'
    return f'Hong Kong Dollars {words} Only'


@transaction.atomic
def ensure_tax_receipt_number(booking):
    from ..models import Organization

    locked = Booking.objects.select_for_update().get(pk=booking.pk)
    if not locked.donation_tax_eligible:
        raise DonationReceiptError(
            'This booking is not eligible for a donation tax receipt.'
        )
    if locked.donation_tax_receipt_number:
        return locked

    org = Organization.objects.select_for_update().get(pk=locked.event.organization_id)
    number = (
        f'{org.receipt_prefix or "DR"}-{timezone.localdate():%Y}-'
        f'{org.receipt_next_number:06d}'
    )
    org.receipt_next_number = (org.receipt_next_number or 1) + 1
    org.save(update_fields=['receipt_next_number'])

    locked.donation_tax_receipt_number = number
    locked.donation_tax_receipt_issued_at = timezone.now()
    locked.save(update_fields=[
        'donation_tax_receipt_number',
        'donation_tax_receipt_issued_at',
        'updated_at',
    ])
    return locked


def build_tax_receipt_pdf(booking):
    """Bilingual official donation receipt PDF."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont

    try:
        pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
        cn_font = 'STSong-Light'
    except Exception:
        cn_font = 'Helvetica'

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    org = booking.event.organization
    issued = booking.donation_tax_receipt_issued_at or timezone.now()
    paid_date = booking.paid_at or issued

    left = 22 * mm
    y = height - 24 * mm

    def line(label, value, gap=7):
        nonlocal y
        c.setFont('Helvetica-Bold', 9)
        c.drawString(left, y, label)
        c.setFont('Helvetica', 9)
        c.drawString(left + 48 * mm, y, str(value or '—'))
        y -= gap * mm

    if booking.status in ('refunded', 'cancelled'):
        c.setFillColorRGB(0.75, 0.05, 0.05)
        c.setFont('Helvetica-Bold', 40)
        c.drawString(left + 35 * mm, height / 2, 'VOID')
        c.setFillColorRGB(0, 0, 0)

    c.setFont('Helvetica-Bold', 17)
    c.drawString(left, y, 'OFFICIAL DONATION RECEIPT')
    y -= 6 * mm
    c.setFont(cn_font, 15)
    c.drawString(left, y, '正式捐款收據')
    y -= 10 * mm

    c.setFont('Helvetica-Bold', 11)
    c.drawString(left, y, org.legal_name or org.name)
    y -= 5 * mm
    if org.legal_name_zh:
        c.setFont(cn_font, 10)
        c.drawString(left, y, org.legal_name_zh)
        y -= 5 * mm
    c.setFont('Helvetica', 8)
    if org.registered_address:
        c.drawString(left, y, f'Address 地址: {org.registered_address}')
        y -= 4 * mm
    if org.registered_address_zh:
        c.setFont(cn_font, 8)
        c.drawString(left, y, org.registered_address_zh)
        y -= 4 * mm
    c.setFont('Helvetica', 8)
    contact = ' | '.join(filter(None, [
        f'Tel 電話: {org.org_phone}' if org.org_phone else '',
        f'Email 電郵: {org.org_email}' if org.org_email else '',
        f'IRD File No. 稅務局檔案編號: {org.ird_file_number}' if org.ird_file_number else '',
    ]))
    if contact:
        c.drawString(left, y, contact[:115])
        y -= 4 * mm
    y -= 4 * mm

    line('Receipt No. 收據編號', booking.donation_tax_receipt_number)
    line('Date of Receipt 收據日期', issued.strftime('%d/%m/%Y'))
    line('Date Donation Received 收到捐款日期', paid_date.strftime('%d/%m/%Y'))
    line('Received From 茲收到', booking.donor_name or booking.customer_name)
    line('Donation Amount 捐款金額', f'HKD {booking.donation_amount:,.2f}')
    c.setFont('Helvetica', 8)
    c.drawString(left + 48 * mm, y, amount_in_words(booking.donation_amount))
    y -= 7 * mm
    line('Payment Method 付款方式', booking.payment_method or 'Online / Credit Card')

    y -= 3 * mm
    c.setFont('Helvetica-Bold', 9)
    c.drawString(left, y, 'Tax Deduction Notice 稅務寬減聲明')
    y -= 5 * mm
    c.setFont('Helvetica', 7.5)
    threshold = org.tax_receipt_threshold or 100
    if org.ird_section88:
        notice = (
            f'This organisation is a charitable institution of a public character exempt '
            f'from tax under Section 88 of the Inland Revenue Ordinance (Cap. 112). '
            f'Official receipts for donations of HK${threshold:,.0f} or above are '
            f'tax-deductible in Hong Kong. No goods, services, or material benefits were '
            f'provided to the donor in return for this contribution.'
        )
        c.drawString(left, y, notice[:118])
        c.drawString(left, y - 4 * mm, notice[118:236])
        y -= 9 * mm
        if cn_font == 'STSong-Light':
            c.setFont(cn_font, 7)
            c.drawString(left, y, '本機構為根據《稅務條例》（第112章）第88條獲豁免繳稅的公共性質慈善機構。')
            c.drawString(left, y - 4 * mm, '凡捐款港幣100元或以上，憑此正式收據可在香港申請稅項扣除。')
            c.drawString(left, y - 8 * mm, '捐款人並無因是次捐款而獲得任何貨品、服務或實質利益。')
            y -= 12 * mm
    else:
        c.drawString(left, y, 'Donation receipt only. Tax-deductible status is pending confirmation.')
        y -= 7 * mm

    if org.receipt_footer_note:
        c.setFont('Helvetica', 7.5)
        c.drawString(left, y, org.receipt_footer_note[:118])
        y -= 6 * mm

    y = max(y, 45 * mm)
    c.setFont('Helvetica-Bold', 9)
    c.drawString(left, y, 'Authorized Signature & Official Chop 授權人簽署及機構印章')
    y -= 6 * mm
    c.setFont('Helvetica', 8)
    c.drawString(left, y, f'Name 姓名: {org.receipt_signatory_name or "________________"}')
    c.drawString(left + 90 * mm, y, f'Title 職銜: {org.receipt_signatory_title or "________________"}')
    y -= 12 * mm
    c.setFont('Helvetica', 7)
    c.drawString(left, y, f'Booking reference: {booking.booking_reference}')
    c.drawString(left + 110 * mm, y, f'Generated: {issued:%d/%m/%Y %H:%M}')

    c.showPage()
    c.save()
    buf.seek(0)
    return buf
