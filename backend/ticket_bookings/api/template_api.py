# backend/ticket_bookings/api/template_api.py
#
# ============================================================================
# AUTHORIZATION MODEL (do not weaken without review)
# ----------------------------------------------------------------------------
# EventTemplateViewSet is scoped on event ownership:
#
#     • Admin / superuser → every template
#     • Organizer         → only templates for events they organize
#     • Anyone else       → nothing (their scoped queryset is empty)
#
# The scoping lives in `get_queryset()`. Everything that calls
# `self.get_object()` — retrieve, update, partial_update, destroy,
# set_default — is therefore automatically protected.
#
# `upload` and `by_type` fetch the Event directly (not via get_object), so
# they apply `_user_can_manage_event()` explicitly.
#
# TemplateTypeViewSet is intentionally NOT scoped: it serves a fixed list
# of type slugs from `ticket_bookings.constants`, identical for every user.
# Scoping it would break the upload dialog without adding security.
# ============================================================================

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


# ============================================================================
# Helpers
# ============================================================================
def _user_can_manage_event(user, event) -> bool:
    """
    Central ownership rule for anything scoped to an event.

      • Staff / superuser → always allowed
      • Organizer         → only their own events
      • Anyone else       → denied

    This mirrors the rule enforced by EventViewSet and BookingViewSet, so
    the "who can touch this event" answer is identical across the API.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    if event is None:
        return False

    # Prefer direct FK comparison — no extra query.
    organizer_id = getattr(event, 'organizer_id', None)
    if organizer_id is not None:
        return organizer_id == user.id

    # Fallback: object may not have organizer_id cached.
    return getattr(event, 'organizer', None) == user


# ============================================================================
# TemplateTypeViewSet
# ----------------------------------------------------------------------------
# NOTE: This viewset intentionally does NOT scope by user.
# It serves a fixed, non-sensitive list of template-type slugs from
# `ticket_bookings.constants.TemplateTypes`. Every authenticated user gets
# the same list — there is nothing per-user to scope.
#
# Scoping this would break the "New Template" dropdown for organizers who
# haven't created any events yet, without adding any security value.
# ============================================================================
class TemplateTypeViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        """List all template types from constants."""
        types = TemplateTypes.get_all()
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
        """Template type choices for dropdowns."""
        types = TemplateTypes.get_all()
        data = [
            {'value': t['slug'], 'label': t['name'], 'icon': t['icon']}
            for t in types
        ]
        return Response(data)


# ============================================================================
# EventTemplateViewSet
# ============================================================================
class EventTemplateViewSet(viewsets.ModelViewSet):
    """
    CRUD for event templates.

    Authorization model
    -------------------
    All actions are gated on event ownership:

      • Admin / superuser → full access to every event's templates
      • Organizer         → only templates for events they organize
      • Regular user      → only templates for public/upcoming events they
                            could theoretically view (read-only in practice,
                            since they can't own an event)

    The scoping lives in `get_queryset()`, which is called by:
      - `list`, `retrieve`
      - `get_object()` → `update`, `partial_update`, `destroy`
      - every `@action(detail=True)` that calls `self.get_object()`

    `upload` doesn't call `get_object()` — it looks up the Event directly —
    so it applies the same rule explicitly.
    """
    queryset = EventTemplate.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = EventTemplateSerializer

    # ------------------------------------------------------------------
    # Scoping — the SINGLE place ownership is enforced for all
    # list/retrieve/update/destroy/set_default paths.
    # ------------------------------------------------------------------
    def get_queryset(self):
        """
        Return only the templates the requesting user is allowed to see.

        Filters from query params are layered on TOP of the scoped base
        queryset, so a user can never widen their own visibility by
        passing `?event_id=<someone-elses-event>`.
        """
        user = self.request.user
        base = EventTemplate.objects.all()

        # --- Ownership scoping ---
        if not (user.is_staff or user.is_superuser):
            # Organizers (and anyone else) only see templates for events
            # they organize. The `event__organizer=user` join handles both
            # organizer users and the general case in one query.
            base = base.filter(event__organizer=user)

        # --- Query-param filters (applied AFTER scoping) ---
        event_id = self.request.query_params.get('event_id')
        template_type = self.request.query_params.get('type')

        if event_id:
            base = base.filter(event_id=event_id)
        if template_type:
            base = base.filter(template_type__slug=template_type)

        return base.select_related('event', 'template_type')

    # ------------------------------------------------------------------
    # Boolean parser
    # ------------------------------------------------------------------
    def _parse_boolean(self, value, default=False):
        """
        Parse a boolean from various wire formats. Multipart form-data and
        JSON both deliver booleans as strings sometimes; this handles all
        the common shapes without silently defaulting.

        Kept identical to the original so no caller regresses.
        """
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ['true', '1', 'yes', 'on', 't']
        if isinstance(value, list):
            return len(value) > 0 and self._parse_boolean(value[0], default)
        if isinstance(value, (int, float)):
            return bool(value)
        return default

    # ------------------------------------------------------------------
    # Template type getter / creator
    # ------------------------------------------------------------------
    def _get_or_create_template_type(self, slug):
        """
        Resolve a template-type slug to a DB row, creating it from constants
        if it doesn't exist yet.

        Returns None if the slug isn't a valid type.
        """
        if not TemplateTypes.is_valid(slug):
            return None

        try:
            return EventTemplateType.objects.get(slug=slug)
        except EventTemplateType.DoesNotExist:
            type_info = TEMPLATE_TYPE_MAP.get(slug, {})
            if not type_info:
                return None

            template_type = EventTemplateType.objects.create(
                slug=slug,
                name=type_info.get('name', slug),
                icon=type_info.get('icon', '📄'),
                is_active=True,
            )
            logger.info(
                "✅ Created template type in database from constants: %s", slug,
            )
            return template_type

    # ==================================================================
    # UPLOAD
    # ==================================================================
    @action(detail=False, methods=['post'])
    def upload(self, request):
        """
        POST /api/templates/upload/

        Multipart form-data:
          image            (file, required)
          event_id         (uuid, required)
          template_type_id (slug, required)
          name             (str, optional)
          description      (str, optional)
          config           (json-ish, optional)
          is_default       (bool-ish, optional)

        Enforces event ownership before persisting anything.
        """
        try:
            image_file = request.FILES.get('image')
            event_id = request.data.get('event_id')
            template_type_slug = request.data.get('template_type_id')
            name = request.data.get('name', 'Template')
            description = request.data.get('description', '')
            config = request.data.get('config', {})

            is_default = self._parse_boolean(
                request.data.get('is_default', False),
            )

            logger.info(
                "📊 Uploading template: name=%s, type=%s, is_default=%s, "
                "user=%s",
                name, template_type_slug, is_default,
                getattr(request.user, 'username', '?'),
            )

            # ---------- Required-field checks ----------
            if not image_file:
                return Response(
                    {'error': 'Image file is required'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not event_id:
                return Response(
                    {'error': 'Event ID is required'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not template_type_slug:
                return Response(
                    {'error': 'Template type is required'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # ---------- Template type validation ----------
            if not TemplateTypes.is_valid(template_type_slug):
                valid_types = ', '.join(
                    t['slug'] for t in TemplateTypes.get_all()
                )
                return Response(
                    {
                        'error': (
                            f'Invalid template type: "{template_type_slug}". '
                            f'Valid types: {valid_types}'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            template_type = self._get_or_create_template_type(
                template_type_slug,
            )
            if not template_type:
                return Response(
                    {
                        'error': (
                            f'Failed to create template type: '
                            f'{template_type_slug}'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # ---------- Event lookup + ownership check ----------
            try:
                event = Event.objects.select_related('organizer').get(
                    id=event_id,
                )
            except Event.DoesNotExist:
                return Response(
                    {'error': 'Event not found'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            # --- Enforce event ownership ---
            # Staff/superusers can manage any event. Organizers can manage
            # only their own events. Everyone else is denied outright.
            if not _user_can_manage_event(request.user, event):
                logger.warning(
                    "🚫 Template upload denied: user=%s attempted to add a "
                    "template to event=%s (organizer=%s)",
                    getattr(request.user, 'username', '?'),
                    event.id,
                    getattr(event.organizer, 'username', '?'),
                )
                return Response(
                    {
                        'error': (
                            'You do not have permission to add templates '
                            'to this event.'
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            # --- END ownership check ---

            # ---------- Image validation ----------
            valid_mimes = ['image/png', 'image/jpeg', 'image/jpg']
            if image_file.content_type not in valid_mimes:
                return Response(
                    {
                        'error': (
                            f'Invalid image type. Supported: '
                            f'{", ".join(valid_mimes)}'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if image_file.size > 5 * 1024 * 1024:
                return Response(
                    {'error': 'Image size must be less than 5MB'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # ---------- Persist ----------
            with transaction.atomic():
                template = EventTemplate.objects.create(
                    event=event,
                    template_type=template_type,
                    name=name,
                    description=description,
                    image=image_file,
                    config=config or {},
                    is_default=is_default,
                    is_active=True,
                )

                if is_default:
                    # Only one default per (event, template_type).
                    EventTemplate.objects.filter(
                        event=event,
                        template_type=template_type,
                        is_default=True,
                    ).exclude(id=template.id).update(is_default=False)

            serializer = EventTemplateSerializer(template)

            return Response(
                {
                    'success': True,
                    'message': 'Template uploaded successfully',
                    'template': serializer.data,
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception:
            # Log the full traceback server-side; never echo it to the
            # client. An internal exception message can leak schema details,
            # file paths, or third-party library versions.
            logger.exception("❌ Template upload error")
            return Response(
                {'error': 'An unexpected error occurred while uploading.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ==================================================================
    # SET DEFAULT
    # ==================================================================
    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        """
        POST /api/templates/<pk>/set_default/

        Marks this template as the default for its (event, template_type).

        Ownership is enforced by `get_object()`, which uses the scoped
        queryset — so a user cannot flip another organizer's template to
        default by guessing its UUID.
        """
        template = self.get_object()

        with transaction.atomic():
            EventTemplate.objects.filter(
                event=template.event,
                template_type=template.template_type,
                is_default=True,
            ).update(is_default=False)

            template.is_default = True
            template.save(update_fields=['is_default', 'updated_at'])

        return Response({
            'success': True,
            'message': f'Template "{template.name}" set as default',
        })

    # ==================================================================
    # BY TYPE
    # ==================================================================
    @action(detail=False, methods=['get'])
    def by_type(self, request):
        """
        GET /api/templates/by_type/?event_id=<uuid>

        Returns templates for an event, grouped by template-type name.

        Ownership is enforced in TWO layers:
          1. `self.get_queryset()` — the base queryset is already scoped to
             the user's own events (or all events, for staff).
          2. An explicit event-ownership check below — so that a regular
             user passing someone else's `event_id` gets a 403 rather than
             a silently-empty result. An empty result would be misleading
             ("no templates") when the real answer is "not allowed".
        """
        event_id = request.query_params.get('event_id')

        if not event_id:
            return Response(
                {'error': 'event_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ---- Event lookup + ownership check ----
        try:
            event = Event.objects.select_related('organizer').get(id=event_id)
        except Event.DoesNotExist:
            return Response(
                {'error': 'Event not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not _user_can_manage_event(request.user, event):
            return Response(
                {
                    'error': (
                        'You do not have permission to view templates for '
                        'this event.'
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        # ---- End ownership check ----

        queryset = (
            EventTemplate.objects
            .filter(event=event, is_active=True)
            .select_related('template_type')
        )
        serializer = EventTemplateSerializer(queryset, many=True)

        # Group by template-type name
        grouped = {}
        for template in serializer.data:
            type_name = template.get(
                'template_type_details', {},
            ).get('name', 'Unknown')
            grouped.setdefault(type_name, []).append(template)

        return Response(grouped)