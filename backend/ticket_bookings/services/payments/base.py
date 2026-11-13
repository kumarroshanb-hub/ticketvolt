from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

# Minor-unit exponent per currency (ISO 4217). Default 2.
_ZERO_DECIMAL = {'JPY', 'KRW', 'VND', 'IDR', 'ISK', 'UGX'}


def minor_units(amount: Decimal, currency: str) -> int:
    """Convert major-unit Decimal to integer minor units for the gateway."""
    exp = 0 if currency.upper() in _ZERO_DECIMAL else 2
    return int(round(Decimal(amount) * (10 ** exp)))


def major_units(minor: int, currency: str) -> Decimal:
    exp = 0 if currency.upper() in _ZERO_DECIMAL else 2
    return Decimal(minor) / (10 ** exp)


@dataclass
class WebhookResult:
    valid: bool = False
    event_type: str = ''
    provider_event_id: str = ''
    provider_payment_id: Optional[str] = None
    provider_order_id: Optional[str] = None
    action: str = 'ignored'      # 'paid' | 'failed' | 'refunded' | 'ignored'
    raw: dict = field(default_factory=dict)


class PaymentProvider(ABC):
    name: str = ''

    @abstractmethod
    def create_order(self, payment) -> dict:
        """Create a gateway order/intent. Returns frontend checkout config."""

    @abstractmethod
    def verify_checkout(self, payment, params: dict) -> bool:
        """Verify the client-returned signature (sync redirect flow)."""

    @abstractmethod
    def parse_webhook(self, body: bytes, headers: dict) -> WebhookResult:
        """Verify webhook signature and normalize the event."""

    @abstractmethod
    def refund(self, payment, amount: Decimal, reason: str = '') -> dict:
        """Issue a (partial) refund at the gateway."""

    @abstractmethod
    def fetch_status(self, payment) -> str:
        """Authoritative gateway status for reconciliation."""