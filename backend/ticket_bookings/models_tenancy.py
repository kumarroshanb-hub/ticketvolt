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
• OrganizationInvite  — tracks pending email invitations (Magic Link flow).

Role hierarchy (6-tier):
  Platform tier : Super Admin  (User.is_superuser / is_staff)  — NOT a membership
  Tenant tier   : Owner > Admin > Staff > Member               — OrganizationMembership.role
  Public tier   : Member-less registered user / Guest          — no membership row
"""
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone
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
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='owned_organizations',
    )

    # Per-tenant display config. Mirrors the fields that used to live
    # on SystemSettings; seeded from SystemSettings on create so a new
    # tenant starts with the platform-configured display config. Any
    # field explicitly supplied by the caller overrides the seed.
    currency_code = models.CharField(max_length=3, default='INR')
    currency_symbol = models.CharField(max_length=8, default='₹')
    currency_locale = models.CharField(max_length=10, default='en-IN')
    country = models.CharField(max_length=100, default='India')
    country_code = models.CharField(max_length=3, default='IN')
    default_timezone = models.CharField(max_length=50, default='Asia/Kolkata')
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
        STAFF = 'staff', 'Staff'      # scanner / check-in only
        MEMBER = 'member', 'Member'   # registered attendee with an account
        # NOTE: 'customer' removed in the 6-tier refactor.
        # A person who merely bought a ticket and has no account is a
        # Guest (no membership row); one who has an account is a Member.

    # Roles that can manage the tenant (see events, bookings, etc.)
    MANAGER_ROLES = (OrgRole.OWNER, OrgRole.ADMIN)
    # Roles that can perform operational actions (check-in)
    OPERATOR_ROLES = (OrgRole.OWNER, OrgRole.ADMIN, OrgRole.STAFF)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='memberships',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='org_memberships',
    )
    role = models.CharField(
        max_length=20, choices=OrgRole.choices, default=OrgRole.MEMBER,
    )
    # Optional per-org profile data — the org's own view of the person.
    display_name = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    # ✅ NEW: Time-bounded membership fields for paid/temporary access
    valid_from = models.DateTimeField(default=timezone.now)
    valid_until = models.DateTimeField(
        null=True, 
        blank=True, 
        help_text="Leave blank for indefinite/lifetime membership."
    )
    is_active = models.BooleanField(
        default=True, 
        help_text="Manual override to disable access without deleting the row."
    )

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
        """Owner / Admin — can mutate tenant data."""
        return self.role in self.MANAGER_ROLES

    @property
    def is_operator(self):
        """Owner / Admin / Staff — can run the check-in scanner."""
        return self.role in self.OPERATOR_ROLES


# Expose nested OrgRole as a top-level import for serializers/permissions.
OrgRole = OrganizationMembership.OrgRole


# ✅ NEW: Organization Invite Model (For Magic Link / Passwordless Flow)
class OrganizationInvite(models.Model):
    """
    Tracks pending email invitations to join an organization.
    Used by the Magic Link / Passwordless onboarding flow.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='invites'
    )
    email = models.EmailField()
    role = models.CharField(
        max_length=20, choices=OrgRole.choices, default=OrgRole.MEMBER
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='sent_invites'
    )

    # Magic link token for the invite
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['token']),
            models.Index(fields=['organization', 'email']),
        ]

    valid_from = models.DateTimeField(default=timezone.now)
    valid_until = models.DateTimeField(
        null=True, blank=True,
        help_text="Membership expiry applied when the invite is accepted.",
    )

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(48)
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(days=7) # Invite expires in 7 days
        super().save(*args, **kwargs)

    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return f'Invite for {self.email} to {self.organization.slug} ({self.role})'


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
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='org_contacts',
    )
    email = models.EmailField()
    name = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    first_seen_at = models.DateTimeField(auto_now_add=True)
    unsubscribed = models.BooleanField(default=False)

    class Meta:
        ordering = ['-first_seen_at']

    def __str__(self):
        return f'{self.name or self.email} @ {self.organization.slug}'