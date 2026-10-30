# backend/ticket_bookings/api/organization_api.py
"""
Organization (tenant) API.

Role rules:
  • Any authenticated user may create an org and becomes OWNER.
  • A Platform Admin may create an org on behalf of another user by
    passing `owner_id` — that user becomes the OWNER instead.
  • OWNER can change member roles (but NOT demote the final OWNER,
    and NOT promote anyone to OWNER — only Platform Admin does that).
  • ADMIN can add/remove STAFF/MEMBER/CUSTOMER members but cannot
    add/remove ADMIN or OWNER.
  • Only Platform Admin can delete an org.

Regional defaults (currency, country, timezone, branding) are seeded
from SystemSettings on create, so a new tenant starts with the
platform-configured display config. Any field explicitly supplied by
the caller overrides the seed.
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
    # Create — with optional owner_id (Platform Admin only)
    # ------------------------------------------------------------------
    @transaction.atomic
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)
    
    def perform_create(self, serializer):
        requester = self.request.user

        # ---- 1. Resolve owner ----
        owner_id = self.request.data.get('owner_id')
        if owner_id:
            if not is_platform_admin(requester):
                raise PermissionDenied(
                    'Only a Platform Admin can assign a different owner.'
                )
            try:
                owner_user = User.objects.get(pk=owner_id)
            except (User.DoesNotExist, ValueError, TypeError):
                raise serializers.ValidationError(
                    {'owner_id': 'User not found.'}
                )
        else:
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
        OrganizationMembership.objects.get_or_create(
            organization=org,
            user=owner_user,
            defaults={'role': OrganizationMembership.OrgRole.OWNER},
        )
        # The Platform Admin who created the org on behalf of someone
        # else retains ADMIN so they can continue to operate it.
        if requester != owner_user:
            OrganizationMembership.objects.get_or_create(
                organization=org,
                user=requester,
                defaults={'role': OrganizationMembership.OrgRole.ADMIN},
            )

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

    @action(detail=True, methods=['get'])
    def members(self, request, pk=None):
        org = self.get_object()
        if not can_manage_org(request.user, org):
            raise PermissionDenied(
                'You do not have permission to list members of this organization.'
            )
        qs = (
            OrganizationMembership.objects
            .filter(organization=org)
            .select_related('user')
            .order_by('-joined_at')
        )
        return Response([
            {
                'user_id': m.user_id,
                'username': m.user.username,
                'email': m.user.email,
                'full_name': f'{m.user.first_name} {m.user.last_name}'.strip(),
                'role': m.role,
                'joined_at': m.joined_at.isoformat(),
            }
            for m in qs
        ], status=status.HTTP_200_OK)

    # ------------------------------------------------------------------
    # Members
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'], url_path='members')
    @transaction.atomic
    def add_member(self, request, pk=None):
        org = self.get_object()
        if not can_manage_org(request.user, org):
            raise PermissionDenied(
                'You do not have permission to add members to this organization.'
            )

        email = (request.data.get('email') or '').strip().lower()
        user_id = request.data.get('user_id')
        role = (request.data.get('role') or 'member').strip().lower()

        allowed_roles = {
            OrganizationMembership.OrgRole.STAFF,
            OrganizationMembership.OrgRole.MEMBER,
            OrganizationMembership.OrgRole.CUSTOMER,
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
                            'Promote another member to OWNER first.'
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
                        'Only a Platform Admin can promote a member to OWNER. '
                        'Contact the platform administrator.'
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
                {'error': 'Cannot remove an OWNER. Demote first via role change.'},
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