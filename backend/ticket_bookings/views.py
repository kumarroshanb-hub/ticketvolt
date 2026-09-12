from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from ticket_bookings.models import UserProfile

def get_user_role(user):
    """
    Helper function to determine user role
    """
    if user.is_superuser:
        return 'super_admin'
    if user.is_staff:
        return 'admin'
    if hasattr(user, 'profile') and user.profile.is_organizer:
        return 'organizer'
    return 'user'

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email')
        password = request.data.get('password')

        if not email or not password:
            return Response(
                {'detail': 'Email and password required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.get(email=email)
            user = authenticate(username=user.username, password=password)
        except User.DoesNotExist:
            user = None

        if user is None:
            return Response(
                {'detail': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        refresh = RefreshToken.for_user(user)
        
        # Get user role
        role = get_user_role(user)

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'name': user.get_full_name() or user.username,
                'role': role,  # ✅ ADD THIS
                'is_superuser': user.is_superuser,
                'is_staff': user.is_staff
            }
        })

class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        
        # Get user role
        role = get_user_role(user)

        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'name': user.get_full_name() or user.username,
            'role': role,  # ✅ ADD THIS
            'is_superuser': user.is_superuser,
            'is_staff': user.is_staff,
            'is_active': user.is_active
        })