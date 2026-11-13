import uuid
from django.db import models
from django.utils import timezone


class PaymentGateway(models.TextChoices):
    RAZORPAY = 'razorpay', 'Razorpay'
    STRIPE = 'stripe', 'Stripe'


class PaymentStatus(models.TextChoices):
    CREATED = 'created'            # order/intent created, inventory held
    PENDING = 'pending'            # user at gateway, awaiting capture
    PAID = 'paid'                  # captured / succeeded -> fulfilled
    FAILED = 'failed'
    EXPIRED = 'expired'            # hold TTL elapsed without payment
    REFUNDED = 'refunded'
    PARTIALLY_REFUNDED = 'partially_refunded'


class Payment(models.Model):
    """One checkout attempt. Booking is created only on verified capture."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Tenant scope (required — every payment belongs to one org/event)
    organization = models.ForeignKey('ticket_bookings.Organization', on_delete=models.PROTECT, related_name='payments')
    event = models.ForeignKey('ticket_bookings.Event', on_delete=models.PROTECT, related_name='payments')
    # Filled only after fulfillment
    booking = models.ForeignKey('ticket_bookings.Booking', on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')

    gateway = models.CharField(max_length=16, choices=PaymentGateway.choices)
    status = models.CharField(max_length=24, choices=PaymentStatus.choices, default=PaymentStatus.CREATED, db_index=True)

    # Provider IDs (order_id == Razorpay order / Stripe PaymentIntent)
    provider_order_id = models.CharField(max_length=128, unique=True, null=True, blank=True, db_index=True)
    provider_payment_id = models.CharField(max_length=128, null=True, blank=True, db_index=True)

    # Amounts in MAJOR units + currency (converted to minor units at gateway)
    currency = models.CharField(max_length=8)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    discount_applied = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_code = models.CharField(max_length=64, blank=True, default='')
    amount_captured = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_refunded = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Customer snapshot (booking may not exist yet)
    customer_name = models.CharField(max_length=255)
    customer_email = models.EmailField()
    customer_phone = models.CharField(max_length=32, blank=True, default='')
    whatsapp_number = models.CharField(max_length=32, blank=True, default='')

    # The line items purchased: [{'tier_id', 'session_id', 'qty', 'attendees': [...]}]
    items = models.JSONField(default=list)
    # Provider-specific bits (client_secret, etc.)
    checkout = models.JSONField(default=dict)

    hold_expires_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.gateway}:{self.provider_order_id or self.id} ({self.status})"


class PaymentRefund(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='refunds')
    provider_refund_id = models.CharField(max_length=128, unique=True, null=True, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=24, default='pending')
    raw = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)


class WebhookEvent(models.Model):
    """Idempotency ledger — one row per processed gateway event."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    gateway = models.CharField(max_length=16, choices=PaymentGateway.choices)
    provider_event_id = models.CharField(max_length=191)
    event_type = models.CharField(max_length=64)
    payment = models.ForeignKey(Payment, on_delete=models.SET_NULL, null=True, blank=True, related_name='webhook_events')
    action = models.CharField(max_length=32, blank=True, default='')   # fulfilled|failed|refunded|ignored
    raw = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['gateway', 'provider_event_id'], name='uniq_gateway_event'),
        ]


class InventoryHold(models.Model):
    """One reserved block of tier/session capacity tied to a Payment."""
    class Status(models.TextChoices):
        ACTIVE = 'active'
        COMMITTED = 'committed'
        RELEASED = 'released'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='holds')
    tier = models.ForeignKey('ticket_bookings.TicketTier', on_delete=models.CASCADE, null=True, blank=True, related_name='holds')
    session = models.ForeignKey('ticket_bookings.Session', on_delete=models.CASCADE, null=True, blank=True, related_name='holds')
    quantity = models.PositiveIntegerField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    released_at = models.DateTimeField(null=True, blank=True)

class OrganizationPaymentConfig(models.Model):
    """Per-tenant gateway credentials.

    Secrets are encrypted at rest by the service layer; this model only
    stores ciphertext. One active configuration per tenant.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.OneToOneField(
        'ticket_bookings.Organization', on_delete=models.CASCADE,
        related_name='payment_config',
    )
    gateway = models.CharField(
        max_length=16, choices=PaymentGateway.choices,
        default=PaymentGateway.RAZORPAY,
    )
    mode = models.CharField(
        max_length=10,
        choices=(('test', 'Test'), ('live', 'Live')),
        default='test',
    )
    key_id = models.CharField(max_length=191, blank=True, default='')
    key_secret_encrypted = models.TextField(blank=True, default='')
    webhook_secret_encrypted = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Organization payment configuration'

    def __str__(self):
        return f'{self.organization} · {self.gateway} ({self.mode})'
