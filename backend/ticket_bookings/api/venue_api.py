# backend/ticket_bookings/api/venue_api.py
import logging
import uuid

from django.db import transaction
from django.db.models.deletion import ProtectedError
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Venue
from ..models_seating import SeatLayout
from ..models_tenancy import Organization
from ..services.seat_layout_parser import ingest_svg_layout
from ..services.tenancy import (
    is_platform_admin,
    user_org_ids,
    visible_venues,
    can_manage_org,
)
from ..services.venue_versioning import bump_venue_master, suppress_bumps
from .serializers import VenueSerializer

logger = logging.getLogger(__name__)


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

    # Venue create/edit may include the seat layout in the SAME request
    # so the venue record and its layout produce exactly one master
    # version (instead of "save venue" + "save layout" = two versions).
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = visible_venues(self.request.user)

        # Honour the active-organization filter sent by the UI. The
        # queryset is already permission-scoped, so narrowing it can
        # never widen access.
        organization_id = self.request.query_params.get('organization_id')
        if organization_id:
            try:
                uuid.UUID(str(organization_id))
            except (ValueError, TypeError, AttributeError):
                return qs.none()
            qs = qs.filter(organization_id=organization_id)

        return qs

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
                'You are not an owner or admin of any organization. '  # ✅ Updated for 6-tier
                'Create an organization first.'
            )

        if len(orgs) == 1:
            return Organization.objects.get(id=orgs[0]), None

        return None, PermissionDenied(
            'You manage multiple organizations; '
            'organization_id is required.'
        )

    # ------------------------------------------------------------------
    # Seat layout (optional, same request as the venue write)
    # ------------------------------------------------------------------
    def _apply_layout_payload(self, venue):
        """Persist an uploaded SVG as part of the venue write.

        Returns the parsed seat count, or None when no file was sent.
        The caller wraps this in `suppress_bumps()` so the venue signal,
        the layout signal, and the seat rows produce ONE master version.
        """
        svg_file = self.request.FILES.get('svg_file')
        logger.info(
            'Venue write: method=%s content_type=%s files=%s reserved=%s',
            self.request.method,
            self.request.content_type,
            list(self.request.FILES.keys()),
            getattr(venue, 'has_reserved_seating', None),
        )

        if not svg_file:
            # Never silently save a reserved-seating venue without a
            # layout. A venue may already have one (edit without
            # replacing it), but a missing layout + missing file is a
            # client/server mismatch we must surface.
            if venue.has_reserved_seating and not SeatLayout.objects.filter(
                venue=venue, seats__isnull=False,
            ).exists():
                raise ValidationError({
                    'svg_file': (
                        'The seat layout file was not received by the server. '
                        'Re-select the SVG and save again.'
                    )
                })
            return None

        if not venue.has_reserved_seating:
            raise ValidationError({
                'svg_file': (
                    'A seat layout can only be attached to a venue with '
                    'reserved seating enabled.'
                )
            })

        try:
            canvas_width = int(self.request.data.get('canvas_width') or 1000)
            canvas_height = int(self.request.data.get('canvas_height') or 800)
        except (TypeError, ValueError):
            raise ValidationError({
                'canvas_width': 'canvas_width and canvas_height must be integers.'
            })

        if canvas_width <= 0 or canvas_height <= 0:
            raise ValidationError({
                'canvas_width': 'canvas_width and canvas_height must be positive.'
            })

        layout, _created = SeatLayout.objects.update_or_create(
            venue=venue,
            defaults={
                'canvas_width': canvas_width,
                'canvas_height': canvas_height,
            },
        )
        try:
            return ingest_svg_layout(layout.id, svg_file)
        except ValueError as exc:
            raise ValidationError({'svg_file': str(exc)})

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------
    @transaction.atomic
    def perform_create(self, serializer):
        raw_org_id = self.request.data.get('organization_id')
        organization, err = self._resolve_organization(
            self.request.user, raw_org_id,
        )
        if err is not None:
            raise err

        with suppress_bumps():
            venue = serializer.save(organization=organization)
            self._apply_layout_payload(venue)

        # One explicit flush for the whole write. If the deferred signal
        # already wrote the identical snapshot this is a no-op.
        bump_venue_master(
            venue,
            actor=self.request.user,
            reason='venue_created',
        )

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------
    @transaction.atomic
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
        new_org = None
        if raw_org_id and str(raw_org_id) != str(instance.organization_id):
            if not is_platform_admin(user):
                raise PermissionDenied(
                    'Only platform admins may move venues between organizations.'
                )
            try:
                new_org = Organization.objects.get(id=raw_org_id)
            except (Organization.DoesNotExist, ValueError):
                raise PermissionDenied('Organization not found.')

        with suppress_bumps():
            if new_org is not None:
                instance.organization = new_org
            venue = serializer.save()
            self._apply_layout_payload(venue)

        bump_venue_master(
            venue,
            actor=user,
            reason='venue_updated',
        )

    # ------------------------------------------------------------------
    # Destroy
    # ------------------------------------------------------------------
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        user = request.user

        if not is_platform_admin(user) and not can_manage_org(
            user, instance.organization,
        ):
            raise PermissionDenied('You do not own this venue.')

        # Every Venue has at least one VenueMaster (created by the
        # post_save signal), and EventVenuePlan / VenueMaster use
        # PROTECT. A hard delete therefore always fails. Return a
        # domain 409 instead of a 500, and point at the safe action.
        try:
            instance.delete()
        except ProtectedError:
            return Response(
                {
                    'error': (
                        'This venue is referenced by an event or by '
                        'versioned venue masters and cannot be deleted. '
                        'Set is_active=false to archive it instead.'
                    ),
                    'code': 'VENUE_IN_USE',
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)