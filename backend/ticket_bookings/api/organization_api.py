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

DB invariant (single-live-OWNER constraint):
  There is a partial unique constraint (DB-level) enforcing at most
  one live OWNER membership per organization. Every mutation path in
  this module that touches OWNER role/`org.owner_id` must run inside
  a single transaction that never leaves two live OWNERs visible at
  a statement boundary. The `@transaction.atomic` decorators below
  plus the "demote-then-promote" ordering in `transfer_ownership`
  satisfy this. `select_for_update()` on the org row serialises
  concurrent ownership mutations.

Soft-delete model:
  Membership removal is a soft-delete (`removed_at` set, `is_active`
  False). Re-invitation reactivates the existing row so that
  `joined_at` is preserved (per the promise in `models_tenancy.py`).
  All OWNER-count invariants count only LIVE rows
  (`removed_at__isnull=True, is_active=True`).
"""
from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import SystemSettings
from ..models_tenancy import (
    Organization,
    OrganizationMembership,
    OrganizationMembershipEvent,
    log_membership_event,
    snapshot_membership,
)
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

    @transaction.atomic
    def perform_create(self, serializer):
        """
        Three paths:

        1. Regular authenticated user creates an org → they become OWNER
            (membership row), org has them as live owner.

        2. Superuser creates an org with ``owner_id`` → ``<user>`` becomes
            OWNER (membership row), superuser gets NO membership.

        3. Superuser creates an org without ``owner_id`` → unowned org;
            no membership row at all. Ownership assigned later via
            ``assign-owner``.

        IMPORTANT: ownership is stored ONLY on
        ``OrganizationMembership(role=OWNER)``. There is no writable
        ``Organization.owner`` FK on the model any more. Do not reintroduce
        a ``serializer.save(owner=...)`` kwarg — the serializer does not
        accept it (``owner`` is not in ``Meta.fields``) and the model does
        not have it as a settable attribute.
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
            if is_platform_superuser(owner_user):
                raise serializers.ValidationError(
                    {'owner_id': 'A Platform Admin cannot be the owner of a tenant.'}
                )
        elif requester_is_superuser:
            owner_user = None
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
            if self.request.data.get(key):
                seed.pop(key, None)

        # ---- 3. Create the org — NO ``owner=`` kwarg ----
        org = serializer.save(**seed)

        # ---- 4. Create the OWNER membership ----
        if owner_user is not None:
            OrganizationMembership.objects.get_or_create(
                organization=org,
                user=owner_user,
                defaults={
                    'role': OrganizationMembership.OrgRole.ADMIN,
                    'is_owner': True,
                    'is_active': True,
                    'removed_at': None,
                },
            )

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

        The POST path NEVER creates an OWNER — `allowed_roles` excludes
        OWNER unconditionally, so the single-live-OWNER DB constraint
        can never be tripped from here. Ownership is only ever created
        via `perform_create` / `assign_owner` / `transfer_ownership`.

        Soft-delete re-invitation:
          If the user was previously removed via soft-delete
          (`removed_at` set, `is_active=False`), the same row is
          reactivated in place — `joined_at` is preserved, and the
          caller sees the same success shape as a fresh add.
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
                    'is_owner': bool(m.is_owner),
                    'is_active': getattr(m, 'is_active', True),
                    'joined_at': m.joined_at.isoformat() if m.joined_at else None,
                }
                if getattr(m, 'removed_at', None):
                    item['removed_at'] = m.removed_at.isoformat()
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

        # ✅ OWNER is intentionally NOT in `allowed_roles` under any
        # permission level. Even a superuser cannot create an OWNER
        # membership through this endpoint; the single-live-OWNER DB
        # constraint is therefore unreachable from here.
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

        # ✅ FIX: reactivate soft-removed memberships instead of
        # returning 409. The whole point of `removed_at` is to allow
        # re-invitation while preserving `joined_at`.
        existing = (
            OrganizationMembership.objects
            .select_for_update()
            .filter(organization=org, user=target_user)
            .first()
        )

        if existing is not None and existing.removed_at is None and existing.is_active:
            return Response(
                {
                    'error': 'User is already a member of this organization.',
                    'role': existing.role,
                },
                status=status.HTTP_409_CONFLICT,
            )

        if existing is not None:
            # Reactivate the soft-removed row in place.
            before = snapshot_membership(existing)
            existing.role = role
            existing.is_owner = False
            existing.is_active = True
            existing.removed_at = None
            existing.save(
                update_fields=['role', 'is_owner', 'is_active', 'removed_at'],
            )
            membership = existing
            created = False

            log_membership_event(
                organization=org,
                membership=membership,
                user=membership.user,
                event_type=OrganizationMembershipEvent.EventType.ADDED,
                actor=request.user,
                before=before,
                after=snapshot_membership(membership),
            )
        else:
            membership = OrganizationMembership.objects.create(
                organization=org,
                user=target_user,
                role=role,
                is_active=True,
                removed_at=None,
            )
            created = True

            log_membership_event(
                organization=org,
                membership=membership,
                user=membership.user,
                event_type=OrganizationMembershipEvent.EventType.ADDED,
                actor=request.user,
                before=None,
                after=snapshot_membership(membership),
            )

        # Return the same shape regardless of created vs. reactivated.
        return Response({
            'user_id': target_user.id,
            'username': target_user.username,
            'email': target_user.email,
            'role': membership.role,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

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

        # Ownership is a property of an Admin membership. It can only
        # move through assign-owner / transfer-ownership.
        if membership.is_owner:
            return Response(
                {
                    'error': (
                        'This member is the organization owner. Use '
                        'transfer-ownership to change ownership first.'
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        if new_role == 'owner':
            return Response(
                {
                    'error': (
                        'Ownership is a property of an Admin member. '
                        'Use transfer-ownership instead.'
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        before = snapshot_membership(membership)
        membership.role = new_role
        membership.save(update_fields=['role'])

        log_membership_event(
            organization=org,
            membership=membership,
            user=membership.user,
            event_type=OrganizationMembershipEvent.EventType.ROLE_CHANGED,
            actor=request.user,
            before=before,
            after=snapshot_membership(membership),
        )

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
          • The target user must exist, be active, non-superuser, and —
            for a brand new assignment — need not already be a member.
            This is the one path that promotes a non-member to OWNER,
            because the org has no members yet.

        Concurrency:
          • `Organization.objects.select_for_update()` serialises two
            concurrent `assign-owner` calls on the same org, so the
            second one sees the first one's committed owner and returns
            409 instead of racing to create a second OWNER membership.
        """
        if not is_platform_superuser(request.user):
            raise PermissionDenied(
                'Only a Platform Admin can assign an organization owner.'
            )

        # ✅ Serialise concurrent ownership mutations on this org.
        org = (
            Organization.objects
            .select_for_update()
            .get(pk=self.get_object().pk)
        )

        # Defence-in-depth: the two checks below are equivalent given
        # the single-live-OWNER DB constraint, but we check both so the
        # error is informative if the invariant is ever violated by a
        # data migration.
        if OrganizationMembership.objects.filter(
            organization=org,
            is_owner=True,
            removed_at__isnull=True,
            is_active=True,
        ).exists():
            return Response(
                {'error': 'This organization already has an owner. Use transfer-ownership.'},
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

        prior = OrganizationMembership.objects.filter(
            organization=org, user=target_user,
        ).first()
        before = snapshot_membership(prior) if prior else None

        membership, created = OrganizationMembership.objects.update_or_create(
            organization=org,
            user=target_user,
            defaults={
                'role': OrganizationMembership.OrgRole.ADMIN,
                'is_owner': True,
                'is_active': True,
                'removed_at': None,
            },
        )

        log_membership_event(
            organization=org,
            membership=membership,
            user=membership.user,
            event_type=OrganizationMembershipEvent.EventType.OWNER_ASSIGNED,
            actor=request.user,
            before=None if created else snapshot_membership(membership),
            after=snapshot_membership(membership),
        )
        # No org.owner_id write — the membership row IS the ownership record.

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

        Permission matrix:
          • Org has a live OWNER membership → current OWNER or Platform
            Admin may transfer.
          • Org has NO live OWNER membership (unowned) → only a Platform
            Superuser may transfer (same rule as `assign-owner`).

        Concurrency / DB constraint:
          • `Organization.objects.select_for_update()` serialises
            concurrent ownership mutations on this org.
          • Within the locked transaction we demote the current OWNER
            to ADMIN *before* promoting the target to OWNER, so the
            single-live-OWNER DB constraint is never observed as
            violated at any statement boundary. The whole block is one
            atomic transaction — if either `save()` fails, both roll
            back together.

        Soft-delete awareness:
          • The current-owner lookup filters on live state
            (`removed_at__isnull=True, is_active=True`). A soft-removed
            OWNER row must not be treated as the current owner, and
            must not be demoted.
        """
        # ✅ Serialise concurrent ownership mutations on this org.
        org = (
            Organization.objects
            .select_for_update()
            .get(pk=self.get_object().pk)
        )
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

        # ✅ FIX: only LIVE OWNER rows count as the current owner.
        current_owner_membership = (
            OrganizationMembership.objects
            .select_for_update()
            .filter(
                organization=org,
                is_owner=True,
                removed_at__isnull=True,
                is_active=True,
            )
            .first()
        )

        if current_owner_membership is None:
            # Unowned org: only a Platform Superuser may assign the
            # first OWNER here, mirroring `assign_owner` semantics.
            # (Platform *Admin* without superuser cannot bootstrap a
            # tenant OWNER.)
            if not is_platform_superuser(requester):
                raise PermissionDenied(
                    'This organization has no owner yet. Only a Platform '
                    'Admin can assign the first owner.'
                )
        else:
            requester_is_owner = (
                current_owner_membership.user_id == requester.id
            )
            if not (requester_is_owner or is_platform_admin(requester)):
                raise PermissionDenied(
                    'Only the current OWNER or a Platform Admin can '
                    'transfer ownership.'
                )
            if current_owner_membership.user_id == new_owner_user_id:
                raise serializers.ValidationError(
                    {
                        'new_owner_user_id': (
                            'This user is already the organization owner.'
                        )
                    }
                )

        # ✅ FIX: the target must be a LIVE member. A soft-removed row
        # is not eligible to become OWNER without first being
        # reactivated (which goes through the `members` POST path).
        target_membership = (
            OrganizationMembership.objects
            .select_for_update()
            .filter(
                organization=org,
                user_id=new_owner_user_id,
                removed_at__isnull=True,
                is_active=True,
            )
            .select_related('user')
            .first()
        )

        if not target_membership:
            raise serializers.ValidationError(
                {
                    'new_owner_user_id': (
                        'New owner must already be an active member of this organization.'
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

        # ✅ Order matters: demote old OWNER → ADMIN *first*, then
        # promote the target to OWNER. At no statement boundary are
        # there two live OWNER rows, so the single-live-OWNER DB
        # constraint never fires mid-transaction.
        if (
            current_owner_membership
            and current_owner_membership.user_id != new_owner_user_id
        ):
            before_old = snapshot_membership(current_owner_membership)
            # Per product rule, the previous owner returns to a regular
            # member by default when ownership is transferred.
            current_owner_membership.role = OrganizationMembership.OrgRole.MEMBER
            current_owner_membership.is_owner = False
            current_owner_membership.save(
                update_fields=['role', 'is_owner'],
            )
            log_membership_event(
                organization=org,
                membership=current_owner_membership,
                user=current_owner_membership.user,
                event_type=OrganizationMembershipEvent.EventType.ROLE_CHANGED,
                actor=requester,
                before=before_old,
                after=snapshot_membership(current_owner_membership),
            )

        before_new = snapshot_membership(target_membership)
        # Ownership is a property; the owner must be an Admin member.
        target_membership.role = OrganizationMembership.OrgRole.ADMIN
        target_membership.is_owner = True
        target_membership.save(update_fields=['role', 'is_owner'])
        log_membership_event(
            organization=org,
            membership=target_membership,
            user=target_membership.user,
            event_type=OrganizationMembershipEvent.EventType.OWNER_TRANSFERRED,
            actor=requester,
            before=before_new,
            after=snapshot_membership(target_membership),
        )

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
        """
        Soft-remove a member.

        ✅ FIX: previously did a hard `membership.delete()`, which:
          • Broke the audit trail (no removal event was written).
          • Made re-invitation impossible without recreating the row,
            losing `joined_at` — contradicting the docstring in
            `models_tenancy.py` that promises to preserve `joined_at`
            on re-invitation.

        We now call `soft_remove()` (sets `removed_at` + `is_active=False`)
        and emit a `REMOVED` audit event. Re-invitation via
        `members` POST will reactivate this exact row.
        """
        org = self.get_object()
        if not can_manage_org(request.user, org):
            raise PermissionDenied(
                'You do not have permission to remove members from this organization.'
            )

        try:
            membership = OrganizationMembership.objects.get(
                organization=org,
                user_id=user_id,
                removed_at__isnull=True,
                is_active=True,
            )
        except OrganizationMembership.DoesNotExist:
            return Response(
                {'error': 'Active membership not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if membership.is_owner:
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

        # ✅ Soft-delete preserves the row (and `joined_at`) so the
        # user can be re-invited later without losing history.
        before = snapshot_membership(membership)
        membership.soft_remove()
        membership.save(update_fields=['removed_at', 'is_active'])

        log_membership_event(
            organization=org,
            membership=membership,
            user=membership.user,
            event_type=OrganizationMembershipEvent.EventType.REMOVED,
            actor=request.user,
            before=before,
            after=snapshot_membership(membership),
        )

        return Response(status=status.HTTP_204_NO_CONTENT)