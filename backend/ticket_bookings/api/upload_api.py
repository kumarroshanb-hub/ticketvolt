"""Small media upload endpoints used by the event builder."""
import os
import uuid

from django.core.files.storage import default_storage
from django.utils.text import slugify
from PIL import Image
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Organization
from ..services import tenancy


class EventImageUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        org = Organization.objects.filter(pk=request.data.get('organization_id')).first()
        if org is None:
            return Response({'error': 'organization_id is required.'}, status=400)
        if not (request.user.is_superuser or tenancy.can_manage_org(request.user, org)):
            return Response({'error': 'Permission denied.'}, status=403)
        upload = request.FILES.get('image')
        if upload is None:
            return Response({'error': 'image is required.'}, status=400)
        if upload.size > 10 * 1024 * 1024:
            return Response({'error': 'Image must be 10MB or smaller.'}, status=400)
        try:
            Image.open(upload).verify()
            upload.seek(0)
        except Exception:
            return Response({'error': 'Upload a valid image file.'}, status=400)

        ext = os.path.splitext(upload.name)[1].lower() or '.jpg'
        if ext not in ('.jpg', '.jpeg', '.png', '.webp'):
            ext = '.jpg'
        org_folder = slugify(org.name) or str(org.id)
        path = default_storage.save(
            f'event_covers/{org_folder}/{uuid.uuid4().hex}{ext}', upload,
        )
        url = default_storage.url(path)
        if url.startswith('/'):
            url = request.build_absolute_uri(url)
        return Response({'url': url, 'path': path}, status=status.HTTP_201_CREATED)


class OrganizationLogoUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        org = Organization.objects.filter(pk=request.data.get('organization_id')).first()
        if org is None:
            return Response({'error': 'organization_id is required.'}, status=400)
        if not (request.user.is_superuser or tenancy.can_manage_org(request.user, org)):
            return Response({'error': 'Permission denied.'}, status=403)
        upload = request.FILES.get('logo')
        if upload is None:
            return Response({'error': 'logo is required.'}, status=400)
        if upload.size > 2 * 1024 * 1024:
            return Response({'error': 'Logo must be 2MB or smaller.'}, status=400)
        # SECURITY (pentest F1): SVG is an active document format. An SVG
        # "logo" can carry <script>, event handlers and external entity
        # references, and it is served back inline from the media origin, so
        # accepting it is a stored-XSS primitive. Only raster formats are
        # accepted, and the stored extension is derived from the *decoded*
        # image format — never from the client-supplied filename.
        upload.seek(0)
        try:
            with Image.open(upload) as probe:
                probe.verify()
                image_format = (probe.format or '').upper()
            upload.seek(0)
            with Image.open(upload) as probe:
                if probe.width < 200 or probe.height < 200:
                    return Response({'error': 'Logo must be at least 200×200px.'}, status=400)
        except Exception:
            return Response({'error': 'Upload a valid PNG, JPG or WEBP logo.'}, status=400)

        format_ext = {
            'PNG': '.png',
            'JPEG': '.jpg',
            'WEBP': '.webp',
        }.get(image_format)
        if format_ext is None:
            return Response({'error': 'Logo must be a PNG, JPG or WEBP image.'}, status=400)

        upload.seek(0)
        folder = slugify(org.slug or org.name) or str(org.id)
        path = default_storage.save(f'org_logos/{folder}/{uuid.uuid4().hex}{format_ext}', upload)
        url = default_storage.url(path)
        if url.startswith('/'):
            url = request.build_absolute_uri(url)
        org.org_logo_url = url
        org.save(update_fields=['org_logo_url', 'updated_at'])
        return Response({'url': url, 'path': path}, status=status.HTTP_201_CREATED)


class OrganizationSlugAvailabilityView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        slug = (request.query_params.get('slug') or '').strip().lower()
        valid = bool(slug) and 3 <= len(slug) <= 40 and bool(
            __import__('re').match(r'^[a-z0-9]+(?:-[a-z0-9]+)*$', slug)
        )
        available = valid and not Organization.objects.filter(slug=slug).exists()
        return Response({'slug': slug, 'valid': valid, 'available': available})


class PublicOrganizationView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        org = Organization.objects.filter(slug=slug, is_active=True).first()
        if org is None:
            return Response({'error': 'Organization not found.'}, status=404)
        return Response({
            'id': str(org.id),
            'name': org.name,
            'slug': org.slug,
            'description': org.description,
            'organization_type': org.organization_type,
            'industry': org.industry,
            'logo_url': org.org_logo_url,
            'email': org.org_email,
            'phone': org.org_phone,
            'social_links': org.social_links or [],
        })
