# backend/ticket_bookings/api/organization_api.py
"""
Organization (tenant) API.

Role rules (6-tier hierarchy):
  • Any authenticated user may create an org. A NON-superuser who
    creates an org becomes its OWNER immediately (self-service).
  • A PLATFORM SUPERUSER creating an org does NOT become its owner and
    does NOT receive an OrganizationMembership. The org is created in
    an "unowned" state (`owner=None`). A superuser assigns the tenant
    OWNER afterwards via `assign-owner` (or `transfer-ownership`).
    This keeps the Platform tier strictly above every tenant tier.
  • A Platform Admin may create an org on behalf of another user by
    passing `owner_id` — that user becomes the OWNER and receives the
    membership. The superuser still gets no membership.
  • OWNER can change member roles among ADMIN / STAFF / MEMBER, but
    CANNOT promote or demote directly to/from OWNER via
    `change_member_role`. Ownership moves ONLY through the atomic
    `transfer-ownership` (and `assign-owner`) endpoint.
  • The current OWNER (or a Platform Admin) may transfer ownership to
    any existing active member via `transfer-ownership`. The previous
    owner is demoted to ADMIN and retained in the org.
  • ADMIN can add/remove STAFF/MEMBER but cannot add/remove ADMIN or
    OWNER.
  • Only Platform Admin can delete an org.
"""
from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import SystemSettings
from ..models_tenancy import Organization, OrganizationMembership
from ..services.tenancy import (
    can_manage_org,
    is_platform_admin,
    is_platform_superuser,
    owns_org,
    visible_organizations,
)
from .serializers import OrganizationSerializer


class OrganizationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = OrganizationSerializer

    def get_queryset(self):
        return visible_organizations(self.request.user)

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------
    @transaction.atomic
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        """
        ✅ FIX [SUPERUSER-ORG-AGNOSTIC]: a superuser creating an org does
        NOT become its owner and does NOT receive a membership.

        Three distinct paths:

          1. Regular authenticated user creates an org for themselves
             → they become OWNER + get the membership.

          2. Superuser creates an org with `owner_id=<user>`
             → `<user>` becomes OWNER + gets the membership.
               Superuser gets NO membership.

          3. Superuser creates an org with no `owner_id`
             → org is created unowned (`owner=None`). No memberships
               at all. Superuser assigns an owner later via
               `assign-owner` once a tenant OWNER user exists.
        """
        requester = self.request.user
        requester_is_superuser = is_platform_superuser(requester)

        # ---- 1. Resolve owner ----
        owner_id = self.request.data.get('owner_id')
        explicit_owner_requested = bool(owner_id)

        if explicit_owner_requested:
            if not requester_is_superuser:
                raise PermissionDenied(
                    'Only a Platform Admin can assign a different owner.'
                )
            try:
                owner_user = User.objects.get(pk=owner_id)
            except (User.DoesNotExist, ValueError, TypeError):
                raise serializers.ValidationError(
                    {'owner_id': 'User not found.'}
                )
        elif requester_is_superuser:
            # ✅ FIX: superuser + no owner_id → unowned org.
            owner_user = None
        else:
            # Regular user self-service: they become owner.
            owner_user = requester

        # ---- 2. Seed regional defaults from SystemSettings ----
        platform = SystemSettings.get()
        seed = {
            'currency_code': platform.currency_code,
            'currency_symbol': platform.currency_symbol,
            'currency_locale': platform.currency_locale,
            'country': platform.country,
            'country_code': platform.country_code,
            'default_timezone': platform.default_timezone,
            'org_email': platform.org_email,
            'org_logo_url': platform.org_logo_url,
            'email_from_name': platform.email_from_name,
        }
        for key in list(seed.keys()):
            value = self.request.data.get(key)
            if value:
                seed.pop(key, None)

        org = serializer.save(owner=owner_user, **seed)

        # ---- 3. Membership rows ----
        #
        # ✅ FIX: only create a membership when there is a tenant OWNER.
        # A superuser NEVER receives an OrganizationMembership, even when
        # they created the org.
        if owner_user is not None:
            OrganizationMembership.objects.get_or_create(
                organization=org,
                user=owner_user,
                defaults={'role': OrganizationMembership.OrgRole.OWNER},
            )

        # ✅ The superuser who created the org gets NO membership row.
        # Their platform-level `is_superuser` already grants full access
        # via `visible_organizations` / `can_manage_org`, which whitelist
        # platform admins. Adding a membership row would make the
        # superuser indistinguishable from a tenant role and would
        # appear in `user.memberships[]`.

        return org

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------
    def perform_update(self, serializer):
        instance = self.get_object()
        if not can_manage_org(self.request.user, instance):
            raise PermissionDenied(
                'You do not have permission to edit this organization.'
            )
        serializer.save()

    # ------------------------------------------------------------------
    # Delete — Platform Admin only
    # ------------------------------------------------------------------
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if not is_platform_superuser(request.user):
            raise PermissionDenied(
                'Only the Platform Admin can delete organizations.'
            )
        return super().destroy(request, *args, **kwargs)

    # ------------------------------------------------------------------
    # Read helpers
    # ------------------------------------------------------------------
    @action(detail=False, methods=['get'])
    def mine(self, request):
        orgs = visible_organizations(request.user)
        data = OrganizationSerializer(
            orgs, many=True, context={'request': request},
        ).data
        for entry, org in zip(data, orgs):
            entry['can_manage'] = can_manage_org(request.user, org)
            entry['is_owner'] = owns_org(request.user, org)
        return Response(data, status=status.HTTP_200_OK)

    # ------------------------------------------------------------------
    # Members (List & Add)
    # ------------------------------------------------------------------
    @action(detail=True, methods=['get', 'post'], url_path='members')
    @transaction.atomic
    def members(self, request, pk=None):
        """
        GET: List all members of the organization.
        POST: Add an existing user directly to the organization.
        """
        org = self.get_object()
        if not can_manage_org(request.user, org):
            raise PermissionDenied(
                'You do not have permission to manage members of this organization.'
            )

        # ---------------------------------------------------------
        # GET: List Members
        # ---------------------------------------------------------
        if request.method == 'GET':
            qs = (
                OrganizationMembership.objects
                .filter(organization=org)
                .select_related('user', 'user__profile')
                .order_by('-joined_at')
            )

            data = []
            for m in qs:
                full_name = m.user.get_full_name().strip() or m.user.username
                item = {
                    'id': str(m.id),
                    'user_id': m.user_id,
                    'email': m.user.email,
                    'name': full_name,
                    'full_name': full_name,
                    'username': m.user.username,
                    'role': m.role,
                    'is_active': getattr(m, 'is_active', True),
                    'joined_at': m.joined_at.isoformat() if m.joined_at else None,
                }
                if getattr(m, 'valid_from', None):
                    item['valid_from'] = m.valid_from.isoformat()
                if getattr(m, 'valid_until', None):
                    item['valid_until'] = m.valid_until.isoformat()
                data.append(item)

            return Response(data, status=status.HTTP_200_OK)

        # ---------------------------------------------------------
        # POST: Add Member
        # ---------------------------------------------------------
        email = (request.data.get('email') or '').strip().lower()
        user_id = request.data.get('user_id')
        role = (request.data.get('role') or 'member').strip().lower()

        allowed_roles = {
            OrganizationMembership.OrgRole.STAFF,
            OrganizationMembership.OrgRole.MEMBER,
        }
        if owns_org(request.user, org) or is_platform_admin(request.user):
            allowed_roles.add(OrganizationMembership.OrgRole.ADMIN)

        if role not in allowed_roles:
            return Response(
                {'error': f'Invalid role for your permission level: {role!r}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_user = None
        if user_id:
            try:
                target_user = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                return Response(
                    {'error': 'User not found.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
        elif email:
            target_user = User.objects.filter(email__iexact=email).first()
            if target_user is None:
                return Response(
                    {'error': 'No user with that email. Ask them to register first.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            return Response(
                {'error': 'email or user_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        membership, created = OrganizationMembership.objects.get_or_create(
            organization=org,
            user=target_user,
            defaults={'role': role},
        )
        if not created:
            return Response(
                {
                    'error': 'User is already a member of this organization.',
                    'role': membership.role,
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response({
            'user_id': target_user.id,
            'username': target_user.username,
            'email': target_user.email,
            'role': membership.role,
        }, status=status.HTTP_201_CREATED)

    # ------------------------------------------------------------------
    # Member role change
    # ------------------------------------------------------------------
    @action(
        detail=True, methods=['patch'],
        url_path=r'members/(?P<user_id>[^/.]+)',
    )
    @transaction.atomic
    def change_member_role(self, request, pk=None, user_id=None):
        org = self.get_object()
        if not owns_org(request.user, org):
            raise PermissionDenied(
                'Only the organization OWNER can change member roles.'
            )

        try:
            membership = OrganizationMembership.objects.get(
                organization=org, user_id=user_id,
            )
        except OrganizationMembership.DoesNotExist:
            return Response(
                {'error': 'Membership not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        new_role = (request.data.get('role') or '').strip().lower()
        if new_role not in dict(OrganizationMembership.OrgRole.choices):
            return Response(
                {'error': f'Invalid role: {new_role!r}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            membership.role == OrganizationMembership.OrgRole.OWNER
            and new_role != OrganizationMembership.OrgRole.OWNER
        ):
            owner_count = OrganizationMembership.objects.filter(
                organization=org,
                role=OrganizationMembership.OrgRole.OWNER,
            ).count()
            if owner_count <= 1:
                return Response(
                    {
                        'error': (
                            'Cannot demote the last OWNER. '
                            'Use the transfer-ownership endpoint instead.'
                        )
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        if (
            new_role == OrganizationMembership.OrgRole.OWNER
            and membership.role != OrganizationMembership.OrgRole.OWNER
        ):
            return Response(
                {
                    'error': (
                        'Cannot promote a member to OWNER directly. '
                        'Use the transfer-ownership endpoint instead.'
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        membership.role = new_role
        membership.save(update_fields=['role'])

        return Response({
            'user_id': membership.user_id,
            'role': membership.role,
        }, status=status.HTTP_200_OK)

    # ------------------------------------------------------------------
    # Assign owner — superuser-only, for a freshly-created unowned org
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'], url_path='assign-owner')
    @transaction.atomic
    def assign_owner(self, request, pk=None):
        """
        ✅ NEW: Assign the first OWNER of an unowned organization.

        A superuser who creates an org does NOT become its owner. Once a
        tenant user exists who should own the org, the superuser calls:

            POST /api/organizations/<id>/assign-owner/
            {"new_owner_user_id": <user id>}

        Invariants enforced:
          • Caller must be a Platform Superuser.
          • The org must currently have NO owner (owner_id is null) and
            NO OWNER membership. To replace an existing owner, use
            `transfer-ownership` instead — that path demotes the
            previous owner rather than silently orphaning them.
          • The target user must exist, be active, and — for a brand
            new assignment — need not already be a member. This is the
            one path that promotes a non-member to OWNER, because the
            org has no members yet.
        """
        if not is_platform_superuser(request.user):
            raise PermissionDenied(
                'Only a Platform Admin can assign an organization owner.'
            )

        org = self.get_object()

        if org.owner_id is not None:
            return Response(
                {
                    'error': (
                        'This organization already has an owner. '
                        'Use transfer-ownership to change the owner.'
                    ),
                    'current_owner_id': org.owner_id,
                },
                status=status.HTTP_409_CONFLICT,
            )

        existing_owner_membership = (
            OrganizationMembership.objects
            .filter(organization=org, role=OrganizationMembership.OrgRole.OWNER)
            .exists()
        )
        if existing_owner_membership:
            return Response(
                {
                    'error': (
                        'This organization already has an OWNER membership. '
                        'Use transfer-ownership to change the owner.'
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        new_owner_user_id = request.data.get('new_owner_user_id')
        if not new_owner_user_id:
            raise serializers.ValidationError(
                {'new_owner_user_id': 'This field is required.'}
            )
        try:
            new_owner_user_id = int(new_owner_user_id)
        except (TypeError, ValueError):
            raise serializers.ValidationError(
                {'new_owner_user_id': 'Must be a valid user ID.'}
            )

        try:
            target_user = User.objects.select_for_update().get(pk=new_owner_user_id)
        except User.DoesNotExist:
            raise serializers.ValidationError(
                {'new_owner_user_id': 'User not found.'}
            )

        if not target_user.is_active:
            raise serializers.ValidationError(
                {'new_owner_user_id': 'User must be active.'}
            )

        # Guard: a superuser must NEVER be the OWNER of a tenant. The
        # whole point of this endpoint is to keep the Platform tier
        # strictly above the tenant tier.
        if is_platform_superuser(target_user):
            raise serializers.ValidationError(
                {
                    'new_owner_user_id': (
                        'A Platform Admin cannot be the owner of a tenant. '
                        'Assign a non-superuser to be the OWNER.'
                    )
                }
            )

        OrganizationMembership.objects.update_or_create(
            organization=org,
            user=target_user,
            defaults={
                'role': OrganizationMembership.OrgRole.OWNER,
                'is_active': True,
            },
        )

        org.owner_id = target_user.id
        org.save(update_fields=['owner', 'updated_at'])

        return Response(
            OrganizationSerializer(org, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )

    # ------------------------------------------------------------------
    # Transfer ownership — existing owner → another existing member
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'], url_path='transfer-ownership')
    @transaction.atomic
    def transfer_ownership(self, request, pk=None):
        """
        Transfer ownership of this organization to another existing member.

        ✅ FIX: this endpoint now also tolerates an unowned org when the
        caller is a Platform Superuser (equivalent to `assign-owner` but
        routed through the same atomic path). The difference is that
        `assign-owner` refuses to run if ANY owner exists; transfer-
        ownership will run if an owner exists and demote the previous
        one. If neither is true, both endpoints behave identically.
        """
        org = self.get_object()
        requester = request.user

        new_owner_user_id = request.data.get('new_owner_user_id')
        if not new_owner_user_id:
            raise serializers.ValidationError(
                {'new_owner_user_id': 'This field is required.'}
            )
        try:
            new_owner_user_id = int(new_owner_user_id)
        except (TypeError, ValueError):
            raise serializers.ValidationError(
                {'new_owner_user_id': 'Must be a valid user ID.'}
            )

        current_owner_membership = (
            OrganizationMembership.objects
            .select_for_update()
            .filter(
                organization=org,
                role=OrganizationMembership.OrgRole.OWNER,
            )
            .first()
        )

        requester_is_owner = bool(
            current_owner_membership
            and current_owner_membership.user_id == requester.id
        )

        if not (requester_is_owner or is_platform_admin(requester)):
            raise PermissionDenied(
                'Only the current OWNER or a Platform Admin can transfer ownership.'
            )

        if (
            current_owner_membership
            and current_owner_membership.user_id == new_owner_user_id
        ):
            raise serializers.ValidationError(
                {'new_owner_user_id': 'This user is already the organization owner.'}
            )

        target_membership = (
            OrganizationMembership.objects
            .select_for_update()
            .filter(organization=org, user_id=new_owner_user_id)
            .select_related('user')
            .first()
        )

        if not target_membership:
            raise serializers.ValidationError(
                {
                    'new_owner_user_id': (
                        'New owner must already be a member of this organization.'
                    )
                }
            )

        if not getattr(target_membership.user, 'is_active', True):
            raise serializers.ValidationError(
                {'new_owner_user_id': 'New owner must be an active user.'}
            )

        # ✅ FIX: enforce that a superuser never becomes a tenant OWNER
        # via this path either.
        if is_platform_superuser(target_membership.user):
            raise serializers.ValidationError(
                {
                    'new_owner_user_id': (
                        'A Platform Admin cannot be the owner of a tenant.'
                    )
                }
            )

        if (
            current_owner_membership
            and current_owner_membership.user_id != new_owner_user_id
        ):
            current_owner_membership.role = OrganizationMembership.OrgRole.ADMIN
            current_owner_membership.save(update_fields=['role'])

        target_membership.role = OrganizationMembership.OrgRole.OWNER
        target_membership.save(update_fields=['role'])

        org.owner_id = new_owner_user_id
        org.save(update_fields=['owner', 'updated_at'])

        serializer = self.get_serializer(org)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # ------------------------------------------------------------------
    # Remove member
    # ------------------------------------------------------------------
    @action(
        detail=True, methods=['delete'],
        url_path=r'members/(?P<user_id>[^/.]+)',
    )
    @transaction.atomic
    def remove_member(self, request, pk=None, user_id=None):
        org = self.get_object()
        if not can_manage_org(request.user, org):
            raise PermissionDenied(
                'You do not have permission to remove members from this organization.'
            )

        try:
            membership = OrganizationMembership.objects.get(
                organization=org, user_id=user_id,
            )
        except OrganizationMembership.DoesNotExist:
            return Response(
                {'error': 'Membership not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if membership.role == OrganizationMembership.OrgRole.OWNER:
            return Response(
                {'error': 'Cannot remove an OWNER. Transfer ownership first.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if (
            membership.role == OrganizationMembership.OrgRole.ADMIN
            and not owns_org(request.user, org)
            and not is_platform_admin(request.user)
        ):
            return Response(
                {'error': 'Only an OWNER can remove an Admin.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)