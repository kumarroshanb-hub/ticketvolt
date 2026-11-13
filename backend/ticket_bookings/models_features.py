"""Feature entitlements: definitions, packages and per-tenant overrides."""
import uuid

from django.contrib.auth.models import User
from django.db import models


class FeatureDefinition(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default='')
    category = models.CharField(max_length=60, blank=True, default='General')
    default_enabled = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['category', 'name']

    def __str__(self):
        return f'{self.name} ({self.key})'


class FeaturePackage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default='')
    feature_keys = models.JSONField(default=list, blank=True)
    allowed_auth_methods = models.JSONField(
        default=list, blank=True,
        help_text='Default login methods for organizations on this tier.',
    )
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_default', 'name']

    def __str__(self):
        return self.name


class OrganizationFeature(models.Model):
    """Per-organisation override of one feature."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        'ticket_bookings.Organization', on_delete=models.CASCADE,
        related_name='feature_overrides',
    )
    feature = models.ForeignKey(
        FeatureDefinition, on_delete=models.CASCADE, related_name='overrides',
    )
    enabled = models.BooleanField(default=True)
    config = models.JSONField(default=dict, blank=True)
    updated_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='+',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('organization', 'feature')]
        ordering = ['feature__category', 'feature__name']

    def __str__(self):
        return f'{self.organization} · {self.feature.key}={self.enabled}'
