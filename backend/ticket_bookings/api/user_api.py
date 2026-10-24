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
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.contrib.auth.tokens import default_token_generator
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

    PROFILE_PATCH_FIELDS = (
        'phone', 'whatsapp_number', 'address', 'city', 'state',
        'country', 'postal_code',
    )

    def get_serializer_class(self):
        if self.action == 'create' or self.action == 'register':
            return UserRegistrationSerializer
        return UserSerializer

    def get_queryset(self):
        user = self.request.user
        role = self.request.query_params.get('role', None)
        is_active_param = self.request.query_params.get('is_active', None)
        search = self.request.query_params.get('search', None)

        if user.is_superuser:
            queryset = User.objects.all()
        elif user.is_staff:
            queryset = User.objects.exclude(is_superuser=True)
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

        if role == 'organizer':
            queryset = queryset.filter(
                Q(profile__is_organizer=True) | Q(is_staff=True)
            )
        elif role == 'admin':
            queryset = queryset.filter(is_staff=True, is_superuser=False)
        elif role == 'super_admin':
            queryset = queryset.filter(is_superuser=True)
        elif role == 'user':
            queryset = queryset.filter(is_staff=False, is_superuser=False)

        return queryset.order_by('-date_joined')

    def _can_view_or_edit_user(self, request, target_user):
        requester = request.user
        if requester.is_staff or requester.is_superuser:
            return True
        return requester.id == target_user.id

    def _persist_profile_fields(self, user, data):
        profile, _ = UserProfile.objects.get_or_create(
            user=user, defaults={'email': user.email},
        )
        changed = False
        for field in self.PROFILE_PATCH_FIELDS:
            if field in data:
                setattr(profile, field, data[field] or '')
                changed = True
        if (
            'is_organizer' in data
            and (self.request.user.is_staff or self.request.user.is_superuser)
        ):
            profile.is_organizer = bool(data['is_organizer'])
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

    def create(self, request, *args, **kwargs):
        if not request.user.is_staff and not request.user.is_superuser:
            return Response(
                {'error': 'You do not have permission to create users'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            with transaction.atomic():
                user = serializer.save()

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

    # ✅ ADDED: Forgot Password flow
    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def forgot_password(self, request):
        email = request.data.get('email', '').strip()
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
                logger.info(f"✉️ Password reset email sent to {email}")
            except Exception as e:
                logger.error(f"❌ Failed to send reset email to {email}: {str(e)}")
                return Response(
                    {'error': 'Failed to send email. Please try again later.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        return Response(
            {'message': 'If an account exists with this email, a reset link has been sent.'},
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def confirm_password_reset(self, request):
        uidb64 = request.data.get('uid')
        token = request.data.get('token')
        new_password = request.data.get('password')

        if not uidb64 or not token or not new_password:
            return Response(
                {'error': 'Missing required fields.'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            user = None

        if user is not None and default_token_generator.check_token(user, token):
            try:
                validate_password(new_password, user=user)
            except DjangoValidationError as exc:
                return Response(
                    {'error': ' '.join(exc.messages)}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            user.set_password(new_password)
            user.save()
            
            try:
                from axes.models import AccessAttempt
                AccessAttempt.objects.filter(username=user.username).delete()
            except Exception:
                pass

            logger.info(f"🔑 Password successfully reset via link for {user.username}")
            return Response({'message': 'Password has been reset successfully.'})
        else:
            return Response(
                {'error': 'Invalid or expired reset link. Please request a new one.'},
                status=status.HTTP_400_BAD_REQUEST
            )

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

        deleted_attempts, _ = AccessAttempt.objects.filter(
            username=target.username,
        ).delete()

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

        with transaction.atomic():
            if 'email' in data and data['email'] != user.email:
                if User.objects.exclude(id=user.id).filter(email=data['email']).exists():
                    return Response(
                        {'error': 'Email already in use'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                user.email = data['email']
                user.save(update_fields=['email'])
                profile.email = data['email']

            self._persist_profile_fields(user, data)

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