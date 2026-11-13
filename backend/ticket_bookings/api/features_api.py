"""Feature entitlement APIs (system administrator)."""
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsPlatformAdmin

from ..models import Organization
from ..models_features import FeatureDefinition, FeaturePackage, OrganizationFeature
from ..services import features, tenancy


class FeatureDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeatureDefinition
        fields = ['id', 'key', 'name', 'description', 'category', 'default_enabled', 'is_active']


class FeaturePackageSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeaturePackage
        fields = ['id', 'code', 'name', 'description', 'feature_keys', 'is_default', 'is_active']


class OrganizationFeatureSerializer(serializers.ModelSerializer):
    feature_key = serializers.CharField(source='feature.key', read_only=True)

    class Meta:
        model = OrganizationFeature
        fields = ['id', 'organization', 'feature', 'feature_key', 'enabled', 'config', 'updated_at']


class FeatureDefinitionViewSet(viewsets.ModelViewSet):
    queryset = FeatureDefinition.objects.all()
    serializer_class = FeatureDefinitionSerializer
    permission_classes = [permissions.IsAuthenticated, IsPlatformAdmin]


class FeaturePackageViewSet(viewsets.ModelViewSet):
    queryset = FeaturePackage.objects.all()
    serializer_class = FeaturePackageSerializer
    permission_classes = [permissions.IsAuthenticated, IsPlatformAdmin]


class OrganizationFeatureViewSet(viewsets.ModelViewSet):
    queryset = OrganizationFeature.objects.select_related('feature', 'organization')
    serializer_class = OrganizationFeatureSerializer
    permission_classes = [permissions.IsAuthenticated, IsPlatformAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        org_id = self.request.query_params.get('organization_id')
        return qs.filter(organization_id=org_id) if org_id else qs

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)


class MyFeaturesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        org = None
        org_id = request.query_params.get('organization_id')
        if org_id:
            org = Organization.objects.filter(pk=org_id).first()
            if org and not (request.user.is_superuser or tenancy.can_manage_org(request.user, org)):
                org = None
        if org is None:
            for candidate in Organization.objects.filter(
                id__in=tenancy.user_org_ids(request.user),
            ):
                org = candidate
                break
        return Response(features.payload(org))
