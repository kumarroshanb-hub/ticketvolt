# backend/ticket_bookings/api/serializers.py
from rest_framework import serializers
from django.contrib.auth.models import User
from django.conf import settings
from django.utils import timezone
import os
import re
import logging

from ..models import (
    Event, Venue, Session, TicketTier, Booking, Ticket,
    CheckInLog, Discount, EventTemplateType, EventTemplate, UserProfile,
)

logger = logging.getLogger(__name__)

# Hard cap — a single booking may not contain more than this many tickets.
MAX_TICKETS_PER_BOOKING = 50


# ============================================================
# WhatsApp service-account helper (unchanged from your version)
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
# EVENT SERIALIZERS
# ============================================================

class PublicEventSerializer(serializers.ModelSerializer):
    """
    Serializer used for PUBLIC (AllowAny) endpoints.

    Exposes ONLY the fields a public visitor needs to browse events.

    ✅ Also exposes summary counts (tier_count, session_count, total_capacity)
       so the booking flow can detect Sold-Out status and show rich cards
       without an extra request per event.
    """
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
            'tier_count', 'session_count', 'total_capacity',   # ✅ ADDED
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
    """Public detail view — adds sessions and tiers (no revenue internals)."""
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


class EventSerializer(serializers.ModelSerializer):
    """
    Full event serializer for authenticated managers.
    Includes summary counts (tiers, sessions, capacity) and nested venue.
    """
    venue = serializers.SerializerMethodField()
    tier_count = serializers.SerializerMethodField()
    session_count = serializers.SerializerMethodField()
    total_capacity = serializers.SerializerMethodField()

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


class EventDetailSerializer(serializers.ModelSerializer):
    """Full event detail serializer for authenticated managers."""
    sessions = serializers.SerializerMethodField()
    tiers = serializers.SerializerMethodField()
    venue = serializers.SerializerMethodField()
    tier_count = serializers.SerializerMethodField()
    session_count = serializers.SerializerMethodField()
    total_capacity = serializers.SerializerMethodField()

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

    class Meta:
        model = Ticket
        fields = [
            'id', 'unique_code', 'attendee_name', 'attendee_email',
            'attendee_phone', 'status', 'check_in_time', 'qr_code',
            'tier_name', 'price', 'event_title', 'booking_reference',
            'is_checked_in', 'created_at',
        ]
        read_only_fields = ['id', 'unique_code', 'created_at']

    def get_price(self, obj):
        return float(obj.tier.price) if obj.tier else 0

    def get_booking_reference(self, obj):
        return obj.booking.booking_reference if obj.booking else None

    def get_is_checked_in(self, obj):
        return obj.status == 'used'


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
            'metadata',
        ]
        read_only_fields = ['id', 'booking_reference', 'created_at', 'updated_at']

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

        tickets_payload = data.get('tickets') or []
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

            computed_total = 0
            for t in tickets_payload:
                tier = TicketTier.objects.filter(id=t.get('tier_id')).first()
                if tier:
                    computed_total += float(tier.price)
            data['total_amount'] = computed_total

        return data

    def create(self, validated_data):
        event = getattr(self, '_event_obj', None)
        if event is None:
            raise serializers.ValidationError({'event': 'Event was not validated.'})
        validated_data['event'] = event

        tickets_data = validated_data.pop('tickets', [])
        logger.info(f"📊 Tickets received in serializer: {len(tickets_data)}")

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
            total = 0
            for t in tickets_data:
                tid = t.get('tier_id')
                if tid:
                    try:
                        total += float(TicketTier.objects.get(id=tid).price)
                    except TicketTier.DoesNotExist:
                        pass
            validated_data['total_amount'] = total

        booking = super().create(validated_data)

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
    class Meta:
        model = Discount
        fields = '__all__'
        read_only_fields = ['id', 'used_count', 'created_at']


# ============================================================
# USER
# ============================================================

class UserProfileSummarySerializer(serializers.ModelSerializer):
    """Compact profile — embedded inside UserSerializer."""
    class Meta:
        model = UserProfile
        fields = [
            'phone', 'whatsapp_number',
            'address', 'city', 'state', 'country', 'postal_code',
            'is_organizer',
        ]


class UserSerializer(serializers.ModelSerializer):
    """
    Includes `is_active`, `is_staff`, `is_superuser`, and a nested `profile`
    so the frontend Users page renders correct status and profile fields.
    """
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
        if hasattr(obj, 'organizer'):
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
    status = serializers.CharField()
    created_at = serializers.DateTimeField()
    ticket_count = serializers.SerializerMethodField()
    formatted_date = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'booking_reference', 'event_title', 'event_id',
            'customer_name', 'customer_email', 'customer_phone',
            'total_amount', 'status', 'created_at', 'formatted_date',
            'ticket_count',
        ]

    def get_ticket_count(self, obj):
        return obj.tickets.count()

    def get_formatted_date(self, obj):
        return obj.created_at.strftime('%d/%m/%Y') if obj.created_at else None


class BookingAdminSerializer(serializers.ModelSerializer):
    tickets = TicketSerializer(many=True, read_only=True)
    event_details = serializers.SerializerMethodField()
    user_details = serializers.SerializerMethodField()
    ticket_count = serializers.SerializerMethodField()
    checked_in_count = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'booking_reference', 'user', 'user_details',
            'event', 'event_details', 'session',
            'customer_name', 'customer_email', 'customer_phone',
            'whatsapp_number', 'total_amount', 'status',
            'payment_id', 'payment_method', 'notes',
            'discount_applied', 'discount_code',
            'paid_at', 'created_at', 'updated_at',
            'tickets', 'ticket_count', 'checked_in_count',
            'metadata',
        ]
        read_only_fields = ['id', 'booking_reference', 'created_at', 'updated_at']

    def get_event_details(self, obj):
        if obj.event:
            return {
                'id': str(obj.event.id),
                'title': obj.event.title,
                'start_date': obj.event.start_date,
                'end_date': obj.event.end_date,
                'status': obj.event.status,
            }
        return None

    def get_user_details(self, obj):
        if obj.user:
            return {
                'id': obj.user.id,
                'username': obj.user.username,
                'email': obj.user.email,
                'full_name': f"{obj.user.first_name} {obj.user.last_name}".strip(),
            }
        return None

    def get_ticket_count(self, obj):
        return obj.tickets.count()

    def get_checked_in_count(self, obj):
        return obj.tickets.filter(status='used').count()


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