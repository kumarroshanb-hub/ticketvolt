# backend/ticket_bookings/api/template_api.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.shortcuts import get_object_or_404
from ..models import EventTemplate, EventTemplateType, Event
from ..constants import TemplateTypes, TEMPLATE_TYPE_MAP
from .serializers import EventTemplateSerializer, EventTemplateTypeSerializer
import logging

logger = logging.getLogger(__name__)


class TemplateTypeViewSet(viewsets.ViewSet):
    """
    ViewSet for template types - Uses constants instead of database
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def list(self, request):
        """List all template types from constants"""
        types = TemplateTypes.get_all()
        # Format to match what frontend expects
        data = [
            {
                'id': t['slug'],
                'slug': t['slug'],
                'name': t['name'],
                'icon': t['icon'],
                'is_active': True,
            }
            for t in types
        ]
        return Response(data)
    
    @action(detail=False, methods=['get'])
    def choices(self, request):
        """Get template type choices for dropdown"""
        types = TemplateTypes.get_all()
        data = [
            {'value': t['slug'], 'label': t['name'], 'icon': t['icon']}
            for t in types
        ]
        return Response(data)


class EventTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for event templates
    """
    queryset = EventTemplate.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = EventTemplateSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        event_id = self.request.query_params.get('event_id')
        template_type = self.request.query_params.get('type')
        
        if event_id:
            queryset = queryset.filter(event_id=event_id)
        if template_type:
            queryset = queryset.filter(template_type__slug=template_type)
        
        return queryset
    
    def _parse_boolean(self, value, default=False):
        """Parse boolean from various formats"""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ['true', '1', 'yes', 'on', 't']
        if isinstance(value, list):
            return len(value) > 0 and self._parse_boolean(value[0], default)
        if isinstance(value, (int, float)):
            return bool(value)
        return default
    
    def _get_or_create_template_type(self, slug):
        """
        Get or create a template type from constants.
        This ensures template types exist in the database for relationships.
        """
        if not TemplateTypes.is_valid(slug):
            return None
        
        # Try to get existing template type from database
        try:
            return EventTemplateType.objects.get(slug=slug)
        except EventTemplateType.DoesNotExist:
            # Create it from constants
            type_info = TEMPLATE_TYPE_MAP.get(slug, {})
            if not type_info:
                return None
            
            # Create the template type in database
            template_type = EventTemplateType.objects.create(
                slug=slug,
                name=type_info.get('name', slug),
                icon=type_info.get('icon', '📄'),
                is_active=True
            )
            logger.info(f"✅ Created template type in database from constants: {slug}")
            return template_type
    
    @action(detail=False, methods=['post'])
    def upload(self, request):
        """
        Upload a template image for an event
        """
        try:
            image_file = request.FILES.get('image')
            event_id = request.data.get('event_id')
            template_type_slug = request.data.get('template_type_id')
            name = request.data.get('name', 'Template')
            description = request.data.get('description', '')
            config = request.data.get('config', {})
            
            is_default = self._parse_boolean(request.data.get('is_default', False))
            
            logger.info(f"📊 Uploading template: name={name}, type={template_type_slug}, is_default={is_default}")
            
            if not image_file:
                return Response(
                    {'error': 'Image file is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if not event_id:
                return Response(
                    {'error': 'Event ID is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if not template_type_slug:
                return Response(
                    {'error': 'Template type is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # ✅ Validate template type against constants
            if not TemplateTypes.is_valid(template_type_slug):
                valid_types = ', '.join([t['slug'] for t in TemplateTypes.get_all()])
                return Response(
                    {'error': f'Invalid template type: "{template_type_slug}". Valid types: {valid_types}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get or create template type from constants
            template_type = self._get_or_create_template_type(template_type_slug)
            if not template_type:
                return Response(
                    {'error': f'Failed to create template type: {template_type_slug}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get event
            try:
                event = Event.objects.get(id=event_id)
            except Event.DoesNotExist:
                return Response(
                    {'error': 'Event not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Validate image
            valid_types = ['image/png', 'image/jpeg', 'image/jpg']
            if image_file.content_type not in valid_types:
                return Response(
                    {'error': f'Invalid image type. Supported: {", ".join(valid_types)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if image_file.size > 5 * 1024 * 1024:
                return Response(
                    {'error': 'Image size must be less than 5MB'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            with transaction.atomic():
                template = EventTemplate.objects.create(
                    event=event,
                    template_type=template_type,
                    name=name,
                    description=description,
                    image=image_file,
                    config=config or {},
                    is_default=is_default,
                    is_active=True
                )
                
                if is_default:
                    EventTemplate.objects.filter(
                        event=event,
                        template_type=template_type,
                        is_default=True
                    ).exclude(id=template.id).update(is_default=False)
            
            serializer = EventTemplateSerializer(template)
            
            return Response({
                'success': True,
                'message': 'Template uploaded successfully',
                'template': serializer.data
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"❌ Template upload error: {str(e)}")
            import traceback
            traceback.print_exc()
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        """
        Set a template as default for its event and type
        """
        template = self.get_object()
        
        with transaction.atomic():
            EventTemplate.objects.filter(
                event=template.event,
                template_type=template.template_type,
                is_default=True
            ).update(is_default=False)
            
            template.is_default = True
            template.save()
        
        return Response({
            'success': True,
            'message': f'Template "{template.name}" set as default'
        })
    
    @action(detail=False, methods=['get'])
    def by_type(self, request):
        """
        Get templates by type for an event
        """
        event_id = request.query_params.get('event_id')
        
        if not event_id:
            return Response(
                {'error': 'event_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        queryset = EventTemplate.objects.filter(event_id=event_id, is_active=True)
        serializer = EventTemplateSerializer(queryset, many=True)
        
        # Group by template type name
        grouped = {}
        for template in serializer.data:
            type_name = template.get('template_type_details', {}).get('name', 'Unknown')
            if type_name not in grouped:
                grouped[type_name] = []
            grouped[type_name].append(template)
        
        return Response(grouped)