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
# IMAGE SPECIFICATION (v4 — relaxed)
# ----------------------------------------------------------------------------
# Uploads are now PERMISSIVE by default. Only two hard gates remain:
#   1. The file must be a decodable image (Pillow can open it).
#   2. The file must be <= MAX_UPLOAD_BYTES (8 MB absolute cap).
#
# Everything else — MIME type, minimum dimensions, maximum dimensions,
# aspect ratio — is a SOFT WARNING. The image is still saved. Warnings
# are returned in the response so the UI can show them if it wants.
#
# To re-enable a hard gate for a specific template type, set the
# corresponding `*_hard` flag to True in IMAGE_SPECS below.
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
# IMAGE SPECIFICATION TABLE (v4)
# ----------------------------------------------------------------------------
# Each entry:
#   • formats               — allowed MIME types (soft by default)
#   • formats_hard          — if True, wrong MIME is a hard rejection
#   • min_width/min_height  — soft warnings unless *_hard is True
#   • max_width/max_height  — soft warnings unless *_hard is True
#   • aspect_ratio          — soft warnings unless *_hard is True
#   • ratio_tolerance       — ±% allowed around aspect_ratio
#   • max_bytes             — absolute per-type cap (always hard)
#   • hint                  — UI copy for the admin upload form
#
# Defaults are deliberately permissive: NO format is hard-rejected,
# and dimensions/ratio only produce warnings. This is intentional —
# organizers were being blocked from uploading perfectly usable
# artwork because it wasn't exactly 16:9 PNG, etc.
# ============================================================================
IMAGE_SPECS = {
    'announcement': {
        'aspect_ratio': 16 / 9,
        'ratio_tolerance': 0.35,                 # ±35% — much more lenient
        'min_width': 600,                        # was 1280
        'min_height': 340,                       # was 720
        'formats': [
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/webp',
        ],
        'max_bytes': 5 * 1024 * 1024,
        'hint': (
            'Landscape banner recommended: ~1920×1080 (16:9), PNG or JPG, '
            'under 5 MB. Other sizes still upload — they may be cropped.'
        ),
        # All soft by default. Flip to True to enforce.
        'formats_hard': False,
        'dimensions_hard': False,
        'ratio_hard': False,
    },
    'ticket': {
        'aspect_ratio': 4 / 1,
        'ratio_tolerance': 0.25,                 # was 0.05
        'min_width': 400,                        # was 550
        'min_height': 100,                       # was 138
        'max_width': 2200,                       # was 1100 — 2× base
        'max_height': 552,
        'formats': [
            'image/png',
            'image/jpeg',
            'image/jpg',
        ],
        'max_bytes': 5 * 1024 * 1024,
        'hint': (
            'Wide-stub ticket layout recommended: 550×138 (4:1), PNG, '
            'under 5 MB. Other sizes still upload — text positions may shift.'
        ),
        'formats_hard': False,
        'dimensions_hard': False,
        'ratio_hard': False,
    },
    'flyer': {
        'aspect_ratio': 3 / 4,
        'ratio_tolerance': 0.25,
        'min_width': 600,
        'min_height': 800,
        'formats': [
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/webp',
        ],
        'max_bytes': 5 * 1024 * 1024,
        'hint': 'Portrait poster recommended: 1800×2400 (3:4).',
        'formats_hard': False,
        'dimensions_hard': False,
        'ratio_hard': False,
    },
    'social': {
        'aspect_ratio': 1 / 1,
        'ratio_tolerance': 0.25,
        'min_width': 400,
        'min_height': 400,
        'formats': [
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/webp',
            'image/gif',
        ],
        'max_bytes': 5 * 1024 * 1024,
        'hint': 'Square post recommended: 1080×1080 (1:1).',
        'formats_hard': False,
        'dimensions_hard': False,
        'ratio_hard': False,
    },
    'invite': {
        'aspect_ratio': 4 / 3,
        'ratio_tolerance': 0.25,
        'min_width': 600,
        'min_height': 450,
        'formats': [
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/webp',
        ],
        'max_bytes': 5 * 1024 * 1024,
        'hint': 'Landscape invitation recommended: 1600×1200 (4:3).',
        'formats_hard': False,
        'dimensions_hard': False,
        'ratio_hard': False,
    },
    'certificate': {
        'aspect_ratio': 297 / 210,
        'ratio_tolerance': 0.15,
        'min_width': 1000,
        'min_height': 700,
        'formats': [
            'image/png',
            'image/jpeg',
            'image/jpg',
        ],
        'max_bytes': 5 * 1024 * 1024,
        'hint': 'A4 landscape certificate recommended: 2970×2100.',
        'formats_hard': False,
        'dimensions_hard': False,
        'ratio_hard': False,
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

    Returns (ok: bool, error_message: str | None, warnings: list[str]).

    Hard gates (ALWAYS enforced — no spec can disable these):
      1. File is decodable by Pillow.
      2. File size <= MAX_UPLOAD_BYTES (8 MB).

    Per-type hard gates (enabled via `*_hard` flags in IMAGE_SPECS):
      • `formats_hard`    — wrong MIME → reject
      • `dimensions_hard` — below min / above max → reject
      • `ratio_hard`      — aspect ratio outside tolerance → reject

    Everything else produces a **warning string** that the caller
    returns to the frontend. Warnings never block the upload.

    The file cursor is rewound to 0 on return so storage can read it.
    """
    spec = IMAGE_SPECS.get(template_type_slug)
    warnings: list[str] = []

    # No spec → accept unconditionally (forward compatibility for
    # new template types added later without a spec entry).
    if not spec:
        try:
            image_file.seek(0)
        except Exception:
            pass
        return True, None, warnings

    # ------------------------------------------------------------
    # HARD GATE 1 — absolute file size cap (8 MB, non-negotiable)
    # ------------------------------------------------------------
    if image_file.size > MAX_UPLOAD_BYTES:
        return (
            False,
            (
                f'File is too large. Maximum allowed is '
                f'{MAX_UPLOAD_BYTES // (1024 * 1024)} MB; '
                f'got {round(image_file.size / (1024 * 1024), 2)} MB.'
            ),
            warnings,
        )

    # ------------------------------------------------------------
    # MIME check — hard only if `formats_hard` is True
    # ------------------------------------------------------------
    allowed_formats = spec.get('formats') or []
    content_type = (image_file.content_type or '').lower()
    format_ok = (
        not allowed_formats
        or content_type in allowed_formats
    )

    if not format_ok:
        msg = (
            f'Unexpected file type "{content_type}". '
            f'Allowed: {", ".join(allowed_formats)}.'
        )
        if spec.get('formats_hard'):
            return False, msg, warnings
        warnings.append(msg)

    # ------------------------------------------------------------
    # HARD GATE 2 — must decode as an image
    # ------------------------------------------------------------
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
            warnings,
        )
    finally:
        try:
            image_file.seek(0)
        except Exception:
            pass

    # ------------------------------------------------------------
    # Per-type file size cap — soft warning (global cap already passed)
    # ------------------------------------------------------------
    per_type_max = spec.get('max_bytes') or MAX_UPLOAD_BYTES
    if image_file.size > per_type_max:
        warnings.append(
            f'File is larger than the recommended '
            f'{per_type_max // (1024 * 1024)} MB for '
            f'"{template_type_slug}" '
            f'({round(image_file.size / (1024 * 1024), 2)} MB). '
            f'It will still be uploaded.'
        )

    # ------------------------------------------------------------
    # Minimum dimensions — hard only if `dimensions_hard` is True
    # ------------------------------------------------------------
    min_w = spec.get('min_width') or 0
    min_h = spec.get('min_height') or 0
    if width < min_w or height < min_h:
        msg = (
            f'Image is smaller than recommended for '
            f'"{template_type_slug}" ({width}×{height}; '
            f'recommended ≥ {min_w}×{min_h}). '
            f'{spec.get("hint", "")}'
        ).strip()
        if spec.get('dimensions_hard'):
            return False, msg, warnings
        warnings.append(msg)

    # ------------------------------------------------------------
    # Maximum dimensions — hard only if `dimensions_hard` is True
    # ------------------------------------------------------------
    max_w = spec.get('max_width')
    max_h = spec.get('max_height')
    if (max_w and width > max_w) or (max_h and height > max_h):
        msg = (
            f'Image is larger than recommended for '
            f'"{template_type_slug}" ({width}×{height}; '
            f'recommended ≤ {max_w}×{max_h}). '
            f'{spec.get("hint", "")}'
        ).strip()
        if spec.get('dimensions_hard'):
            return False, msg, warnings
        warnings.append(msg)

    # ------------------------------------------------------------
    # Aspect ratio — hard only if `ratio_hard` is True
    # ------------------------------------------------------------
    target_ratio = spec.get('aspect_ratio')
    tolerance = spec.get('ratio_tolerance', 0.15)
    if target_ratio and height > 0:
        actual_ratio = width / height
        deviation = abs(actual_ratio - target_ratio) / target_ratio
        if deviation > tolerance:
            msg = (
                f'Aspect ratio for "{template_type_slug}" is '
                f'{actual_ratio:.2f}:1 '
                f'(target ≈{target_ratio:.2f}:1, '
                f'±{int(tolerance * 100)}%). '
                f'{spec.get("hint", "")}'
            ).strip()
            if spec.get('ratio_hard'):
                return False, msg, warnings
            warnings.append(msg)

    return True, None, warnings


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

            # ---------- Per-type validation (v4: warnings, not errors) ----------
            ok, spec_error, spec_warnings = _validate_image_spec(
                image_file, template_type_slug,
            )
            if not ok:
                return Response(
                    {
                        'error': spec_error,
                        'template_type': template_type_slug,
                        'spec': IMAGE_SPECS.get(template_type_slug),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if spec_warnings:
                logger.info(
                    "⚠️ Template upload warnings for %s: %s",
                    template_type_slug,
                    ' | '.join(spec_warnings),
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

            # Pass the request so `image_url` is absolute.
            serializer = EventTemplateSerializer(
                template,
                context={'request': request},
            )

            return Response(
                {
                    'success': True,
                    'message': 'Template uploaded successfully',
                    'template': serializer.data,
                    # ✅ NEW: non-blocking warnings the UI can display.
                    'warnings': spec_warnings,
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
        serializer = EventTemplateSerializer(
            queryset,
            many=True,
            context={'request': request},
        )

        grouped = {}
        for template in serializer.data:
            type_name = template.get(
                'template_type_details', {},
            ).get('name', 'Unknown')
            grouped.setdefault(type_name, []).append(template)

        return Response(grouped)