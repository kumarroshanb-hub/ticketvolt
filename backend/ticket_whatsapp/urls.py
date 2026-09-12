# backend/ticket_whatsapp/urls.py
from django.urls import path
from .api.whatsapp_api import (
    SendTicketView,
    SendBulkTicketsView,
    SendConfirmationView,
    SendEventReminderView,
    SendCheckinConfirmationView,
    SendTestQRView,
    SendTicketPDFView,      # Add this
    SendBookingPDFView,      # Add this
    WhatsAppWebhookView
)

app_name = 'ticket_whatsapp'

urlpatterns = [
    # Image/QR sending
    path('send-ticket/', SendTicketView.as_view(), name='send_ticket'),
    path('send-bulk/', SendBulkTicketsView.as_view(), name='send_bulk'),
    path('send-confirmation/', SendConfirmationView.as_view(), name='send_confirmation'),
    path('send-reminder/', SendEventReminderView.as_view(), name='send_reminder'),
    path('send-checkin/', SendCheckinConfirmationView.as_view(), name='send_checkin'),
    path('test-qr/', SendTestQRView.as_view(), name='test_qr'),
    
    # PDF sending (NEW)
    path('send-ticket-pdf/', SendTicketPDFView.as_view(), name='send_ticket_pdf'),
    path('send-booking-pdf/', SendBookingPDFView.as_view(), name='send_booking_pdf'),
    
    # Webhook
    path('webhook/', WhatsAppWebhookView.as_view(), name='whatsapp_webhook'),
]