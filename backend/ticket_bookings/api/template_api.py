# backend/ticket_bookings/api/template_api.py
#
# ============================================================================
# AUTHORIZATION MODEL
# ============================================================================
# EventTemplateViewSet is scoped on event ownership:
#     • Admin / superuser → every template
#     • Organizer         → only templates for events they organize
#     • Anyone else       → nothing
#
# ============================================================================
# IMAGE SPECIFICATION (v3)
# ----------------------------------------------------------------------------
# Every template type has a mandatory image specification. The `upload`
# action enforces it server-side via Pillow BEFORE any file is written.
#
# The SPEC table is the single source of truth. Edit ONLY this table if
# you need to relax or tighten a constraint — no logic changes required.
# ============================================================================

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.shortcuts import get_object_or_404
from PIL import Image as PILImage, UnidentifiedImageError
from ..models import EventTemplate, EventTemplateType, Event
from ..constants import TemplateTypes, TEMPLATE_TYPE_MAP
from .serializers import EventTemplateSerializer, EventTemplateTypeSerializer
import logging

logger = logging.getLogger(__name__)


# ============================================================================
# IMAGE SPECIFICATION TABLE
# ----------------------------------------------------------------------------
# Keys match TemplateTypes.slugs from ticket_bookings.constants.
# ============================================================================
IMAGE_SPECS = {
    'announcement': {
        'aspect_ratio': 16 / 9,                # 1920/1080
        'ratio_tolerance': 0.02,               # ±2% (strict, per spec)
        'min_width': 1920,
        'min_height': 1080,
        'max_width': 1920,                     # exactly 1920×1080 required
        'max_height': 1080,
        'formats': ['image/png'],              # PNG only, per spec
        'max_bytes': 5 * 1024 * 1024,          # < 5 MB
        'hint': (
            'PNG format, exactly 1920×1080 px (16:9 landscape), under 5 MB. '
            'Keep text and logos within the centre 70% so they survive '
            'any banner crop.'
        ),
    },
    'ticket': {
        'aspect_ratio': 4 / 1,                 # 550/138 ≈ 3.985 — 4:1 target
        'ratio_tolerance': 0.05,               # ±5% covers the 550×138 ratio
        'min_width': 550,
        'min_height': 138,
        'max_width': 1100,                     # 2× the base size for high-DPI
        'max_height': 276,
        'formats': ['image/png'],              # PNG only, per spec
        'max_bytes': 5 * 1024 * 1024,          # < 5 MB
        'hint': (
            'PNG format, 550×138 px base (4:1 landscape), under 5 MB. '
            'This is the wide-stub ticket layout — it must preserve the '
            'Ticket 1 arrangement, title, logo, QR code area, and '
            'admission details for the PDF renderer.'
        ),
    },
    'flyer': {
        'aspect_ratio': 3 / 4,
        'ratio_tolerance': 0.10,
        'min_width': 1200,
        'min_height': 1600,
        'formats': ['image/jpeg', 'image/jpg', 'image/png'],
        'max_bytes': 5 * 1024 * 1024,
        'hint': 'Portrait poster. Recommended: 1800×2400 px (3:4).',
    },
    'social': {
        'aspect_ratio': 1 / 1,
        'ratio_tolerance': 0.05,
        'min_width': 1080,
        'min_height': 1080,
        'formats': ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        'max_bytes': 5 * 1024 * 1024,
        'hint': (
            'Square post. Recommended: 1080×1080 px (1:1). '
            'Keep the subject centred — Instagram/WhatsApp crop edges.'
        ),
    },
    'invite': {
        'aspect_ratio': 4 / 3,
        'ratio_tolerance': 0.10,
        'min_width': 1200,
        'min_height': 900,
        'formats': ['image/jpeg', 'image/jpg', 'image/png'],
        'max_bytes': 5 * 1024 * 1024,
        'hint': 'Landscape invitation. Recommended: 1600×1200 px (4:3).',
    },
    'certificate': {
        'aspect_ratio': 297 / 210,
        'ratio_tolerance': 0.05,
        'min_width': 2970,
        'min_height': 2100,
        'formats': ['image/png', 'image/jpeg'],
        'max_bytes': 5 * 1024 * 1024,
        'hint': 'A4 landscape certificate. Recommended: 2970×2100 px.',
    },
}

# Absolute hard cap — enforced for every type as a defence in depth.
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB


# ============================================================================
# Helpers
# ============================================================================
def _user_can_manage_event(user, event) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    if event is None:
        return False
    organizer_id = getattr(event, 'organizer_id', None)
    if organizer_id is not None:
        return organizer_id == user.id
    return getattr(event, 'organizer', None) == user


def _validate_image_spec(image_file, template_type_slug):
    """
    Validate an uploaded image against the spec for `template_type_slug`.

    Returns (ok: bool, error_message: str | None, details: dict | None).

    Enforces:
      1. MIME type is in the spec's allowed format list.
      2. File is a decodable image (Pillow).
      3. Dimensions are >= min_width/min_height.
      4. Dimensions are <= max_width/max_height (when set).
      5. Aspect ratio within tolerance.
      6. File size <= spec's max_bytes (if defined; else global cap).

    Resets the file cursor to 0 on return so the storage layer can still
    consume the stream after successful validation.
    """
    spec = IMAGE_SPECS.get(template_type_slug)
    if not spec:
        return True, None, None

    # ---- 1. MIME type ----
    if image_file.content_type not in spec['formats']:
        return (
            False,
            (
                f'Invalid image format for {template_type_slug}. '
                f'Allowed: {", ".join(spec["formats"])}.'
            ),
            None,
        )

    # ---- 6. File size (per-type cap first, then global) ----
    per_type_max = spec.get('max_bytes') or MAX_UPLOAD_BYTES
    if image_file.size > per_type_max:
        return (
            False,
            (
                f'File is too large for {template_type_slug}. '
                f'Max allowed: {per_type_max // (1024 * 1024)} MB. '
                f'Got {round(image_file.size / (1024 * 1024), 2)} MB.'
            ),
            {'size_bytes': image_file.size, 'max_bytes': per_type_max},
        )

    # ---- 2. Decodable image ----
    try:
        image_file.seek(0)
        probe = PILImage.open(image_file)
        probe.verify()
        image_file.seek(0)
        img = PILImage.open(image_file)
        width, height = img.size
    except (UnidentifiedImageError, OSError, Exception) as exc:
        logger.warning(
            "Image validation failed for %s (%s): %s",
            template_type_slug, image_file.name, exc,
        )
        return (
            False,
            (
                'Could not read the uploaded file as an image. '
                'It may be corrupted or in an unsupported format.'
            ),
            None,
        )
    finally:
        try:
            image_file.seek(0)
        except Exception:
            pass

    # ---- 3. Minimum dimensions ----
    if width < spec['min_width'] or height < spec['min_height']:
        return (
            False,
            (
                f'Image is too small for {template_type_slug}. '
                f'Got {width}×{height}; minimum is '
                f'{spec["min_width"]}×{spec["min_height"]}. '
                f'{spec["hint"]}'
            ),
            {'width': width, 'height': height},
        )

    # ---- 4. Maximum dimensions (only if set) ----
    max_w = spec.get('max_width')
    max_h = spec.get('max_height')
    if (max_w and width > max_w) or (max_h and height > max_h):
        return (
            False,
            (
                f'Image is too large for {template_type_slug}. '
                f'Got {width}×{height}; max is '
                f'{max_w}×{max_h}. {spec["hint"]}'
            ),
            {'width': width, 'height': height},
        )

    # ---- 5. Aspect ratio ----
    actual_ratio = width / height
    target_ratio = spec['aspect_ratio']
    deviation = abs(actual_ratio - target_ratio) / target_ratio

    if deviation > spec['ratio_tolerance']:
        return (
            False,
            (
                f'Incorrect aspect ratio for {template_type_slug}. '
                f'Got {width}×{height} (≈{actual_ratio:.2f}:1), '
                f'expected ≈{target_ratio:.2f}:1 '
                f'(±{int(spec["ratio_tolerance"] * 100)}%). '
                f'{spec["hint"]}'
            ),
            {
                'width': width,
                'height': height,
                'actual_ratio': round(actual_ratio, 3),
                'target_ratio': round(target_ratio, 3),
            },
        )

    return True, None, {'width': width, 'height': height}


# ============================================================================
# TemplateTypeViewSet
# ============================================================================
class TemplateTypeViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        types = TemplateTypes.get_all()
        data = [
            {
                'id': t['slug'],
                'slug': t['slug'],
                'name': t['name'],
                'icon': t['icon'],
                'is_active': True,
                'spec': IMAGE_SPECS.get(t['slug']),
            }
            for t in types
        ]
        return Response(data)

    @action(detail=False, methods=['get'])
    def choices(self, request):
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
    queryset = EventTemplate.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = EventTemplateSerializer

    def get_queryset(self):
        user = self.request.user
        base = EventTemplate.objects.all()

        if not (user.is_staff or user.is_superuser):
            base = base.filter(event__organizer=user)

        event_id = self.request.query_params.get('event_id')
        template_type = self.request.query_params.get('type')

        if event_id:
            base = base.filter(event_id=event_id)
        if template_type:
            base = base.filter(template_type__slug=template_type)

        return base.select_related('event', 'template_type')

    def _parse_boolean(self, value, default=False):
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

            # ---------- Absolute hard size cap ----------
            if image_file.size > MAX_UPLOAD_BYTES:
                return Response(
                    {
                        'error': (
                            f'File size exceeds the maximum of '
                            f'{MAX_UPLOAD_BYTES // (1024 * 1024)} MB.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # ---------- Per-type image spec validation ----------
            ok, spec_error, spec_details = _validate_image_spec(
                image_file, template_type_slug,
            )
            if not ok:
                return Response(
                    {
                        'error': spec_error,
                        'template_type': template_type_slug,
                        'spec': IMAGE_SPECS.get(template_type_slug),
                        'received': spec_details,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Guarantee the stream is at position 0 before storage writes.
            try:
                image_file.seek(0)
            except Exception:
                pass

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
        event_id = request.query_params.get('event_id')

        if not event_id:
            return Response(
                {'error': 'event_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

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

        queryset = (
            EventTemplate.objects
            .filter(event=event, is_active=True)
            .select_related('template_type')
        )
        serializer = EventTemplateSerializer(queryset, many=True)

        grouped = {}
        for template in serializer.data:
            type_name = template.get(
                'template_type_details', {},
            ).get('name', 'Unknown')
            grouped.setdefault(type_name, []).append(template)

        return Response(grouped)