# backend/ticket_bookings/api/discount_api.py
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied

from ..models import Discount
from ..models_tenancy import Organization
from ..services.tenancy import (
    is_platform_admin,
    user_org_ids,
    visible_discounts,
    can_manage_org,
)
from .serializers import DiscountSerializer


class DiscountViewSet(viewsets.ModelViewSet):
    """
    Tenant-scoped discounts.

    Organization resolution is uniform across all tenant-scoped
    viewsets:
      1. Explicit `organization_id` → validate existence + permission.
      2. Omitted + exactly one managed org → that org.
      3. Omitted + zero managed orgs → 400.
      4. Omitted + more than one managed org → 400.
    """
    permission_classes = [IsAuthenticated]
    queryset = Discount.objects.all()
    serializer_class = DiscountSerializer

    def get_queryset(self):
        return visible_discounts(self.request.user)

    def _resolve_organization(self, user, raw_org_id):
        """Return (organization, error_response_or_None)."""
        # ---------- Explicit path ----------
        if raw_org_id not in (None, '', 'null'):
            try:
                organization = Organization.objects.get(id=raw_org_id)
            except (Organization.DoesNotExist, ValueError, TypeError):
                return None, PermissionDenied('Organization not found.')

            if not can_manage_org(user, organization):
                return None, PermissionDenied(
                    'You do not have permission to manage discounts in this organization.'
                )
            return organization, None

        # ---------- Omitted path ----------
        orgs = user_org_ids(user)

        if not orgs:
            return None, PermissionDenied(
                'You are not an organizer of any organization. '
                'Create an organization first.'
            )

        if len(orgs) == 1:
            return Organization.objects.get(id=orgs[0]), None

        return None, PermissionDenied(
            'You manage multiple organizations; '
            'organization_id is required.'
        )

    def perform_create(self, serializer):
        user = self.request.user

        raw_org_id = self.request.data.get('organization_id')
        organization, err = self._resolve_organization(user, raw_org_id)
        if err is not None:
            raise err

        # `organizer` is the legacy field on Discount; write it for
        # backward compatibility, but access control is `organization`.
        serializer.save(
            organization=organization,
            organizer=user if can_manage_org(user, organization) else organization.owner,
        )

    def perform_update(self, serializer):
        instance = self.get_object()
        user = self.request.user

        if not is_platform_admin(user):
            if not can_manage_org(user, instance.organization):
                raise PermissionDenied('You do not own this discount.')

        raw_org_id = self.request.data.get('organization_id')
        if raw_org_id and str(raw_org_id) != str(instance.organization_id):
            if not is_platform_admin(user):
                raise PermissionDenied(
                    'Only platform admins may move discounts between organizations.'
                )
            try:
                new_org = Organization.objects.get(id=raw_org_id)
            except (Organization.DoesNotExist, ValueError):
                raise PermissionDenied('Organization not found.')
            instance.organization = new_org

        serializer.save()