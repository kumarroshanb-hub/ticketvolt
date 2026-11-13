"""Event feedback links and delivery."""
from __future__ import annotations

import logging

from django.conf import settings
from django.core import signing
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from ..models import Ticket
from .booking_emails import safe_send_email

logger = logging.getLogger(__name__)
SALT = 'event-feedback'
MAX_AGE = 60 * 60 * 24 * 90


def feedback_token(ticket):
    return signing.dumps(
        {'ticket': str(ticket.id), 'event': str(ticket.event_id)},
        salt=SALT,
    )


def read_feedback_token(token):
    try:
        return signing.loads(token, salt=SALT, max_age=MAX_AGE)
    except signing.BadSignature:
        return None


def send_feedback_invites(event):
    tickets = (
        Ticket.objects
        .filter(event=event, check_in_time__isnull=False)
        .exclude(status='cancelled')
        .select_related('booking', 'event')
        .order_by('id')
    )
    sent = 0
    skipped = 0
    failed = 0
    seen = set()
    for ticket in tickets:
        email = (ticket.attendee_email or ticket.booking.customer_email or '').strip()
        if not email:
            skipped += 1
            continue
        key = (email.lower(), str(ticket.booking_id))
        if key in seen:
            skipped += 1
            continue
        seen.add(key)
        link = f"{settings.FRONTEND_URL}/feedback/{feedback_token(ticket)}"
        try:
            html = render_to_string('emails/event_feedback.html', {
                'event': event, 'ticket': ticket, 'link': link,
            })
            message = EmailMultiAlternatives(
                subject=f"Share your feedback: {event.title}",
                body=f"Thank you for attending {event.title}. Share your feedback: {link}",
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[email],
            )
            message.attach_alternative(html, 'text/html')
            if safe_send_email(message, context_label='event_feedback'):
                sent += 1
            else:
                failed += 1
        except Exception as exc:
            logger.warning('Feedback email failed for %s: %s', email, exc)
            failed += 1
    return {'sent': sent, 'skipped': skipped, 'failed': failed}
