"""Email-sending service for authentication & membership lifecycle.

Mirrors the contract of ``services/booking_emails.py`` exactly:

* Pure service module — no DRF dependency, independently unit-testable.
* HTML rendered from ``ticket_bookings/templates/emails/*.html``.
* Sent via ``EmailMultiAlternatives`` (text part = strip_tags(html)).
* Delivery through ``safe_send_email`` so SMTP/Resend failures are
  diagnosed and logged — never swallowed silently.
* Every sender returns ``{'success': bool, 'message'|'error': str}``.
* Senders NEVER raise: callers treat email as non-blocking.

Public API
----------
- send_magic_link_email(user, link)
- send_password_reset_email(user, link)
- send_organization_invite_email(invite, link)
- send_welcome_email(user)
"""
from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags

from .booking_emails import safe_send_email

logger = logging.getLogger(__name__)

MAGIC_LINK_MINUTES = 15


def _send(*, template: str, subject: str, context: dict,
          recipient: str, label: str) -> dict:
    """Shared render → EmailMultiAlternatives → safe_send_email path.

    Same shape as booking_emails._send_notification: all link/notification
    emails differ only in template/subject/context.
    """
    if not recipient:
        return {'success': False, 'message': 'No recipient address.',
                'error': 'No recipient.'}
    try:
        html_content = render_to_string(template, context)
        text_content = strip_tags(html_content)

        email = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[recipient],
        )
        email.attach_alternative(html_content, 'text/html')

        sent_ok = safe_send_email(email, context_label=label)
        return {
            'success': sent_ok,
            'message': (f'{label} email sent to {recipient}.' if sent_ok
                        else f'{label} email failed (see logs).'),
            'error': None if sent_ok else 'Delivery failed (see logs).',
        }
    except Exception as exc:
        logger.exception('❌ %s email failed for %s: %s', label, recipient, exc)
        return {'success': False, 'message': f'{label} email error: {exc}',
                'error': str(exc)}


# ============================================================
# PUBLIC SENDERS
# ============================================================

def send_magic_link_email(user, link: str) -> dict:
    return _send(
        template='emails/auth_link.html',
        subject='Your TicketVolt Login Link',
        context={
            'user': user,
            'link': link,
            'heading': 'Your secure login link',
            'message': (
                'Click the button below to sign in to TicketVolt. '
                f'This link expires in {MAGIC_LINK_MINUTES} minutes '
                'and can be used once.'
            ),
            'cta': 'Log In',
        },
        recipient=user.email,
        label='magic_link',
    )


def send_password_reset_email(user, link: str) -> dict:
    return _send(
        template='emails/auth_link.html',
        subject='Password Reset Request - TicketVolt',
        context={
            'user': user,
            'link': link,
            'heading': 'Reset your password',
            'message': (
                'You requested a password reset. Click the button below '
                'to choose a new password. If you didn\'t request this, '
                'you can safely ignore this email.'
            ),
            'cta': 'Reset Password',
        },
        recipient=user.email,
        label='password_reset',
    )


def send_organization_invite_email(invite, link: str) -> dict:
    return _send(
        template='emails/organization_invite.html',
        subject=f'Invitation to join {invite.organization.name}',
        context={
            'invite': invite,
            'organization': invite.organization,
            'link': link,
        },
        recipient=invite.email,
        label='organization_invite',
    )


def send_welcome_email(user) -> dict:
    return _send(
        template='emails/welcome.html',
        subject=f'Welcome to TicketVolt, {user.first_name or user.username}!',
        context={
            'user': user,
            'login_url': f'{settings.FRONTEND_URL}/login',
        },
        recipient=user.email,
        label='welcome',
    )

def send_otp_email(user, code: str, expiry_minutes: int = 5) -> dict:
    return _send(
        template='emails/otp_code.html',
        subject='Your TicketVolt Verification Code',
        context={'user': user, 'code': code, 'expiry_minutes': expiry_minutes},
        recipient=user.email,
        label='otp_code',
    )