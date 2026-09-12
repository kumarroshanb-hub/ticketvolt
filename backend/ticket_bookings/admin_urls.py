# ticket_bookings/admin_urls.py
from django.urls import path
from django.shortcuts import get_object_or_404, redirect
from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.utils import timezone
from .models import Booking
from ticket_bookings.services.qr_service import QRCodeService

# ============ ADMIN ACTION VIEWS ============

@staff_member_required
def admin_confirm_payment_issue(request, booking_id):
    """Admin view to confirm payment and issue tickets"""
    booking = get_object_or_404(Booking, id=booking_id)
    
    if booking.status != 'pending':
        messages.error(request, f'Booking is already {booking.status}')
        return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))
    
    try:
        # Mark as paid
        booking.status = 'paid'
        booking.payment_method = 'offline'
        booking.paid_at = timezone.now()
        booking.save()
        
        # Generate QR codes
        for ticket in booking.tickets.all():
            qr_code = QRCodeService.generate_ticket_qr(ticket)
            if qr_code:
                ticket.qr_code = qr_code
                ticket.status = 'active'
                ticket.save()
        
        # Confirm booking
        booking.status = 'confirmed'
        booking.save()
        
        messages.success(
            request, 
            f'✅ Payment confirmed and tickets issued for booking: {booking.booking_reference}'
        )
    except Exception as e:
        messages.error(request, f'❌ Error: {str(e)}')
    
    return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))

@staff_member_required
def admin_mark_payment(request, booking_id):
    """Admin view to mark payment received without issuing tickets"""
    booking = get_object_or_404(Booking, id=booking_id)
    
    if booking.status != 'pending':
        messages.error(request, f'Booking is already {booking.status}')
        return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))
    
    try:
        booking.status = 'paid'
        booking.payment_method = 'offline'
        booking.paid_at = timezone.now()
        booking.save()
        
        messages.success(
            request, 
            f'💰 Payment marked as received for booking: {booking.booking_reference}'
        )
    except Exception as e:
        messages.error(request, f'❌ Error: {str(e)}')
    
    return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))

@staff_member_required
def admin_issue_tickets(request, booking_id):
    """Admin view to issue tickets (generate QR codes)"""
    booking = get_object_or_404(Booking, id=booking_id)
    
    if booking.status not in ['paid', 'confirmed']:
        messages.error(request, f'Booking must be paid before issuing tickets. Current status: {booking.status}')
        return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))
    
    has_qr = booking.tickets.filter(qr_code__isnull=False).exists()
    if has_qr:
        messages.warning(request, 'Tickets already have QR codes. Use "Regenerate QR" to update them.')
        return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))
    
    try:
        tickets_issued = 0
        for ticket in booking.tickets.all():
            qr_code = QRCodeService.generate_ticket_qr(ticket)
            if qr_code:
                ticket.qr_code = qr_code
                ticket.status = 'active'
                ticket.save()
                tickets_issued += 1
        
        if booking.status != 'confirmed':
            booking.status = 'confirmed'
            booking.save()
        
        messages.success(
            request, 
            f'🎫 Issued {tickets_issued} tickets for booking: {booking.booking_reference}'
        )
    except Exception as e:
        messages.error(request, f'❌ Error: {str(e)}')
    
    return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))

@staff_member_required
def admin_regenerate_qr(request, booking_id):
    """Admin view to regenerate QR codes"""
    booking = get_object_or_404(Booking, id=booking_id)
    
    if booking.status in ['cancelled', 'refunded']:
        messages.error(request, f'Cannot regenerate QR for {booking.status} booking')
        return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))
    
    try:
        tickets_regenerated = 0
        for ticket in booking.tickets.all():
            qr_code = QRCodeService.generate_ticket_qr(ticket)
            if qr_code:
                ticket.qr_code = qr_code
                ticket.status = 'active'
                ticket.save()
                tickets_regenerated += 1
        
        messages.success(
            request, 
            f'🔄 Regenerated QR codes for {tickets_regenerated} tickets in booking: {booking.booking_reference}'
        )
    except Exception as e:
        messages.error(request, f'❌ Error: {str(e)}')
    
    return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))

@staff_member_required
def admin_cancel_booking(request, booking_id):
    """Admin view to cancel booking"""
    booking = get_object_or_404(Booking, id=booking_id)
    
    if booking.status in ['cancelled', 'refunded']:
        messages.warning(request, f'Booking is already {booking.status}')
        return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))
    
    try:
        booking.status = 'cancelled'
        booking.save()
        
        # Update tickets
        for ticket in booking.tickets.all():
            if ticket.status != 'used':
                ticket.status = 'cancelled'
                ticket.save()
        
        # If event stats were updated, revert them
        if booking.paid_at:
            event = booking.event
            event.total_tickets_sold -= booking.tickets.count()
            event.total_revenue -= booking.total_amount
            event.save()
        
        messages.success(
            request, 
            f'❌ Booking cancelled: {booking.booking_reference}'
        )
    except Exception as e:
        messages.error(request, f'❌ Error: {str(e)}')
    
    return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))

@staff_member_required
def admin_refund_booking(request, booking_id):
    """Admin view to refund booking"""
    booking = get_object_or_404(Booking, id=booking_id)
    
    if booking.status not in ['paid', 'confirmed']:
        messages.error(request, f'Only paid/confirmed bookings can be refunded. Current status: {booking.status}')
        return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))
    
    if booking.status == 'refunded':
        messages.warning(request, 'Booking is already refunded')
        return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))
    
    try:
        booking.status = 'refunded'
        booking.save()
        
        # Update tickets
        for ticket in booking.tickets.all():
            if ticket.status != 'used':
                ticket.status = 'refunded'
                ticket.save()
        
        # Update event stats
        event = booking.event
        event.total_tickets_sold -= booking.tickets.count()
        event.total_revenue -= booking.total_amount
        event.save()
        
        messages.success(
            request, 
            f'💸 Booking refunded: {booking.booking_reference}'
        )
    except Exception as e:
        messages.error(request, f'❌ Error: {str(e)}')
    
    return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))

@staff_member_required
def admin_booking_details(request, booking_id):
    """Admin view to show booking details with action buttons"""
    booking = get_object_or_404(Booking, id=booking_id)
    
    # This just redirects to the admin change view
    return HttpResponseRedirect(reverse('admin:ticket_bookings_booking_change', args=[booking_id]))

# ============ URL PATTERNS ============

# IMPORTANT: This is what was missing!
urlpatterns = [
    path('booking/<uuid:booking_id>/confirm-payment-issue/', admin_confirm_payment_issue, name='admin_confirm_payment_issue'),
    path('booking/<uuid:booking_id>/mark-payment/', admin_mark_payment, name='admin_mark_payment'),
    path('booking/<uuid:booking_id>/issue-tickets/', admin_issue_tickets, name='admin_issue_tickets'),
    path('booking/<uuid:booking_id>/regenerate-qr/', admin_regenerate_qr, name='admin_regenerate_qr'),
    path('booking/<uuid:booking_id>/cancel/', admin_cancel_booking, name='admin_cancel_booking'),
    path('booking/<uuid:booking_id>/refund/', admin_refund_booking, name='admin_refund_booking'),
    path('booking/<uuid:booking_id>/', admin_booking_details, name='admin_booking_details'),
]