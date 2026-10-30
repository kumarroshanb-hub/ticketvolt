# backend/ticket_bookings/models_tenancy.py
"""
Tenant (Organization) models.

Design:
  • Organization        — the tenant object. Every business entity
                          (Event, Venue, Discount, CancellationPolicy)
                          hangs off exactly one Organization.
  • OrganizationMembership — a user's role WITHIN one org. Replaces the
                          flat UserProfile.is_organizer flag.
  • OrganizationContact — the org's CRM view of a person, whether or not
                          they have a User account. Populated lazily on
                          every booking that lands on this org.
"""
import uuid

from django.contrib.auth.models import User
from django.db import models
from django.utils.text import slugify


class Organization(models.Model):
    """
    A tenant. "Malayalam Academy HK", "Kala", etc.

    Platform-level admins (User.is_staff / is_superuser) can see every
    Organization. Everyone else is scoped to the Organizations they are
    a member of.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)

    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200, unique=True)

    # The user who created the org. PROTECT so a SuperAdmin can't
    # accidentally delete the last human with ownership rights.
    owner = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name='owned_organizations',
    )

    # Per-tenant display config. Mirrors the fields that used to live
    # only on SystemSettings. SystemSettings stays as the platform-wide
    # fallback.
    currency_code = models.CharField(max_length=3, default='HKD')
    currency_symbol = models.CharField(max_length=8, default='HK$')
    currency_locale = models.CharField(max_length=16, default='en-HK')
    country = models.CharField(max_length=100, default='Hong Kong')
    country_code = models.CharField(max_length=2, default='HK')
    default_timezone = models.CharField(max_length=64, default='Asia/Hong_Kong')
    org_email = models.EmailField(blank=True, default='')
    org_logo_url = models.URLField(blank=True, default='')
    email_from_name = models.CharField(max_length=120, blank=True, default='')

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [models.Index(fields=['slug'])]

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:180] or 'org'
            candidate = base
            n = 1
            while Organization.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                n += 1
                candidate = f'{base}-{n}'
            self.slug = candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class OrganizationMembership(models.Model):
    """
    A user's role inside one Organization.

    This is the ONLY place tenant roles live. `User.is_staff` /
    `is_superuser` remain the platform roles.
    """

    class OrgRole(models.TextChoices):
        OWNER = 'owner', 'Owner'
        ADMIN = 'admin', 'Admin'
        STAFF = 'staff', 'Staff'        # scanner / check-in only
        MEMBER = 'member', 'Member'     # registered attendee with an account
        CUSTOMER = 'customer', 'Customer'  # bought a ticket, no account relationship

    # Roles that can manage the tenant (see events, bookings, etc.)
    MANAGER_ROLES = (OrgRole.OWNER, OrgRole.ADMIN)
    # Roles that can perform operational actions (check-in)
    OPERATOR_ROLES = (OrgRole.OWNER, OrgRole.ADMIN, OrgRole.STAFF)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='memberships',
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='org_memberships',
    )
    role = models.CharField(
        max_length=20, choices=OrgRole.choices, default=OrgRole.MEMBER,
    )

    # Optional per-org profile data — the org's own view of the person.
    display_name = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)

    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('organization', 'user')]
        ordering = ['-joined_at']
        indexes = [
            models.Index(fields=['organization', 'role']),
            models.Index(fields=['user', 'role']),
        ]

    def __str__(self):
        return f'{self.user.username} @ {self.organization.slug} ({self.role})'

    @property
    def is_manager(self):
        return self.role in self.MANAGER_ROLES

    @property
    def is_operator(self):
        return self.role in self.OPERATOR_ROLES


class OrganizationContact(models.Model):
    """
    The org's own CRM row for a person. Created lazily on the first
    booking tied to this org, whether the person has a User account or
    checked out as a guest.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='contacts',
    )
    user = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='org_contacts',
    )
    email = models.EmailField()
    name = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)

    first_seen_at = models.DateTimeField(auto_now_add=True)
    unsubscribed = models.BooleanField(default=False)

    class Meta:
        unique_together = [('organization', 'email')]
        ordering = ['-first_seen_at']
        indexes = [models.Index(fields=['organization', 'email'])]

    def __str__(self):
        return f'{self.email} @ {self.organization.slug}'