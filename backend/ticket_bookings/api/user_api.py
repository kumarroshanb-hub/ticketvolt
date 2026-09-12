# backend/ticket_bookings/api/user_api.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q
from django.core.mail import send_mail
from django.conf import settings
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
        
        # Super admin can see all users
        if user.is_superuser:
            queryset = User.objects.all()
        # Admin can see all users except super admins
        elif user.is_staff:
            queryset = User.objects.exclude(is_superuser=True)
        # Regular users can only see themselves
        else:
            queryset = User.objects.filter(id=user.id)
        
        # Filter by role if provided
        if role == 'organizer':
            # Get users with organizer profile or role
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

    def create(self, request, *args, **kwargs):
        """
        Create a new user (Admin/Super Admin only)
        """
        # Check if user has permission
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
                    # Create organizer profile
                    UserProfile.objects.create(
                        user=user,
                        email=user.email,
                        phone=request.data.get('phone', ''),
                        whatsapp_number=request.data.get('whatsapp_number', ''),
                        address=request.data.get('address', ''),
                        city=request.data.get('city', ''),
                        state=request.data.get('state', ''),
                        country=request.data.get('country', 'India'),
                        postal_code=request.data.get('postal_code', ''),
                        is_organizer=True
                    )
                
                # Send welcome email
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
                
                # Create user profile
                UserProfile.objects.create(
                    user=user,
                    email=user.email,
                    phone=request.data.get('phone', ''),
                    whatsapp_number=request.data.get('whatsapp_number', ''),
                    address=request.data.get('address', ''),
                    city=request.data.get('city', ''),
                    state=request.data.get('state', ''),
                    country=request.data.get('country', 'India'),
                    postal_code=request.data.get('postal_code', ''),
                    is_organizer=False
                )
                
                # Send welcome email
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
        
        # Only super admin can update roles
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
            # Reset user flags
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
                # Ensure organizer profile exists
                profile, created = UserProfile.objects.get_or_create(
                    user=user,
                    defaults={
                        'email': user.email,
                        'phone': request.data.get('phone', ''),
                        'whatsapp_number': request.data.get('whatsapp_number', ''),
                        'is_organizer': True
                    }
                )
                if not created:
                    profile.is_organizer = True
                    profile.save()
            elif role == 'user':
                # Remove organizer status if exists
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
        
        # Super admin can toggle anyone, admin can toggle non-super-admins
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

    @action(detail=True, methods=['get'])
    def profile(self, request, pk=None):
        """
        Get user profile
        """
        user = self.get_object()
        profile, created = UserProfile.objects.get_or_create(
            user=user,
            defaults={'email': user.email}
        )
        serializer = UserProfileSerializer(profile)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def update_profile(self, request, pk=None):
        """
        Update user profile
        """
        user = self.get_object()
        profile, created = UserProfile.objects.get_or_create(
            user=user,
            defaults={'email': user.email}
        )
        data = request.data
        
        # Update email in both User and UserProfile
        if 'email' in data and data['email'] != user.email:
            # Check if email is already taken
            if User.objects.exclude(id=user.id).filter(email=data['email']).exists():
                return Response(
                    {'error': 'Email already in use'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            user.email = data['email']
            user.save()
            profile.email = data['email']
        
        # Update profile fields
        profile_fields = ['phone', 'whatsapp_number', 'address', 'city', 'state', 'country', 'postal_code', 'is_organizer']
        for field in profile_fields:
            if field in data:
                setattr(profile, field, data[field])
        profile.save()
        
        serializer = UserProfileSerializer(profile)
        return Response(serializer.data)

    @action(detail=True, methods=['delete'])
    def delete_user(self, request, pk=None):
        """
        Delete a user (Super Admin only)
        """
        user = self.get_object()
        
        # Only super admin can delete users
        if not request.user.is_superuser:
            return Response(
                {'error': 'Only super admin can delete users'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Prevent self-deletion
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