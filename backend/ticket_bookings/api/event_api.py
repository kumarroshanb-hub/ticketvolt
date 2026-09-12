# backend/ticket_bookings/api/event_api.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import datetime
from django.db.models import Sum, Count, Q
from ..models import Event, Venue, Session, TicketTier
from .serializers import EventSerializer, EventDetailSerializer


class EventViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Event management
    """
    queryset = Event.objects.all()

    def get_permissions(self):
        """
        Dynamically set permissions based on action.
        - list, retrieve, public, public_detail: AllowAny (no auth required for public access)
        - create, update, destroy, publish: IsAuthenticated
        """
        if self.action in ['list', 'retrieve', 'public', 'public_detail']:
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == 'list':
            return EventSerializer
        return EventDetailSerializer

    def get_queryset(self):
        """
        Role-based event filtering:
        - Admin/SuperAdmin: ALL events (past, present, future) - full management access
        - Organizer: ONLY UPCOMING events (their own + public) - NO PAST EVENTS
        - Regular User: Only upcoming active/published public events
        - Unauthenticated: Only upcoming active/published public events
        """
        user = self.request.user
        now = timezone.now()
        
        # If user is not authenticated, only show public upcoming events
        if not user or not user.is_authenticated:
            return Event.objects.filter(
                status__in=['active', 'published'],
                is_public=True,
                end_date__gte=now  # ✅ Only upcoming events
            )
        
        # ✅ ADMIN/SUPERADMIN: See ALL events (past, present, future)
        # No date filtering - full management access
        if user.is_staff or user.is_superuser:
            return Event.objects.all()
        
        # Check if user is an organizer via profile
        is_organizer = False
        if hasattr(user, 'profile') and user.profile.is_organizer:
            is_organizer = True
        # Fallback: check for organizer attribute
        if hasattr(user, 'organizer'):
            is_organizer = True
        
        # ✅ ORGANIZER: ONLY UPCOMING events (their own + public)
        # ✅ FIXED: Filter out past events
        if is_organizer:
            their_upcoming_events = Event.objects.filter(
                organizer=user,
                end_date__gte=now  # ✅ Only upcoming events
            )
            upcoming_public = Event.objects.filter(
                status__in=['active', 'published'],
                is_public=True,
                end_date__gte=now  # ✅ Only upcoming events
            )
            return their_upcoming_events | upcoming_public
        
        # ✅ REGULAR USER: Only upcoming active/published public events
        return Event.objects.filter(
            status__in=['active', 'published'],
            is_public=True,
            end_date__gte=now  # ✅ Only upcoming events
        )

    def create(self, request, *args, **kwargs):
        """
        Create event - Admin/Organizer only
        """
        data = request.data
        
        # Get venue if provided
        venue = None
        if data.get('venue_id'):
            try:
                venue = Venue.objects.get(id=data['venue_id'])
            except Venue.DoesNotExist:
                pass
        
        # Parse dates
        start_date = None
        end_date = None
        
        if data.get('start_date'):
            try:
                start_date = datetime.fromisoformat(data['start_date'].replace('Z', '+00:00'))
            except Exception as e:
                start_date = data['start_date']
        
        if data.get('end_date'):
            try:
                end_date = datetime.fromisoformat(data['end_date'].replace('Z', '+00:00'))
            except Exception as e:
                end_date = data['end_date']
        
        # Create event
        event = Event.objects.create(
            organizer=request.user,
            title=data.get('title', 'Untitled'),
            description=data.get('description', ''),
            short_description=data.get('short_description', ''),
            event_type=data.get('event_type', 'single'),
            category=data.get('category', 'other'),
            start_date=start_date,
            end_date=end_date,
            timezone=data.get('timezone', 'Asia/Kolkata'),
            venue=venue,
            metadata=data.get('metadata', {}),
            status=data.get('status', 'draft'),
            is_public=data.get('is_public', True),
            # Ticket settings
            ticket_format=data.get('ticket_format', 'pdf'),
            combine_tickets=data.get('combine_tickets', False),
            tickets_per_page=data.get('tickets_per_page', 4),
        )
        
        # Create sessions
        for session_data in data.get('sessions', []):
            session_start = None
            session_end = None
            
            if session_data.get('start_time'):
                try:
                    session_start = datetime.fromisoformat(session_data['start_time'].replace('Z', '+00:00'))
                except:
                    session_start = session_data['start_time']
            
            if session_data.get('end_time'):
                try:
                    session_end = datetime.fromisoformat(session_data['end_time'].replace('Z', '+00:00'))
                except:
                    session_end = session_data['end_time']
            
            Session.objects.create(
                event=event,
                start_time=session_start,
                end_time=session_end,
                capacity=session_data.get('capacity', 100),
            )
        
        # Create tiers
        for tier_data in data.get('tiers', []):
            TicketTier.objects.create(
                event=event,
                name=tier_data.get('name', 'General'),
                price=tier_data.get('price', 0),
                quantity_total=tier_data.get('quantity_total', 100),
                ticket_type=tier_data.get('ticket_type', 'ga'),
            )
        
        return Response(EventDetailSerializer(event).data, status=status.HTTP_201_CREATED)

    def list(self, request, *args, **kwargs):
        """
        List events with accurate ticket counts (excluding cancelled/refunded)
        """
        queryset = self.get_queryset()
        
        # Annotate with active ticket counts (excluding cancelled/refunded bookings)
        queryset = queryset.annotate(
            active_tickets_count=Count(
                'tickets',
                filter=~Q(tickets__booking__status__in=['cancelled', 'refunded']),
                distinct=True
            ),
            active_bookings_count=Count(
                'bookings',
                filter=~Q(bookings__status__in=['cancelled', 'refunded']),
                distinct=True
            ),
            active_revenue=Sum(
                'bookings__total_amount',
                filter=Q(bookings__status__in=['paid', 'confirmed', 'completed'])
            )
        )
        
        serializer = EventSerializer(queryset, many=True)
        data = serializer.data
        
        # Override with annotated values
        for i, event_obj in enumerate(queryset):
            data[i]['total_tickets_sold'] = event_obj.active_tickets_count or 0
            data[i]['total_revenue'] = float(event_obj.active_revenue or 0)
            data[i]['total_bookings'] = event_obj.active_bookings_count or 0
        
        return Response(data)

    def retrieve(self, request, *args, **kwargs):
        """
        Get event details with accurate ticket counts (excluding cancelled/refunded)
        
        ✅ ADMIN: Can retrieve ANY event (past, present, future)
        ✅ ORGANIZER: Can retrieve their UPCOMING events + upcoming public events
        ✅ REGULAR USER: Can retrieve upcoming public events only
        """
        instance = self.get_object()
        
        # Check if user can access this event
        user = request.user
        if user.is_authenticated and not user.is_staff and not user.is_superuser:
            # Check if user is organizer
            is_organizer = False
            if hasattr(user, 'profile') and user.profile.is_organizer:
                is_organizer = True
            if hasattr(user, 'organizer'):
                is_organizer = True
            
            # For regular users, only allow access to upcoming public events
            if not is_organizer or instance.organizer_id != user.id:
                if instance.status not in ['active', 'published'] or not instance.is_public:
                    return Response(
                        {'error': 'Event not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )
                if instance.end_date and instance.end_date < timezone.now():
                    return Response(
                        {'error': 'Event has ended'},
                        status=status.HTTP_404_NOT_FOUND
                    )
            
            # For organizers, block access to past events (unless admin)
            if is_organizer and instance.organizer_id == user.id:
                if instance.end_date and instance.end_date < timezone.now():
                    return Response(
                        {'error': 'Event has ended'},
                        status=status.HTTP_404_NOT_FOUND
                    )
        
        # Recalculate ticket counts excluding cancelled/refunded bookings
        active_tickets_count = instance.tickets.exclude(
            booking__status__in=['cancelled', 'refunded']
        ).count()
        
        # Recalculate revenue excluding cancelled/refunded bookings
        actual_revenue = instance.bookings.filter(
            status__in=['paid', 'confirmed', 'completed']
        ).aggregate(
            total=Sum('total_amount')
        )['total'] or 0
        
        # Get active bookings count
        active_bookings_count = instance.bookings.exclude(
            status__in=['cancelled', 'refunded']
        ).count()
        
        # Serialize the event
        serializer = EventDetailSerializer(instance)
        data = serializer.data
        
        # Override with corrected values
        data['total_tickets_sold'] = active_tickets_count
        data['total_revenue'] = float(actual_revenue)
        data['total_bookings'] = active_bookings_count
        
        return Response(data)

    def update(self, request, *args, **kwargs):
        """
        Update event - Admin/Organizer only
        
        ✅ ADMIN: Can update ANY event (past, present, future)
        ✅ ORGANIZER: Can update ONLY their UPCOMING events
        """
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        data = request.data

        # Check permission
        user = request.user
        if not user.is_staff and not user.is_superuser:
            # Check if user is the organizer
            is_organizer = False
            if hasattr(user, 'profile') and user.profile.is_organizer:
                is_organizer = True
            if hasattr(user, 'organizer'):
                is_organizer = True
            
            if not is_organizer or instance.organizer_id != user.id:
                return Response(
                    {'error': 'Permission denied'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # ✅ FIXED: Organizer cannot update PAST events
            if instance.end_date and instance.end_date < timezone.now():
                return Response(
                    {'error': 'Cannot edit past events'},
                    status=status.HTTP_403_FORBIDDEN
                )

        # Update venue if provided
        if data.get('venue_id'):
            try:
                venue = Venue.objects.get(id=data['venue_id'])
                instance.venue = venue
            except Venue.DoesNotExist:
                pass
        
        # Parse dates
        if data.get('start_date'):
            try:
                data['start_date'] = datetime.fromisoformat(data['start_date'].replace('Z', '+00:00'))
            except:
                pass
        if data.get('end_date'):
            try:
                data['end_date'] = datetime.fromisoformat(data['end_date'].replace('Z', '+00:00'))
            except:
                pass
        
        # Include ALL fields including ticket settings
        fields = [
            'title', 'description', 'short_description', 'event_type', 'category', 
            'start_date', 'end_date', 'timezone', 'status', 'metadata', 'is_public',
            'is_featured', 'cover_image', 'gallery_images', 'venue_metadata',
            'booking_start_date', 'booking_end_date',
            'min_tickets_per_order', 'max_tickets_per_order',
            'cancellation_policy', 'refundable_until',
            # Ticket settings
            'ticket_format', 'combine_tickets', 'tickets_per_page',
        ]
        
        for field in fields:
            if field in data:
                setattr(instance, field, data[field])
        instance.save()
        
        # Update sessions if provided
        if 'sessions' in data:
            instance.sessions.all().delete()
            for session_data in data['sessions']:
                session_start = None
                session_end = None
                
                if session_data.get('start_time'):
                    try:
                        session_start = datetime.fromisoformat(session_data['start_time'].replace('Z', '+00:00'))
                    except:
                        session_start = session_data['start_time']
                
                if session_data.get('end_time'):
                    try:
                        session_end = datetime.fromisoformat(session_data['end_time'].replace('Z', '+00:00'))
                    except:
                        session_end = session_data['end_time']
                
                Session.objects.create(
                    event=instance,
                    start_time=session_start,
                    end_time=session_end,
                    capacity=session_data.get('capacity', 100),
                )
        
        # Update tiers if provided
        if 'tiers' in data:
            instance.tiers.all().delete()
            for tier_data in data['tiers']:
                TicketTier.objects.create(
                    event=instance,
                    name=tier_data.get('name', 'General'),
                    price=tier_data.get('price', 0),
                    quantity_total=tier_data.get('quantity_total', 100),
                    ticket_type=tier_data.get('ticket_type', 'ga'),
                )
        
        # Update ticket counts after changes
        instance.update_ticket_counts()
        
        return Response(EventDetailSerializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        """
        Delete event - Admin/Organizer only
        
        ✅ ADMIN: Can delete ANY event
        ✅ ORGANIZER: Can delete ONLY their UPCOMING events
        """
        instance = self.get_object()
        
        # Check permission
        user = request.user
        if not user.is_staff and not user.is_superuser:
            # Check if user is the organizer
            is_organizer = False
            if hasattr(user, 'profile') and user.profile.is_organizer:
                is_organizer = True
            if hasattr(user, 'organizer'):
                is_organizer = True
            
            if not is_organizer or instance.organizer_id != user.id:
                return Response(
                    {'error': 'Permission denied'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # ✅ FIXED: Organizer cannot delete PAST events
            if instance.end_date and instance.end_date < timezone.now():
                return Response(
                    {'error': 'Cannot delete past events'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        """
        Publish event - Admin/Organizer only
        
        ✅ ADMIN: Can publish ANY event
        ✅ ORGANIZER: Can publish ONLY their UPCOMING events
        """
        event = self.get_object()
        
        # Check permission
        user = request.user
        if not user.is_staff and not user.is_superuser:
            # Check if user is the organizer
            is_organizer = False
            if hasattr(user, 'profile') and user.profile.is_organizer:
                is_organizer = True
            if hasattr(user, 'organizer'):
                is_organizer = True
            
            if not is_organizer or event.organizer_id != user.id:
                return Response(
                    {'error': 'Permission denied'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # ✅ FIXED: Organizer cannot publish PAST events
            if event.end_date and event.end_date < timezone.now():
                return Response(
                    {'error': 'Cannot publish past events'},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        event.status = 'active'
        event.save()
        return Response({'message': 'Event published successfully'})

    # ============ PUBLIC ENDPOINTS (No Auth Required) ============
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def public(self, request):
        """
        Public endpoint for WhatsApp and unauthenticated users
        
        Shows ONLY upcoming active/published events
        This ensures regular users and public users see the same events
        """
        now = timezone.now()
        
        queryset = Event.objects.filter(
            status__in=['active', 'published'],
            is_public=True,
            end_date__gte=now  # ✅ Only upcoming events
        ).order_by('-start_date')
        
        # Annotate with active ticket counts for public view
        queryset = queryset.annotate(
            active_tickets_count=Count(
                'tickets',
                filter=~Q(tickets__booking__status__in=['cancelled', 'refunded']),
                distinct=True
            )
        )
        
        serializer = self.get_serializer(queryset, many=True)
        data = serializer.data
        
        # Override with annotated values
        for i, event_obj in enumerate(queryset):
            data[i]['total_tickets_sold'] = event_obj.active_tickets_count or 0
        
        return Response({
            'count': queryset.count(),
            'results': data
        })

    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
    def public_detail(self, request, pk=None):
        """
        Public endpoint for getting a single event details
        No authentication required
        
        Shows ONLY upcoming active/published public events
        """
        now = timezone.now()
        
        try:
            event = Event.objects.get(
                id=pk,
                status__in=['active', 'published'],
                is_public=True,
                end_date__gte=now  # ✅ Only upcoming events
            )
            
            # Get accurate counts for public view
            active_tickets_count = event.tickets.exclude(
                booking__status__in=['cancelled', 'refunded']
            ).count()
            
            serializer = self.get_serializer(event)
            data = serializer.data
            
            # Override with corrected values
            data['total_tickets_sold'] = active_tickets_count
            
            return Response(data)
        except Event.DoesNotExist:
            return Response(
                {'error': 'Event not found'},
                status=status.HTTP_404_NOT_FOUND
            )