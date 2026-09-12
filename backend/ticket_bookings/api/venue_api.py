from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from ..models import Venue
from .serializers import VenueSerializer

class VenueViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Venue.objects.all()
    serializer_class = VenueSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return Venue.objects.all()
        return Venue.objects.filter(is_active=True)
