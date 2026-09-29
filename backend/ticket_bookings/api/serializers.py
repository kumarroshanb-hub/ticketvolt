# backend/ticket_bookings/api/serializers.py
from rest_framework import serializers
from django.contrib.auth.models import User
from django.conf import settings
from django.utils import timezone
from decimal import Decimal
import os
import re
import logging

from ..models import (
    Event, Venue, Session, TicketTier, Booking, Ticket,
    CheckInLog, Discount, DiscountUsage, EventTemplateType, EventTemplate,
    UserProfile, CancellationPolicy,
)
from ..services.cancellation_policy import validate_cancellation_rules


logger = logging.getLogger(__name__)

# Hard cap — a single booking may not contain more than this many tickets.
MAX_TICKETS_PER_BOOKING = 50

# ---------------------------------------------------------------------------
# Canonical ticket QR payload schema. Must match the mobile extractor and
# the server-side helper in views.py.
# ---------------------------------------------------------------------------
TICKET_SCHEMA_VERSION = 1
TICKET_TYPE = 'ticket'
TICKET_CODE_RE = re.compile(r'^TIX[A-Z0-9]{8,32}$')
MAX_QR_PAYLOAD_LENGTH = 2048


# ============================================================
# WhatsApp service-account helper
# ============================================================
def get_or_create_whatsapp_bot_user():
    service_password = os.environ.get('WHATSAPP_BOT_PASSWORD')

    if not service_password:
        logger.critical(
            "❌ WHATSAPP_BOT_PASSWORD environment variable is not set! "
            "Cannot create or use the whatsapp_bot service account securely."
        )
        raise ValueError(
            "WHATSAPP_BOT_PASSWORD environment variable is required "
            "to create the whatsapp_bot service account."
        )

    if len(service_password) < 16:
        raise ValueError(
            "WHATSAPP_BOT_PASSWORD must be at least 16 characters."
        )

    whatsapp_user, created = User.objects.get_or_create(
        username='whatsapp_bot',
        defaults={
            'email': 'whatsapp@ticketvolt.com',
            'is_active': True,
            'is_staff': False,
            'is_superuser': False,
        },
    )

    if created:
        whatsapp_user.set_password(service_password)
        whatsapp_user.save()
        logger.info("✅ Created whatsapp_bot service account.")
    else:
        if not whatsapp_user.check_password(service_password):
            logger.warning(
                "⚠️ whatsapp_bot exists but stored password does not match "
                "WHATSAPP_BOT_PASSWORD. Rotate via admin."
            )

    return whatsapp_user


# ============================================================
# TICKET QR PAYLOAD (strict)
# ============================================================
class TicketPayloadSerializer(serializers.Serializer):
    """
    Strict, fail-closed schema for the signed QR payload.

    Accepted shape (exactly these four keys, nothing else):
        {
          "v": 1,
          "type": "ticket",
          "code": "TIX<8-32 uppercase alnum>",
          "sig": "<hex HMAC-SHA256 over canonical {v,type,code}>"
        }
    """
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
            raise serializers.ValidationError(
                {'code': 'Invalid ticket code format.'}
            )

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
# EVENT SERIALIZERS
# ============================================================

class PublicEventSerializer(serializers.ModelSerializer):
    venue = serializers.SerializerMethodField()
    tier_count = serializers.SerializerMethodField()
    session_count = serializers.SerializerMethodField()
    total_capacity = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            'id', 'title', 'description', 'short_description',
            'event_type', 'category',
            'start_date', 'end_date', 'timezone',
            'cover_image', 'gallery_images',
            'status', 'is_public',
            'total_tickets_sold',
            'ticket_format', 'combine_tickets', 'tickets_per_page',
            'venue',
            'tier_count', 'session_count', 'total_capacity',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_venue(self, obj):
        if not obj.venue:
            return None
        return {
            'id': str(obj.venue.id),
            'name': obj.venue.name,
            'city': obj.venue.city,
            'state': obj.venue.state,
            'country': obj.venue.country,
            'address_line1': obj.venue.address_line1,
        }

    def get_tier_count(self, obj):
        return obj.tiers.count()

    def get_session_count(self, obj):
        return obj.sessions.count()

    def get_total_capacity(self, obj):
        from django.db.models import Sum
        result = obj.tiers.aggregate(total=Sum('quantity_total'))
        return result.get('total') or 0


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
                'available': max(0, (t.quantity_total or 0) - (t.quantity_sold or 0)),
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
                    {'is_default': 'This organizer already has a default policy.'}
                )
        return attrs


class EventSerializer(serializers.ModelSerializer):
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

    class Meta:
        model = Event
        fields = '__all__'
        read_only_fields = [
            'id', 'organizer', 'created_at', 'updated_at',
            'total_tickets_sold', 'total_revenue',
        ]

    def get_venue(self, obj):
        if not obj.venue:
            return None
        return {
            'id': str(obj.venue.id),
            'name': obj.venue.name,
            'city': obj.venue.city,
            'state': obj.venue.state,
            'country': obj.venue.country,
        }

    def get_tier_count(self, obj):
        return obj.tiers.count()

    def get_session_count(self, obj):
        return obj.sessions.count()

    def get_total_capacity(self, obj):
        from django.db.models import Sum
        result = obj.tiers.aggregate(total=Sum('quantity_total'))
        return result.get('total') or 0

    def validate_cancellation_policy(self, value):
        if value is None:
            return value

        request = self.context.get('request')
        if not request or not request.user:
            return value

        user = request.user
        if user.is_staff or user.is_superuser:
            return value

        if value.organizer_id != user.id:
            raise serializers.ValidationError(
                'You can only attach your own cancellation policies.'
            )
        return value


class EventDetailSerializer(serializers.ModelSerializer):
    sessions = serializers.SerializerMethodField()
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

    class Meta:
        model = Event
        fields = '__all__'
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
            }
            for t in obj.tiers.all()
        ]

    def get_venue(self, obj):
        if obj.venue:
            return {
                'id': str(obj.venue.id),
                'name': obj.venue.name,
                'city': obj.venue.city,
                'state': obj.venue.state,
                'country': obj.venue.country,
            }
        return None

    def get_tier_count(self, obj):
        return obj.tiers.count()

    def get_session_count(self, obj):
        return obj.sessions.count()

    def get_total_capacity(self, obj):
        from django.db.models import Sum
        result = obj.tiers.aggregate(total=Sum('quantity_total'))
        return result.get('total') or 0

    def validate_cancellation_policy(self, value):
        if value is None:
            return value

        request = self.context.get('request')
        if not request or not request.user:
            return value

        user = request.user
        if user.is_staff or user.is_superuser:
            return value

        if value.organizer_id != user.id:
            raise serializers.ValidationError(
                'You can only attach your own cancellation policies.'
            )
        return value


# ============================================================
# VENUE
# ============================================================
class VenueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Venue
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


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
            'paid_at', 'created_at', 'updated_at', 'notes',
            'event_title', 'event_id', 'event',
            'ticket_count', 'checked_in_count',
            'tickets', 'formatted_date',
            'metadata', 'refund_amount',
        ]
        read_only_fields = [
            'id', 'booking_reference', 'created_at', 'updated_at',
            # discount_applied is computed server-side, never trusted from the client.
            'discount_applied',
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

    # -----------------------------------------------------------------
    # HELPER — resolve the tickets payload from wherever it lives
    # -----------------------------------------------------------------
    def _resolve_tickets_payload(self, data):
        """
        The frontend sends tickets inside `metadata.ticket_types`
        (and `metadata.tickets`) because the top-level `tickets` field
        is `read_only=True` and therefore never lands in `validated_data`.

        This helper returns the first non-empty list it finds among:
          1. data['tickets']                    (top-level, if ever sent)
          2. data['metadata']['ticket_types']   (what CreateBooking actually sends)
          3. data['metadata']['tickets']        (alternate shape)
          4. self.initial_data['tickets']       (raw request fallback)
          5. self.initial_data['metadata']...   (raw request fallback)
        """
        # 1. Top-level `tickets` (rarely populated, but harmless to check).
        tickets = data.get('tickets')
        if isinstance(tickets, list) and tickets:
            return tickets

        # 2./3. From `metadata` inside validated data.
        md = data.get('metadata')
        if isinstance(md, dict):
            for key in ('ticket_types', 'tickets'):
                candidate = md.get(key)
                if isinstance(candidate, list) and candidate:
                    return candidate

        # 4./5. From the raw request data (in case metadata was stripped
        #       by an earlier serializer pass — belt and braces).
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

    # -----------------------------------------------------------------
    # VALIDATE — resolves the discount server-side
    # -----------------------------------------------------------------
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

        # ------------------------------------------------------------
        # ✅ Resolve the tickets list from WHEREVER the client put it.
        #    Before this fix, the code only looked at `data['tickets']`,
        #    which is read-only on this serializer and therefore always
        #    empty. That made `computed_total == 0`, which in turn caused
        #    every discount with `min_order_amount > 0` to be wrongly
        #    rejected with "Minimum order ₹X required."
        # ------------------------------------------------------------
        tickets_payload = self._resolve_tickets_payload(data)

        computed_total = Decimal('0.00')

        if tickets_payload and hasattr(self, '_event_obj'):
            valid_tier_ids = {str(t.id) for t in self._event_obj.tiers.all()}
            for i, t in enumerate(tickets_payload):
                if not isinstance(t, dict):
                    raise serializers.ValidationError(
                        {'tickets': f'Item {i} is not an object.'}
                    )
                tier_id = str(t.get('tier_id') or '').strip()
                if not tier_id:
                    raise serializers.ValidationError(
                        {'tickets': f'Item {i} missing tier_id.'}
                    )
                if tier_id not in valid_tier_ids:
                    raise serializers.ValidationError(
                        {'tickets': f'Tier {tier_id} not found for this event.'}
                    )

            for t in tickets_payload:
                tier = TicketTier.objects.filter(id=t.get('tier_id')).first()
                if tier:
                    computed_total += Decimal(str(tier.price))

        # ------------------------------------------------------------
        # ✅ Safety net: if we STILL couldn't compute a total (e.g. the
        #    client sent only `total_amount` with no per-ticket detail),
        #    fall back to the client-supplied total_amount so discount
        #    validation doesn't falsely fail on `min_order_amount`.
        #
        #    This is safe because the discount AMOUNT is recomputed from
        #    `computed_total` — a malicious client inflating total_amount
        #    only affects the minimum-order threshold, not the money
        #    actually charged (the booking total is overwritten below).
        # ------------------------------------------------------------
        if computed_total == Decimal('0.00'):
            fallback = (
                data.get('total_amount')
                or self.initial_data.get('total_amount')
            )
            if fallback:
                try:
                    computed_total = Decimal(str(fallback))
                except (ValueError, TypeError, ArithmeticError):
                    pass

        # total_amount is ALWAYS the gross subtotal (before discount).
        # The discount is stored separately in `discount_applied`.
        if computed_total > 0:
            data['total_amount'] = computed_total

        # ---- Resolve the discount server-side (never trust client) ----
        raw_code = (
            data.get('discount_code')
            or self.initial_data.get('discount_code')
            or ''
        )
        discount_code = str(raw_code).strip().upper()
        discount_amount = Decimal('0.00')

        if discount_code:
            try:
                discount_obj = Discount.objects.get(
                    code__iexact=discount_code, is_active=True,
                )
            except Discount.DoesNotExist:
                raise serializers.ValidationError(
                    {'discount_code': 'Invalid or inactive discount code.'}
                )

            # Organizer ownership check (only relevant if not staff).
            request = self.context.get('request')
            requester = getattr(request, 'user', None)
            if requester and not (requester.is_staff or requester.is_superuser):
                if discount_obj.organizer_id != self._event_obj.organizer_id:
                    raise serializers.ValidationError(
                        {'discount_code': 'This code is not valid for this event.'}
                    )

            # Time window
            now = timezone.now()
            if discount_obj.valid_from and discount_obj.valid_from > now:
                raise serializers.ValidationError(
                    {'discount_code': 'This code is not yet valid.'}
                )
            if discount_obj.valid_to and discount_obj.valid_to < now:
                raise serializers.ValidationError(
                    {'discount_code': 'This code has expired.'}
                )

            # Global usage limit
            if discount_obj.max_uses and discount_obj.used_count >= discount_obj.max_uses:
                raise serializers.ValidationError(
                    {'discount_code': 'This code has reached its usage limit.'}
                )

            # Event scoping (empty M2M = organizer-wide)
            scoped_ids = list(
                discount_obj.applicable_events.values_list('id', flat=True)
            )
            if scoped_ids and self._event_obj.id not in scoped_ids:
                raise serializers.ValidationError(
                    {'discount_code': 'This code is not valid for this event.'}
                )

            # Order constraints
            if (
                discount_obj.min_order_amount
                and computed_total < Decimal(str(discount_obj.min_order_amount))
            ):
                raise serializers.ValidationError(
                    {'discount_code':
                     f'Minimum order ₹{discount_obj.min_order_amount} required.'}
                )

            if (
                discount_obj.min_ticket_count
                and len(tickets_payload) < discount_obj.min_ticket_count
            ):
                raise serializers.ValidationError(
                    {'discount_code':
                     f'Minimum {discount_obj.min_ticket_count} tickets required.'}
                )

            # Compute discount amount
            if discount_obj.type == 'percentage':
                discount_amount = (
                    computed_total * Decimal(str(discount_obj.value)) / Decimal('100')
                ).quantize(Decimal('0.01'))
                if (
                    discount_obj.max_discount
                    and discount_amount > Decimal(str(discount_obj.max_discount))
                ):
                    discount_amount = Decimal(str(discount_obj.max_discount))
            else:
                discount_amount = Decimal(str(discount_obj.value))
                if discount_amount > computed_total:
                    discount_amount = computed_total

            data['discount_code'] = discount_obj.code
            data['discount_applied'] = discount_amount
            # Stash the model instance so create() can persist usage audit.
            self._discount_obj = discount_obj
        else:
            # No code provided — make sure nothing sneaky was passed.
            data.pop('discount_applied', None)
            data['discount_applied'] = Decimal('0.00')
            data['discount_code'] = ''

        return data

    # -----------------------------------------------------------------
    # CREATE — persists the resolved discount and audits its usage
    # -----------------------------------------------------------------
    def create(self, validated_data):
        event = getattr(self, '_event_obj', None)
        if event is None:
            raise serializers.ValidationError({'event': 'Event was not validated.'})
        validated_data['event'] = event

        tickets_data = validated_data.pop('tickets', [])
        logger.info(f"📊 Tickets received in serializer: {len(tickets_data)}")

        # Pull out the discount fields so we control when they hit the DB.
        discount_code = validated_data.pop('discount_code', '')
        discount_applied = validated_data.pop('discount_applied', Decimal('0.00'))

        if 'user' not in validated_data:
            customer_email = validated_data.get('customer_email')
            customer_name = validated_data.get('customer_name', 'WhatsApp User')
            customer_phone = validated_data.get('customer_phone', '')

            if customer_email:
                try:
                    username = re.sub(
                        r'[^a-zA-Z0-9_]', '_',
                        customer_email.split('@')[0]
                    )[:140] or 'user'
                    base_username = username
                    counter = 1
                    while User.objects.filter(username=username).exists():
                        username = f"{base_username}_{counter}"[:150]
                        counter += 1

                    name_parts = customer_name.split()
                    first_name = (name_parts[0] if name_parts else customer_name)[:150]
                    last_name = (' '.join(name_parts[1:]) if len(name_parts) > 1 else '')[:150]

                    user = User.objects.create_user(
                        username=username,
                        email=customer_email,
                        password=None,
                        first_name=first_name,
                        last_name=last_name,
                    )
                    user.is_active = True
                    user.save(update_fields=['is_active'])

                    try:
                        UserProfile.objects.get_or_create(
                            user=user,
                            defaults={
                                'email': customer_email,
                                'phone': customer_phone,
                                'whatsapp_number': customer_phone,
                            },
                        )
                    except Exception as profile_err:
                        logger.warning(f"⚠️ Could not create UserProfile: {profile_err}")

                    validated_data['user'] = user
                except Exception:
                    logger.exception("Error creating user from email")
                    validated_data['user'] = get_or_create_whatsapp_bot_user()
            else:
                validated_data['user'] = get_or_create_whatsapp_bot_user()

        if not validated_data.get('total_amount'):
            total = Decimal('0.00')
            for t in tickets_data:
                tid = t.get('tier_id')
                if tid:
                    try:
                        total += Decimal(str(TicketTier.objects.get(id=tid).price))
                    except TicketTier.DoesNotExist:
                        pass
            validated_data['total_amount'] = total

        # Persist the discount fields on the model.
        validated_data['discount_code'] = discount_code
        validated_data['discount_applied'] = discount_applied

        booking = super().create(validated_data)

        # ---- Audit: DiscountUsage + used_count increment ----
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
                # Atomic increment to avoid lost updates.
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

        # ✅ Snapshot the event's cancellation policy at booking time.
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

        if not tickets_data and isinstance(validated_data.get('metadata'), dict):
            md = validated_data['metadata']
            if isinstance(md.get('ticket_types'), list):
                tickets_data = md['ticket_types']
            elif isinstance(md.get('tickets'), list):
                tickets_data = md['tickets']
            elif isinstance(md.get('tier_ids'), list):
                tier_ids = md['tier_ids']
                tier_quantities = md.get('tier_quantities', {})
                for tier_id in tier_ids:
                    quantity = tier_quantities.get(str(tier_id), 1)
                    for i in range(int(quantity)):
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

        booking.metadata['tickets'] = tickets_data
        booking.metadata['total_tickets'] = len(tickets_data)
        booking.metadata['ticket_created'] = False

        if tickets_data:
            tier_ids = list({
                t.get('tier_id') for t in tickets_data if t.get('tier_id')
            })
            booking.metadata['tier_ids'] = tier_ids

            booking.metadata['ticket_types'] = [
                {
                    'tier_id': t.get('tier_id'),
                    'attendee_name': t.get('attendee_name', booking.customer_name),
                    'tier_name': t.get('tier_name', 'Unknown'),
                }
                for t in tickets_data
            ]

            tier_quantities = {}
            attendee_names_by_tier = {}
            for t in tickets_data:
                tier_id = str(t.get('tier_id'))
                tier_quantities[tier_id] = tier_quantities.get(tier_id, 0) + 1
                attendee_names_by_tier.setdefault(tier_id, []).append(
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
    role = serializers.SerializerMethodField()
    profile = UserProfileSummarySerializer(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role',
            'is_active', 'is_staff', 'is_superuser',
            'profile',
            'date_joined', 'last_login',
        ]
        read_only_fields = [
            'id', 'date_joined', 'last_login',
            'is_active', 'is_staff', 'is_superuser', 'profile',
        ]

    def get_role(self, obj):
        if obj.is_superuser:
            return 'super_admin'
        if obj.is_staff:
            return 'admin'
        if hasattr(obj, 'profile') and obj.profile.is_organizer:
            return 'organizer'
        return 'user'


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
        write_only=True, required=True, min_length=12,
        style={'input_type': 'password'},
    )
    password_confirm = serializers.CharField(
        write_only=True, required=True,
        style={'input_type': 'password'},
    )
    phone = serializers.CharField(required=False, allow_blank=True)
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
            'username': {'required': True},
            'email': {'required': True},
        }

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('Username already exists')
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Email already exists')
        return value

    def validate(self, data):
        if data.get('password') != data.get('password_confirm'):
            raise serializers.ValidationError(
                {'password_confirm': 'Passwords do not match'}
            )

        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_password(data.get('password'))
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)})
        return data

    def create(self, validated_data):
        password = validated_data.pop('password')
        validated_data.pop('password_confirm')

        validated_data.pop('is_organizer', None)

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

        user = User.objects.create_user(
            username=validated_data.get('username'),
            email=validated_data.get('email'),
            password=password,
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

    class Meta:
        model = EventTemplate
        fields = [
            'id', 'event', 'template_type', 'template_type_details',
            'name', 'description', 'image', 'image_url',
            'config', 'is_default', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_image_url(self, obj):
        return obj.image.url if obj.image else None