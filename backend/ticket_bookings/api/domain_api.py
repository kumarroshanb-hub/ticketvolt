from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsPlatformAdmin

from ..models import Organization


class VerifyOrganizationDomainView(APIView):
    """Mark a tenant custom domain verified after DNS/proxy setup.

    Verification is intentionally a superuser operation for now; the
    expected DNS record is a CNAME/proxy to the platform hostname.
    """

    permission_classes = [permissions.IsAuthenticated, IsPlatformAdmin]

    def post(self, request, org_id):
        org = Organization.objects.filter(pk=org_id).first()
        if org is None:
            return Response({'error': 'Organization not found.'}, status=404)
        if not org.custom_domain:
            return Response({'error': 'Set a custom domain first.'}, status=400)
        org.domain_verified = bool(request.data.get('verified', True))
        org.save(update_fields=['domain_verified', 'updated_at'])
        return Response({
            'custom_domain': org.custom_domain,
            'domain_verified': org.domain_verified,
        }, status=status.HTTP_200_OK)
