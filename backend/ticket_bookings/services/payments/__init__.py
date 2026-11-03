from django.conf import settings
from .razorpay_provider import RazorpayProvider
from .stripe_provider import StripeProvider

_PROVIDERS = {
    'razorpay': RazorpayProvider,
    'stripe': StripeProvider,
}


def get_provider(name: str):
    name = (name or settings.PAYMENTS['DEFAULT_GATEWAY']).lower()
    if name not in _PROVIDERS:
        raise ValueError(f'Unknown payment gateway: {name!r}')
    return _PROVIDERS[name]()