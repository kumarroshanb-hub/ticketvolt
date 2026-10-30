# backend/ticket_bookings/api/cancellation_policy_api.py
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from ..models import CancellationPolicy
from ..models_tenancy import Organization
from ..services.tenancy import (
    is_platform_admin,
    user_org_ids,
    visible_cancellation_policies,
    can_manage_org,
)
from .serializers import CancellationPolicySerializer
from ..services.cancellation_policy import validate_cancellation_rules


class CancellationPolicyViewSet(viewsets.ModelViewSet):
    """
    CRUD for organization-owned cancellation policies.

    Permissions:
      • Platform admin:   everything.
      • Org owner/admin:  their own organization's policies only.

    The policy `rules` JSON is validated on write by the serializer
    (via validate_cancellation_rules) so an invalid policy can never
    be saved.
    """
    serializer_class = CancellationPolicySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return visible_cancellation_policies(self.request.user)

    def _resolve_organization(self, user, raw_org_id):
        if raw_org_id in (None, '', 'null'):
            if is_platform_admin(user):
                return None, PermissionDenied(
                    'organization_id is required for platform admins.'
                )
            orgs = user_org_ids(user)
            if not orgs:
                return None, PermissionDenied(
                    'You are not an organizer of any organization.'
                )
            if len(orgs) > 1:
                return None, PermissionDenied(
                    'You belong to multiple organizations; '
                    'organization_id is required.'
                )
            return Organization.objects.get(id=orgs[0]), None

        try:
            organization = Organization.objects.get(id=raw_org_id)
        except (Organization.DoesNotExist, ValueError, TypeError):
            return None, PermissionDenied('Organization not found.')

        if not can_manage_org(user, organization):
            return None, PermissionDenied(
                'You do not have permission to manage policies in this organization.'
            )

        return organization, None

    def perform_create(self, serializer):
        user = self.request.user
        raw_org_id = self.request.data.get('organization_id')
        organization, err = self._resolve_organization(user, raw_org_id)
        if err is not None:
            raise err

        # `organizer` is the legacy field; `organization` is the new
        # source of truth for access control.
        serializer.save(
            organization=organization,
            organizer=user if can_manage_org(user, organization) else organization.owner,
        )

    def perform_update(self, serializer):
        instance = self.get_object()
        user = self.request.user

        if not is_platform_admin(user):
            if not can_manage_org(user, instance.organization):
                raise PermissionDenied('You do not own this policy.')

        raw_org_id = self.request.data.get('organization_id')
        if raw_org_id and str(raw_org_id) != str(instance.organization_id):
            if not is_platform_admin(user):
                raise PermissionDenied(
                    'Only platform admins may move policies between organizations.'
                )
            try:
                new_org = Organization.objects.get(id=raw_org_id)
            except (Organization.DoesNotExist, ValueError):
                raise PermissionDenied('Organization not found.')
            instance.organization = new_org

        serializer.save()