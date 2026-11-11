# backend/ticket_bookings/api/serializers.py
import secrets
from django.contrib.auth.hashers import make_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.models import User
from django.conf import settings
from django.db import models  # ← required by get_user_effective_role()
from django.core.exceptions import FieldDoesNotExist  # ADDED FOR 6-TIER HIERARCHY SAFETY
from django.utils import timezone
from decimal import Decimal
import json
import os
import re
import logging
from ..services.serializers_helpers import resolve_or_create_user_for_booking as _resolve_or_create_user_for_booking
from ..models import (
    Event, Venue, Session, TicketTier, Booking, Ticket,
    CheckInLog, Discount, DiscountUsage, EventTemplateType, EventTemplate,
    UserProfile, CancellationPolicy,
    VenueMaster,              # ✅ ADDED — needed by VenueMasterListSerializer
)
from ..models_tenancy import (  # UPDATED: added OrganizationContact back
    Organization, OrganizationMembership, OrganizationContact, OrgRole,
)
from ..services.cancellation_policy import validate_cancellation_rules
from ..services.tenancy import user_memberships_payload, effective_role_label
from ..services.event_pricing import (
    resolve_seat_price,
    compute_booking_subtotal,
    PricingError,
)
from ..utils.date_validation import validate_event_dates

# ✅ SECURITY FIX: import the canonical membership filter and the
# superuser predicate from the tenancy service.
from ..services.tenancy import (
    _active_membership_filter,
    is_platform_superuser,
)

# ============================================================
# MEMBERSHIP SERIALIZERS
# ============================================================
from ..models_membership import (  # noqa: E402
    Membership,
    MembershipDependent,
    MembershipPayment,
    MembershipTier,
)

def get_user_effective_role(user):
    """
    DEPRECATED wrapper. Delegates to `tenancy.effective_role_label()`.

    In the membership-as-property model there is no "the user's role";
    the label is derived from the user's memberships. Kept so existing
    callers keep working; new code should call
    `tenancy.effective_role_label` directly.

    Priority: superuser > highest org role > 'user' (guest / no membership).
    """
    return effective_role_label(user)


logger = logging.getLogger(__name__)


# ✅ SECURITY FIX: `_active_user_memberships` now delegates to the canonical
# tenancy filter, which applies is_active / valid_from / valid_until /
# removed_at. The old `_membership_has_is_active` probe and the inline
# `.filter(is_active=True)` are gone — they treated expired or soft-removed
# memberships as active.
def _active_user_memberships(user):
    """Legacy alias — delegates to the canonical tenancy filter."""
    return _active_membership_filter(user)


# Hard cap — a single booking may not contain more than this many tickets.
MAX_TICKETS_PER_BOOKING = 50

# ---------------------------------------------------------------------------
# Canonical ticket QR payload schema.
# ---------------------------------------------------------------------------
TICKET_SCHEMA_VERSION = 1
TICKET_TYPE = 'ticket'
TICKET_CODE_RE = re.compile(r'^(TIX|REG)[A-Z0-9]{8,32}$')
MAX_QR_PAYLOAD_LENGTH = 2048


# ============================================================
# ✅ NEW: Login with Email OR Username
# ============================================================
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Allows users to log in using either their username or their email address.
    """
    def validate(self, attrs):
        login_identifier = attrs.get('username', '').strip()

        if '@' in login_identifier:
            try:
                user = User.objects.get(email__iexact=login_identifier)
                attrs['username'] = user.username
            except User.DoesNotExist:
                pass

        return super().validate(attrs)


# ============================================================
# Organizer eligibility helper
# ============================================================
def _user_can_own_events(user):
    """
    Determine whether `user` may be assigned as an event organizer.

    ✅ SECURITY FIX: `is_staff` is no longer honored here. After the
    Platform Staff removal, `is_staff` is either deleted (dead code) or
    a legacy flag on superusers only (already caught by `is_superuser`).
    Honoring a stale `is_staff=True` row would let a demoted user with
    no membership be assigned as an organizer. Use the canonical
    superuser predicate instead.
    """
    if user is None:
        return False
    if is_platform_superuser(user):  # is_superuser only
        return True
    # In the 6-tier hierarchy, any user with an active organization membership
    # can be assigned as an event organizer. The specific organization membership
    # invariant is strictly enforced in the EventViewSet.
    return _active_user_memberships(user).exists()


# ============================================================
# Event-level capacity helper
# ============================================================
def _event_total_capacity(obj):
    sessions = list(obj.sessions.all())
    if sessions:
        return sum(max(0, (s.capacity or 0)) for s in sessions)
    from django.db.models import Sum
    return obj.tiers.aggregate(total=Sum('quantity_total')).get('total') or 0


def _event_venue_payload(event):
    """Return the venue as pinned to THIS event, not the live Venue row.

    `EventVenuePlan` pins a specific VenueMaster version. `provision_venue_plan`
    copies that version's physical-venue fields onto `event.venue_metadata`.
    Preferring the pinned copy means editing the source Venue later creates a
    new master version but does NOT rewrite how an existing event's venue is
    displayed. Falls back to the live FK for legacy/GA events.
    """
    venue = event.venue
    pinned = event.venue_metadata or {}

    if venue is None and not pinned:
        return None

    def pick(key, default=None):
        if key in pinned and pinned.get(key) not in (None, ''):
            return pinned.get(key)
        return getattr(venue, key, default) if venue is not None else default

    venue_id = pinned.get('venue_id') or (str(venue.id) if venue is not None else None)

    return {
        'id': str(venue_id) if venue_id else None,
        'name': pick('name', ''),
        'address_line1': pick('address_line1', ''),
        'address_line2': pick('address_line2', ''),
        'city': pick('city', ''),
        'state': pick('state', ''),
        'postal_code': pick('postal_code', ''),
        'country': pick('country', ''),
        'has_reserved_seating': bool(
            pinned.get('has_reserved_seating')
            if 'has_reserved_seating' in pinned
            else getattr(venue, 'has_reserved_seating', False)
        ),
        'venue_master_id': pinned.get('venue_master_id'),
        'venue_master_version': pinned.get('venue_master_version'),
    }


# ============================================================
# TICKET QR PAYLOAD (strict)
# ============================================================
class TicketPayloadSerializer(serializers.Serializer):
    v = serializers.IntegerField(required=True)
    type = serializers.CharField(required=True, max_length=16)
    code = serializers.CharField(required=True, max_length=64)
    sig = serializers.CharField(required=True, max_length=256)

    def validate(self, attrs):
        if attrs.get('v') != TICKET_SCHEMA_VERSION:
            raise serializers.ValidationError(
                {'v': f'Unsupported schema version. Expected {TICKET_SCHEMA_VERSION}.'}
            )
        if attrs.get('type') != TICKET_TYPE:
            raise serializers.ValidationError(
                {'type': f'Invalid payload type. Expected "{TICKET_TYPE}".'}
            )

        code = attrs.get('code') or ''
        if not TICKET_CODE_RE.match(code):
            raise serializers.ValidationError({'code': 'Invalid ticket code format.'})

        sig = attrs.get('sig') or ''
        if not sig:
            raise serializers.ValidationError({'sig': 'Missing signature.'})

        raw = self.initial_data if isinstance(self.initial_data, dict) else {}
        allowed = {'v', 'type', 'code', 'sig'}
        extra = set(raw.keys()) - allowed
        if extra:
            raise serializers.ValidationError(
                {'non_field_errors': [f'Unexpected fields: {sorted(extra)}']}
            )

        return attrs


# ============================================================
# ✅ NEW: ORGANIZATION SERIALIZER
# ============================================================
class OrganizationSerializer(serializers.ModelSerializer):
    owner_username = serializers.SerializerMethodField(read_only=True)
    role = serializers.SerializerMethodField(read_only=True)
    is_owner = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Organization
        fields = [
            'id', 'name', 'slug',
            'owner_username', 'role', 'is_owner',
            'currency_code', 'currency_symbol', 'currency_locale',
            'country', 'country_code', 'default_timezone',
            'org_email', 'org_logo_url', 'email_from_name',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'slug', 'role', 'is_owner', 'is_active',
            'created_at', 'updated_at',
        ]

    def get_owner_username(self, obj):
        owner = getattr(obj, 'owner', None)
        return getattr(owner, 'username', None)

    def get_role(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        if not user or not user.is_authenticated:
            return None

        if user.is_superuser:
            return None

        try:
            membership = _active_user_memberships(user).filter(
                organization=obj,
            ).first()
        except Exception:
            return None

        return membership.role if membership else None

    def get_is_owner(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        if not user or not user.is_authenticated or user.is_superuser:
            return False
        try:
            membership = _active_user_memberships(user).filter(
                organization=obj,
            ).first()
        except Exception:
            return False
        return bool(membership and membership.is_owner)


# ============================================================
# EVENT SERIALIZERS
# ============================================================

class PublicEventSerializer(serializers.ModelSerializer):
    venue = serializers.SerializerMethodField()
    currency_code = serializers.CharField(source='organization.currency_code', read_only=True)
    tier_count = serializers.SerializerMethodField()
    session_count = serializers.SerializerMethodField()
    total_capacity = serializers.SerializerMethodField()
    template_images = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            'id', 'title', 'description', 'short_description',
            'event_type', 'category', 'event_flow',
            'members_only', 'min_membership_tier', 'donations_enabled',
            'start_date', 'end_date', 'timezone', 'currency_code',
            'cover_image', 'gallery_images',
            'status', 'is_public',
            'total_tickets_sold',
            'ticket_format', 'combine_tickets', 'tickets_per_page',
            'venue',
            'tier_count', 'session_count', 'total_capacity',
            'template_images',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_venue(self, obj):
        return _event_venue_payload(obj)

    def get_tier_count(self, obj):
        return obj.tiers.count()

    def get_session_count(self, obj):
        return obj.sessions.count()

    def get_total_capacity(self, obj):
        return _event_total_capacity(obj)

    def get_template_images(self, obj):
        images = {}
        default_url = None
        request = self.context.get('request')

        templates = obj.templates.filter(is_active=True).select_related('template_type')

        for template in templates:
            if not template.image:
                continue

            try:
                url = template.image.url
            except ValueError:
                continue

            if request is not None and url.startswith('/'):
                try:
                    url = request.build_absolute_uri(url)
                except Exception:
                    pass

            images[template.template_type.slug] = url

            if template.is_default and default_url is None:
                default_url = url

            if default_url is not None:
                images['default'] = default_url
            elif images:
                images['default'] = next(iter(images.values()))

        return images


class PublicEventDetailSerializer(PublicEventSerializer):
    sessions = serializers.SerializerMethodField()
    tiers = serializers.SerializerMethodField()

    class Meta(PublicEventSerializer.Meta):
        fields = PublicEventSerializer.Meta.fields + ['sessions', 'tiers']

    def get_sessions(self, obj):
        return [
            {
                'id': str(s.id),
                'start_time': s.start_time,
                'end_time': s.end_time,
                'capacity': s.capacity,
                'booked': s.booked,
                'remaining': max(0, (s.capacity or 0) - (s.booked or 0)),
                'is_active': s.is_active,
            }
            for s in obj.sessions.filter(is_active=True)
        ]

    def get_tiers(self, obj):
        return [
            {
                'id': str(t.id),
                'name': t.name,
                'price': float(t.price),
                'quantity_total': t.quantity_total,
                'quantity_sold': t.quantity_sold,
                'available': t.available_tickets(),
                'ticket_type': t.ticket_type,
                'max_per_order': t.max_per_order,
                'min_per_order': t.min_per_order,
            }
            for t in obj.tiers.all()
        ]


# ============================================================
# Cancellation Policy
# ============================================================
class CancellationPolicySerializer(serializers.ModelSerializer):
    event_count = serializers.SerializerMethodField(read_only=True)
    organizer_username = serializers.CharField(
        source='organizer.username', read_only=True,
    )

    class Meta:
        model = CancellationPolicy
        fields = [
            'id', 'name', 'description', 'rules',
            'is_active', 'is_default',
            'organizer', 'organizer_username',
            'event_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'organizer', 'created_at', 'updated_at']

    def get_event_count(self, obj):
        return obj.events.count()

    def validate_rules(self, value):
        try:
            validate_cancellation_rules(value)
        except Exception as exc:
            raise serializers.ValidationError(str(exc))
        return value

    def validate(self, attrs):
        is_default = attrs.get('is_default')
        organizer = attrs.get('organizer') or self.instance and self.instance.organizer
        if is_default and organizer:
            qs = CancellationPolicy.objects.filter(
                organizer=organizer, is_default=True,
            )
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {'is_default': 'This user already has a default policy.'}
                )
        return attrs


# ============================================================================
# EVENT SERIALIZERS (Admin)
# ============================================================================

class EventSerializer(serializers.ModelSerializer):
    venue = serializers.SerializerMethodField()
    currency_code = serializers.CharField(source='organization.currency_code', read_only=True)
    tier_count = serializers.SerializerMethodField()
    session_count = serializers.SerializerMethodField()
    total_capacity = serializers.SerializerMethodField()

    cancellation_policy = CancellationPolicySerializer(read_only=True)
    cancellation_policy_id = serializers.PrimaryKeyRelatedField(
        source='cancellation_policy',
        queryset=CancellationPolicy.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )

    organizer_id = serializers.PrimaryKeyRelatedField(
        source='organizer',
        queryset=User.objects.all(),
        required=False,
        write_only=True,
    )
    organizer_username = serializers.CharField(
        source='organizer.username', read_only=True,
    )
    organizer_email = serializers.CharField(
        source='organizer.email', read_only=True,
    )

    class Meta:
        model = Event
        fields = [
            'id', 'organizer', 'organizer_id', 'organizer_username', 'organizer_email',
            'title', 'description', 'short_description',
            'event_type', 'category', 'event_flow',
            'members_only', 'min_membership_tier', 'donations_enabled',
            'start_date', 'end_date', 'timezone', 'currency_code',
            'venue', 'metadata', 'venue_metadata',
            'cover_image', 'gallery_images',
            'status', 'is_public', 'is_featured',
            'booking_start_date', 'booking_end_date',
            'min_tickets_per_order', 'max_tickets_per_order',
            'cancellation_policy', 'cancellation_policy_id',
            'cancellation_policy_text', 'refundable_until',
            'total_tickets_sold', 'total_revenue',
            'ticket_format', 'combine_tickets', 'tickets_per_page',
            'created_at', 'updated_at',
            'tier_count', 'session_count', 'total_capacity',
        ]
        read_only_fields = [
            'id', 'organizer', 'created_at', 'updated_at',
            'total_tickets_sold', 'total_revenue',
        ]

    def get_venue(self, obj):
        return _event_venue_payload(obj)

    def get_tier_count(self, obj):
        return obj.tiers.count()

    def get_session_count(self, obj):
        return obj.sessions.count()

    def get_total_capacity(self, obj):
        return _event_total_capacity(obj)

    def validate_organizer_id(self, value):
        if value is None:
            return value

        request = self.context.get('request')
        if request is None or not request.user:
            return value

        requester = request.user

        if not requester.is_superuser:
            if value.id != requester.id:
                raise serializers.ValidationError(
                    'Only platform admins can assign an event to another user.'
                )
            return value

        if not _user_can_own_events(value):
            raise serializers.ValidationError(
                'The selected user must have an active organization membership.'
            )
        return value

    def validate_cancellation_policy(self, value):
        if value is None:
            return value

        request = self.context.get('request')
        if not request or not request.user:
            return value

        user = request.user
        if user.is_superuser:
            return value

        if value.organizer_id != user.id:
            raise serializers.ValidationError(
                'You can only attach your own cancellation policies.'
            )
        return value
    
    def validate(self, attrs):
        # If the event type is 'single', force the end_date to match start_date
        event_type = attrs.get('event_type', self.instance.event_type if self.instance else 'single')
        start_date = attrs.get('start_date', self.instance.start_date if self.instance else None)
        end_date = attrs.get('end_date', self.instance.end_date if self.instance else None)

        if event_type == 'single' and start_date:
            attrs['end_date'] = start_date
        else:
            date_err = validate_event_dates(start_date, end_date)
            if date_err:
                raise serializers.ValidationError({'end_date': date_err})

        return attrs

class EventDetailSerializer(serializers.ModelSerializer):
    sessions = serializers.SerializerMethodField()
    currency_code = serializers.CharField(source='organization.currency_code', read_only=True)
    tiers = serializers.SerializerMethodField()
    venue = serializers.SerializerMethodField()
    tier_count = serializers.SerializerMethodField()
    session_count = serializers.SerializerMethodField()
    total_capacity = serializers.SerializerMethodField()

    cancellation_policy = CancellationPolicySerializer(read_only=True)
    cancellation_policy_id = serializers.PrimaryKeyRelatedField(
        source='cancellation_policy',
        queryset=CancellationPolicy.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )

    organizer_id = serializers.PrimaryKeyRelatedField(
        source='organizer',
        queryset=User.objects.all(),
        required=False,
        write_only=True,
    )
    organizer_username = serializers.CharField(
        source='organizer.username', read_only=True,
    )
    organizer_email = serializers.CharField(
        source='organizer.email', read_only=True,
    )

    class Meta:
        model = Event
        fields = [
            'id', 'organizer', 'organizer_id', 'organizer_username', 'organizer_email',
            'title', 'description', 'short_description',
            'event_type', 'category', 'event_flow',
            'members_only', 'min_membership_tier', 'donations_enabled',
            'start_date', 'end_date', 'timezone', 'currency_code',
            'venue', 'metadata', 'venue_metadata',
            'cover_image', 'gallery_images',
            'status', 'is_public', 'is_featured',
            'booking_start_date', 'booking_end_date',
            'min_tickets_per_order', 'max_tickets_per_order',
            'cancellation_policy', 'cancellation_policy_id',
            'cancellation_policy_text', 'refundable_until',
            'total_tickets_sold', 'total_revenue',
            'ticket_format', 'combine_tickets', 'tickets_per_page',
            'created_at', 'updated_at',
            'sessions', 'tiers', 'tier_count', 'session_count',
            'total_capacity',
        ]
        read_only_fields = [
            'id', 'organizer', 'created_at', 'updated_at',
            'total_tickets_sold', 'total_revenue',
        ]

    def get_sessions(self, obj):
        return [
            {
                'id': str(s.id),
                'start_time': s.start_time,
                'end_time': s.end_time,
                'capacity': s.capacity,
                'booked': s.booked,
                'remaining': max(0, (s.capacity or 0) - (s.booked or 0)),
                'is_active': s.is_active,
            }
            for s in obj.sessions.all()
        ]

    def get_tiers(self, obj):
        return [
            {
                'id': str(t.id),
                'name': t.name,
                'price': float(t.price),
                'quantity_total': t.quantity_total,
                'quantity_sold': t.quantity_sold,
                'available': t.available_tickets(),
                'ticket_type': t.ticket_type,
                'max_per_order': t.max_per_order,
                'min_per_order': t.min_per_order,
            }
            for t in obj.tiers.all()
        ]

    def get_venue(self, obj):
        return _event_venue_payload(obj)

    def get_tier_count(self, obj):
        return obj.tiers.count()

    def get_session_count(self, obj):
        return obj.sessions.count()

    def get_total_capacity(self, obj):
        return _event_total_capacity(obj)

    def validate_event_flow(self, value):
        valid = {c[0] for c in Event.EventFlow.choices}
        if value not in valid:
            raise serializers.ValidationError(
                f'Invalid event_flow. Must be one of {sorted(valid)}.'
            )
        return value

    def validate(self, attrs):
        flow = attrs.get(
            'event_flow',
            self.instance.event_flow if self.instance else Event.EventFlow.TICKETED,
        )

        tiers = attrs.get('tiers', None)
        if flow == Event.EventFlow.FREE_REGISTRATION and tiers:
            for i, tier in enumerate(tiers):
                tier_price = tier.get('price', 0) or 0
                if float(tier_price) > 0:
                    raise serializers.ValidationError({
                        'tiers': (
                            f'Free registration events cannot have priced '
                            f'tiers. Tier #{i + 1} has price {tier_price}.'
                        )
                    })

        # If the event type is 'single', force the end_date to match start_date
        event_type = attrs.get('event_type', self.instance.event_type if self.instance else 'single')
        start_date = attrs.get('start_date', self.instance.start_date if self.instance else None)
        end_date = attrs.get('end_date', self.instance.end_date if self.instance else None)

        if event_type == 'single' and start_date:
            attrs['end_date'] = start_date
        else:
            date_err = validate_event_dates(start_date, end_date)
            if date_err:
                raise serializers.ValidationError({'end_date': date_err})

        return attrs

    def validate_organizer_id(self, value):
        if value is None:
            return value

        request = self.context.get('request')
        if request is None or not request.user:
            return value

        requester = request.user

        if not requester.is_superuser:
            if value.id != requester.id:
                raise serializers.ValidationError(
                    'Only administrators can assign an event to another organizer.'
                )
            return value

        if not _user_can_own_events(value):
            raise serializers.ValidationError(
                'The selected user is not an organizer.'
            )
        return value

    def validate_cancellation_policy(self, value):
        if value is None:
            return value

        request = self.context.get('request')
        if not request or not request.user:
            return value

        user = request.user
        if user.is_superuser:
            return value

        if value.organizer_id != user.id:
            raise serializers.ValidationError(
                'You can only attach your own cancellation policies.'
            )
        return value


# ============================================================
# VENUE SERIALIZER
# ============================================================
class VenueSerializer(serializers.ModelSerializer):
    organization_details = OrganizationSerializer(
        source='organization', read_only=True,
    )
    has_layout = serializers.SerializerMethodField()

    class Meta:
        model = Venue
        fields = '__all__'
        read_only_fields = [
            'id', 'organization', 'created_at', 'updated_at', 'has_layout',
        ]
        extra_kwargs = {
            'organization': {'required': False, 'allow_null': False},
        }

    def get_has_layout(self, obj):
        if not getattr(obj, 'has_reserved_seating', False):
            return False

        master = getattr(obj, 'current_master', None)
        if master is None:
            # Fallback if `current_master` isn't prefetched.
            master = VenueMaster.objects.filter(
                venue_id=obj.id, is_current=True,
            ).first()

        # Trust the snapshot, never the denormalized flag: older master
        # rows may have has_layout=True while the seat list is empty.
        layout = (master.snapshot or {}).get('layout') if master else None
        return bool(layout and layout.get('seats'))
    
# ============================================================
# VENUE MASTER
# ============================================================
class VenueMasterListSerializer(serializers.ModelSerializer):
    venue_id = serializers.UUIDField(source='venue.id', read_only=True)
    seat_count = serializers.SerializerMethodField()
    category_count = serializers.SerializerMethodField()

    class Meta:
        model = VenueMaster
        fields = [
            'id', 'version', 'venue_id',
            'name', 'city', 'country', 'venue_type',
            'has_reserved_seating', 'has_layout',
            'is_current',                      # ✅ required by Create.js
            'created_at', 'seat_count', 'category_count',
        ]
        read_only_fields = fields

    def get_seat_count(self, obj):
        layout = (obj.snapshot or {}).get('layout')
        return len(layout.get('seats', [])) if layout else 0

    def get_category_count(self, obj):
        return len((obj.snapshot or {}).get('category_palette', []))


class VenueMasterDetailSerializer(serializers.ModelSerializer):
    venue_id = serializers.UUIDField(source='venue.id', read_only=True)

    class Meta:
        model = VenueMaster
        fields = [
            'id', 'version', 'venue_id',
            'name', 'city', 'country', 'venue_type',
            'has_reserved_seating', 'has_layout',
            'is_current', 'snapshot',
            'created_at',
        ]
        read_only_fields = fields
        
# ============================================================
# TICKET
# ============================================================
class TicketSerializer(serializers.ModelSerializer):
    tier_name = serializers.CharField(source='tier.name', read_only=True, default=None)
    price = serializers.SerializerMethodField()
    event_title = serializers.CharField(source='event.title', read_only=True, default=None)
    booking_reference = serializers.SerializerMethodField()
    is_checked_in = serializers.SerializerMethodField()

    qr_code = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            'id', 'unique_code', 'attendee_name', 'attendee_email',
            'attendee_phone', 'status', 'check_in_time', 'qr_code',
            'tier_name', 'price', 'event_title', 'booking_reference',
            'is_checked_in', 'created_at',
            'cancelled_at', 'cancelled_reason', 'refund_amount',
            'refund_percent_applied', 'cancellation_fee_applied',
            'net_paid_amount',
        ]
        read_only_fields = [
            'id', 'unique_code', 'created_at',
            'refund_percent_applied', 'cancellation_fee_applied',
            'net_paid_amount',
        ]

    def get_price(self, obj):
        return float(obj.tier.price) if obj.tier else 0

    def get_booking_reference(self, obj):
        return obj.booking.booking_reference if obj.booking else None

    def get_is_checked_in(self, obj):
        return obj.status == 'used'

    def get_qr_code(self, obj):
        if obj.status == 'active':
            return obj.qr_code
        return None


# ============================================================
# BOOKING
# ============================================================
class BookingSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source='event.title', read_only=True, default='N/A')
    event_id = serializers.UUIDField(source='event.id', read_only=True, default=None)
    ticket_count = serializers.SerializerMethodField()
    checked_in_count = serializers.SerializerMethodField()
    tickets = TicketSerializer(many=True, read_only=True)
    formatted_date = serializers.SerializerMethodField()

    event = serializers.UUIDField(write_only=True, required=True)

    class Meta:
        model = Booking
        fields = [
            'id', 'booking_reference', 'customer_name', 'customer_email',
            'customer_phone', 'whatsapp_number', 'total_amount', 'status',
            'payment_id', 'payment_method', 'discount_applied', 'discount_code',
            'donation_amount', 'donation_currency_code',
            'donation_tax_receipt_number', 'donation_tax_receipt_issued_at',
            'donation_tax_eligible',
            'paid_at', 'created_at', 'updated_at', 'notes',
            'event_title', 'event_id', 'event',
            'ticket_count', 'checked_in_count',
            'tickets', 'formatted_date',
            'metadata', 'refund_amount',
        ]
        read_only_fields = [
            'id', 'booking_reference', 'created_at', 'updated_at',
            'discount_applied',
            'donation_currency_code',
            'donation_tax_receipt_number',
            'donation_tax_receipt_issued_at',
            'donation_tax_eligible',
        ]

    def get_ticket_count(self, obj):
        return obj.tickets.count()

    def get_checked_in_count(self, obj):
        return obj.tickets.filter(status='used').count()

    def get_formatted_date(self, obj):
        return obj.created_at.strftime('%d/%m/%Y') if obj.created_at else None

    def validate_customer_email(self, value):
        if value and len(value) > 254:
            raise serializers.ValidationError('Email is too long.')
        return value

    def validate_customer_phone(self, value):
        if value:
            digits = re.sub(r'\D', '', str(value))
            if not (7 <= len(digits) <= 15):
                raise serializers.ValidationError('Invalid phone number.')
        return value

    def validate_tickets(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('tickets must be a list.')
        if len(value) > MAX_TICKETS_PER_BOOKING:
            raise serializers.ValidationError(
                f'Maximum {MAX_TICKETS_PER_BOOKING} tickets per booking.'
            )
        return value

    def _resolve_tickets_payload(self, data):
        tickets = data.get('tickets')
        if isinstance(tickets, list) and tickets:
            return tickets

        md = data.get('metadata')
        if isinstance(md, dict):
            for key in ('ticket_types', 'tickets'):
                candidate = md.get(key)
                if isinstance(candidate, list) and candidate:
                    return candidate

        raw = self.initial_data if isinstance(self.initial_data, dict) else {}
        raw_tickets = raw.get('tickets')
        if isinstance(raw_tickets, list) and raw_tickets:
            return raw_tickets

        raw_md = raw.get('metadata')
        if isinstance(raw_md, dict):
            for key in ('ticket_types', 'tickets'):
                candidate = raw_md.get(key)
                if isinstance(candidate, list) and candidate:
                    return candidate

        return []

    def validate(self, data):
        event_uuid = data.get('event')
        if event_uuid:
            try:
                event = Event.objects.get(id=event_uuid)
            except Event.DoesNotExist:
                raise serializers.ValidationError({'event': 'Event not found.'})

            if event.status not in ('active', 'published'):
                raise serializers.ValidationError(
                    {'event': 'This event is not available for booking.'}
                )
            if event.end_date and event.end_date < timezone.now():
                raise serializers.ValidationError(
                    {'event': 'This event has already ended.'}
                )
            self._event_obj = event

        if getattr(self, '_event_obj', None) and \
                self._event_obj.event_flow == Event.EventFlow.FREE_REGISTRATION:
            return self._validate_free_registration(data)

        tickets_payload = self._resolve_tickets_payload(data)

        # ============================================================
        # B4: BookingSerializer.validate — same treatment
        #
        # The serializer no longer accepts total_amount from the client
        # for reserved-seating events. compute_booking_subtotal requires
        # every item to be priced correctly and sums them itself. The
        # previous inline block (and the fallback to client-supplied
        # total_amount) was the smuggling vector.
        # ============================================================
        if tickets_payload and getattr(self, '_event_obj', None):
            try:
                computed_total = compute_booking_subtotal(
                    self._event_obj, tickets_payload
                )
            except PricingError as exc:
                raise serializers.ValidationError({'tickets': str(exc)})
            donation = Decimal(str(data.get('donation_amount') or 0))
            if donation > 0 and not self._event_obj.donations_enabled:
                raise serializers.ValidationError(
                    {'donation_amount': 'Donations are not enabled for this event.'}
                )
            data['total_amount'] = (computed_total + donation).quantize(
                Decimal('0.01')
            )

        session_id = (
            data.get('session')
            or self.initial_data.get('session')
            or data.get('session_id')
            or self.initial_data.get('session_id')
            or (data.get('metadata') or {}).get('slot_id')
            or (self.initial_data.get('metadata') or {}).get('slot_id')
        )

        requested_count = len(tickets_payload)

        if session_id and requested_count > 0:
            from ..models import Session as _Session

            try:
                session = _Session.objects.get(id=session_id)
            except _Session.DoesNotExist:
                raise serializers.ValidationError(
                    {'session': 'The selected slot was not found.'}
                )

            if (
                hasattr(self, '_event_obj')
                and session.event_id != self._event_obj.id
            ):
                raise serializers.ValidationError(
                    {'session': 'The selected slot does not belong to this event.'}
                )

            ok, reason = session.check_capacity(requested_count)
            if not ok:
                raise serializers.ValidationError({'session': reason})

        raw_code = (
            data.get('discount_code')
            or self.initial_data.get('discount_code')
            or ''
        )
        discount_code = str(raw_code).strip().upper()
        discount_amount = Decimal('0.00')

        if discount_code:
            from ..services.discount_service import (
                validate_discount as _validate_discount,
                DiscountError,
            )

            try:
                discount_obj = Discount.objects.get(
                    code__iexact=discount_code, is_active=True,
                )
            except Discount.DoesNotExist:
                raise serializers.ValidationError(
                    {'discount_code': 'Invalid or inactive discount code.'}
                )

            request = self.context.get('request')
            requester = getattr(request, 'user', None)

            # Discounts apply to the TICKET subtotal only — never to the
            # optional donation.
            order_subtotal = (
                Decimal(str(data.get('total_amount') or 0))
                - Decimal(str(data.get('donation_amount') or 0))
            ).quantize(Decimal('0.01'))
            if order_subtotal < 0:
                order_subtotal = Decimal('0.00')

            try:
                _validate_discount(
                    discount=discount_obj,
                    user=requester if requester and requester.is_authenticated else None,
                    event=self._event_obj,
                    ticket_count=requested_count,
                    order_subtotal=order_subtotal,
                )
            except DiscountError as exc:
                raise serializers.ValidationError({'discount_code': str(exc)})

            if discount_obj.type == 'percentage':
                discount_amount = (
                    order_subtotal * Decimal(str(discount_obj.value)) / Decimal('100')
                ).quantize(Decimal('0.01'))
                if (
                    discount_obj.max_discount
                    and discount_amount > Decimal(str(discount_obj.max_discount))
                ):
                    discount_amount = Decimal(str(discount_obj.max_discount))
            else:
                discount_amount = Decimal(str(discount_obj.value))
                if discount_amount > order_subtotal:
                    discount_amount = order_subtotal

            data['discount_code'] = discount_obj.code
            data['discount_applied'] = discount_amount
            self._discount_obj = discount_obj
        else:
            data.pop('discount_applied', None)
            data['discount_applied'] = Decimal('0.00')
            data['discount_code'] = ''

        return data

    def _validate_free_registration(self, data):
        required = ['customer_name', 'customer_email', 'customer_phone']
        for f in required:
            if not (data.get(f) or self.initial_data.get(f)):
                raise serializers.ValidationError(
                    {f: f'{f} is required for free registration.'}
                )

        md = data.get('metadata')
        if md is None:
            md = (self.initial_data.get('metadata')
                  if isinstance(self.initial_data, dict) else None)
        md = md or {}

        raw_entries = md.get('entries')
        attendees = md.get('attendees') or []

        if not isinstance(attendees, list):
            raise serializers.ValidationError({
                'metadata': {'attendees': 'Must be a list.'}
            })

        try:
            entries = int(raw_entries) if raw_entries is not None else len(attendees) or 1
        except (TypeError, ValueError):
            raise serializers.ValidationError({
                'metadata': {'entries': 'Must be a positive integer.'}
            })

        if entries < 1:
            raise serializers.ValidationError({
                'metadata': {'entries': 'At least one entry is required.'}
            })

        max_per_order = self._event_obj.max_tickets_per_order or 10
        if entries > max_per_order:
            raise serializers.ValidationError({
                'metadata': {
                    'entries': f'Maximum {max_per_order} entries per registration.'
                }
            })

        if attendees:
            if len(attendees) != entries:
                raise serializers.ValidationError({
                    'metadata': {'attendees': (
                        f'Expected {entries} attendee(s), got {len(attendees)}.'
                    )}
                })
            for i, att in enumerate(attendees):
                if not isinstance(att, dict):
                    raise serializers.ValidationError({
                        'metadata': {'attendees': f'Entry {i + 1} must be an object.'}
                    })
                if not (att.get('name') or '').strip():
                    raise serializers.ValidationError({
                        'metadata': {'attendees': f'Entry {i + 1} is missing a name.'}
                    })
                att_email = (att.get('email') or '').strip()
                if att_email and not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', att_email):
                    raise serializers.ValidationError({
                        'metadata': {
                            'attendees': f'Entry {i + 1} has an invalid email address.'
                        }
                    })

        data['total_amount'] = Decimal('0.00')
        data['discount_applied'] = Decimal('0.00')
        data['discount_code'] = ''
        data.pop('tickets', None)

        normalised_md = dict(md) if isinstance(md, dict) else {}
        normalised_md['entries'] = entries
        if attendees:
            normalised_md['attendees'] = [
                {
                    'name': (att.get('name') or '').strip(),
                    'email': (att.get('email') or '').strip(),
                    'phone': (att.get('phone') or '').strip(),
                }
                for att in attendees
            ]
        data['metadata'] = normalised_md

        return data

    def create(self, validated_data):
        event = getattr(self, '_event_obj', None)
        if event is None:
            raise serializers.ValidationError({'event': 'Event was not validated.'})
        validated_data['event'] = event

        # `tickets` is read-only, so it is stripped from validated_data.
        # We must explicitly extract it from the raw request payload.
        tickets_data = validated_data.pop('tickets', [])
        if not tickets_data:
            raw_data = self.initial_data if isinstance(self.initial_data, dict) else {}
            tickets_data = self._resolve_tickets_payload(raw_data)

        logger.info(f"📊 Tickets received in serializer: {len(tickets_data)}")

        # ✅ NEW: Validate that reserved seats have categories with prices
        has_reserved_seating = any(t.get('seat_id') for t in tickets_data if isinstance(t, dict))
        if has_reserved_seating:
            from ..models_seating import Seat
            for t in tickets_data:
                if isinstance(t, dict) and t.get('seat_id'):
                    try:
                        seat = Seat.objects.select_related('category').get(id=t['seat_id'])
                        if not seat.category:
                            raise serializers.ValidationError({
                                'tickets': f'Seat {seat.seat_number} (Row {seat.row_label}) does not have a category assigned. Please configure seat categories before booking.'
                            })
                        if resolve_seat_price(event, t['seat_id']) <= 0:
                            raise serializers.ValidationError({
                                'tickets': f'Seat {seat.seat_number} (Row {seat.row_label}) has a category with zero price. Please set a valid price for the category.'
                            })
                    except Seat.DoesNotExist:
                        raise serializers.ValidationError({
                            'tickets': f'Seat ID {t["seat_id"]} not found.'
                        })

        discount_code = validated_data.pop('discount_code', '')
        discount_applied = validated_data.pop('discount_applied', Decimal('0.00'))

        if 'user' not in validated_data:
            customer_email = validated_data.get('customer_email')
            customer_name = validated_data.get('customer_name', 'WhatsApp User')
            customer_phone = validated_data.get('customer_phone', '')

            validated_data['user'] = _resolve_or_create_user_for_booking(
                customer_email=customer_email,
                customer_name=customer_name,
                customer_phone=customer_phone,
            )

        # Snapshot the donation currency from the event's organization.
        donation = validated_data.get('donation_amount') or Decimal('0.00')
        if donation and donation > 0:
            validated_data['donation_currency_code'] = (
                event.organization.currency_code or ''
            )

        # Fallback if total_amount wasn't set by validate (e.g. empty ticket list).
        if not validated_data.get('total_amount'):
            total = Decimal('0.00')
            for t in tickets_data:
                seat_id = t.get('seat_id')
                tier_id = t.get('tier_id')
                qty = int(t.get('qty', 1))

                if seat_id:
                    # Reserved seating: get price from Seat's category
                    try:
                        price = resolve_seat_price(event, seat_id)
                        total += Decimal(str(price)) * qty
                    except Exception:
                        pass
                elif tier_id:
                    try:
                        total += Decimal(str(TicketTier.objects.get(id=tier_id).price)) * qty
                    except TicketTier.DoesNotExist:
                        pass
            validated_data['total_amount'] = total

        validated_data['discount_code'] = discount_code
        validated_data['discount_applied'] = discount_applied

        metadata = validated_data.get('metadata')
        if not isinstance(metadata, dict):
            metadata = {}
        if 'booking_source' not in metadata or not metadata.get('booking_source'):
            request = self.context.get('request')
            if request is not None and getattr(request, 'user', None):
                if request.user.is_staff or request.user.is_superuser:
                    metadata['booking_source'] = 'admin_portal'
                else:
                    metadata['booking_source'] = 'user_portal'
            else:
                metadata['booking_source'] = 'whatsapp'
        validated_data['metadata'] = metadata

        booking = super().create(validated_data)

        if discount_code and discount_applied and discount_applied > 0:
            try:
                discount_obj = getattr(self, '_discount_obj', None) or Discount.objects.get(
                    code__iexact=discount_code
                )
                DiscountUsage.objects.create(
                    discount=discount_obj,
                    booking=booking,
                    user=booking.user,
                    amount_applied=discount_applied,
                )
                from django.db.models import F
                Discount.objects.filter(pk=discount_obj.pk).update(
                    used_count=F('used_count') + 1
                )
                logger.info(
                    "Recorded discount usage %s on booking %s (₹%s)",
                    discount_code, booking.booking_reference, discount_applied,
                )
            except Exception as exc:
                logger.warning(
                    "Failed to record DiscountUsage for %s: %s",
                    booking.booking_reference, exc,
                )

        try:
            from ..services.cancellation_policy import snapshot_policy

            if event.cancellation_policy:
                booking.cancellation_policy_snapshot = snapshot_policy(
                    event.cancellation_policy
                )
            else:
                booking.cancellation_policy_snapshot = {}
            booking.save(update_fields=['cancellation_policy_snapshot'])

            logger.info(
                "Booking %s snapshotted policy %r",
                booking.booking_reference,
                booking.cancellation_policy_snapshot.get('policy_name', '<none>'),
            )
        except Exception as exc:
            logger.warning(
                "Failed to snapshot cancellation policy for booking %s: %s",
                booking.booking_reference, exc,
            )
            booking.cancellation_policy_snapshot = {}
            booking.save(update_fields=['cancellation_policy_snapshot'])

        if not booking.metadata:
            booking.metadata = {}

        if not tickets_data and isinstance(booking.metadata, dict):
            md = booking.metadata
            if isinstance(md.get('ticket_types'), list):
                tickets_data = md['ticket_types']
            elif isinstance(md.get('tickets'), list):
                tickets_data = md['tickets']
            elif isinstance(md.get('tier_ids'), list):
                tier_ids = md['tier_ids']
                tier_quantities = md.get('tier_quantities', {})
                for tier_id in tier_ids:
                    quantity = tier_quantities.get(str(tier_id), 0)
                    try:
                        quantity = int(quantity)
                    except (ValueError, TypeError):
                        quantity = 0
                    for i in range(quantity):
                        attendee_name = booking.customer_name
                        attendee_names = md.get('attendee_names', {})
                        if str(tier_id) in attendee_names:
                            names = attendee_names[str(tier_id)]
                            if i < len(names):
                                attendee_name = names[i]
                        tickets_data.append({
                            'tier_id': tier_id,
                            'attendee_name': attendee_name,
                        })

        # Persist the raw tickets data (with seat_ids) into metadata
        booking.metadata['tickets'] = tickets_data
        booking.metadata['total_tickets'] = len(tickets_data)
        booking.metadata['ticket_created'] = False

        if tickets_data:
            tier_ids = list({
                str(t.get('tier_id')) for t in tickets_data if t.get('tier_id')
            })
            booking.metadata['tier_ids'] = tier_ids

            seat_ids = [str(t.get('seat_id')) for t in tickets_data if t.get('seat_id')]
            if seat_ids:
                booking.metadata['seat_ids'] = seat_ids
                booking.metadata['reserved_seating'] = True

            booking.metadata['ticket_types'] = [
                {
                    'tier_id': str(t.get('tier_id')) if t.get('tier_id') else None,
                    'seat_id': str(t.get('seat_id')) if t.get('seat_id') else None,
                    'qty': int(t.get('qty', 1) or 1),
                    'attendee_name': t.get('attendee_name', booking.customer_name),
                    'attendee_email': t.get('attendee_email', booking.customer_email),
                    'attendee_phone': t.get('attendee_phone', booking.customer_phone),
                    'tier_name': t.get('tier_name', 'Unknown'),
                    'price': t.get('price'),
                }
                for t in tickets_data
            ]

            tier_quantities = {}
            attendee_names_by_tier = {}
            for t in tickets_data:
                key = str(t.get('tier_id') or t.get('seat_id') or 'general')
                tier_quantities[key] = tier_quantities.get(key, 0) + 1
                attendee_names_by_tier.setdefault(key, []).append(
                    t.get('attendee_name', booking.customer_name)
                )

            booking.metadata['tier_quantities'] = tier_quantities
            booking.metadata['attendee_names'] = attendee_names_by_tier

        booking.save(update_fields=['metadata'])

        logger.info(
            f"✅ Booking {booking.booking_reference} created with "
            f"{len(tickets_data)} tickets in metadata"
        )
        return booking


class BookingDetailSerializer(serializers.ModelSerializer):
    tickets = TicketSerializer(many=True, read_only=True)
    event = serializers.SerializerMethodField()
    ticket_count = serializers.SerializerMethodField()
    checked_in_count = serializers.SerializerMethodField()
    formatted_date = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'booking_reference', 'customer_name', 'customer_email',
            'customer_phone', 'whatsapp_number', 'total_amount', 'status',
            'payment_id', 'payment_method', 'discount_applied', 'discount_code',
            'donation_amount', 'donation_currency_code',
            'donation_tax_receipt_number', 'donation_tax_receipt_issued_at',
            'donation_tax_eligible',
            'paid_at', 'created_at', 'updated_at', 'notes',
            'event', 'tickets', 'ticket_count', 'checked_in_count',
            'formatted_date', 'metadata',
        ]
        read_only_fields = ['id', 'booking_reference', 'created_at', 'updated_at']

    def get_event(self, obj):
        if obj.event:
            return {
                'id': str(obj.event.id),
                'title': obj.event.title,
                'description': obj.event.description,
                'start_date': obj.event.start_date,
                'end_date': obj.event.end_date,
                'venue': {
                    'id': str(obj.event.venue.id) if obj.event.venue else None,
                    'name': obj.event.venue.name if obj.event.venue else None,
                } if obj.event.venue else None,
            }
        return None

    def get_ticket_count(self, obj):
        return obj.tickets.count()

    def get_checked_in_count(self, obj):
        return obj.tickets.filter(status='used').count()

    def get_formatted_date(self, obj):
        return obj.created_at.strftime('%d/%m/%Y') if obj.created_at else None


# ============================================================
# CHECK-IN
# ============================================================
class CheckInLogSerializer(serializers.ModelSerializer):
    ticket_code = serializers.CharField(source='ticket.unique_code', read_only=True)
    attendee_name = serializers.CharField(source='ticket.attendee_name', read_only=True)
    event_title = serializers.CharField(source='event.title', read_only=True)
    scanner_email = serializers.CharField(source='scanner_user.email', read_only=True, default=None)
    scanner_name = serializers.SerializerMethodField()

    class Meta:
        model = CheckInLog
        fields = [
            'id', 'ticket', 'ticket_code', 'attendee_name', 'event', 'event_title',
            'session', 'scanner_user', 'scanner_email', 'scanner_name',
            'scanner_device_id', 'scanner_ip', 'scanned_at', 'status',
            'latitude', 'longitude', 'notes', 'is_offline', 'synced_at', 'created_at',
        ]
        read_only_fields = ['id', 'scanned_at', 'created_at', 'synced_at']

    def get_scanner_name(self, obj):
        if obj.scanner_user:
            return (
                f"{obj.scanner_user.first_name} {obj.scanner_user.last_name}".strip()
                or obj.scanner_user.username
            )
        return None


# ============================================================
# DISCOUNT
# ============================================================
class DiscountSerializer(serializers.ModelSerializer):
    organizer = serializers.PrimaryKeyRelatedField(read_only=True)
    organizer_username = serializers.CharField(
        source='organizer.username', read_only=True,
    )

    class Meta:
        model = Discount
        fields = [
            'id', 'code', 'name', 'type', 'value',
            'min_order_amount', 'max_discount',
            'max_uses', 'used_count',
            'valid_from', 'valid_to', 'is_active',
            'applicable_events',
            'max_uses_per_user', 'min_ticket_count',
            'first_time_buyers_only', 'stackable',
            'organizer', 'organizer_username',
            'created_at',
        ]
        read_only_fields = [
            'id', 'used_count', 'organizer', 'created_at',
        ]


# ============================================================
# USER
# ============================================================
class UserProfileSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            'phone', 'whatsapp_number',
            'address', 'city', 'state', 'country', 'postal_code',
            'is_organizer',
        ]


class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for the User model in the user-management views.

    `role` is a DERIVED label, not a stored field. The canonical
    per-org roles live in `memberships[]`.
    """
    role = serializers.SerializerMethodField()
    effective_role = serializers.SerializerMethodField()
    memberships = serializers.SerializerMethodField()
    organization_memberships = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'effective_role', 'memberships',
            'is_active', 'is_staff', 'is_superuser',
            'organization_memberships',
            'date_joined', 'last_login',
        ]
        read_only_fields = [
            'id',
            'username',
            'date_joined',
            'last_login',
            'is_staff',
            'is_superuser',
            'profile',
        ]

    def get_role(self, obj):
        return effective_role_label(obj)

    def get_effective_role(self, obj):
        return effective_role_label(obj)

    def get_memberships(self, obj):
        return user_memberships_payload(obj)

    def get_organization_memberships(self, obj):
        return user_memberships_payload(obj)


class UserProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        source='user',
        queryset=User.objects.all(),
        write_only=True,
    )

    class Meta:
        model = UserProfile
        fields = [
            'id', 'user', 'user_id', 'email', 'phone', 'whatsapp_number',
            'address', 'city', 'state', 'country', 'postal_code',
            'is_organizer', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, min_length=10,
        style={'input_type': 'password'},
    )
    password_confirm = serializers.CharField(
        write_only=True, required=False, allow_blank=True,
        style={'input_type': 'password'},
    )

    phone = serializers.CharField(required=True, allow_blank=False)

    whatsapp_number = serializers.CharField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True)
    state = serializers.CharField(required=False, allow_blank=True)
    country = serializers.CharField(required=False, default='India')
    postal_code = serializers.CharField(required=False, allow_blank=True)
    is_organizer = serializers.BooleanField(required=False, default=False)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'password', 'password_confirm',
            'first_name', 'last_name',
            'phone', 'whatsapp_number', 'address', 'city', 'state',
            'country', 'postal_code', 'is_organizer',
        ]
        extra_kwargs = {
            'username': {'required': False},
            'email': {'required': True},
        }

    _PHONE_ALLOWED = re.compile(r'^\+?[0-9]{7,15}$')

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('Username already exists')
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Email already exists')
        return value

    def validate_phone(self, value):
        raw = (value or '').strip()
        digits = re.sub(r'[\s\-\(\)\.]', '', raw)
        if not self._PHONE_ALLOWED.match(digits):
            raise serializers.ValidationError(
                'Enter a valid mobile number (7–15 digits, '
                'optionally starting with "+").'
            )
        return digits

    def validate_whatsapp_number(self, value):
        if value is None or value == '':
            return ''
        raw = str(value).strip()
        digits = re.sub(r'[\s\-\(\)\.]', '', raw)
        if not self._PHONE_ALLOWED.match(digits):
            raise serializers.ValidationError(
                'Enter a valid WhatsApp number (7–15 digits, '
                'optionally starting with "+").'
            )
        return digits

    def validate(self, data):
        password = data.get('password')
        password_confirm = data.get('password_confirm')

        if password and password_confirm:
            if password != password_confirm:
                raise serializers.ValidationError(
                    {'password_confirm': 'Passwords do not match'}
                )
            from django.contrib.auth.password_validation import validate_password
            from django.core.exceptions import ValidationError as DjangoValidationError
            try:
                validate_password(password)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({'password': list(exc.messages)})
        elif password and not password_confirm:
            raise serializers.ValidationError({'password_confirm': 'Please confirm your password.'})
        elif not password and password_confirm:
            raise serializers.ValidationError({'password': 'Please enter a password.'})

        if not data.get('whatsapp_number'):
            data['whatsapp_number'] = data.get('phone', '')

        return data

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        validated_data.pop('password_confirm', None)
        validated_data.pop('is_organizer', None)

        if not password:
            final_password = secrets.token_urlsafe(32)
        else:
            final_password = password

        profile_fields = {
            'phone': validated_data.pop('phone', ''),
            'whatsapp_number': validated_data.pop('whatsapp_number', ''),
            'address': validated_data.pop('address', ''),
            'city': validated_data.pop('city', ''),
            'state': validated_data.pop('state', ''),
            'country': validated_data.pop('country', 'India'),
            'postal_code': validated_data.pop('postal_code', ''),
            'is_organizer': False,
        }

        username = validated_data.get('username')
        if not username:
            base = re.sub(
                r'[^a-zA-Z0-9_]', '_',
                (validated_data.get('email') or 'user').split('@')[0]
            )[:140] or 'user'
            username, n = base, 1
            while User.objects.filter(username=username).exists():
                username = f"{base}_{n}"[:150]
                n += 1

        user = User.objects.create_user(
            username=username,
            email=validated_data.get('email'),
            password=final_password,
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
        )
        user.is_active = True
        user.save(update_fields=['is_active'])

        UserProfile.objects.create(user=user, email=user.email, **profile_fields)
        return user


# ============================================================
# BOOKING LIST / ADMIN
# ============================================================
class BookingListSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source='event.title', read_only=True)
    event_id = serializers.UUIDField(source='event.id', read_only=True, default=None)
    customer_name = serializers.CharField()
    customer_email = serializers.CharField()
    customer_phone = serializers.CharField()
    total_amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    discount_applied = serializers.DecimalField(max_digits=10, decimal_places=2)
    discount_code = serializers.CharField()
    net_amount = serializers.SerializerMethodField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField()
    ticket_count = serializers.SerializerMethodField()
    formatted_date = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'booking_reference', 'event_title', 'event_id',
            'customer_name', 'customer_email', 'customer_phone',
            'total_amount', 'discount_applied', 'discount_code', 'net_amount',
            'status', 'created_at', 'formatted_date',
            'ticket_count',
        ]

    def get_ticket_count(self, obj):
        return obj.tickets.count()

    def get_formatted_date(self, obj):
        return obj.created_at.strftime('%d/%m/%Y') if obj.created_at else None

    def get_net_amount(self, obj):
        return float((obj.total_amount or 0) - (obj.discount_applied or 0))


class BookingAdminSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(
        source='event.title',
        read_only=True,
        default='N/A',
    )
    event_id = serializers.UUIDField(
        source='event.id',
        read_only=True,
        default=None,
    )

    tickets = TicketSerializer(many=True, read_only=True)
    event_details = serializers.SerializerMethodField()
    user_details = serializers.SerializerMethodField()
    ticket_count = serializers.SerializerMethodField()
    checked_in_count = serializers.SerializerMethodField()
    net_amount = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'booking_reference', 'user', 'user_details',
            'event', 'event_id', 'event_title', 'event_details', 'session',
            'customer_name', 'customer_email', 'customer_phone',
            'whatsapp_number', 'total_amount', 'status',
            'payment_id', 'payment_method', 'notes',
            'discount_applied', 'discount_code', 'net_amount',
            'donation_amount', 'donation_currency_code',
            'donation_tax_receipt_number', 'donation_tax_receipt_issued_at',
            'donation_tax_eligible',
            'paid_at', 'created_at', 'updated_at',
            'tickets', 'ticket_count', 'checked_in_count',
            'metadata', 'refund_amount',
        ]
        read_only_fields = [
            'id', 'booking_reference', 'created_at', 'updated_at',
            'event_title', 'event_id',
        ]

    def get_event_details(self, obj):
        if not obj.event:
            return None
        return {
            'id': str(obj.event.id),
            'title': obj.event.title,
            'start_date': obj.event.start_date,
            'end_date': obj.event.end_date,
            'status': obj.event.status,
        }

    def get_user_details(self, obj):
        if not obj.user:
            return None
        return {
            'id': obj.user.id,
            'username': obj.user.username,
            'email': obj.user.email,
            'full_name': f"{obj.user.first_name} {obj.user.last_name}".strip(),
        }

    def get_ticket_count(self, obj):
        return obj.tickets.count()

    def get_checked_in_count(self, obj):
        return obj.tickets.filter(status='used').count()

    def get_net_amount(self, obj):
        return float((obj.total_amount or 0) - (obj.discount_applied or 0))


class BulkActionResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    action = serializers.CharField()
    summary = serializers.DictField()
    results = serializers.ListField()
    errors = serializers.ListField(required=False, allow_null=True)


# ============================================================
# TEMPLATES
# ============================================================
class EventTemplateTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventTemplateType
        fields = [
            'id', 'name', 'slug', 'description',
            'icon', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class EventTemplateSerializer(serializers.ModelSerializer):
    template_type_details = EventTemplateTypeSerializer(
        source='template_type', read_only=True,
    )
    image_url = serializers.SerializerMethodField()

    MAX_CONFIG_BYTES = 64 * 1024

    class Meta:
        model = EventTemplate
        fields = [
            'id', 'event', 'template_type', 'template_type_details',
            'name', 'description', 'image', 'image_url',
            'config', 'is_default', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_config(self, value):
        if value is None:
            return {}

        if not isinstance(value, dict):
            raise serializers.ValidationError('config must be a JSON object.')

        try:
            encoded = json.dumps(value, separators=(',', ':'))
        except (TypeError, ValueError) as exc:
            raise serializers.ValidationError(
                f'config is not JSON-serialisable: {exc}'
            )

        if len(encoded) > self.MAX_CONFIG_BYTES:
            raise serializers.ValidationError(
                f'config is too large ({len(encoded)} bytes); '
                f'maximum is {self.MAX_CONFIG_BYTES} bytes.'
            )

        fields = value.get('fields')
        if fields is not None and not isinstance(fields, dict):
            raise serializers.ValidationError('config.fields must be an object.')

        return value

    def get_image_url(self, obj):
        if not obj.image:
            return None
        try:
            url = obj.image.url
        except ValueError:
            return None
        request = self.context.get('request')
        if request is not None and url.startswith('/'):
            try:
                return request.build_absolute_uri(url)
            except Exception:
                return url
        return url


class MembershipTierSerializer(serializers.ModelSerializer):
    organization_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = MembershipTier
        fields = [
            'id', 'organization', 'organization_details',
            'slug', 'name', 'description',
            'price', 'currency_code', 'billing_period', 'duration_days',
            'max_members', 'benefits',
            'is_active', 'is_public',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'slug', 'organization', 'currency_code',
            'duration_days', 'created_at', 'updated_at',
        ]
        extra_kwargs = {
            'organization': {'required': False},
        }

    def get_organization_details(self, obj):
        return {
            'id': str(obj.organization.id),
            'name': obj.organization.name,
            'currency_code': obj.organization.currency_code,
        }


class MembershipDependentSerializer(serializers.ModelSerializer):
    class Meta:
        model = MembershipDependent
        fields = [
            'id', 'membership', 'full_name', 'email', 'phone',
            'date_of_birth', 'relationship', 'member_code',
            'promoted_user', 'is_active', 'created_at',
        ]
        read_only_fields = [
            'id', 'membership', 'member_code', 'promoted_user', 'created_at',
        ]


class MembershipSerializer(serializers.ModelSerializer):
    tier = MembershipTierSerializer(read_only=True)
    dependents = MembershipDependentSerializer(many=True, read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    user_name = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()
    seats_used = serializers.SerializerMethodField()
    seats_max = serializers.SerializerMethodField()
    reviewed_by_username = serializers.CharField(
        source='reviewed_by.username', read_only=True, default=None,
    )

    class Meta:
        model = Membership
        fields = [
            'id', 'organization', 'user', 'user_email', 'user_name',
            'tier', 'price_paid', 'currency_code',
            'status', 'payment_method', 'offline_reference',
            'started_at', 'valid_until',
            'cancelled_at', 'cancelled_reason',
            'reviewed_by', 'reviewed_by_username', 'reviewed_at',
            'dependents',
            'is_active', 'seats_used', 'seats_max',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_user_name(self, obj):
        if not obj.user_id:
            return None
        return obj.user.get_full_name() or obj.user.username

    def get_is_active(self, obj):
        return obj.is_active()

    def get_seats_used(self, obj):
        return obj.seats_used()

    def get_seats_max(self, obj):
        return obj.tier.max_members


class MembershipPaymentSerializer(serializers.ModelSerializer):
    tier = MembershipTierSerializer(read_only=True)

    class Meta:
        model = MembershipPayment
        fields = [
            'id', 'organization', 'user', 'tier', 'membership',
            'gateway', 'provider_order_id', 'provider_payment_id',
            'amount', 'currency', 'status', 'checkout',
            'paid_at', 'created_at', 'updated_at',
        ]
        read_only_fields = fields