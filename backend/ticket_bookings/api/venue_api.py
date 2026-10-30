# backend/ticket_bookings/api/venue_api.py
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied

from ..models import Venue
from ..models_tenancy import Organization
from ..services.tenancy import (
    is_platform_admin,
    user_org_ids,
    visible_venues,
    can_manage_org,
)
from .serializers import VenueSerializer


class VenueViewSet(viewsets.ModelViewSet):
    """
    Tenant-scoped venues.

    Scoping:
      • Platform admin  → every venue in every org.
      • Org owner/admin → venues belonging to their org(s).
      • Org staff       → can operate (view) but not create/delete.
      • Everyone else   → nothing.

    Organization assignment:
      The client may send `organization_id` in the request body. If
      omitted, we infer the target org from the caller's single
      managed org. Users with multiple orgs MUST supply it explicitly;
      users with zero orgs get a "create an organization first" error.

      Platform admins who own exactly ONE org get the same frictionless
      path as organizers — a superadmin rarely manages multiple tenants
      in practice, so forcing an explicit pick on every create is
      needless friction.

    The `organization` field on `VenueSerializer` is READ-ONLY, so
    a client can never spoof the tenant by sending `organization`
    directly — only `organization_id` is honored, and only after
    the permission check in `_resolve_organization`.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = VenueSerializer

    def get_queryset(self):
        return visible_venues(self.request.user)

    # ------------------------------------------------------------------
    # Organization resolution
    # ------------------------------------------------------------------
    def _resolve_organization(self, user, raw_org_id):
        """
        Return (organization, error_response_or_None).

        Resolution order (consistent across all tenant-scoped viewsets):
          1. Explicit `organization_id` → validate existence + permission.
          2. Omitted + exactly one managed org → that org.
          3. Omitted + zero managed orgs → 400.
          4. Omitted + more than one managed org → 400.
        """
        # ---------- Explicit path ----------
        if raw_org_id not in (None, '', 'null'):
            try:
                organization = Organization.objects.get(id=raw_org_id)
            except (Organization.DoesNotExist, ValueError, TypeError):
                return None, PermissionDenied('Organization not found.')

            if not can_manage_org(user, organization):
                return None, PermissionDenied(
                    'You do not have permission to manage venues in this organization.'
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

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------
    def perform_create(self, serializer):
        raw_org_id = self.request.data.get('organization_id')
        organization, err = self._resolve_organization(
            self.request.user, raw_org_id,
        )
        if err is not None:
            raise err

        serializer.save(organization=organization)

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------
    def perform_update(self, serializer):
        instance = self.get_object()
        user = self.request.user

        # Non-platform-admins may only edit venues in an org they manage.
        if not is_platform_admin(user) and not can_manage_org(
            user, instance.organization,
        ):
            raise PermissionDenied('You do not own this venue.')

        # Platform admins may move a venue between organizations.
        raw_org_id = self.request.data.get('organization_id')
        if raw_org_id and str(raw_org_id) != str(instance.organization_id):
            if not is_platform_admin(user):
                raise PermissionDenied(
                    'Only platform admins may move venues between organizations.'
                )
            try:
                new_org = Organization.objects.get(id=raw_org_id)
            except (Organization.DoesNotExist, ValueError):
                raise PermissionDenied('Organization not found.')
            instance.organization = new_org
            instance.save(update_fields=['organization'])

        serializer.save()

    # ------------------------------------------------------------------
    # Destroy
    # ------------------------------------------------------------------
    def perform_destroy(self, instance):
        user = self.request.user
        if not is_platform_admin(user) and not can_manage_org(
            user, instance.organization,
        ):
            raise PermissionDenied('You do not own this venue.')
        instance.delete()