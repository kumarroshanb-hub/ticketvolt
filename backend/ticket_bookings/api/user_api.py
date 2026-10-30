# backend/ticket_bookings/api/user_api.py
"""
User management — tenant-aware.

Role model (per matrix):
  • Platform Admin  = is_superuser=True  → every user, every org.
  • Tenant Admin    = is_staff=True AND manager of ≥1 org → users who
                      share an org, plus self; cannot see/edit
                      superusers or other tenant admins.
  • Org Owner/Admin = manager of ≥1 org, no is_staff → same visibility
                      as Tenant Admin minus the "create staff" bit.
  • Regular User    = only themselves.

The legacy `UserProfile.is_organizer` flag is retired. Tenant roles live
in `OrganizationMembership.role`. This file never writes `is_organizer`.

`update_role` is Platform-Admin-only. It handles the platform bit
(is_staff / is_superuser) and the "attach to an org" convenience. Moving
a user between orgs is done via the OrganizationMembership admin.
"""
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
from django.core.mail import send_mail
from django.conf import settings
from django.utils.html import strip_tags
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
)
from .serializers import (
    UserSerializer,
    UserProfileSerializer,
    UserRegistrationSerializer,
)
import logging

logger = logging.getLogger(__name__)


def _platform_country_default():
    try:
        return SystemSettings.get().country or 'India'
    except Exception:
        return 'India'


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

        # Helper: user IDs that are managers of ≥1 org.
        manager_user_ids = (
            OrganizationMembership.objects
            .filter(role__in=OrganizationMembership.MANAGER_ROLES)
            .values_list('user_id', flat=True)
            .distinct()
        )

        if role == 'organizer':
            # Organizer = manager membership, NOT is_staff.
            queryset = queryset.filter(id__in=list(manager_user_ids))

        elif role == 'admin':
            # FIX: Tenant Admin = is_staff=True, is_superuser=False AND a
            # manager of ≥1 org. Bare `is_staff=True` with no org is a
            # Regular User per the matrix.
            queryset = queryset.filter(
                is_staff=True, is_superuser=False,
            ).filter(id__in=list(manager_user_ids))

        elif role == 'super_admin':
            queryset = queryset.filter(is_superuser=True)

        elif role == 'user':
            # Regular user: neither is_staff nor a manager of any org.
            queryset = queryset.filter(
                is_staff=False, is_superuser=False,
            ).exclude(id__in=list(manager_user_ids))

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
            # Dead branch today (is_platform_admin == superuser). Kept in
            # case a future widening of platform-admin is intentional.
            return not target_user.is_superuser
        # Tenant path: cannot see/edit any platform-level staff.
        if target_user.is_staff or target_user.is_superuser:
            return False
        requester_orgs = set(user_org_ids(requester))
        if not requester_orgs:
            return False
        target_orgs = set(
            OrganizationMembership.objects
            .filter(user=target_user)
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
        # FIX: keep `profile.email` in sync when `user.email` changes —
        # the column is unique=True, so a mismatch between the two is a
        # latent bug (duplicate-email errors on create).
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

        # FIX: a user editing themselves must not be able to flip their
        # own `is_active` (that would let an admin lock themselves out,
        # and it is not in the matrix).
        if instance.id == request.user.id and 'is_active' in request.data:
            return Response(
                {'error': 'You cannot change your own active status.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # FIX (BUG 19 follow-up): PATCH can also deactivate a user via
        # `is_active`, bypassing toggle_active()'s guard. Enforce the
        # same "at least one active superuser" invariant here. Only the
        # active -> inactive transition on a superuser matters.
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

    def _coerce_bool(self, value):  # <-- Added 'self' here
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
        if not is_platform_admin(requester):
            raw_org_id = request.data.get('organization_id')
            requester_orgs = user_org_ids(requester)
            if raw_org_id:
                try:
                    target_org = Organization.objects.get(id=raw_org_id)
                except (Organization.DoesNotExist, ValueError):
                    return Response(
                        {'error': 'Organization not found.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if target_org.id not in requester_orgs:
                    return Response(
                        {'error': 'You do not have permission to create users in this organization.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                elif len(requester_orgs) == 1:
                    target_org = Organization.objects.get(id=requester_orgs[0])
                else:
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

        # ---- FIX: Validate role BEFORE creating the user ----
        # Previously the role check ran AFTER `serializer.save()`, so a
        # rejected role check left an orphaned user in the DB (a `return`
        # inside `with transaction.atomic()` does not roll back).
        requested_role = request.data.get('role', 'user')
        if requested_role not in ('user', 'organizer', 'admin', 'super_admin'):
            return Response(
                {'error': 'Invalid role. Must be: user, organizer, admin, super_admin'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if requested_role == 'super_admin' and not is_platform_superuser(requester):
            return Response(
                {'error': 'Only a super admin can create super admin users.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if requested_role == 'admin':
            # FIX: per matrix, creating an Admin requires Platform Admin.
            # Also require an org target so the "Admin" role is meaningful
            # (an Admin with no org is a Regular User).
            if not is_platform_admin(requester):
                return Response(
                    {'error': 'You do not have permission to create admins.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if target_org is None:
                return Response(
                    {'error': 'organization_id is required to create admins.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if requested_role == 'organizer':
            if target_org is None:
                return Response(
                    {'error': 'organization_id is required to create organizers.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not can_manage_org(requester, target_org):
                return Response(
                    {'error': 'You do not have permission to create organizers in this organization.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # ---- Build payload (inject organization_id so the serializer
        #       does not need to know about it) ----
        payload = (
            request.data.copy()
            if hasattr(request.data, 'copy')
            else dict(request.data)
        )

        serializer = UserRegistrationSerializer(data=payload)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            user = serializer.save()

            if requested_role == 'super_admin':
                user.is_staff = True
                user.is_superuser = True
                user.save(update_fields=['is_staff', 'is_superuser'])

            elif requested_role == 'admin':
                user.is_staff = True
                user.save(update_fields=['is_staff'])
                OrganizationMembership.objects.get_or_create(
                    organization=target_org,
                    user=user,
                    defaults={'role': OrganizationMembership.OrgRole.ADMIN},
                )

            elif requested_role == 'organizer':
                OrganizationMembership.objects.get_or_create(
                    organization=target_org,
                    user=user,
                    defaults={'role': OrganizationMembership.OrgRole.ORGANIZER},
                )

            else:  # 'user'
                if target_org is not None:
                    OrganizationMembership.objects.get_or_create(
                        organization=target_org,
                        user=user,
                        defaults={'role': OrganizationMembership.OrgRole.MEMBER},
                    )

            # FIX: apply is_active BEFORE the response, not after a
            # branch that could `return` first.
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
        serializer = UserRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            user = serializer.save()

            UserProfile.objects.get_or_create(
                user=user,
                defaults={
                    'email': user.email,
                    'phone': request.data.get('phone', ''),
                    'whatsapp_number': request.data.get('whatsapp_number', ''),
                    'address': request.data.get('address', ''),
                    'city': request.data.get('city', ''),
                    'state': request.data.get('state', ''),
                    'country': request.data.get('country') or _platform_country_default(),
                    'postal_code': request.data.get('postal_code', ''),
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

    # ------------------------------------------------------------------
    # Role update (Platform Admin only)
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'])
    def update_role(self, request, pk=None):
        target = self.get_object()
        requester = request.user

        if not is_platform_superuser(requester):
            return Response(
                {'error': 'Only super admin can update user roles'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # FIX: nobody — not even a superuser — may change their own
        # platform role via this endpoint. Promotion/demotion of self is
        # an administrative act that must go through a second superuser
        # or Django admin.
        if target.id == requester.id:
            return Response(
                {'error': 'You cannot change your own role.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = request.data.get('role')
        if role not in ('user', 'organizer', 'admin', 'super_admin'):
            return Response(
                {'error': 'Invalid role. Must be: user, organizer, admin, super_admin'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if role == 'admin':
            # FIX: an Admin must be a manager of at least one org. If
            # the caller did not supply an org, refuse — otherwise the
            # user is a "staff with no org" ghost per the matrix.
            raw_org_id = request.data.get('organization_id')
            if not raw_org_id:
                return Response(
                    {'error': 'organization_id is required to promote a user to admin.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                target_org = Organization.objects.get(id=raw_org_id)
            except (Organization.DoesNotExist, ValueError):
                return Response(
                    {'error': 'Organization not found.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if role == 'organizer':
            raw_org_id = request.data.get('organization_id')
            if not raw_org_id:
                return Response(
                    {'error': 'organization_id is required to promote to organizer.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                target_org = Organization.objects.get(id=raw_org_id)
            except (Organization.DoesNotExist, ValueError):
                return Response(
                    {'error': 'Organization not found.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # FIX (BUG 19): never allow the last active superuser to be
        # demoted out of the super_admin role. Mirrors the guard in
        # delete_user(). This MUST run before `with transaction.atomic():`
        # because the atomic block unconditionally clears both platform
        # bits on entry — and a `return` inside an atomic block does not
        # roll back the writes that already happened.
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
            # Always clear both platform bits first; then re-set based on role.
            target.is_staff = False
            target.is_superuser = False
            target.save(update_fields=['is_staff', 'is_superuser'])

            if role == 'admin':
                target.is_staff = True
                target.save(update_fields=['is_staff'])
                OrganizationMembership.objects.update_or_create(
                    organization=target_org,
                    user=target,
                    defaults={'role': OrganizationMembership.OrgRole.ADMIN},
                )

            elif role == 'super_admin':
                target.is_staff = True
                target.is_superuser = True
                target.save(update_fields=['is_staff', 'is_superuser'])

            elif role == 'organizer':
                OrganizationMembership.objects.update_or_create(
                    organization=target_org,
                    user=target,
                    defaults={'role': OrganizationMembership.OrgRole.ADMIN},
                )

            elif role == 'user':
                # Strip manager roles from every org the target belongs to.
                OrganizationMembership.objects.filter(
                    user=target,
                    role__in=OrganizationMembership.MANAGER_ROLES,
                ).update(role=OrganizationMembership.OrgRole.MEMBER)

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

        # FIX (BUG 19 follow-up): deactivating the last active superuser
        # produces the same lockout as demoting or deleting them. This
        # path never clears `is_superuser`, so it did not match BUG 19's
        # original scope — but the *outcome* is the same, and the invariant
        # "at least one active superuser always exists" should be enforced
        # at every mutation site rather than inferred from the fact that
        # authenticated users must be active. Guard is a no-op today given
        # that guarantee, and protects against future auth changes.
        #
        # Only fires on the deactivating transition (`is_active: True -> False`).
        # Reactivating a superuser is always safe.
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

        # FIX: only a superuser may reset a superuser's password, even on
        # self-service. A superuser resetting their own password is
        # allowed (is_self=True bypasses the target-superuser check).
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

        user = User.objects.filter(email__iexact=email).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)

            frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
            reset_link = f"{frontend_url}/reset-password/{uid}/{token}"

            subject = "Password Reset Request - TicketVolt"
            html_message = f"""
            <p>Hi {user.first_name or user.username},</p>
            <p>You requested a password reset. Click the link below to set a new password:</p>
            <p><a href="{reset_link}">Reset Password</a></p>
            <p>If you didn't request this, you can safely ignore this email.</p>
            <p>Thanks,<br>TicketVolt Team</p>
            """

            try:
                send_mail(
                    subject,
                    strip_tags(html_message),
                    settings.DEFAULT_FROM_EMAIL,
                    [user.email],
                    html_message=html_message,
                    fail_silently=False,
                )
                logger.info(f"Password reset email sent to {email}")
            except Exception as e:
                logger.error(f"Failed to send reset email to {email}: {str(e)}")
                return Response(
                    {'error': 'Failed to send email. Please try again later.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

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

        # FIX: "unlock" must NOT reactivate a user who was explicitly
        # deactivated. Reactivation is toggle_active's job. Only clear
        # Axes attempts here.
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

        # FIX: never allow the last superuser to be deleted.
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
        try:
            subject = f'Welcome to TicketVolt, {user.first_name or user.username}!'

            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; color: #333; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }}
                    .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                    .footer {{ text-align: center; margin-top: 20px; color: #888; font-size: 12px; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎫 Welcome to TicketVolt!</h1>
                    </div>
                    <div class="content">
                        <h2>Hi {user.first_name or user.username},</h2>
                        <p>Your account has been created successfully!</p>
                        <p><strong>Username:</strong> {user.username}</p>
                        <p><strong>Email:</strong> {user.email}</p>
                        <p>You can now log in to start managing your events and bookings.</p>
                        <p><a href="{settings.FRONTEND_URL}/login" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Login Now</a></p>
                    </div>
                    <div class="footer">
                        <p>TicketVolt - Your trusted event ticketing platform</p>
                    </div>
                </div>
            </body>
            </html>
            """

            send_mail(
                subject,
                strip_tags(html_content),
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
                html_message=html_content,
                fail_silently=False,
            )
            logger.info(f"Welcome email sent to {user.email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send welcome email: {str(e)}")
            return False