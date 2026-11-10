# backend/ticket_bookings/api/user_api.py
"""
User management — tenant-aware.

Role model (per matrix):
  • Platform Admin  = is_superuser=True  → every user, every org.
  • Platform Staff  = is_staff=True, is_superuser=False → Django-admin
                      access only; does NOT grant tenant scope.
  • Tenant Admin    = manager of ≥1 org, optionally is_staff=True.
                      Sees users who share an org, plus self; cannot
                      see/edit superusers.
  • Org Owner/Admin = manager of ≥1 org, is_staff=False → same visibility
                      as Tenant Admin minus the "create platform staff" bit.
  • Regular User    = only themselves.

The legacy `UserProfile.is_organizer` flag is retired. Tenant roles live
in `OrganizationMembership.role`. This file never writes `is_organizer`.

`update_role` is Platform-Admin-only. It handles the platform bit
(is_staff / is_superuser) and the "attach to an org" convenience. Moving
a user between orgs is done via the OrganizationMembership admin.

OWNERSHIP INVARIANT:
  Ownership (Organization.owner + OrganizationMembership(OWNER)) is written
  ONLY by the dedicated assign-owner / transfer-ownership endpoints. Neither
  `create` nor `update_role` may grant OWNER — they return 400 with a pointer
  to those endpoints. This keeps the canonical Organization.owner field and
  the OWNER membership in lock-step through a single write path.
"""
import secrets
import logging

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.conf import settings
from django.utils import timezone
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.contrib.auth.tokens import default_token_generator

from ..models import UserProfile, SystemSettings
from ..models_tenancy import Organization, OrganizationMembership
from ..services.tenancy import (
    is_platform_admin,
    is_platform_superuser,
    user_org_ids,
    can_manage_org,
    _active_membership_filter,   # ✅ FIX: validity-aware membership filter
)
from ..services import auth_emails
from .serializers import (
    UserSerializer,
    UserProfileSerializer,
    UserRegistrationSerializer,
)

logger = logging.getLogger(__name__)


def _platform_country_default():
    try:
        return SystemSettings.get().country or 'India'
    except Exception:
        return 'India'


def _active_membership_user_ids():
    """
    ✅ FIX: user IDs with at least one CURRENTLY VALID membership.

    Used by the `role=` filters so an expired membership does not keep a
    user categorised as `member` / `staff` / `owner`.
    """
    now = timezone.now()
    return (
        OrganizationMembership.objects
        .filter(is_active=True, valid_from__lte=now)
        .filter(Q(valid_until__isnull=True) | Q(valid_until__gte=now))
        .values_list('user_id', flat=True)
        .distinct()
    )


def _valid_role_user_ids(role):
    """Return a queryset of user IDs holding a valid membership of `role`."""
    now = timezone.now()
    return (
        OrganizationMembership.objects
        .filter(role=role, is_active=True, valid_from__lte=now)
        .filter(Q(valid_until__isnull=True) | Q(valid_until__gte=now))
        .values_list('user_id', flat=True)
        .distinct()
    )


class UserPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


class UserViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = User.objects.all()
    serializer_class = UserSerializer
    pagination_class = UserPagination

    PROFILE_PATCH_FIELDS = (
        'phone', 'whatsapp_number', 'address', 'city', 'state',
        'country', 'postal_code',
    )

    def get_serializer_class(self):
        if self.action in ('create', 'register'):
            return UserRegistrationSerializer
        return UserSerializer

    # ------------------------------------------------------------------
    # Queryset scoping
    # ------------------------------------------------------------------
    def get_queryset(self):
        user = self.request.user
        role = self.request.query_params.get('role', None)
        # `platform_role` filters on Django's is_staff / is_superuser flags,
        # independent of OrganizationMembership. This disambiguates the
        # historical overload where role='staff' meant *tenant* STAFF.
        platform_role = self.request.query_params.get('platform_role', None)
        is_active_param = self.request.query_params.get('is_active', None)
        search = self.request.query_params.get('search', None)
        organization_id = self.request.query_params.get('organization_id', None)

        if is_platform_superuser(user):
            queryset = User.objects.all()
        else:
            org_ids = user_org_ids(user)
            if org_ids:
                shared_user_ids = (
                    OrganizationMembership.objects
                    .filter(organization_id__in=org_ids)
                    .values_list('user_id', flat=True)
                    .distinct()
                )
                queryset = User.objects.filter(
                    Q(id__in=list(shared_user_ids)) | Q(id=user.id)
                ).exclude(is_superuser=True)
            else:
                queryset = User.objects.filter(id=user.id)

        queryset = queryset.select_related('profile')

        if is_active_param is not None:
            is_active_bool = str(is_active_param).lower() in ('true', '1', 'yes')
            queryset = queryset.filter(is_active=is_active_bool)

        if search:
            queryset = queryset.filter(
                Q(username__icontains=search) |
                Q(email__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search)
            )

        if organization_id:
            try:
                target_org = Organization.objects.get(id=organization_id)
            except (Organization.DoesNotExist, ValueError):
                return queryset.none()
            if not can_manage_org(user, target_org):
                return queryset.none()
            org_user_ids = (
                OrganizationMembership.objects
                .filter(organization=target_org)
                .values_list('user_id', flat=True)
            )
            queryset = queryset.filter(id__in=list(org_user_ids))

        # `role` is the TENANT-membership axis: owner / admin / staff / member /
        # organizer / user. (role='super_admin' is retained for backward compat
        # and is equivalent to platform_role=superuser.) Use `platform_role` for
        # the Django is_staff / is_superuser axis.
        #
        # ✅ FIX: all role filters now use validity-aware membership IDs,
        # so an expired membership does not keep a user in a role bucket.
        if role in ('organizer', 'owner'):
            # Owner/Organizer = valid OWNER membership (NOT is_staff).
            queryset = queryset.filter(
                id__in=list(_valid_role_user_ids(OrganizationMembership.OrgRole.ADMIN)),
            )

        elif role == 'admin':
            # Tenant Admin = is_staff=True, is_superuser=False AND a valid
            # ADMIN/OWNER membership.
            manager_ids = list(
                OrganizationMembership.objects
                .filter(
                    role__in=OrganizationMembership.MANAGER_ROLES,
                    is_active=True,
                    valid_from__lte=timezone.now(),
                )
                .filter(Q(valid_until__isnull=True) | Q(valid_until__gte=timezone.now()))
                .values_list('user_id', flat=True)
                .distinct()
            )
            queryset = queryset.filter(
                is_staff=True, is_superuser=False, id__in=manager_ids,
            )

        elif role == 'super_admin':
            # Backward-compat alias for platform_role=superuser.
            queryset = queryset.filter(is_superuser=True)

        elif role == 'staff':
            # ✅ FIX: valid STAFF membership only (TENANT staff).
            queryset = queryset.filter(
                id__in=list(_valid_role_user_ids(OrganizationMembership.OrgRole.STAFF)),
            )

        elif role == 'member':
            # ✅ FIX: valid MEMBER membership only.
            queryset = queryset.filter(
                id__in=list(_valid_role_user_ids(OrganizationMembership.OrgRole.MEMBER)),
            )

        elif role == 'user':
            # Regular user: neither is_staff nor a *valid* member of any org.
            queryset = queryset.filter(
                is_staff=False, is_superuser=False,
            ).exclude(id__in=list(_active_membership_user_ids()))

        # ---- Platform-bits axis (separate from tenant `role`) ----
        if platform_role == 'superuser':
            queryset = queryset.filter(is_superuser=True)
        elif platform_role == 'staff':
            # Platform Staff = is_staff=True AND NOT superuser (Django-admin only).
            queryset = queryset.filter(is_staff=True, is_superuser=False)
        elif platform_role == 'none':
            queryset = queryset.filter(is_staff=False, is_superuser=False)

        return queryset.order_by('-date_joined')

    # ------------------------------------------------------------------
    # Object-level permission check
    # ------------------------------------------------------------------
    def _can_view_or_edit_user(self, request, target_user):
        requester = request.user
        if requester.id == target_user.id:
            return True
        if is_platform_superuser(requester):
            return True
        if is_platform_admin(requester):
            return not target_user.is_superuser
        # Tenant path: cannot see/edit any platform-level staff.
        if target_user.is_staff or target_user.is_superuser:
            return False
        requester_orgs = set(user_org_ids(requester))
        if not requester_orgs:
            return False
        # ✅ FIX: only count *valid* target memberships.
        now = timezone.now()
        target_orgs = set(
            OrganizationMembership.objects
            .filter(
                user=target_user,
                is_active=True,
                valid_from__lte=now,
            )
            .filter(Q(valid_until__isnull=True) | Q(valid_until__gte=now))
            .values_list('organization_id', flat=True)
        )
        return bool(requester_orgs & target_orgs)

    def _persist_profile_fields(self, user, data):
        profile, _ = UserProfile.objects.get_or_create(
            user=user, defaults={'email': user.email},
        )
        changed = False
        for field in self.PROFILE_PATCH_FIELDS:
            if field in data:
                setattr(profile, field, data[field] or '')
                changed = True
        # Keep profile.email in sync when user.email changes.
        if 'email' in data:
            email_value = (data.get('email') or '').strip()
            if email_value and email_value != profile.email:
                profile.email = email_value
                changed = True
        if changed:
            profile.save()
        return profile

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()

        if not self._can_view_or_edit_user(request, instance):
            return Response(
                {'error': 'You do not have permission to edit this user.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # A user editing themselves must not be able to flip their own
        # `is_active` (that would let an admin lock themselves out).
        if instance.id == request.user.id and 'is_active' in request.data:
            return Response(
                {'error': 'You cannot change your own active status.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # PATCH can also deactivate a user via `is_active`; enforce the
        # "at least one active superuser" invariant here too.
        if (
            'is_active' in request.data
            and instance.is_superuser
            and instance.is_active
        ):
            requested_active = str(request.data['is_active']).strip().lower() in (
                'true', '1', 'yes',
            )
            if not requested_active:
                remaining_superusers = (
                    User.objects
                    .filter(is_superuser=True, is_active=True)
                    .exclude(id=instance.id)
                    .count()
                )
                if remaining_superusers == 0:
                    return Response(
                        {'error': 'Cannot deactivate the last super admin.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        serializer = self.get_serializer(
            instance, data=request.data, partial=partial,
        )
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            self.perform_update(serializer)
            self._persist_profile_fields(instance, request.data)

        if getattr(instance, '_prefetched_objects_cache', None):
            instance._prefetched_objects_cache = {}

        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def _coerce_bool(self, value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ('true', '1', 'yes', 'on')
        return bool(value)

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------
    def create(self, request, *args, **kwargs):
        requester = request.user
        if not (is_platform_admin(requester) or user_org_ids(requester)):
            return Response(
                {'error': 'You do not have permission to create users'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # ---- Resolve target org ----
        target_org = None
        raw_org_id = request.data.get('organization_id')

        if raw_org_id:
            try:
                target_org = Organization.objects.get(id=raw_org_id)
            except (Organization.DoesNotExist, ValueError):
                return Response(
                    {'error': 'Organization not found.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not is_platform_admin(requester):
                requester_orgs = user_org_ids(requester)
                if target_org.id not in requester_orgs:
                    return Response(
                        {'error': 'You do not have permission to create users in this organization.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )
        elif not is_platform_admin(requester):
            requester_orgs = user_org_ids(requester)
            if len(requester_orgs) == 1:
                target_org = Organization.objects.get(id=requester_orgs[0])
            elif len(requester_orgs) > 1:
                logger.warning(
                    "User creation blocked: requester=%s belongs to multiple orgs %s "
                    "and did not supply organization_id.",
                    requester.username, sorted(requester_orgs),
                )
                return Response(
                    {
                        'error': 'organization_required',
                        'detail': (
                            'You belong to multiple organizations. '
                            'Please choose which organization this user should belong to.'
                        ),
                        'code': 'MULTI_ORG_REQUIRED',
                        'organizations': list(
                            Organization.objects
                            .filter(id__in=requester_orgs)
                            .values('id', 'name')
                            .order_by('name')
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            else:
                return Response(
                    {'error': 'You do not belong to any organization and cannot create users.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # ---- Validate role BEFORE creating the user ----
        requested_role = request.data.get('role', 'user')
        # `platform_staff` is a distinct value from tenant `staff`.
        # NOTE: 'owner' is intentionally NOT a valid role for user creation —
        # ownership is granted only via assign-owner / transfer-ownership.
        valid_roles = (
            'user', 'member', 'staff', 'organizer',
            'admin', 'platform_staff', 'super_admin',
        )
        if requested_role not in valid_roles:
            return Response(
                {'error': f'Invalid role. Must be one of: {", ".join(valid_roles)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Ownership is never granted through user creation. The canonical
        # Organization.owner and the OWNER membership are written only by
        # the assign-owner / transfer-ownership endpoints.
        if requested_role == 'owner':
            return Response(
                {'error': 'Ownership is assigned via assign-owner / transfer-ownership.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if requested_role in ('super_admin', 'platform_staff') and not is_platform_superuser(requester):
            return Response(
                {'error': 'Only a super admin can create platform staff/super admins.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if requested_role == 'admin':
            if not is_platform_admin(requester):
                return Response(
                    {'error': 'You do not have permission to create admins.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if target_org is None and not is_platform_superuser(requester):
                return Response(
                    {'error': 'organization_id is required to create admins.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if requested_role == 'organizer':
            if target_org is None and not is_platform_superuser(requester):
                return Response(
                    {'error': 'organization_id is required to create organizers.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if target_org is not None and not can_manage_org(requester, target_org):
                return Response(
                    {'error': 'You do not have permission to create organizers in this organization.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        if requested_role in ('staff', 'member'):
            if target_org is None:
                return Response(
                    {'error': f'organization_id is required to create {requested_role}s.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not can_manage_org(requester, target_org):
                return Response(
                    {'error': f'You do not have permission to create {requested_role}s in this organization.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # ---- Build payload ----
        payload = (
            request.data.copy()
            if hasattr(request.data, 'copy')
            else dict(request.data)
        )

        # ✅ FIX: pass PLAINTEXT to the serializer; it hashes exactly once.
        # The old code passed `make_password(...)` which the serializer then
        # hashed AGAIN, producing a double-hashed unusable password.
        if not payload.get('password'):
            payload['password'] = secrets.token_urlsafe(32)
        if not payload.get('password_confirm'):
            payload['password_confirm'] = payload['password']

        serializer = UserRegistrationSerializer(data=payload)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            user = serializer.save()

            if requested_role == 'super_admin':
                user.is_staff = True
                user.is_superuser = True
                user.save(update_fields=['is_staff', 'is_superuser'])

            elif requested_role == 'platform_staff':
                # ✅ FIX: platform staff = is_staff only, no superuser.
                user.is_staff = True
                user.is_superuser = False
                user.save(update_fields=['is_staff', 'is_superuser'])
                if target_org is not None:
                    OrganizationMembership.objects.get_or_create(
                        organization=target_org,
                        user=user,
                        defaults={'role': OrganizationMembership.OrgRole.STAFF},
                    )

            elif requested_role == 'admin':
                user.is_staff = True
                user.save(update_fields=['is_staff'])
                if target_org is not None:
                    OrganizationMembership.objects.get_or_create(
                        organization=target_org,
                        user=user,
                        defaults={'role': OrganizationMembership.OrgRole.ADMIN},
                    )

            elif requested_role == 'organizer':
                # Retired alias — `organizer` maps to a tenant MEMBER-ish role
                # in the legacy UI; it is never OWNER. Ownership goes through
                # assign-owner / transfer-ownership only.
                if target_org is not None:
                    OrganizationMembership.objects.get_or_create(
                        organization=target_org,
                        user=user,
                        defaults={'role': OrganizationMembership.OrgRole.MEMBER},
                    )

            elif requested_role == 'staff':
                if target_org is not None:
                    OrganizationMembership.objects.get_or_create(
                        organization=target_org,
                        user=user,
                        defaults={'role': OrganizationMembership.OrgRole.STAFF},
                    )

            elif requested_role == 'member':
                if target_org is not None:
                    OrganizationMembership.objects.get_or_create(
                        organization=target_org,
                        user=user,
                        defaults={'role': OrganizationMembership.OrgRole.MEMBER},
                    )

            else:  # 'user'
                if target_org is not None:
                    OrganizationMembership.objects.get_or_create(
                        organization=target_org,
                        user=user,
                        defaults={'role': OrganizationMembership.OrgRole.MEMBER},
                    )

            if 'is_active' in request.data:
                user.is_active = self._coerce_bool(request.data['is_active'])
                user.save(update_fields=['is_active'])

            self._send_welcome_email(user)

        return Response({
            'success': True,
            'message': f'User {user.username} created successfully',
            'user': UserSerializer(user).data,
        }, status=status.HTTP_201_CREATED)

    # ------------------------------------------------------------------
    # Self-service registration
    # ------------------------------------------------------------------
    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def register(self, request):
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        # ✅ FIX: plaintext password; serializer hashes once.
        if not data.get('password'):
            data['password'] = secrets.token_urlsafe(32)
            data['password_confirm'] = data['password']

        serializer = UserRegistrationSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            user = serializer.save()

            UserProfile.objects.get_or_create(
                user=user,
                defaults={
                    'email': user.email,
                    'phone': data.get('phone', ''),
                    'whatsapp_number': data.get('whatsapp_number', ''),
                    'address': data.get('address', ''),
                    'city': data.get('city', ''),
                    'state': data.get('state', ''),
                    'country': data.get('country') or _platform_country_default(),
                    'postal_code': data.get('postal_code', ''),
                },
            )

            self._send_welcome_email(user)

        return Response({
            'success': True,
            'message': 'Registration successful! Please login.',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'role': 'user',
            },
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def update_role(self, request, pk=None):
        """
        Set a user's membership role within an organization, or set the
        user's platform bits.

        MEMBERSHIP-AS-PROPERTY MODEL:
        - `role` is NOT a column on User. It is a property of the
          user's OrganizationMembership in a specific org.
        - 'super_admin'    → is_staff=True, is_superuser=True
        - 'platform_staff' → is_staff=True, is_superuser=False
        - 'admin'          → is_staff=True + ADMIN membership in `organization_id`
        - 'staff'          → STAFF membership in `organization_id`
        - 'member'         → MEMBER membership in `organization_id`
        - 'user'           → strip all memberships

        'owner' is NOT accepted here. Ownership is written only by the
        assign-owner / transfer-ownership endpoints so that the canonical
        Organization.owner field and the OWNER membership stay in sync.

        Only a Platform Super Admin may call this.
        """
        target = self.get_object()
        requester = request.user

        if not is_platform_superuser(requester):
            return Response(
                {'error': 'Only super admin can update user roles'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if target.id == requester.id:
            return Response(
                {'error': 'You cannot change your own role.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = request.data.get('role')
        valid_roles = (
            'user', 'member', 'staff', 'admin',
            'platform_staff', 'super_admin',
        )
        if role not in valid_roles:
            return Response(
                {'error': f'Invalid role. Must be one of: {", ".join(valid_roles)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if role == 'owner':
            return Response(
                {'error': 'Ownership is assigned via assign-owner / transfer-ownership.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_org = None
        if role in ('admin', 'staff', 'member', 'platform_staff', 'user'):
            raw_org_id = request.data.get('organization_id')
            # `platform_staff` is a platform-wide flag; every other role
            # change is scoped to ONE organization.
            if role != 'platform_staff':
                if not raw_org_id:
                    return Response(
                        {'error': f'organization_id is required to set role {role}.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            if raw_org_id:
                try:
                    target_org = Organization.objects.get(id=raw_org_id)
                except (Organization.DoesNotExist, ValueError):
                    return Response(
                        {'error': 'Organization not found.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        # Ownership is never mutated here. Demoting the live OWNER through
        # a generic role endpoint would leave the org ownerless.
        if target_org is not None:
            is_live_owner = OrganizationMembership.objects.filter(
                organization=target_org,
                user=target,
                is_owner=True,
                removed_at__isnull=True,
                is_active=True,
            ).exists()
            if is_live_owner:
                return Response(
                    {
                        'error': (
                            'This user is the live OWNER of that organization. '
                            'Use transfer-ownership instead of update_role.'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Never allow the last active superuser to be demoted out of super_admin.
        if target.is_superuser and role != 'super_admin':
            remaining_superusers = (
                User.objects
                .filter(is_superuser=True, is_active=True)
                .exclude(id=target.id)
                .count()
            )
            if remaining_superusers == 0:
                return Response(
                    {'error': 'Cannot demote the last super admin.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with transaction.atomic():
            # Clear platform bits first; role determines what we re-set.
            target.is_staff = False
            target.is_superuser = False
            target.save(update_fields=['is_staff', 'is_superuser'])

            if role == 'super_admin':
                target.is_staff = True
                target.is_superuser = True
                target.save(update_fields=['is_staff', 'is_superuser'])

            elif role == 'platform_staff':
                # ✅ FIX: platform staff = is_staff only.
                target.is_staff = True
                target.is_superuser = False
                target.save(update_fields=['is_staff', 'is_superuser'])
                if target_org is not None:
                    OrganizationMembership.objects.update_or_create(
                        organization=target_org,
                        user=target,
                        defaults={'role': OrganizationMembership.OrgRole.STAFF},
                    )

            elif role == 'admin':
                # Tenant ADMIN is a membership role ONLY. Never set the
                # platform `is_staff` bit here — historically that
                # silently granted cross-tenant read access.
                OrganizationMembership.objects.update_or_create(
                    organization=target_org,
                    user=target,
                    defaults={
                        'role': OrganizationMembership.OrgRole.ADMIN,
                        'removed_at': None,
                        'is_active': True,
                    },
                )

            elif role == 'staff':
                OrganizationMembership.objects.update_or_create(
                    organization=target_org,
                    user=target,
                    defaults={
                        'role': OrganizationMembership.OrgRole.STAFF,
                        'removed_at': None,
                        'is_active': True,
                    },
                )

            elif role == 'member':
                OrganizationMembership.objects.update_or_create(
                    organization=target_org,
                    user=target,
                    defaults={
                        'role': OrganizationMembership.OrgRole.MEMBER,
                        'removed_at': None,
                        'is_active': True,
                    },
                )

            elif role == 'user':
                # Revoke this user's membership in the supplied org only.
                # Never delete their memberships in other tenants.
                OrganizationMembership.objects.filter(
                    organization=target_org,
                    user=target,
                ).delete()

        return Response({
            'success': True,
            'message': f'User role updated to {role}',
            'user': UserSerializer(target).data,
        })

    # ------------------------------------------------------------------
    # Toggle active
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        target = self.get_object()

        if not self._can_view_or_edit_user(request, target):
            return Response(
                {'error': 'You do not have permission to modify users'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if target.id == request.user.id:
            return Response(
                {'error': 'You cannot change your own active status.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target.is_superuser and not is_platform_superuser(request.user):
            return Response(
                {'error': 'Only super admin can modify super admin users'},
                status=status.HTTP_403_FORBIDDEN,
            )

        deactivating = target.is_active and target.is_superuser
        if deactivating:
            remaining_superusers = (
                User.objects
                .filter(is_superuser=True, is_active=True)
                .exclude(id=target.id)
                .count()
            )
            if remaining_superusers == 0:
                return Response(
                    {'error': 'Cannot deactivate the last super admin.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        target.is_active = not target.is_active
        target.save(update_fields=['is_active'])

        logger.info(
            "Toggled active for user=%s -> is_active=%s by=%s",
            target.username, target.is_active, request.user.username,
        )

        return Response({
            'success': True,
            'message': f'User {target.username} {"activated" if target.is_active else "deactivated"}',
            'user': UserSerializer(target).data,
        })

    # ------------------------------------------------------------------
    # Reset password
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'])
    def reset_password(self, request, pk=None):
        from axes.models import AccessAttempt

        target = self.get_object()
        requester = request.user

        is_self = requester.id == target.id
        if not is_self and not self._can_view_or_edit_user(request, target):
            return Response(
                {'error': 'You do not have permission to reset this password.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if target.is_superuser and not is_self and not is_platform_superuser(requester):
            return Response(
                {'error': 'Only a super admin can reset a super admin password.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        new_password = (request.data.get('password') or '').strip()
        if not new_password:
            return Response(
                {'error': 'A new password is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(new_password, user=target)
        except DjangoValidationError as exc:
            return Response(
                {'error': ' '.join(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target.set_password(new_password)
        target.save(update_fields=['password'])

        try:
            AccessAttempt.objects.filter(username=target.username).delete()
        except Exception:
            logger.exception(
                "Failed to clear Axes attempts for user=%s during password reset",
                target.username,
            )

        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                BlacklistedToken, OutstandingToken,
            )
            for outstanding in OutstandingToken.objects.filter(user=target):
                BlacklistedToken.objects.get_or_create(token=outstanding)
        except Exception:
            logger.warning(
                "Could not blacklist JWT tokens for user=%s after password reset",
                target.username,
            )

        logger.info(
            "🔑 Password reset for user=%s by=%s",
            target.username, requester.username,
        )

        return Response({
            'success': True,
            'message': f'Password reset for {target.username}.',
            'username': target.username,
        })

    # ------------------------------------------------------------------
    # Forgot / confirm password reset (public)
    # ------------------------------------------------------------------
    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def forgot_password(self, request):
        email = (request.data.get('email') or '').strip()
        if not email:
            return Response({'error': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)

            frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
            reset_link = f"{frontend_url}/reset-password/{uid}/{token}"

            result = auth_emails.send_password_reset_email(user, reset_link)
            if not result['success']:
                logger.error(f"Failed to send reset email to {email}: {result.get('error')}")
                return Response(
                    {'error': 'Failed to send email. Please try again later.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            logger.info(f"Password reset email sent to {email}")

        return Response(
            {'message': 'If an account exists with this email, a reset link has been sent.'},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def confirm_password_reset(self, request):
        uidb64 = request.data.get('uid')
        token = request.data.get('token')
        new_password = request.data.get('password')

        if not uidb64 or not token or not new_password:
            return Response(
                {'error': 'Missing required fields.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            user = None

        if user is None or not default_token_generator.check_token(user, token):
            return Response(
                {'error': 'Invalid or expired reset link. Please request a new one.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            return Response(
                {'error': ' '.join(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save()

        try:
            from axes.models import AccessAttempt
            AccessAttempt.objects.filter(username=user.username).delete()
        except Exception:
            pass

        logger.info(f"Password successfully reset via link for {user.username}")
        return Response({'message': 'Password has been reset successfully.'})

    # ------------------------------------------------------------------
    # Unlock
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'])
    def unlock(self, request, pk=None):
        from axes.models import AccessAttempt

        target = self.get_object()
        requester = request.user

        if not self._can_view_or_edit_user(request, target):
            return Response(
                {'error': 'You do not have permission to unlock users.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if target.is_superuser and not is_platform_superuser(requester):
            return Response(
                {'error': 'Only a super admin can unlock a super admin.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        deleted_attempts, _ = AccessAttempt.objects.filter(
            username=target.username,
        ).delete()

        logger.info(
            "Unlocked user=%s by=%s (attempts_deleted=%s)",
            target.username, requester.username, deleted_attempts,
        )

        return Response({
            'success': True,
            'message': f'{target.username} unlocked.',
            'username': target.username,
            'is_active': target.is_active,
            'attempts_cleared': deleted_attempts,
        })

    # ------------------------------------------------------------------
    # Lockout status (read-only)
    # ------------------------------------------------------------------
    @action(detail=True, methods=['get'])
    def lockout_status(self, request, pk=None):
        from axes.models import AccessAttempt

        target = self.get_object()
        if not self._can_view_or_edit_user(request, target):
            return Response(
                {'error': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        attempts_qs = AccessAttempt.objects.filter(username=target.username)
        attempt_count = attempts_qs.count()
        failures = list(attempts_qs.values_list('failures_since_start', flat=True))
        max_failures = max(failures) if failures else 0

        failure_limit = getattr(settings, 'AXES_FAILURE_LIMIT', 5)
        is_locked = max_failures >= failure_limit or (target.is_active is False)

        return Response({
            'username': target.username,
            'is_active': target.is_active,
            'is_locked': is_locked,
            'failures_since_start': max_failures,
            'failure_limit': failure_limit,
            'attempt_rows': attempt_count,
        })

    # ------------------------------------------------------------------
    # Profile (read + update)
    # ------------------------------------------------------------------
    @action(detail=True, methods=['get'])
    def profile(self, request, pk=None):
        user = self.get_object()
        if not self._can_view_or_edit_user(request, user):
            return Response(
                {'error': 'You do not have permission to view this profile.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        profile, _ = UserProfile.objects.get_or_create(
            user=user, defaults={'email': user.email},
        )
        return Response(UserProfileSerializer(profile).data)

    @action(detail=True, methods=['post'])
    def update_profile(self, request, pk=None):
        user = self.get_object()
        if not self._can_view_or_edit_user(request, user):
            return Response(
                {'error': 'You do not have permission to edit this profile.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        profile, _ = UserProfile.objects.get_or_create(
            user=user, defaults={'email': user.email},
        )
        data = request.data

        with transaction.atomic():
            if 'email' in data and data['email'] != user.email:
                new_email = (data.get('email') or '').strip()
                if User.objects.exclude(id=user.id).filter(email=new_email).exists():
                    return Response(
                        {'error': 'Email already in use'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                user.email = new_email
                user.save(update_fields=['email'])

            self._persist_profile_fields(user, data)

        return Response(UserProfileSerializer(profile).data)

    # ------------------------------------------------------------------
    # Delete (Platform Admin only)
    # ------------------------------------------------------------------
    @action(detail=True, methods=['delete'])
    def delete_user(self, request, pk=None):
        target = self.get_object()

        if not is_platform_superuser(request.user):
            return Response(
                {'error': 'Only super admin can delete users'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if target.id == request.user.id:
            return Response(
                {'error': 'You cannot delete your own account'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target.is_superuser:
            remaining_superusers = (
                User.objects
                .filter(is_superuser=True, is_active=True)
                .exclude(id=target.id)
                .count()
            )
            if remaining_superusers == 0:
                return Response(
                    {'error': 'Cannot delete the last super admin account.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        username = target.username
        target.delete()

        return Response({
            'success': True,
            'message': f'User {username} deleted successfully',
        }, status=status.HTTP_200_OK)

    # ------------------------------------------------------------------
    # Welcome email
    # ------------------------------------------------------------------
    def _send_welcome_email(self, user):
        """Delegates to the centralized auth_emails service."""
        result = auth_emails.send_welcome_email(user)
        if not result['success']:
            logger.warning(
                '⚠️ Welcome email failed for %s: %s',
                user.email, result.get('error')
            )
        return result['success']