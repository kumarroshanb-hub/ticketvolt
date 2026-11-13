"""Commercial / operations models: transfers, payouts, audit trail."""
import uuid

from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


class TicketTransfer(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        ACCEPTED = 'accepted', 'Accepted'
        CANCELLED = 'cancelled', 'Cancelled'
        EXPIRED = 'expired', 'Expired'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.ForeignKey(
        'ticket_bookings.Ticket', on_delete=models.CASCADE,
        related_name='transfers',
    )
    from_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True,
        related_name='ticket_transfers_sent',
    )
    to_email = models.EmailField()
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING,
    )
    expires_at = models.DateTimeField()
    accepted_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='ticket_transfers_received',
    )
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.ticket.unique_code} → {self.to_email} ({self.status})'

    @property
    def is_open(self):
        return self.status == self.Status.PENDING and self.expires_at > timezone.now()


class OrganizerPayout(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        APPROVED = 'approved', 'Approved'
        PAID = 'paid', 'Paid'
        CANCELLED = 'cancelled', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'ticket_bookings.Organization', on_delete=models.CASCADE,
        related_name='payouts',
    )
    reference = models.CharField(max_length=40, unique=True)
    period_start = models.DateField()
    period_end = models.DateField()
    gross_sales = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    refunds = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    platform_fee = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    net_payout = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    paid_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='payouts_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-period_end']

    def __str__(self):
        return f'{self.reference} · {self.organization} · {self.net_payout}'


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'ticket_bookings.Organization', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='audit_logs',
    )
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='audit_logs',
    )
    action = models.CharField(max_length=120)
    method = models.CharField(max_length=10, blank=True, default='')
    path = models.CharField(max_length=500, blank=True, default='')
    status_code = models.PositiveIntegerField(null=True, blank=True)
    entity_type = models.CharField(max_length=80, blank=True, default='')
    entity_id = models.CharField(max_length=80, blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    detail = models.JSONField(default=dict, blank=True)
    # Tamper-evident chain. Entries are append-only; entry_hash covers
    # the previous hash and the immutable fields of this entry.
    sequence = models.PositiveBigIntegerField(null=True, blank=True, db_index=True)
    prev_hash = models.CharField(max_length=64, blank=True, default='')
    entry_hash = models.CharField(max_length=64, blank=True, default='', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organization', 'created_at']),
            models.Index(fields=['actor', 'created_at']),
        ]

    def __str__(self):
        return f'{self.action} {self.method} {self.path}'

    def save(self, *args, **kwargs):
        import hashlib
        import json
        from django.db import transaction

        if self.pk and AuditLog.objects.filter(pk=self.pk).exists():
            raise ValueError('Audit log entries are append-only.')

        with transaction.atomic():
            last = (
                AuditLog.objects.select_for_update()
                .order_by('-sequence')
                .first()
            )
            self.sequence = (last.sequence or 0) + 1 if last else 1
            self.prev_hash = last.entry_hash if last else ''
            payload = {
                'sequence': self.sequence,
                'organization_id': str(self.organization_id or ''),
                'actor_id': self.actor_id,
                'action': self.action,
                'method': self.method,
                'path': self.path,
                'status_code': self.status_code,
                'entity_type': self.entity_type,
                'entity_id': self.entity_id,
                'ip_address': str(self.ip_address or ''),
                'detail': self.detail or {},
            }
            raw = f"{self.prev_hash}:{json.dumps(payload, sort_keys=True, separators=(',', ':'), default=str)}"
            self.entry_hash = hashlib.sha256(raw.encode()).hexdigest()
            super().save(*args, **kwargs)


class PatronContact(models.Model):
    """Tracks Patrons-team outreach for a booking (no duplicate contacts)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking = models.OneToOneField(
        'ticket_bookings.Booking', on_delete=models.CASCADE,
        related_name='patron_contact',
    )
    contacted_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='patron_contacts',
    )
    contacted_at = models.DateTimeField(default=timezone.now)
    notes = models.TextField(blank=True, default='')

    def __str__(self):
        return f'Patron contact {self.booking.booking_reference}'


class OAuthLoginTicket(models.Model):
    """One-time handoff from the Google OAuth callback to the SPA."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    token = models.CharField(max_length=80, unique=True, db_index=True)
    user = models.ForeignKey(
        'auth.User', on_delete=models.CASCADE, related_name='oauth_login_tickets',
    )
    access_token = models.TextField()
    refresh_token = models.TextField()
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
