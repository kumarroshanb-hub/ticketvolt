import hashlib
import hmac
import logging

import razorpay
from django.conf import settings

from .base import PaymentProvider, WebhookResult, minor_units

logger = logging.getLogger(__name__)


class RazorpayProvider(PaymentProvider):
    name = 'razorpay'

    def __init__(self, key_id=None, key_secret=None, webhook_secret=None):
        self.key_id = key_id or settings.RAZORPAY_KEY_ID
        self.key_secret = key_secret or settings.RAZORPAY_KEY_SECRET
        self.webhook_secret = webhook_secret or settings.RAZORPAY_WEBHOOK_SECRET
        self.client = razorpay.Client(auth=(self.key_id, self.key_secret))

    # ---------- helpers ----------

    @staticmethod
    def _description_for(payment):
        """Return a display title for ticket payments OR membership payments."""
        # Membership payments carry an explicit description property.
        desc = getattr(payment, 'description', None)
        if desc:
            return desc
        event = getattr(payment, 'event', None)
        if event is not None and getattr(event, 'title', None):
            return event.title
        return 'TiketVault'

    # ---------- interface ----------

    def create_order(self, payment) -> dict:
        order = self.client.order.create({
            'amount': minor_units(payment.amount, payment.currency),
            'currency': payment.currency.upper(),
            'receipt': str(payment.id),
            'payment_capture': 1,
            'notes': {'payment_id': str(payment.id)},
        })
        org = getattr(payment, 'organization', None)
        return {
            'provider_order_id': order['id'],
            'client': {
                'key': self.key_id,
                'order_id': order['id'],
                'amount': minor_units(payment.amount, payment.currency),
                'currency': payment.currency.upper(),
                'name': org.name if org else 'TicketVolt',
                'description': self._description_for(payment),
                'prefill': {
                    'name': getattr(payment, 'customer_name', '') or '',
                    'email': getattr(payment, 'customer_email', '') or '',
                    'contact': getattr(payment, 'customer_phone', '') or '',
                },
            },
        }

    def verify_checkout(self, payment, params: dict) -> bool:
        order_id = params.get('razorpay_order_id', '')
        payment_id = params.get('razorpay_payment_id', '')
        signature = params.get('razorpay_signature', '')
        if not (order_id and payment_id and signature):
            return False
        expected = hmac.new(
            self.key_secret.encode(),
            f'{order_id}|{payment_id}'.encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    def parse_webhook(self, body: bytes, headers: dict) -> WebhookResult:
        res = WebhookResult(raw={})
        signature = headers.get('X-Razorpay-Signature', '')
        expected = hmac.new(
            self.webhook_secret.encode(), body, hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            logger.warning('🚫 Razorpay webhook signature mismatch')
            return res
        res.valid = True

        import json
        data = json.loads(body)
        res.raw = data
        event = data.get('event', '')
        res.event_type = event
        entity = data.get('payload', {}).get('payment', {}).get('entity', {})
        res.provider_payment_id = entity.get('id')
        res.provider_order_id = entity.get('order_id')
        res.provider_event_id = (
            f"{event}:{res.provider_payment_id or res.provider_order_id or 'unknown'}"
        )

        if event == 'payment.captured':
            res.action = 'paid'
        elif event == 'payment.failed':
            res.action = 'failed'
        elif event in ('refund.created', 'refund.processed'):
            res.action = 'refunded'
        return res

    def refund(self, payment, amount, reason=''):
        return self.client.refund.create({
            'payment_id': payment.provider_payment_id,
            'amount': minor_units(amount, payment.currency),
            'notes': {'reason': reason, 'payment_id': str(payment.id)},
        })

    def fetch_status(self, payment) -> str:
        if not payment.provider_payment_id:
            return 'created'
        p = self.client.payment.fetch(payment.provider_payment_id)
        return p.get('status', 'unknown')