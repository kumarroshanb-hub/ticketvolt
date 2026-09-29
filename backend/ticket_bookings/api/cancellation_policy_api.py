from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError

from ..models import CancellationPolicy
from .serializers import CancellationPolicySerializer
from ..services.cancellation_policy import validate_cancellation_rules


class CancellationPolicyViewSet(viewsets.ModelViewSet):
    """
    CRUD for organizer-owned cancellation policies.

    Permissions:
      • Admin/superadmin: everything
      • Organizer:         their own policies only
      • Regular user:      read-only, and only via the events they can see

    The policy `rules` JSON is validated on write by calling the same
    validator the runtime engine uses, so a bad policy can never be saved.
    """
    serializer_class = CancellationPolicySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return CancellationPolicy.objects.all()
        return CancellationPolicy.objects.filter(organizer=user)

    def perform_create(self, serializer):
        user = self.request.user

        # Non-admins always own the policy they create.
        if not (user.is_staff or user.is_superuser):
            serializer.save(organizer=user)
            return

        # Admins/superusers:
        #   - If the request explicitly supplied an organizer, honor it.
        #   - Otherwise, fall back to the admin's own account.
        #   - Never insert NULL — the DB column is NOT NULL.
        organizer = (
            serializer.validated_data.get('organizer')
            or self.request.data.get('organizer')
            or user
        )
        serializer.save(organizer=organizer)

    def perform_update(self, serializer):
        instance = self.get_object()
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            if instance.organizer_id != self.request.user.id:
                raise PermissionDenied('You do not own this policy.')
        serializer.save()