# backend/ticket_bookings/services/email_backend.py
"""
Custom Django email backend that sends mail via Resend's HTTPS API.

Why: Render's free tier blocks outbound SMTP at the network layer
     (OSError: [Errno 101] Network is unreachable). Resend delivers
     via HTTPS (port 443), which is always allowed.

Usage: set `EMAIL_BACKEND` to this dotted path. See core/settings/base.py.

Resend's Python SDK: https://github.com/resend/resend-python
"""
import logging
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

try:
    import resend
except ImportError:
    resend = None


class ResendEmailBackend(BaseEmailBackend):
    """
    Django email backend that delivers messages via Resend's HTTP API.

    Supports:
      - Plain text (message.body)
      - HTML (attached alternatives with mimetype text/html)
      - Attachments (both inline and regular)

    Returns the number of successfully delivered messages, like Django's
    built-in backends, so `EmailMessage.send()` returns 1 on success
    and the diagnostic helper in booking_api.py can log accordingly.
    """

    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)

        if resend is None:
            raise ImportError(
                "The `resend` package is required for ResendEmailBackend. "
                "Add `resend` to requirements.txt and reinstall."
            )

        api_key = getattr(settings, 'RESEND_API_KEY', None)
        if not api_key:
            raise ValueError(
                "RESEND_API_KEY is not configured. "
                "Set EMAIL_PROVIDER=resend and RESEND_API_KEY in your env."
            )

        resend.api_key = api_key

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def send_messages(self, email_messages):
        """
        Send one or more Django EmailMessage objects.

        Returns the number of messages successfully submitted to Resend.
        """
        if not email_messages:
            return 0

        sent_count = 0
        for message in email_messages:
            try:
                self._send_one(message)
                sent_count += 1
            except Exception as exc:
                if not self.fail_silently:
                    raise
                logger.exception(
                    f"❌ Resend delivery failed for {message.to}: {exc}"
                )

        return sent_count

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _send_one(self, message):
        """Convert a Django EmailMessage to Resend's payload and send it."""

        # -------- recipients --------
        to = list(message.to or [])
        if not to:
            raise ValueError("Email has no recipients (`to` is empty).")

        # -------- from --------
        from_email = message.from_email or settings.DEFAULT_FROM_EMAIL

        # -------- body: detect HTML alternative --------
        html_body = None
        text_body = message.body or ''

        # Django's EmailMultiAlternatives stores HTML in `.alternatives`
        # as a list of (content, mimetype) tuples.
        for content, mimetype in getattr(message, 'alternatives', []):
            if mimetype == 'text/html':
                html_body = content
                break

        # If the body itself is HTML (rare, but possible), use it
        if not html_body and getattr(message, 'content_subtype', None) == 'html':
            html_body = message.body
            text_body = None

        # Resend requires at least one of html/text
        if not html_body and not text_body:
            text_body = ' '

        # -------- attachments --------
        attachments = []
        for att in message.attachments:
            # Django may give us either:
            #   - a tuple (filename, content, mimetype)
            #   - an email.mime.base.MIMEBase instance
            if isinstance(att, tuple):
                filename, content, mimetype = att
            else:
                filename = att.get_filename() or 'attachment'
                content = att.get_payload(decode=True)
                mimetype = att.get_content_type()

            # Resend wants base64-encoded content
            import base64
            if isinstance(content, str):
                # Assume the caller already base64-encoded it (Django
                # sometimes does this for MIME attachments)
                encoded = content
            else:
                encoded = base64.b64encode(content).decode('ascii')

            attachments.append({
                'filename': filename,
                'content': encoded,
            })

        # -------- build payload --------
        payload = {
            'from': from_email,
            'to': to,
            'subject': message.subject or '(no subject)',
        }

        if html_body:
            payload['html'] = html_body
        if text_body:
            payload['text'] = text_body
        if attachments:
            payload['attachments'] = attachments

        # Reply-To if present
        reply_to = getattr(message, 'reply_to', None)
        if reply_to:
            payload['reply_to'] = list(reply_to)

        # CC / BCC if present
        if message.cc:
            payload['cc'] = list(message.cc)
        if message.bcc:
            payload['bcc'] = list(message.bcc)

        # -------- send --------
        logger.info(
            f"📧 [resend] Sending '{message.subject}' to {to} "
            f"({len(attachments)} attachment(s))"
        )

        response = resend.Emails.send(payload)

        # Resend returns {'id': '...'} on success or raises on failure.
        email_id = response.get('id') if isinstance(response, dict) else None
        logger.info(f"📧 [resend] Accepted by Resend, id={email_id}")

        return email_id