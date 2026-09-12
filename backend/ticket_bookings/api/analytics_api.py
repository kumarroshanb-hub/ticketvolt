from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count
from ..models import Event, Booking, Ticket, CheckInLog, Venue, Discount

class AnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'overview': {
                'total_events': Event.objects.count(),
                'total_bookings': Booking.objects.count(),
                'total_revenue': float(Booking.objects.filter(status='paid').aggregate(
                    total=Sum('total_amount'))['total'] or 0),
                'total_tickets': Ticket.objects.count(),
                'total_checkins': CheckInLog.objects.filter(status='success').count(),
                'total_venues': Venue.objects.filter(is_active=True).count(),
                'total_discounts': Discount.objects.filter(is_active=True).count(),
            }
        })
