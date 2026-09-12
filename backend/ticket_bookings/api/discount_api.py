# backend/ticket_bookings/api/discount_api.py
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from ..models import Discount
from .serializers import DiscountSerializer

class DiscountViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Discount.objects.all()
    serializer_class = DiscountSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return Discount.objects.all()
        
        # ✅ FIX: Check if user is an organizer via profile
        if hasattr(user, 'profile') and user.profile.is_organizer:
            return Discount.objects.filter(organizer=user)
        
        # Fallback: check for organizer attribute
        if hasattr(user, 'organizer'):
            return Discount.objects.filter(organizer=user)
        
        return Discount.objects.none()