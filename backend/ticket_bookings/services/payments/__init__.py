from django.conf import settings
from .razorpay_provider import RazorpayProvider
from .stripe_provider import StripeProvider

_PROVIDERS = {
    'razorpay': RazorpayProvider,
    'stripe': StripeProvider,
}


def get_provider(name: str, organization=None):
    """Return a gateway client for a tenant, falling back to platform keys."""
    name = (name or settings.PAYMENTS['DEFAULT_GATEWAY']).lower()
    if name not in _PROVIDERS:
        raise ValueError(f'Unknown payment gateway: {name!r}')

    config = None
    if organization is not None:
        from ...models_payments import OrganizationPaymentConfig
        config = OrganizationPaymentConfig.objects.filter(
            organization=organization, is_active=True,
        ).first()
        if config is not None and config.gateway != name:
            config = None

    if config is not None:
        from .crypto import decrypt
        if name == 'razorpay':
            return _PROVIDERS[name](
                key_id=config.key_id,
                key_secret=decrypt(config.key_secret_encrypted),
                webhook_secret=decrypt(config.webhook_secret_encrypted),
            )
        if name == 'stripe':
            return _PROVIDERS[name](
                secret_key=decrypt(config.key_secret_encrypted),
                publishable_key=config.key_id,
                webhook_secret=decrypt(config.webhook_secret_encrypted),
            )

    return _PROVIDERS[name]()