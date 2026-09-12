from django.contrib import admin
from .models import WhatsAppMessage

@admin.register(WhatsAppMessage)
class WhatsAppMessageAdmin(admin.ModelAdmin):
    list_display = ['phone_number', 'status', 'sent_at']
    list_filter = ['status']