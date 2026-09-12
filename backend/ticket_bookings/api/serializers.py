# backend/ticket_bookings/api/serializers.py
from rest_framework import serializers
from ..models import Event, Venue, Session, TicketTier, Booking, Ticket, CheckInLog, Discount, EventTemplateType, EventTemplate, UserProfile
from django.contrib.auth.models import User
import re
import json
import logging

logger = logging.getLogger(__name__)

# ============ EVENT SERIALIZERS ============
class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = '__all__'
        read_only_fields = ['id', 'organizer', 'created_at', 'updated_at', 'total_tickets_sold', 'total_revenue']

class EventDetailSerializer(serializers.ModelSerializer):
    sessions = serializers.SerializerMethodField()
    tiers = serializers.SerializerMethodField()
    venue = serializers.SerializerMethodField()
    
    class Meta:
        model = Event
        fields = '__all__'
        read_only_fields = ['id', 'organizer', 'created_at', 'updated_at', 'total_tickets_sold', 'total_revenue']
    
    def get_sessions(self, obj):
        return [
            {
                'id': str(s.id),
                'start_time': s.start_time,
                'end_time': s.end_time,
                'capacity': s.capacity,
                'booked': s.booked
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
                'quantity_sold': t.quantity_sold
            }
            for t in obj.tiers.all()
        ]
    
    def get_venue(self, obj):
        if obj.venue:
            return {
                'id': str(obj.venue.id),
                'name': obj.venue.name,
                'city': obj.venue.city
            }
        return None

# ============ VENUE SERIALIZERS ============
class VenueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Venue
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']

# ============ TICKET SERIALIZER ============
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
            'is_checked_in', 'created_at'
        ]
        read_only_fields = ['id', 'unique_code', 'created_at']
    
    def get_price(self, obj):
        if obj.tier:
            return float(obj.tier.price)
        return 0
    
    def get_booking_reference(self, obj):
        return obj.booking.booking_reference if obj.booking else None
    
    def get_is_checked_in(self, obj):
        return obj.status == 'used'

# ============ BOOKING SERIALIZERS ============
class BookingSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source='event.title', read_only=True, default='N/A')
    event_id = serializers.UUIDField(source='event.id', read_only=True, default=None)
    ticket_count = serializers.SerializerMethodField()
    checked_in_count = serializers.SerializerMethodField()
    tickets = TicketSerializer(many=True, read_only=True)
    formatted_date = serializers.SerializerMethodField()
    
    # Add event field to accept UUID from request (for WhatsApp)
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
            'metadata'
        ]
        read_only_fields = ['id', 'booking_reference', 'created_at', 'updated_at']
    
    def get_ticket_count(self, obj):
        return obj.tickets.count()
    
    def get_checked_in_count(self, obj):
        return obj.tickets.filter(status='used').count()
    
    def get_formatted_date(self, obj):
        return obj.created_at.strftime('%d/%m/%Y') if obj.created_at else None
    
    def create(self, validated_data):
        """
        Override create to handle:
        - event lookup from event_id
        - user creation from email for WhatsApp bookings
        - STORE ticket data in metadata (DO NOT create tickets yet)
        - Tickets will be created when admin issues them via issue_tickets action
        """
        from django.contrib.auth.models import User
        from ..models import TicketTier, Ticket, Event
        
        # Extract event_id from the event field
        event_id = validated_data.pop('event', None)
        if event_id:
            try:
                event = Event.objects.get(id=event_id)
                validated_data['event'] = event
            except Event.DoesNotExist:
                raise serializers.ValidationError({'event': 'Event not found'})
        
        # Handle tickets data
        tickets_data = validated_data.pop('tickets', [])
        
        # ✅ LOG: Print tickets data for debugging
        logger.info(f"📊 Tickets data received in serializer: {tickets_data}")
        logger.info(f"📊 Number of tickets: {len(tickets_data)}")
        
        # CREATE USER FROM EMAIL IF NOT PROVIDED
        if 'user' not in validated_data:
            customer_email = validated_data.get('customer_email')
            customer_name = validated_data.get('customer_name', 'WhatsApp User')
            customer_phone = validated_data.get('customer_phone', '')
            
            if customer_email:
                try:
                    # Generate a username from email (remove special chars)
                    username = re.sub(r'[^a-zA-Z0-9_]', '_', customer_email.split('@')[0])
                    # Make sure username is unique
                    base_username = username
                    counter = 1
                    while User.objects.filter(username=username).exists():
                        username = f"{base_username}_{counter}"
                        counter += 1
                    
                    # Create the user
                    name_parts = customer_name.split()
                    first_name = name_parts[0] if name_parts else customer_name
                    last_name = ' '.join(name_parts[1:]) if len(name_parts) > 1 else ''
                    
                    user = User.objects.create_user(
                        username=username,
                        email=customer_email,
                        password=None,  # No password set, user can reset later
                        first_name=first_name,
                        last_name=last_name
                    )
                    user.is_active = True
                    user.save()
                    
                    # Also create UserProfile if the model exists
                    try:
                        from ..models import UserProfile
                        UserProfile.objects.get_or_create(
                            user=user,
                            defaults={
                                'email': customer_email,
                                'phone': customer_phone,
                                'whatsapp_number': customer_phone
                            }
                        )
                    except ImportError:
                        pass
                    
                    validated_data['user'] = user
                    
                except Exception as e:
                    logger.error(f"❌ Error creating user: {e}")
                    # Fallback to default whatsapp_bot user
                    whatsapp_user, created = User.objects.get_or_create(
                        username='whatsapp_bot',
                        defaults={
                            'email': 'whatsapp@ticketvolt.com',
                            'is_active': True
                        }
                    )
                    if created:
                        whatsapp_user.set_password('whatsapp_bot_password_123')
                        whatsapp_user.save()
                    validated_data['user'] = whatsapp_user
            else:
                # No email provided, use default whatsapp_bot user
                whatsapp_user, created = User.objects.get_or_create(
                    username='whatsapp_bot',
                    defaults={
                        'email': 'whatsapp@ticketvolt.com',
                        'is_active': True
                    }
                )
                if created:
                    whatsapp_user.set_password('whatsapp_bot_password_123')
                    whatsapp_user.save()
                validated_data['user'] = whatsapp_user
        
        # Ensure total_amount is set
        if 'total_amount' not in validated_data or validated_data['total_amount'] is None:
            total = 0
            for ticket_data in tickets_data:
                tier_id = ticket_data.get('tier_id')
                if tier_id:
                    try:
                        tier = TicketTier.objects.get(id=tier_id)
                        total += float(tier.price)
                    except TicketTier.DoesNotExist:
                        pass
            validated_data['total_amount'] = total
        
        # Create the booking
        booking = super().create(validated_data)
        
        # ✅ Initialize metadata if not exists
        if not hasattr(booking, 'metadata') or not booking.metadata:
            booking.metadata = {}
        
        # ✅ CRITICAL FIX: If tickets_data is empty, check if it was sent in metadata
        if not tickets_data and 'metadata' in validated_data:
            metadata = validated_data.get('metadata', {})
            if isinstance(metadata, dict):
                # Check for ticket data in metadata (from WhatsApp)
                if 'ticket_types' in metadata:
                    tickets_data = metadata.get('ticket_types', [])
                    logger.info(f"📊 Found {len(tickets_data)} tickets in metadata.ticket_types")
                elif 'tickets' in metadata:
                    tickets_data = metadata.get('tickets', [])
                    logger.info(f"📊 Found {len(tickets_data)} tickets in metadata.tickets")
                elif 'tier_ids' in metadata:
                    # Reconstruct from tier_ids
                    tier_ids = metadata.get('tier_ids', [])
                    tier_quantities = metadata.get('tier_quantities', {})
                    for tier_id in tier_ids:
                        quantity = tier_quantities.get(str(tier_id), 1)
                        for i in range(quantity):
                            attendee_name = booking.customer_name
                            # Check if we have attendee names
                            attendee_names = metadata.get('attendee_names', {})
                            if str(tier_id) in attendee_names:
                                names = attendee_names[str(tier_id)]
                                if i < len(names):
                                    attendee_name = names[i]
                            tickets_data.append({
                                'tier_id': tier_id,
                                'attendee_name': attendee_name
                            })
                    logger.info(f"📊 Reconstructed {len(tickets_data)} tickets from tier_ids")
        
        # ✅ Store tickets data in metadata for later retrieval
        booking.metadata['tickets'] = tickets_data
        booking.metadata['total_tickets'] = len(tickets_data)
        booking.metadata['ticket_created'] = False  # ← Important: tickets not created yet
        
        # ✅ Store tier information separately for easy access
        if tickets_data:
            tier_ids = list(set([t.get('tier_id') for t in tickets_data if t.get('tier_id')]))
            booking.metadata['tier_ids'] = tier_ids
            
            # Store ticket types with attendee names
            booking.metadata['ticket_types'] = [
                {
                    'tier_id': t.get('tier_id'),
                    'attendee_name': t.get('attendee_name', booking.customer_name),
                    'tier_name': t.get('tier_name', 'Unknown')
                }
                for t in tickets_data
            ]
            
            # Also store quantities per tier
            tier_quantities = {}
            attendee_names_by_tier = {}
            for t in tickets_data:
                tier_id = str(t.get('tier_id'))
                if tier_id in tier_quantities:
                    tier_quantities[tier_id] += 1
                else:
                    tier_quantities[tier_id] = 1
                
                if tier_id not in attendee_names_by_tier:
                    attendee_names_by_tier[tier_id] = []
                attendee_names_by_tier[tier_id].append(t.get('attendee_name', booking.customer_name))
            
            booking.metadata['tier_quantities'] = tier_quantities
            booking.metadata['attendee_names'] = attendee_names_by_tier
            
            logger.info(f"✅ Stored {len(tickets_data)} tickets in metadata (tickets NOT created yet)")
            logger.info(f"✅ Tier IDs: {tier_ids}")
            logger.info(f"✅ Tier quantities: {tier_quantities}")
        else:
            # If no tickets_data, try to get tier from request for single tier bookings
            tier_id = validated_data.get('tier_id')
            if tier_id:
                booking.metadata['tier_id'] = str(tier_id)
                booking.metadata['quantity'] = validated_data.get('quantity', 1)
                logger.info(f"✅ Stored single tier in metadata: {tier_id}")
            else:
                logger.warning(f"⚠️ No tickets data found for booking {booking.booking_reference}")
        
        booking.save(update_fields=['metadata'])
        
        # ✅ IMPORTANT: DO NOT create tickets here!
        # Tickets will be created when admin issues them via the issue_tickets action
        # This ensures the booking stays in PENDING status with no tickets
        
        logger.info(f"✅ Booking {booking.booking_reference} created with {len(tickets_data)} tickets in metadata (pending, no tickets created yet)")
        
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
            'event', 'tickets', 'ticket_count', 'checked_in_count', 'formatted_date',
            'metadata'
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
                } if obj.event.venue else None
            }
        return None
    
    def get_ticket_count(self, obj):
        return obj.tickets.count()
    
    def get_checked_in_count(self, obj):
        return obj.tickets.filter(status='used').count()
    
    def get_formatted_date(self, obj):
        return obj.created_at.strftime('%d/%m/%Y') if obj.created_at else None

# ============ CHECK-IN SERIALIZERS ============
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
            'latitude', 'longitude', 'notes', 'is_offline', 'synced_at', 'created_at'
        ]
        read_only_fields = ['id', 'scanned_at', 'created_at', 'synced_at']
    
    def get_scanner_name(self, obj):
        if obj.scanner_user:
            return f"{obj.scanner_user.first_name} {obj.scanner_user.last_name}".strip() or obj.scanner_user.username
        return None

# ============ DISCOUNT SERIALIZERS ============
class DiscountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Discount
        fields = '__all__'
        read_only_fields = ['id', 'used_count', 'created_at']

# ============ USER SERIALIZERS ============

class UserSerializer(serializers.ModelSerializer):
    """
    User serializer for booking responses with role field
    """
    role = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'is_active']
        read_only_fields = ['id']
    
    def get_role(self, obj):
        """
        Determine user role based on user attributes:
        - super_admin: is_superuser = True
        - admin: is_staff = True
        - organizer: profile.is_organizer = True
        - user: default
        """
        if obj.is_superuser:
            return 'super_admin'
        if obj.is_staff:
            return 'admin'
        # ✅ FIX: Check profile.is_organizer
        if hasattr(obj, 'profile') and obj.profile.is_organizer:
            return 'organizer'
        # Fallback: check for organizer attribute
        if hasattr(obj, 'organizer'):
            return 'organizer'
        return 'user'


class UserProfileSerializer(serializers.ModelSerializer):
    """
    Serializer for UserProfile
    """
    user = UserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        source='user',
        queryset=User.objects.all(),
        write_only=True
    )
    
    class Meta:
        model = UserProfile
        fields = [
            'id', 'user', 'user_id', 'email', 'phone', 'whatsapp_number',
            'address', 'city', 'state', 'country', 'postal_code',
            'is_organizer', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class UserRegistrationSerializer(serializers.ModelSerializer):
    """
    Serializer for user registration
    """
    password = serializers.CharField(write_only=True, required=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, required=True)
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
            'phone', 'whatsapp_number', 'address', 'city', 'state', 'country', 'postal_code',
            'is_organizer'
        ]
        extra_kwargs = {
            'username': {'required': True},
            'email': {'required': True},
        }
    
    def validate(self, data):
        # Check if passwords match
        if data.get('password') != data.get('password_confirm'):
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match'})
        
        # Check if username already exists
        if User.objects.filter(username=data.get('username')).exists():
            raise serializers.ValidationError({'username': 'Username already exists'})
        
        # Check if email already exists
        if User.objects.filter(email=data.get('email')).exists():
            raise serializers.ValidationError({'email': 'Email already exists'})
        
        return data
    
    def create(self, validated_data):
        # Remove non-user fields
        password = validated_data.pop('password')
        validated_data.pop('password_confirm')
        
        # Extract profile fields
        profile_fields = {}
        profile_fields['phone'] = validated_data.pop('phone', '')
        profile_fields['whatsapp_number'] = validated_data.pop('whatsapp_number', '')
        profile_fields['address'] = validated_data.pop('address', '')
        profile_fields['city'] = validated_data.pop('city', '')
        profile_fields['state'] = validated_data.pop('state', '')
        profile_fields['country'] = validated_data.pop('country', 'India')
        profile_fields['postal_code'] = validated_data.pop('postal_code', '')
        profile_fields['is_organizer'] = validated_data.pop('is_organizer', False)
        
        # Create user
        user = User.objects.create_user(
            username=validated_data.get('username'),
            email=validated_data.get('email'),
            password=password,
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', '')
        )
        user.is_active = True
        user.save()
        
        # Create user profile
        UserProfile.objects.create(
            user=user,
            email=user.email,
            **profile_fields
        )
        
        return user


# ============ BOOKING LIST SERIALIZERS ============

class BookingListSerializer(serializers.ModelSerializer):
    """Simplified booking serializer for list views"""
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
            'id', 
            'booking_reference', 
            'event_title',
            'event_id',
            'customer_name',
            'customer_email',
            'customer_phone',
            'total_amount', 
            'status', 
            'created_at',
            'formatted_date',
            'ticket_count'
        ]
    
    def get_ticket_count(self, obj):
        return obj.tickets.count()
    
    def get_formatted_date(self, obj):
        return obj.created_at.strftime('%d/%m/%Y') if obj.created_at else None

class BookingAdminSerializer(serializers.ModelSerializer):
    """Admin serializer for booking management with all details"""
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
            'metadata'
        ]
        read_only_fields = ['id', 'booking_reference', 'created_at', 'updated_at']
    
    def get_event_details(self, obj):
        if obj.event:
            return {
                'id': str(obj.event.id),
                'title': obj.event.title,
                'start_date': obj.event.start_date,
                'end_date': obj.event.end_date,
                'status': obj.event.status
            }
        return None
    
    def get_user_details(self, obj):
        if obj.user:
            return {
                'id': obj.user.id,
                'username': obj.user.username,
                'email': obj.user.email,
                'full_name': f"{obj.user.first_name} {obj.user.last_name}".strip()
            }
        return None
    
    def get_ticket_count(self, obj):
        return obj.tickets.count()
    
    def get_checked_in_count(self, obj):
        return obj.tickets.filter(status='used').count()

class BulkActionResponseSerializer(serializers.Serializer):
    """Serializer for bulk action responses"""
    status = serializers.CharField()
    action = serializers.CharField()
    summary = serializers.DictField()
    results = serializers.ListField()
    errors = serializers.ListField(required=False, allow_null=True)

# ============================================
# TEMPLATE SERIALIZERS
# ============================================

class EventTemplateTypeSerializer(serializers.ModelSerializer):
    """Serializer for EventTemplateType"""
    
    class Meta:
        model = EventTemplateType
        fields = ['id', 'name', 'slug', 'description', 'icon', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class EventTemplateSerializer(serializers.ModelSerializer):
    """Serializer for EventTemplate"""
    
    template_type_details = EventTemplateTypeSerializer(source='template_type', read_only=True)
    image_url = serializers.SerializerMethodField()
    
    class Meta:
        model = EventTemplate
        fields = [
            'id', 'event', 'template_type', 'template_type_details',
            'name', 'description', 'image', 'image_url',
            'config', 'is_default', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_image_url(self, obj):
        if obj.image:
            return obj.image.url
        return None