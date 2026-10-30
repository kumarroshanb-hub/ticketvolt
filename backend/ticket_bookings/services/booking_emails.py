# backend/ticket_bookings/services/booking_emails.py
"""
Email-sending service for bookings, tickets, registrations and refunds.

Extracted from ``BookingViewSet`` (backend/ticket_bookings/api/booking_api.py)
as a pure move (2026-10-30). The viewset now delegates to the public functions
below. This module has no DRF dependency and is independently unit-testable.

Public API
----------
- ``safe_send_email(email_message, context_label='')``
- ``send_registration_confirmation(booking)``
- ``send_payment_confirmation(booking)``
- ``send_tickets(booking, allocation_message=None)``
- ``send_cancellation(booking)``
- ``send_partial_cancellation(booking, *, cancelled_ids, refund_amount, fully_cancelled)``
- ``send_refund(booking)``

Note: all senders return a dict of the form
``{'success': bool, 'message'|'error': str, ...optional extras}``.
"""
from __future__ import annotations

import base64
import logging
from io import BytesIO

import qrcode
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags

from ..api.ticket_combiner import TicketCombiner
from ..api.ticket_generator import TicketGenerator
from ..services.qr_payload import serialise_ticket_qr_payload
from ..utils.money import format_money

logger = logging.getLogger(__name__)


# ============================================================
# LOW-LEVEL HELPERS
# ============================================================

def safe_send_email(email_message, context_label: str = '') -> bool:
    """Send an EmailMultiAlternatives with diagnostic logging.

    Kept as a module-level function so both this service and any
    remaining inline callers share the same logging contract.
    """
    try:
        sent = email_message.send(fail_silently=False)
        if sent == 1:
            logger.info(f"📧 [{context_label}] SMTP accepted 1 email → {email_message.to}")
            return True
        logger.warning(
            f"📧 [{context_label}] SMTP returned {sent} (unexpected). "
            f"Recipients: {email_message.to}"
        )
        return False
    except Exception as exc:
        logger.exception(
            f"📧 [{context_label}] SMTP FAILURE: {type(exc).__name__}: {exc} | "
            f"Recipients: {email_message.to}"
        )
        return False


# Backwards-compatible alias for the name used inside BookingViewSet.
_safe_send_email = safe_send_email


def _seek_buffer(buf) -> bool:
    """Rewind a buffer, returning True only if it lands at offset 0."""
    try:
        buf.seek(0)
        if hasattr(buf, 'tell') and buf.tell() != 0:
            return False
        return True
    except Exception:
        return False


def _read_buffer_bytes(buf):
    """Read the full contents of a buffer without leaving it consumed."""
    if not _seek_buffer(buf):
        return None
    try:
        raw = buf.read()
        _seek_buffer(buf)
        return raw
    except Exception:
        return None


def _ticket_qr_data_uri(ticket, *, box_size: int = 3, error_correction=None) -> str:
    """Render a ticket's QR payload as a ``data:image/png;base64,...`` URI.

    Used for inline embedding in HTML emails. ``error_correction`` defaults
    to ``ERROR_CORRECT_L`` (matching the previous registration-confirmation
    behaviour); pass ``ERROR_CORRECT_H`` when calling from contexts that
    require the higher-redundancy level.
    """
    if error_correction is None:
        error_correction = qrcode.constants.ERROR_CORRECT_L
    payload = serialise_ticket_qr_payload(ticket)
    qr = qrcode.QRCode(
        version=None,
        error_correction=error_correction,
        box_size=box_size,
        border=1,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color='black', back_color='white')
    buf = BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def _build_email_html(booking, *, template: str, extra_context: dict | None = None):
    """Render ``template`` for ``booking`` and also return the text version."""
    active_tickets = list(booking.tickets.filter(status='active'))

    first_qr_base64 = ''
    if active_tickets:
        try:
            first_qr_base64 = _ticket_qr_data_uri(active_tickets[0])
        except Exception as exc:
            logger.error("Failed to generate inline QR: %s", exc)

    display_date = booking.session.start_time if booking.session else booking.event.start_date
    context = {
        'booking': booking,
        'event': booking.event,
        'session': booking.session,
        'display_date': display_date,
        'customer_name': booking.customer_name,
        'tickets': active_tickets,
        'ticket': active_tickets[0] if active_tickets else None,
        'first_qr_base64': first_qr_base64,
    }
    context.update(extra_context or {})
    html_content = render_to_string(template, context)
    return html_content, strip_tags(html_content)


def _send_notification(
    booking,
    *,
    template: str,
    subject: str,
    context_extra: dict | None = None,
    label: str,
    fallback_html: str | None = None,
    attach_alternative: bool = True,
) -> dict:
    """Shared send path for the simple (no-attachment) notification emails.

    Used by payment-confirmation, cancellation and refund emails, which all
    follow the identical ``render → EmailMultiAlternatives → safe_send_email``
    shape and differ only in template/subject/context.
    """
    if not booking.customer_email:
        return {'success': False, 'message': 'No customer email on booking.', 'error': 'No customer email.'}

    try:
        try:
            html_content, text_content = _build_email_html(
                booking, template=template, extra_context=context_extra,
            )
        except Exception:
            # Same fallback contract as the pre-move implementation: if the
            # template is missing/raises, fall back to the caller-supplied
            # inline HTML; if none was supplied, re-raise so the outer
            # try/except reports it.
            if fallback_html is None:
                raise
            html_content = fallback_html
            text_content = strip_tags(html_content)

        email = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[booking.customer_email],
        )
        if attach_alternative:
            email.attach_alternative(html_content, 'text/html')

        sent_ok = safe_send_email(email, context_label=label)
        return {
            'success': sent_ok,
            'message': f'Email sent to {booking.customer_email}.' if sent_ok else 'Email failed (see logs).',
            'error': None if sent_ok else 'Delivery failed (see logs).',
        }
    except Exception as exc:
        logger.exception('❌ %s email failed for %s: %s', label, booking.booking_reference, exc)
        return {'success': False, 'message': f'Email error: {exc}', 'error': str(exc)}


def _attach_ticket_artifacts(
    booking, *, filename_prefix: str,
) -> tuple[list[tuple[str, bytes, str]], list, str, bool, list]:
    """Generate per-ticket or combined PDF/PNG attachments.

    Returns ``(attachments, opened_buffers, format_names, use_combined, ticket_buffers)``.
    Caller is responsible for closing ``opened_buffers`` in a ``finally`` block.
    """
    event = booking.event
    ticket_format = (getattr(event, 'ticket_format', None) or 'pdf').lower()
    combine = bool(getattr(event, 'combine_tickets', False))
    per_page = int(getattr(event, 'tickets_per_page', 4) or 4)

    want_pdf = ticket_format in ('pdf', 'both')
    want_png = ticket_format in ('png', 'both')

    generator = TicketGenerator()
    combiner = TicketCombiner()

    tickets = list(booking.tickets.filter(status='active'))
    opened_buffers: list = []
    ticket_buffers: list[dict] = []
    format_names: list[str] = []

    if want_pdf:
        format_names.append('PDF')
    if want_png:
        format_names.append('PNG')

    for ticket in tickets:
        if want_pdf:
            pdf_buf = generator.generate_ticket_pdf(ticket, booking, event)
            if pdf_buf:
                opened_buffers.append(pdf_buf)
                ticket_buffers.append({'ticket': ticket, 'buffer': pdf_buf, 'format': 'pdf'})
        if want_png:
            png_buf = generator.generate_ticket_png(ticket, booking, event)
            if png_buf:
                opened_buffers.append(png_buf)
                ticket_buffers.append({'ticket': ticket, 'buffer': png_buf, 'format': 'png'})

    attachments: list[tuple[str, bytes, str]] = []
    combined_attachments: list[tuple[str, bytes, str]] = []
    combined_failed = False

    if combine and len(tickets) > 1:
        pdf_entries = [e for e in ticket_buffers if e['format'] == 'pdf']
        png_entries = [e for e in ticket_buffers if e['format'] == 'png']

        if pdf_entries:
            try:
                combine_input = []
                for e in pdf_entries:
                    if not _seek_buffer(e['buffer']):
                        raise ValueError('PDF buffer not readable')
                    combine_input.append({'buffer': e['buffer'], 'ticket': e['ticket']})
                combined_pdf = combiner.combine_to_pdf(
                    combine_input, booking, tickets_per_page=per_page,
                )
            except Exception as exc:
                logger.error('❌ combine_to_pdf failed: %s', exc)
                combined_pdf = None
                combined_failed = True

            if combined_pdf:
                opened_buffers.append(combined_pdf)
                raw = _read_buffer_bytes(combined_pdf)
                if raw is not None:
                    combined_attachments.append((
                        f'{filename_prefix}_{booking.booking_reference}.pdf',
                        raw, 'application/pdf',
                    ))
                else:
                    combined_failed = True

        if png_entries:
            try:
                combine_input = []
                for e in png_entries:
                    if not _seek_buffer(e['buffer']):
                        raise ValueError('PNG buffer not readable')
                    combine_input.append({'buffer': e['buffer'], 'ticket': e['ticket']})
                combined_png = combiner.combine_to_paginated_image(
                    combine_input, booking, tickets_per_page=per_page,
                    output_format='PNG',
                )
            except Exception as exc:
                logger.error('❌ combine_to_paginated_image failed: %s', exc)
                combined_png = None
                combined_failed = True

            if combined_png:
                opened_buffers.append(combined_png)
                raw = _read_buffer_bytes(combined_png)
                if raw is not None:
                    combined_attachments.append((
                        f'{filename_prefix}_{booking.booking_reference}.png',
                        raw, 'image/png',
                    ))
                else:
                    combined_failed = True

    use_combined = combine and len(tickets) > 1 and bool(combined_attachments) and not combined_failed

    if use_combined:
        attachments.extend(combined_attachments)
    else:
        for entry in ticket_buffers:
            ticket = entry['ticket']
            raw = _read_buffer_bytes(entry['buffer'])
            if raw is None:
                continue
            if entry['format'] == 'pdf':
                attachments.append((
                    f'{filename_prefix}_{ticket.unique_code}.pdf',
                    raw, 'application/pdf',
                ))
            else:
                attachments.append((
                    f'{filename_prefix}_{ticket.unique_code}.png',
                    raw, 'image/png',
                ))

    return attachments, opened_buffers, '+'.join(format_names), use_combined, ticket_buffers


# ============================================================
# PUBLIC SENDERS
# ============================================================

def send_registration_confirmation(booking) -> dict:
    """Confirmation email for free-registration bookings (with passes attached)."""
    if not booking.customer_email:
        logger.info('No customer email on %s — skipping confirmation.', booking.booking_reference)
        return {'success': False, 'message': 'No customer email on booking.', 'attachments': 0, 'formats': ''}

    passes = list(booking.tickets.filter(status='active'))
    if not passes:
        logger.error('❌ Cannot send confirmation for %s: no active ticket exists.', booking.booking_reference)
        raise RuntimeError(f'No active ticket for booking {booking.booking_reference}')

    is_free = booking.event.event_flow == 'free_registration'
    event = booking.event

    first_qr_base64 = None
    try:
        first_qr_base64 = _ticket_qr_data_uri(passes[0])
    except Exception:
        logger.warning(
            'Could not generate inline QR (non-fatal): booking=%s',
            booking.booking_reference,
        )

    subject = (
        f"You're registered for {event.title}" if is_free
        else f'Registration confirmed for {event.title}'
    )
    if len(passes) > 1:
        subject = f'{len(passes)} passes confirmed — {event.title}'

    extra_context = {
        'is_free': is_free,
        'pass_count': len(passes),
        'display_date': booking.session.start_time if booking.session else event.start_date,
    }

    try:
        html_content, text_content = _build_email_html(
            booking, template='emails/registration_confirmation.html',
            extra_context=extra_context,
        )
    except Exception:
        html_content, text_content = _build_email_html(
            booking, template='emails/ticket_email.html',
            extra_context=extra_context,
        )

    opened_buffers: list = []
    try:
        attachments, opened_buffers, format_names, _used_combined, _tb = _attach_ticket_artifacts(
            booking, filename_prefix='pass',
        )

        email = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[booking.customer_email],
        )
        email.attach_alternative(html_content, 'text/html')
        for filename, raw, mimetype in attachments:
            email.attach(filename, raw, mimetype)

        if not attachments:
            logger.warning(
                'No attachments generated for registration confirmation '
                '(booking=%s, passes=%d)',
                booking.booking_reference, len(passes),
            )

        sent_ok = safe_send_email(email, context_label='registration_confirmation')
        return {
            'success': sent_ok,
            'message': (
                f'Registration passes sent to {booking.customer_email}.'
                if sent_ok else
                'Registration confirmation email failed (see logs).'
            ),
            'attachments': len(attachments),
            'formats': format_names,
            'passes': len(passes),
        }
    finally:
        for buf in opened_buffers:
            try:
                buf.close()
            except Exception:
                pass


def send_payment_confirmation(booking) -> dict:
    """'Payment received' notification (no ticket attachments)."""
    return _send_notification(
        booking,
        template='emails/booking_confirmation.html',
        subject=f'✅ Payment Received - {booking.booking_reference}',
        context_extra={'total_display': format_money(booking.total_amount)},
        label='payment_confirmation',
    )


def send_tickets(booking, allocation_message: str | None = None) -> dict:
    """Send ticket PDFs/PNGs (combined or per-ticket) to the customer."""
    tickets = list(booking.tickets.filter(status='active'))
    if not tickets:
        return {'success': False, 'message': 'No active tickets to send.', 'formats': '', 'combined': False, 'attachments': 0}
    if not booking.customer_email:
        return {'success': False, 'message': 'No customer email on booking.', 'formats': '', 'combined': False, 'attachments': 0}

    event = booking.event
    subject = f'🎫 Your Tickets for {event.title if event else "Event"}'

    opened_buffers: list = []
    try:
        attachments, opened_buffers, format_names, use_combined, _tb = _attach_ticket_artifacts(
            booking, filename_prefix='ticket',
        )

        if not attachments:
            logger.warning(
                'No attachments generated for booking %s, sending email without them.',
                booking.booking_reference,
            )

        html_content, text_content = _build_email_html(
            booking, template='emails/ticket_email.html',
            extra_context={'slot_allocation_message': allocation_message},
        )

        email = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[booking.customer_email],
        )
        email.attach_alternative(html_content, 'text/html')
        for filename, raw, mimetype in attachments:
            email.attach(filename, raw, mimetype)

        sent_ok = safe_send_email(email, context_label='tickets')
        return {
            'success': sent_ok,
            'message': f'Tickets sent to {booking.customer_email}.' if sent_ok else 'Ticket email failed (see logs).',
            'formats': format_names,
            'combined': use_combined,
            'attachments': len(attachments),
        }
    except Exception as exc:
        logger.exception('❌ send_tickets failed for %s: %s', booking.booking_reference, exc)
        return {'success': False, 'message': f'Email error: {exc}', 'formats': '', 'combined': False, 'attachments': 0}
    finally:
        for buf in opened_buffers:
            try:
                buf.close()
            except Exception:
                pass


def send_cancellation(booking) -> dict:
    """'Booking cancelled' notification."""
    refund_amount = booking.refund_amount or 0
    fallback_html = (
        f'<p>Hi {booking.customer_name},</p>'
        f'<p>Your booking <strong>{booking.booking_reference}</strong> has been cancelled.</p>'
        f'<p>Refund amount: ₹{refund_amount}</p>'
    )
    return _send_notification(
        booking,
        template='emails/booking_cancelled.html',
        subject=f'❌ Booking Cancelled - {booking.booking_reference}',
        context_extra={
            'customer_name': booking.customer_name,
            'refund_amount': refund_amount,
        },
        label='cancellation',
        fallback_html=fallback_html,
    )


def send_partial_cancellation(booking, *, cancelled_ids, refund_amount, fully_cancelled) -> dict:
    """Notification after a partial (or full) ticket cancellation."""
    if fully_cancelled:
        subject = f'Booking Cancelled - {booking.booking_reference}'
        intro = 'Your entire booking has been cancelled.'
    else:
        subject = f'Tickets Cancelled - {booking.booking_reference}'
        intro = f'{len(cancelled_ids)} ticket(s) on your booking have been cancelled.'

    if not booking.customer_email:
        return {'success': False, 'error': 'No customer email.'}

    html = (
        f'<p>Hi {booking.customer_name},</p>'
        f'<p>{intro}</p>'
        f'<p><strong>Refund amount:</strong> {format_money(refund_amount)}</p>'
        f'<p><strong>Booking reference:</strong> {booking.booking_reference}</p>'
        f'<p>If you did not request this, please contact support.</p>'
    )

    try:
        email = EmailMultiAlternatives(
            subject, '', settings.DEFAULT_FROM_EMAIL, [booking.customer_email],
        )
        email.attach_alternative(html, 'text/html')
        sent_ok = safe_send_email(email, context_label='partial_cancellation')
        return {'success': sent_ok, 'error': None if sent_ok else 'Delivery failed (see logs).'}
    except Exception as exc:
        logger.exception('❌ send_partial_cancellation failed for %s: %s', booking.booking_reference, exc)
        return {'success': False, 'error': str(exc)}


def send_refund(booking) -> dict:
    """'Booking refunded' notification."""
    refund_amount = booking.refund_amount or 0
    fallback_html = (
        f'<p>Hi {booking.customer_name},</p>'
        f'<p>Your booking <strong>{booking.booking_reference}</strong> has been refunded.</p>'
        f'<p>Refund amount: {format_money(refund_amount)}</p>'
    )
    return _send_notification(
        booking,
        template='emails/booking_refunded.html',
        subject=f'💸 Booking Refunded - {booking.booking_reference}',
        context_extra={
            'customer_name': booking.customer_name,
            'refund_amount': refund_amount,
            'refund_display': format_money(refund_amount),
        },
        label='refund',
        fallback_html=fallback_html,
    )