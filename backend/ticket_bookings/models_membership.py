# backend/ticket_bookings/models_membership.py
"""
Membership models for TicketVolt.

Scope
-----
A paid (or free) subscription a user holds with an Organization.
Family members are modeled as MembershipDependent rows — NOT User accounts.

Design decisions (v1):
  • One login per household (the primary member).
  • Dependents have no login; they receive member_codes for check-in.
  • One Membership row per purchase/renewal — history preserved.
  • Tiers own pricing + benefit config (JSON) so perks don't need migrations.
  • MembershipPayment is separate from Payment because Payment FKs to Event.

See also:
  • services/membership_access.py    — read-only access checks
  • services/membership_fulfillment.py — provisioning on payment success
"""
import secrets
import string
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


class MembershipTier(models.Model):
    """
    A purchasable plan within an organization (e.g. "Family Plan (Yearly)").
    Pricing is snapshotted onto Membership at purchase time.
    """
    class BillingPeriod(models.TextChoices):
        ONE_TIME  = 'one_time',  'One-time'
        MONTHLY   = 'monthly',   'Monthly'
        QUARTERLY = 'quarterly', 'Quarterly'
        YEARLY    = 'yearly',    'Yearly'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organization = models.ForeignKey(
        'ticket_bookings.Organization',
        on_delete=models.CASCADE,
        related_name='membership_tiers',
    )
    slug = models.SlugField(max_length=120)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)

    price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    currency_code = models.CharField(max_length=3, blank=True, default='')
    billing_period = models.CharField(
        max_length=20, choices=BillingPeriod.choices, default=BillingPeriod.YEARLY,
    )
    duration_days = models.PositiveIntegerField(default=365)

    # 1 = primary only, 5 = primary + 4 dependents, etc.
    max_members = models.PositiveSmallIntegerField(default=1)

    benefits = models.JSONField(
        default=dict, blank=True,
        help_text=(
            'Free-form benefit flags. Examples: '
            '{"member_discount_pct": 15, '
            '"allowed_event_categories": ["concert","theater"], '
            '"free_tickets_per_year": 2, "members_only_events": true}'
        ),
    )

    is_active = models.BooleanField(default=True)
    is_public = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['organization', 'price']
        unique_together = [('organization', 'slug')]
        indexes = [
            models.Index(fields=['organization', 'is_active'], name='mt_org_active_idx'),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:120]
        if not self.currency_code:
            self.currency_code = self.organization.currency_code
        durations = {'monthly': 30, 'quarterly': 90, 'yearly': 365}
        if self.billing_period in durations:
            self.duration_days = durations[self.billing_period]
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.name} ({self.organization.slug})'


class Membership(models.Model): 
    """
    A user's active (or historical) membership with an organization.

    One row per activation / renewal. Query the active row via
    `Membership.active_for(user, organization)` — never filter inline.
    """
    class Status(models.TextChoices):
        PENDING_OFFLINE = 'pending_offline', 'Pending offline payment'
        PENDING   = 'pending',   'Pending gateway payment'
        ACTIVE    = 'active',    'Active'
        EXPIRED   = 'expired',   'Expired'
        CANCELLED = 'cancelled', 'Cancelled'
        REFUNDED  = 'refunded',  'Refunded'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organization = models.ForeignKey(
        'ticket_bookings.Organization',
        on_delete=models.PROTECT,
        related_name='paid_memberships',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='memberships',
    )
    tier = models.ForeignKey(MembershipTier, on_delete=models.PROTECT, related_name='memberships')

    # Snapshot — never re-read the live tier row for pricing.
    price_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency_code = models.CharField(max_length=3, default='')

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    started_at = models.DateTimeField(default=timezone.now)
    valid_until = models.DateTimeField(null=True, blank=True)  # null = lifetime

    membership_payment_id = models.CharField(max_length=128, blank=True)
    # ---- Offline / cash payment tracking ----
    payment_method = models.CharField(
        max_length=20,
        default='online',
        choices=[
            ('online', 'Online (gateway)'),
            ('cash',   'Cash'),
            ('offline', 'Other offline (bank transfer, cheque, …)'),
        ],
    )
    offline_reference = models.CharField(
        max_length=128, blank=True, default='',
        help_text='Reference the user quoted at signup (e.g. receipt no., bank ref).',
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_memberships',
        help_text='The owner/admin who activated or rejected an offline membership.',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    #-----------------------------
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_reason = models.CharField(max_length=255, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'organization', 'status'], name='memb_user_org_status_idx'),
            models.Index(fields=['organization', 'valid_until'], name='memb_org_valid_until_idx'),
        ]

    # ---- Convenience API ----

    @classmethod
    def active_for(cls, user, organization, now=None):
        now = now or timezone.now()
        return (
            cls.objects
            .filter(
                user=user,
                organization=organization,
                status=cls.Status.ACTIVE,
            )
            .filter(
                models.Q(valid_until__isnull=True) | models.Q(valid_until__gte=now)
            )
            .order_by('-started_at')
            .first()
        )

    def is_active(self, now=None):
        now = now or timezone.now()
        if self.status != self.Status.ACTIVE:
            return False
        return self.valid_until is None or self.valid_until >= now

    def seats_used(self):
        # +1 for the primary member.
        return 1 + self.dependents.filter(is_active=True).count()

    def has_seat_available(self):
        return self.seats_used() < self.tier.max_members

    def __str__(self):
        return f'{self.user.username} @ {self.organization.slug} — {self.tier.name} ({self.status})'


class MembershipDependent(models.Model):
    """
    A covered family member. NOT a User account.

    If they later want their own login, use the `promote()` endpoint
    on MembershipViewSet which creates a User + links promoted_user.
    """
    class Relationship(models.TextChoices):
        SPOUSE  = 'spouse',  'Spouse'
        CHILD   = 'child',   'Child'
        PARENT  = 'parent',  'Parent'
        SIBLING = 'sibling', 'Sibling'
        OTHER   = 'other',   'Other'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    membership = models.ForeignKey(
        Membership, on_delete=models.CASCADE, related_name='dependents',
    )
    full_name = models.CharField(max_length=200)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    relationship = models.CharField(
        max_length=20, choices=Relationship.choices, default=Relationship.OTHER,
    )
    member_code = models.CharField(max_length=20, unique=True, db_index=True)

    promoted_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='dependent_profiles',
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['membership', 'full_name']
        indexes = [models.Index(fields=['member_code'], name='membdep_code_idx')]

    def save(self, *args, **kwargs):
        if not self.member_code:
            alphabet = string.ascii_uppercase + string.digits
            self.member_code = 'TKV-' + ''.join(secrets.choice(alphabet) for _ in range(6))
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.full_name} → {self.membership.tier.name}'


class MembershipPayment(models.Model):
    """
    Payment ledger for membership signup / renewal.

    Deliberately separate from `Payment` because that model FKs to Event.
    Reuses the same `services.payments` provider interface, so Razorpay
    and Stripe work identically at the frontend.
    """
    class Status(models.TextChoices):
        CREATED   = 'created',   'Created'
        PENDING   = 'pending',   'Pending'
        PAID      = 'paid',      'Paid'
        FAILED    = 'failed',    'Failed'
        EXPIRED   = 'expired',   'Expired'
        REFUNDED  = 'refunded',  'Refunded'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organization = models.ForeignKey(
        'ticket_bookings.Organization', on_delete=models.PROTECT,
        related_name='membership_payments',
    )
    membership = models.ForeignKey(
        Membership, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='payments',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='membership_payments',
    )
    tier = models.ForeignKey(MembershipTier, on_delete=models.PROTECT)

    gateway = models.CharField(max_length=16)
    provider_order_id = models.CharField(max_length=128, unique=True, null=True, blank=True)
    provider_payment_id = models.CharField(max_length=128, null=True, blank=True)

    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=8)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.CREATED)
    checkout = models.JSONField(default=dict)

    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['provider_order_id'], name='membpay_provider_order_idx'),
            models.Index(fields=['user', 'status'], name='membpay_user_status_idx'),
        ]

    # ---- Provider-compatibility shims ----
    @property
    def event(self):
        """Some providers reference payment.event.title. Return None here."""
        return None

    @property
    def description(self):
        return f'{self.tier.name} — {self.organization.name}'

    @property
    def customer_name(self):
        return self.user.get_full_name() or self.user.username

    @property
    def customer_email(self):
        return self.user.email

    @property
    def customer_phone(self):
        try:
            return self.user.profile.phone or ''
        except Exception:
            return ''

    def __str__(self):
        return f'{self.gateway}:{self.provider_order_id or self.id} ({self.status})'