# backend/ticket_bookings/api/discount_api.py
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied

from ..models import Discount
from .serializers import DiscountSerializer


class DiscountViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Discount.objects.all()
    serializer_class = DiscountSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return Discount.objects.all()

        # ✅ Check if user is an organizer via profile
        if hasattr(user, 'profile') and user.profile.is_organizer:
            return Discount.objects.filter(organizer=user)

        # Fallback: check for organizer attribute
        if hasattr(user, 'organizer'):
            return Discount.objects.filter(organizer=user)

        return Discount.objects.none()

    def perform_create(self, serializer):
        user = self.request.user

        # Non-admins always own what they create — ignore any organizer id
        # the client may have sent.
        if not (user.is_staff or user.is_superuser):
            serializer.save(organizer=user)
            return

        # Admins/superusers: honor an explicit organizer if one was sent,
        # otherwise fall back to the admin's own account. Never save NULL.
        organizer = (
            serializer.validated_data.get('organizer')
            or self.request.data.get('organizer')
            or user
        )
        serializer.save(organizer=organizer)

    def perform_update(self, serializer):
        instance = self.get_object()
        user = self.request.user
        if not (user.is_staff or user.is_superuser):
            if instance.organizer_id != user.id:
                raise PermissionDenied('You do not own this discount.')
        serializer.save()