import json
import logging

import stripe
from django.conf import settings

from .base import PaymentProvider, WebhookResult, minor_units, major_units

logger = logging.getLogger(__name__)
stripe.api_key = settings.STRIPE_SECRET_KEY


class StripeProvider(PaymentProvider):
    name = 'stripe'

    def create_order(self, payment) -> dict:
        intent = stripe.PaymentIntent.create(
            amount=minor_units(payment.amount, payment.currency),
            currency=payment.currency.lower(),
            metadata={'payment_id': str(payment.id)},
            receipt_email=payment.customer_email or None,
            automatic_payment_methods={'enabled': True},
        )
        return {
            'provider_order_id': intent['id'],
            'client': {
                'client_secret': intent['client_secret'],
                'publishable_key': settings.STRIPE_PUBLISHABLE_KEY,
                'payment_intent_id': intent['id'],
            },
        }

    def verify_checkout(self, payment, params: dict) -> bool:
        # Stripe relies on webhook + intent status; re-fetch the intent.
        try:
            intent = stripe.PaymentIntent.retrieve(payment.provider_order_id)
            return intent.status in ('succeeded', 'requires_capture')
        except stripe.error.StripeError:
            logger.exception('Stripe verify_checkout failed')
            return False

    def parse_webhook(self, body: bytes, headers: dict) -> WebhookResult:
        res = WebhookResult(raw={})
        sig = headers.get('Stripe-Signature', '')
        try:
            event = stripe.Webhook.construct_event(body, sig, settings.STRIPE_WEBHOOK_SECRET)
        except (ValueError, stripe.error.SignatureVerificationError):
            logger.warning('🚫 Stripe webhook signature mismatch')
            return res

        res.valid = True
        res.event_type = event['type']
        res.provider_event_id = event['id']
        obj = event['data']['object']
        res.raw = {'type': event['type'], 'object_id': obj.get('id')}

        if event['type'] == 'payment_intent.succeeded':
            res.action = 'paid'
            res.provider_order_id = obj.get('id')
            res.provider_payment_id = obj.get('latest_charge')
        elif event['type'] == 'payment_intent.payment_failed':
            res.action = 'failed'
            res.provider_order_id = obj.get('id')
        elif event['type'] == 'charge.refunded':
            res.action = 'refunded'
            res.provider_payment_id = obj.get('id')
        return res

    def refund(self, payment, amount, reason=''):
        return stripe.Refund.create(
            payment_intent=payment.provider_order_id,
            amount=minor_units(amount, payment.currency),
            reason=reason or None,
            metadata={'payment_id': str(payment.id)},
        )

    def fetch_status(self, payment) -> str:
        if not payment.provider_order_id:
            return 'created'
        intent = stripe.PaymentIntent.retrieve(payment.provider_order_id)
        return intent.status   # requires_payment_method|succeeded|canceled|...