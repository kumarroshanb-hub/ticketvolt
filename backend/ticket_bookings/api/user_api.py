# backend/ticket_bookings/api/user_api.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.core.mail import send_mail
from django.conf import settings
from django.utils.html import strip_tags
from ..models import UserProfile
from .serializers import UserSerializer, UserProfileSerializer, UserRegistrationSerializer
import logging
import re

logger = logging.getLogger(__name__)


class UserViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing users
    - Super Admin: Full access
    - Admin: Can view and create users, but not promote to super admin
    - Organizer/User: Can only view themselves
    """
    permission_classes = [IsAuthenticated]
    queryset = User.objects.all()
    serializer_class = UserSerializer

    def get_serializer_class(self):
        if self.action == 'create' or self.action == 'register':
            return UserRegistrationSerializer
        return UserSerializer

    def get_queryset(self):
        user = self.request.user
        role = self.request.query_params.get('role', None)
        is_active_param = self.request.query_params.get('is_active', None)
        search = self.request.query_params.get('search', None)

        # Base queryset based on caller's role
        if user.is_superuser:
            queryset = User.objects.all()
        elif user.is_staff:
            queryset = User.objects.exclude(is_superuser=True)
        else:
            queryset = User.objects.filter(id=user.id)

        # ✅ Prefetch profile so the serializer doesn't N+1 on user.profile
        queryset = queryset.select_related('profile')

        # ✅ Handle is_active filter (frontend sends 'active' / 'inactive')
        if is_active_param is not None:
            is_active_bool = str(is_active_param).lower() in ('true', '1', 'yes')
            queryset = queryset.filter(is_active=is_active_bool)

        # ✅ Handle search filter across username / email / name
        if search:
            queryset = queryset.filter(
                Q(username__icontains=search) |
                Q(email__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search)
            )

        # Role filter
        if role == 'organizer':
            queryset = queryset.filter(
                Q(profile__is_organizer=True) |
                Q(is_organizer=True)
            )
        elif role == 'admin':
            queryset = queryset.filter(is_staff=True, is_superuser=False)
        elif role == 'super_admin':
            queryset = queryset.filter(is_superuser=True)
        elif role == 'user':
            queryset = queryset.filter(is_staff=False, is_superuser=False)

        return queryset.order_by('-date_joined')

    # ✅ FIX [P1]: shared "can the caller touch this user?" guard.
    # Admins/superadmins may act on anyone (with the superadmin exception
    # already enforced elsewhere). Everyone else may only act on themselves.
    # This is used by `profile`, `update_profile`, and any future
    # self-scoped detail action.
    def _can_view_or_edit_user(self, request, target_user):
        requester = request.user
        if requester.is_staff or requester.is_superuser:
            return True
        return requester.id == target_user.id

    def create(self, request, *args, **kwargs):
        """
        Create a new user (Admin/Super Admin only)
        """
        if not request.user.is_staff and not request.user.is_superuser:
            return Response(
                {'error': 'You do not have permission to create users'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            with transaction.atomic():
                user = serializer.save()

                # Set role based on request
                role = request.data.get('role', 'user')
                if role == 'admin' and request.user.is_superuser:
                    user.is_staff = True
                    user.save()
                elif role == 'super_admin' and request.user.is_superuser:
                    user.is_staff = True
                    user.is_superuser = True
                    user.save()
                elif role == 'organizer':
                    profile, created = UserProfile.objects.get_or_create(
                        user=user,
                        defaults={
                            'email': user.email,
                            'phone': request.data.get('phone', ''),
                            'whatsapp_number': request.data.get('whatsapp_number', ''),
                            'address': request.data.get('address', ''),
                            'city': request.data.get('city', ''),
                            'state': request.data.get('state', ''),
                            'country': request.data.get('country', 'India'),
                            'postal_code': request.data.get('postal_code', ''),
                        },
                    )
                    profile.is_organizer = True
                    profile.save()

                # Allow `is_active` to be set on creation
                if 'is_active' in request.data:
                    user.is_active = bool(request.data['is_active'])
                    user.save(update_fields=['is_active'])

                self._send_welcome_email(user)

                return Response({
                    'success': True,
                    'message': f'User {user.username} created successfully',
                    'user': UserSerializer(user).data
                }, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def register(self, request):
        """
        Public registration for regular users
        """
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
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
                        'country': request.data.get('country', 'India'),
                        'postal_code': request.data.get('postal_code', ''),
                        'is_organizer': False,
                    }
                )

                self._send_welcome_email(user)

                return Response({
                    'success': True,
                    'message': 'Registration successful! Please login.',
                    'user': {
                        'id': user.id,
                        'username': user.username,
                        'email': user.email,
                        'role': 'user'
                    }
                }, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def update_role(self, request, pk=None):
        """
        Update user role (Super Admin only)
        """
        user = self.get_object()

        if not request.user.is_superuser:
            return Response(
                {'error': 'Only super admin can update user roles'},
                status=status.HTTP_403_FORBIDDEN
            )

        role = request.data.get('role')
        if role not in ['user', 'organizer', 'admin', 'super_admin']:
            return Response(
                {'error': 'Invalid role. Must be: user, organizer, admin, super_admin'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            user.is_staff = False
            user.is_superuser = False
            user.save()

            if role == 'admin':
                user.is_staff = True
                user.save()
            elif role == 'super_admin':
                user.is_staff = True
                user.is_superuser = True
                user.save()
            elif role == 'organizer':
                profile, created = UserProfile.objects.get_or_create(
                    user=user,
                    defaults={
                        'email': user.email,
                        'phone': request.data.get('phone', ''),
                        'whatsapp_number': request.data.get('whatsapp_number', ''),
                    }
                )
                profile.is_organizer = True
                profile.save()
            elif role == 'user':
                if hasattr(user, 'profile'):
                    user.profile.is_organizer = False
                    user.profile.save()

        return Response({
            'success': True,
            'message': f'User role updated to {role}',
            'user': UserSerializer(user).data
        })

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        """
        Toggle user active status (Admin+ only)
        """
        user = self.get_object()

        if not request.user.is_staff and not request.user.is_superuser:
            return Response(
                {'error': 'You do not have permission to modify users'},
                status=status.HTTP_403_FORBIDDEN
            )

        if user.is_superuser and not request.user.is_superuser:
            return Response(
                {'error': 'Only super admin can modify super admin users'},
                status=status.HTTP_403_FORBIDDEN
            )

        user.is_active = not user.is_active
        user.save()

        return Response({
            'success': True,
            'message': f'User {user.username} {"activated" if user.is_active else "deactivated"}',
            'user': UserSerializer(user).data
        })

    # ============================================================
    # ✅ ENHANCEMENT: reset_password
    # ------------------------------------------------------------
    # Admin/superadmin may set a new password for any user. A user
    # may reset their own password. Password is validated against
    # Django's AUTH_PASSWORD_VALIDATORS. All of the target user's
    # outstanding JWT sessions are blacklisted so old tokens can't
    # survive a forced password change.
    #
    # The target user's Axes lockout is also cleared on reset — the
    # whole point of an admin reset is to get a locked-out user back
    # in. (The dedicated `unlock` action does the same thing, but
    # doing it here too avoids the admin having to click twice.)
    # ============================================================
    @action(detail=True, methods=['post'])
    def reset_password(self, request, pk=None):
        from axes.models import AccessAttempt

        target = self.get_object()
        requester = request.user

        is_self = requester.id == target.id
        is_admin = requester.is_staff or requester.is_superuser

        if not is_self and not is_admin:
            return Response(
                {'error': 'You do not have permission to reset this password.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Admin (non-super) may not touch a superuser.
        if (
            not requester.is_superuser
            and target.is_superuser
            and not is_self
        ):
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

        # Rotating a password lifts any Axes lockout for this user.
        try:
            AccessAttempt.objects.filter(username=target.username).delete()
        except Exception:
            logger.exception(
                "Failed to clear Axes attempts for user=%s during password reset",
                target.username,
            )

        # Blacklist outstanding tokens so old sessions can't survive.
        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                BlacklistedToken, OutstandingToken,
            )
            for outstanding in OutstandingToken.objects.filter(user=target):
                BlacklistedToken.objects.get_or_create(token=outstanding)
        except Exception:
            # Token blacklist app may not be installed; never fail the
            # reset because of it.
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

    # ============================================================
    # ✅ ENHANCEMENT: unlock
    # ------------------------------------------------------------
    # Clears the Axes lockout for the target user AND reactivates
    # the account if it was deactivated. Both are usually needed
    # after the user is locked out of login.
    # ============================================================
    @action(detail=True, methods=['post'])
    def unlock(self, request, pk=None):
        from axes.models import AccessAttempt

        target = self.get_object()
        requester = request.user

        if not (requester.is_staff or requester.is_superuser):
            return Response(
                {'error': 'You do not have permission to unlock users.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if target.is_superuser and not requester.is_superuser:
            return Response(
                {'error': 'Only a super admin can unlock a super admin.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # 1. Lift the Axes lock for this username (across all IPs).
        deleted_attempts, _ = AccessAttempt.objects.filter(
            username=target.username,
        ).delete()

        # 2. Reactivate the account if it was off.
        was_inactive = not target.is_active
        if was_inactive:
            target.is_active = True
            target.save(update_fields=['is_active'])

        logger.info(
            "🔓 Unlocked user=%s by=%s (attempts_deleted=%s, reactivated=%s)",
            target.username, requester.username,
            deleted_attempts, was_inactive,
        )

        return Response({
            'success': True,
            'message': f'{target.username} unlocked.',
            'username': target.username,
            'is_active': target.is_active,
            'attempts_cleared': deleted_attempts,
            'was_reactivated': was_inactive,
        })

    # ============================================================
    # ✅ ENHANCEMENT: lockout_status (read-only)
    # ------------------------------------------------------------
    # Returns whether the target user is currently locked out by
    # Axes, plus the number of failures on record. Used by the
    # Users page to decide when to show the "Unlock" button.
    # ============================================================
    @action(detail=True, methods=['get'])
    def lockout_status(self, request, pk=None):
        from axes.models import AccessAttempt

        target = self.get_object()
        requester = request.user

        if not (requester.is_staff or requester.is_superuser):
            return Response(
                {'error': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        attempts_qs = AccessAttempt.objects.filter(username=target.username)
        attempt_count = attempts_qs.count()
        failures = list(
            attempts_qs.values_list('failures_since_start', flat=True)
        )
        max_failures = max(failures) if failures else 0

        failure_limit = getattr(settings, 'AXES_FAILURE_LIMIT', 5)
        is_locked = max_failures >= failure_limit or (
            target.is_active is False
        )

        return Response({
            'username': target.username,
            'is_active': target.is_active,
            'is_locked': is_locked,
            'failures_since_start': max_failures,
            'failure_limit': failure_limit,
            'attempt_rows': attempt_count,
        })

    @action(detail=True, methods=['get'])
    def profile(self, request, pk=None):
        # ✅ FIX [P1]: a non-staff caller must only be able to read their
        # own profile. Without this check any authenticated user could
        # GET /api/users/<someone-elses-id>/profile/ and harvest PII.
        user = self.get_object()

        if not self._can_view_or_edit_user(request, user):
            return Response(
                {'error': 'You do not have permission to view this profile.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        profile, created = UserProfile.objects.get_or_create(
            user=user,
            defaults={'email': user.email}
        )
        serializer = UserProfileSerializer(profile)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def update_profile(self, request, pk=None):
        # ✅ FIX [P1]: a non-staff caller may only edit their own profile.
        # `get_object()` returns *any* user for staff, and for regular
        # users it already scopes to `id=user.id` — but the guard below
        # is defensive against a future change to `get_queryset()` that
        # would widen the base queryset.
        user = self.get_object()

        if not self._can_view_or_edit_user(request, user):
            return Response(
                {'error': 'You do not have permission to edit this profile.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        profile, created = UserProfile.objects.get_or_create(
            user=user,
            defaults={'email': user.email}
        )
        data = request.data

        if 'email' in data and data['email'] != user.email:
            if User.objects.exclude(id=user.id).filter(email=data['email']).exists():
                return Response(
                    {'error': 'Email already in use'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            user.email = data['email']
            user.save()
            profile.email = data['email']

        # ✅ FIX [P1]: only staff/superadmins may flip `is_organizer`
        # through this endpoint. Without this, a regular user could
        # self-promote to organizer and gain event-management access.
        profile_fields = [
            'phone', 'whatsapp_number', 'address', 'city', 'state',
            'country', 'postal_code',
        ]
        if request.user.is_staff or request.user.is_superuser:
            profile_fields.append('is_organizer')

        for field in profile_fields:
            if field in data:
                setattr(profile, field, data[field])
        profile.save()

        serializer = UserProfileSerializer(profile)
        return Response(serializer.data)

    @action(detail=True, methods=['delete'])
    def delete_user(self, request, pk=None):
        user = self.get_object()

        if not request.user.is_superuser:
            return Response(
                {'error': 'Only super admin can delete users'},
                status=status.HTTP_403_FORBIDDEN
            )

        if user.id == request.user.id:
            return Response(
                {'error': 'You cannot delete your own account'},
                status=status.HTTP_400_BAD_REQUEST
            )

        username = user.username
        user.delete()

        return Response({
            'success': True,
            'message': f'User {username} deleted successfully'
        }, status=status.HTTP_200_OK)

    def _send_welcome_email(self, user):
        """Send welcome email to new user"""
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

            text_content = strip_tags(html_content)

            send_mail(
                subject,
                text_content,
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
                html_message=html_content,
                fail_silently=False
            )

            logger.info(f"✅ Welcome email sent to {user.email}")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to send welcome email: {str(e)}")
            return False