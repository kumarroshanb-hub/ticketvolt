# backend/ticket_bookings/admin.py
from django.utils import timezone
from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.contrib import messages

from .models import (
    Event, Venue, Session, TicketTier, Booking,
    Ticket, CheckInLog, Discount, UserProfile,
)
from .models_tenancy import (
    Organization, OrganizationMembership, OrganizationContact,
)
from ticket_bookings.services.qr_service import QRCodeService


# ============================================================
# INLINES
# ============================================================

class TicketInline(admin.TabularInline):
    """Inline display of tickets within a booking."""
    model = Ticket
    extra = 0
    fields = ['unique_code', 'attendee_name', 'status', 'qr_preview', 'check_in_time', 'ticket_link']
    readonly_fields = ['unique_code', 'qr_preview', 'check_in_time', 'ticket_link']
    can_delete = False
    show_change_link = True
    max_num = 0

    def qr_preview(self, obj):
        if obj.qr_code:
            return format_html(
                '<img src="{}" style="width: 40px; height: 40px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 4px;" />',
                obj.qr_code,
            )
        return format_html(
            '<span style="color: #94a3b8; font-size: 11px;">No QR</span>'
        )
    qr_preview.short_description = 'QR Code'

    def ticket_link(self, obj):
        if obj.id:
            url = reverse('admin:ticket_bookings_ticket_change', args=[obj.id])
            return format_html('<a href="{}" style="font-size: 12px;">🔍 View</a>', url)
        return '-'
    ticket_link.short_description = 'Actions'

    def has_add_permission(self, request, obj=None):
        return False


class CheckInLogInline(admin.TabularInline):
    """Inline display of check-in logs within a ticket."""
    model = CheckInLog
    extra = 0
    fields = ['scanned_at', 'scanner_device_id', 'status', 'scanner_user']
    readonly_fields = ['scanned_at', 'scanner_device_id', 'status', 'scanner_user']
    can_delete = False
    max_num = 0

    def has_add_permission(self, request, obj=None):
        return False


# ============================================================
# ORGANIZATION / MEMBERSHIP / CONTACT
# ============================================================

@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'owner', 'is_active', 'created_at')
    list_filter = ('is_active', 'country')
    search_fields = ('name', 'slug', 'owner__username', 'owner__email')
    readonly_fields = ('slug', 'created_at', 'updated_at')
    autocomplete_fields = ('owner',)

    fieldsets = (
        ('Identity', {'fields': ('name', 'slug', 'owner', 'is_active')}),
        ('Regional', {
            'fields': (
                'currency_code', 'currency_symbol', 'currency_locale',
                'country', 'country_code', 'default_timezone',
            ),
        }),
        ('Branding', {
            'fields': ('org_email', 'org_logo_url', 'email_from_name'),
        }),
        ('Audit', {'fields': ('created_at', 'updated_at')}),
    )


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'organization', 'role', 'joined_at')
    list_filter = ('role', 'organization')
    search_fields = ('user__username', 'user__email', 'organization__name')
    autocomplete_fields = ('user', 'organization')
    ordering = ('organization', '-joined_at')


@admin.register(OrganizationContact)
class OrganizationContactAdmin(admin.ModelAdmin):
    list_display = ('email', 'name', 'organization', 'user', 'first_seen_at', 'unsubscribed')
    list_filter = ('organization', 'unsubscribed')
    search_fields = ('email', 'name', 'organization__name')
    ordering = ('-first_seen_at',)


# ============================================================
# EVENT
# ============================================================

@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = (
        'title', 'organization', 'event_flow',
        'event_type', 'start_date', 'status',
        'total_tickets_sold', 'total_revenue',
    )
    list_filter = ('organization', 'event_flow', 'event_type', 'status', 'is_public')
    search_fields = ('title', 'description', 'short_description', 'organization__name')
    ordering = ('-created_at',)
    readonly_fields = (
        'created_at', 'updated_at',
        'total_tickets_sold', 'total_revenue',
        'organizer',  # legacy FK — now auto-set to the creator
    )
    autocomplete_fields = ('organization',)
    fieldsets = (
        ('Basic Information', {
            'fields': (
                'title', 'organization', 'organizer',
                'description', 'short_description',
                'event_type', 'category', 'event_flow',
            )
        }),
        ('Date & Time', {'fields': ('start_date', 'end_date', 'timezone')}),
        ('Venue', {'fields': ('venue', 'venue_metadata')}),
        ('Booking Settings', {
            'fields': (
                'booking_start_date', 'booking_end_date',
                'min_tickets_per_order', 'max_tickets_per_order',
            )
        }),
        ('Status & Visibility', {'fields': ('status', 'is_public', 'is_featured')}),
        ('Images', {'fields': ('cover_image', 'gallery_images')}),
        ('Policy', {'fields': ('cancellation_policy', 'cancellation_policy_text', 'refundable_until')}),
        ('Statistics', {'fields': ('total_tickets_sold', 'total_revenue')}),
        ('Metadata', {'fields': ('metadata', 'created_at', 'updated_at')}),
    )


# ============================================================
# VENUE
# ============================================================

@admin.register(Venue)
class VenueAdmin(admin.ModelAdmin):
    list_display = ('name', 'organization', 'city', 'venue_type', 'capacity', 'is_active')
    list_filter = ('organization', 'venue_type', 'is_active', 'country')
    search_fields = ('name', 'city', 'address_line1', 'organization__name')
    ordering = ('name',)
    readonly_fields = ('created_at', 'updated_at')
    autocomplete_fields = ('organization',)
    fieldsets = (
        ('Identity', {'fields': ('name', 'organization', 'is_active')}),
        ('Type & Capacity', {'fields': ('venue_type', 'capacity', 'has_reserved_seating')}),
        ('Address', {
            'fields': (
                'address_line1', 'address_line2', 'city', 'state',
                'postal_code', 'country',
            ),
        }),
        ('Contact', {'fields': ('contact_phone', 'contact_email', 'website_url')}),
        ('Metadata', {'fields': ('description', 'amenities', 'rules', 'metadata')}),
        ('Audit', {'fields': ('created_at', 'updated_at')}),
    )


# ============================================================
# SESSION
# ============================================================

@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ('event', 'venue', 'start_time', 'end_time', 'capacity', 'booked', 'remaining_capacity')
    list_filter = ('is_active', 'event__organization')
    search_fields = ('event__title', 'event__organization__name')
    ordering = ('start_time',)
    readonly_fields = ('created_at',)

    def remaining_capacity(self, obj):
        return obj.remaining_capacity()
    remaining_capacity.short_description = 'Remaining Capacity'


# ============================================================
# TICKET TIER
# ============================================================

@admin.register(TicketTier)
class TicketTierAdmin(admin.ModelAdmin):
    list_display = ('name', 'event', 'price', 'quantity_total', 'quantity_sold', 'available_tickets', 'ticket_type')
    list_filter = ('ticket_type', 'event__organization')
    search_fields = ('name', 'event__title')
    ordering = ('-created_at',)
    readonly_fields = ('created_at',)

    def available_tickets(self, obj):
        return obj.available_tickets()
    available_tickets.short_description = 'Available Tickets'


# ============================================================
# BOOKING
# ============================================================

@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = (
        'booking_reference',
        'organization_display',
        'customer_name',
        'event_link',
        'total_amount',
        'status_badge',
        'slot_allocation_info',
        'ticket_status_summary',
        'payment_method_display',
        'paid_at_display',
        'created_at_display',
        'admin_actions',
    )
    list_filter = ('status', 'payment_method', 'event', 'event__organization')
    search_fields = (
        'booking_reference', 'customer_name', 'customer_email',
        'customer_phone', 'event__title', 'event__organization__name',
    )
    ordering = ('-created_at',)
    readonly_fields = ('created_at', 'updated_at', 'booking_reference')
    inlines = [TicketInline]
    actions = (
        'confirm_payment_and_issue_tickets',
        'mark_payment_received',
        'issue_tickets',
        'regenerate_qr_codes',
        'cancel_booking',
    )

    fieldsets = (
        ('Booking Information', {
            'fields': ('booking_reference', 'status', 'event', 'session')
        }),
        ('Customer Details', {
            'fields': ('customer_name', 'customer_email', 'customer_phone', 'whatsapp_number')
        }),
        ('Payment Information', {
            'fields': ('total_amount', 'payment_method', 'payment_id', 'paid_at')
        }),
        ('Discount', {
            'fields': ('discount_applied', 'discount_code')
        }),
        ('Metadata', {
            'fields': ('metadata', 'notes', 'created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

    def organization_display(self, obj):
        if obj.event and obj.event.organization:
            url = reverse('admin:ticket_bookings_organization_change', args=[obj.event.organization.id])
            return format_html('<a href="{}">{}</a>', url, obj.event.organization.name)
        return '-'
    organization_display.short_description = 'Organization'
    organization_display.admin_order_field = 'event__organization__name'

    def slot_allocation_info(self, obj):
        if obj.metadata:
            allocation_msg = obj.metadata.get('slot_allocation_message', '')
            if allocation_msg:
                return format_html(
                    '<span style="font-size: 11px; color: #059669;">🕐 {}</span>',
                    allocation_msg[:50] + '...' if len(allocation_msg) > 50 else allocation_msg,
                )
        return '-'
    slot_allocation_info.short_description = 'Slot Allocation'

    def status_badge(self, obj):
        status_colors = {
            'pending': '#f59e0b',
            'paid': '#3b82f6',
            'confirmed': '#22c55e',
            'cancelled': '#ef4444',
            'refunded': '#8b5cf6',
        }
        color = status_colors.get(obj.status, '#94a3b8')
        status_labels = {
            'pending': '⏳ PENDING',
            'paid': '💰 PAID',
            'confirmed': '✅ CONFIRMED',
            'cancelled': '❌ CANCELLED',
            'refunded': '🔄 REFUNDED',
        }
        label = status_labels.get(obj.status, obj.status.upper())
        return format_html(
            '<span style="background-color: {}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: bold;">{}</span>',
            color, label,
        )
    status_badge.short_description = 'Status'
    status_badge.admin_order_field = 'status'

    def payment_method_display(self, obj):
        if obj.payment_method:
            return format_html(
                '<span style="background-color: #e2e8f0; padding: 2px 8px; border-radius: 8px; font-size: 11px;">{}</span>',
                obj.payment_method.upper(),
            )
        return '-'
    payment_method_display.short_description = 'Payment'

    def paid_at_display(self, obj):
        if obj.paid_at:
            return obj.paid_at.strftime('%d/%m/%Y %H:%M')
        return '-'
    paid_at_display.short_description = 'Paid At'

    def created_at_display(self, obj):
        return obj.created_at.strftime('%d/%m/%Y %H:%M')
    created_at_display.short_description = 'Created'

    def ticket_status_summary(self, obj):
        tickets = obj.tickets.all()
        total = tickets.count()
        if total == 0:
            return '-'
        active = tickets.filter(status='active').count()
        used = tickets.filter(status='used').count()
        has_qr = tickets.filter(qr_code__isnull=False).count()
        return format_html(
            '<span style="font-size: 12px;">'
            '🎫 {} total<br>'
            '✅ {} active | 🔴 {} used<br>'
            '📱 QR: {}/{}'
            '</span>',
            total, active, used, has_qr, total,
        )
    ticket_status_summary.short_description = 'Tickets'

    def admin_actions(self, obj):
        actions = []
        if obj.status == 'pending':
            actions.append(format_html(
                '<a href="{}" class="button" style="background-color: #22c55e; color: white; padding: 4px 8px; border-radius: 4px; text-decoration: none; margin: 2px; font-size: 11px; display: inline-block;">💰 Confirm & Issue</a>',
                f'/admin/booking/{obj.id}/confirm-payment/',
            ))
        if obj.status == 'paid':
            has_qr = obj.tickets.filter(qr_code__isnull=False).exists()
            if not has_qr:
                actions.append(format_html(
                    '<a href="{}" class="button" style="background-color: #3b82f6; color: white; padding: 4px 8px; border-radius: 4px; text-decoration: none; margin: 2px; font-size: 11px; display: inline-block;">🎫 Issue Tickets</a>',
                    f'/admin/booking/{obj.id}/issue-tickets/',
                ))
        if obj.status in ['paid', 'confirmed']:
            has_qr = obj.tickets.filter(qr_code__isnull=False).exists()
            if has_qr:
                actions.append(format_html(
                    '<a href="{}" class="button" style="background-color: #8b5cf6; color: white; padding: 4px 8px; border-radius: 4px; text-decoration: none; margin: 2px; font-size: 11px; display: inline-block;">🔄 Regenerate QR</a>',
                    f'/admin/booking/{obj.id}/regenerate-qr/',
                ))
        if obj.status not in ['cancelled', 'refunded']:
            actions.append(format_html(
                '<a href="{}" class="button" style="background-color: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; text-decoration: none; margin: 2px; font-size: 11px; display: inline-block;" onclick="return confirm(\'Are you sure you want to cancel this booking?\')">❌ Cancel</a>',
                f'/admin/booking/{obj.id}/cancel/',
            ))
        if obj.status in ['paid', 'confirmed']:
            actions.append(format_html(
                '<a href="{}" class="button" style="background-color: #8b5cf6; color: white; padding: 4px 8px; border-radius: 4px; text-decoration: none; margin: 2px; font-size: 11px; display: inline-block;" onclick="return confirm(\'Are you sure you want to refund this booking?\')">💸 Refund</a>',
                f'/admin/booking/{obj.id}/refund/',
            ))
        return format_html(''.join(actions))
    admin_actions.short_description = 'Actions'

    def event_link(self, obj):
        if obj.event:
            url = reverse('admin:ticket_bookings_event_change', args=[obj.event.id])
            return format_html('<a href="{}">{}</a>', url, obj.event.title)
        return '-'
    event_link.short_description = 'Event'
    event_link.admin_order_field = 'event__title'

    # ---------- Bulk actions (unchanged from your original) ----------

    def confirm_payment_and_issue_tickets(self, request, queryset):
        processed = errors = 0
        for booking in queryset:
            if booking.status == 'pending':
                try:
                    booking.status = 'paid'
                    booking.payment_method = 'offline'
                    booking.paid_at = timezone.now()
                    booking.save()
                    for ticket in booking.tickets.all():
                        qr_code = QRCodeService.generate_ticket_qr(ticket)
                        if qr_code:
                            ticket.qr_code = qr_code
                            ticket.status = 'active'
                            ticket.save()
                    booking.status = 'confirmed'
                    booking.save()
                    processed += 1
                except Exception:
                    errors += 1
        if processed > 0:
            self.message_user(
                request,
                f'✅ Successfully processed {processed} bookings with tickets issued.',
                messages.SUCCESS,
            )
        if errors > 0:
            self.message_user(
                request,
                f'⚠️ {errors} bookings failed to process.',
                messages.WARNING,
            )
    confirm_payment_and_issue_tickets.short_description = "💰 Confirm Payment & Issue Tickets (1-Click)"

    def mark_payment_received(self, request, queryset):
        processed = 0
        for booking in queryset:
            if booking.status == 'pending':
                booking.status = 'paid'
                booking.payment_method = 'offline'
                booking.paid_at = timezone.now()
                booking.save()
                processed += 1
        if processed > 0:
            self.message_user(
                request,
                f'💰 Marked {processed} bookings as PAID. Tickets not yet issued.',
                messages.SUCCESS,
            )
    mark_payment_received.short_description = "💰 Mark Payment Received (No Tickets)"

    def issue_tickets(self, request, queryset):
        processed = skipped = errors = 0
        for booking in queryset:
            if booking.status in ['paid', 'confirmed']:
                has_qr = booking.tickets.filter(qr_code__isnull=False).exists()
                if has_qr:
                    skipped += 1
                    continue
                try:
                    for ticket in booking.tickets.all():
                        qr_code = QRCodeService.generate_ticket_qr(ticket)
                        if qr_code:
                            ticket.qr_code = qr_code
                            ticket.status = 'active'
                            ticket.save()
                    if booking.status != 'confirmed':
                        booking.status = 'confirmed'
                        booking.save()
                    processed += 1
                except Exception:
                    errors += 1
            else:
                skipped += 1
        self.message_user(
            request,
            f'🎫 Issued tickets for {processed} bookings. Skipped {skipped} (already have QR or wrong status).',
            messages.SUCCESS if processed > 0 else messages.WARNING,
        )
    issue_tickets.short_description = "🎫 Issue Tickets (Generate QR Codes)"

    def regenerate_qr_codes(self, request, queryset):
        processed = errors = 0
        for booking in queryset:
            if booking.status in ['paid', 'confirmed']:
                try:
                    for ticket in booking.tickets.all():
                        qr_code = QRCodeService.generate_ticket_qr(ticket)
                        if qr_code:
                            ticket.qr_code = qr_code
                            ticket.save()
                    processed += 1
                except Exception:
                    errors += 1
        self.message_user(
            request,
            f'🔄 Regenerated QR codes for {processed} bookings. Errors: {errors}',
            messages.SUCCESS if processed > 0 else messages.WARNING,
        )
    regenerate_qr_codes.short_description = "🔄 Regenerate QR Codes"

    def cancel_booking(self, request, queryset):
        processed = 0
        for booking in queryset:
            if booking.status not in ['cancelled', 'refunded']:
                booking.status = 'cancelled'
                booking.save()
                processed += 1
        self.message_user(
            request,
            f'❌ Cancelled {processed} bookings.',
            messages.WARNING,
        )
    cancel_booking.short_description = "❌ Cancel Bookings"


# ============================================================
# TICKET
# ============================================================

@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = (
        'unique_code', 'attendee_name', 'booking_link', 'event_link',
        'status_display', 'qr_preview', 'check_in_time_display', 'created_at_display',
    )
    list_filter = ('status', 'event', 'event__organization')
    search_fields = (
        'unique_code', 'attendee_name',
        'booking__booking_reference', 'booking__customer_name',
    )
    ordering = ('-created_at',)
    readonly_fields = ('created_at', 'unique_code')
    inlines = [CheckInLogInline]
    fieldsets = (
        ('Ticket Information', {'fields': ('unique_code', 'status', 'qr_code')}),
        ('Attendee Details', {'fields': ('attendee_name', 'attendee_email', 'attendee_phone')}),
        ('Event Details', {'fields': ('event', 'session', 'booking', 'tier')}),
        ('Check-in', {'fields': ('check_in_time',)}),
        ('Metadata', {'fields': ('created_at',)}),
    )
    actions = ('mark_as_used', 'mark_as_active', 'mark_as_cancelled')

    def qr_preview(self, obj):
        if obj.qr_code:
            return format_html(
                '<img src="{}" style="width: 50px; height: 50px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 4px;" />',
                obj.qr_code,
            )
        return format_html('<span style="color: #94a3b8; font-size: 12px;">No QR</span>')
    qr_preview.short_description = 'QR Code'

    def booking_link(self, obj):
        if obj.booking:
            url = reverse('admin:ticket_bookings_booking_change', args=[obj.booking.id])
            return format_html('<a href="{}">{}</a>', url, obj.booking.booking_reference)
        return '-'
    booking_link.short_description = 'Booking'
    booking_link.admin_order_field = 'booking__booking_reference'

    def event_link(self, obj):
        if obj.event:
            url = reverse('admin:ticket_bookings_event_change', args=[obj.event.id])
            return format_html('<a href="{}">{}</a>', url, obj.event.title)
        return '-'
    event_link.short_description = 'Event'
    event_link.admin_order_field = 'event__title'

    def status_display(self, obj):
        status_colors = {
            'active': '#22c55e',
            'used': '#ef4444',
            'cancelled': '#94a3b8',
            'expired': '#f59e0b',
            'refunded': '#8b5cf6',
        }
        color = status_colors.get(obj.status, '#94a3b8')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">{}</span>',
            color, obj.status.upper(),
        )
    status_display.short_description = 'Status'
    status_display.admin_order_field = 'status'

    def check_in_time_display(self, obj):
        if obj.check_in_time:
            return obj.check_in_time.strftime('%d/%m/%Y %H:%M')
        return '-'
    check_in_time_display.short_description = 'Check-in Time'
    check_in_time_display.admin_order_field = 'check_in_time'

    def created_at_display(self, obj):
        return obj.created_at.strftime('%d/%m/%Y %H:%M')
    created_at_display.short_description = 'Created'
    created_at_display.admin_order_field = 'created_at'

    def mark_as_used(self, request, queryset):
        updated = queryset.update(status='used', check_in_time=timezone.now())
        self.message_user(request, f'{updated} tickets marked as used.')
    mark_as_used.short_description = "Mark selected tickets as used"

    def mark_as_active(self, request, queryset):
        updated = queryset.update(status='active', check_in_time=None)
        self.message_user(request, f'{updated} tickets marked as active.')
    mark_as_active.short_description = "Mark selected tickets as active"

    def mark_as_cancelled(self, request, queryset):
        updated = queryset.update(status='cancelled')
        self.message_user(request, f'{updated} tickets marked as cancelled.')
    mark_as_cancelled.short_description = "Mark selected tickets as cancelled"


# ============================================================
# CHECK-IN LOG
# ============================================================

@admin.register(CheckInLog)
class CheckInLogAdmin(admin.ModelAdmin):
    list_display = (
        'ticket_link', 'attendee_name_display', 'event_link',
        'scanner_user', 'scanner_device_id', 'status_display', 'scanned_at_display',
    )
    list_filter = ('status', 'event', 'is_offline', 'event__organization')
    search_fields = ('ticket__unique_code', 'ticket__attendee_name', 'scanner_device_id')
    ordering = ('-scanned_at',)
    readonly_fields = ('scanned_at', 'synced_at', 'created_at')
    fieldsets = (
        ('Check-in Information', {'fields': ('ticket', 'event', 'session', 'status')}),
        ('Scanner Details', {'fields': ('scanner_user', 'scanner_device_id', 'scanner_ip')}),
        ('Location', {'fields': ('latitude', 'longitude')}),
        ('Sync Status', {'fields': ('is_offline', 'synced_at')}),
        ('Notes', {'fields': ('notes', 'created_at')}),
    )

    def ticket_link(self, obj):
        if obj.ticket:
            url = reverse('admin:ticket_bookings_ticket_change', args=[obj.ticket.id])
            return format_html('<a href="{}">{}</a>', url, obj.ticket.unique_code)
        return '-'
    ticket_link.short_description = 'Ticket'
    ticket_link.admin_order_field = 'ticket__unique_code'

    def attendee_name_display(self, obj):
        return obj.ticket.attendee_name if obj.ticket else '-'
    attendee_name_display.short_description = 'Attendee'
    attendee_name_display.admin_order_field = 'ticket__attendee_name'

    def event_link(self, obj):
        if obj.event:
            url = reverse('admin:ticket_bookings_event_change', args=[obj.event.id])
            return format_html('<a href="{}">{}</a>', url, obj.event.title)
        return '-'
    event_link.short_description = 'Event'
    event_link.admin_order_field = 'event__title'

    def status_display(self, obj):
        status_colors = {
            'success': '#22c55e',
            'failed': '#ef4444',
            'cancelled': '#94a3b8',
        }
        color = status_colors.get(obj.status, '#94a3b8')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">{}</span>',
            color, obj.status.upper(),
        )
    status_display.short_description = 'Status'
    status_display.admin_order_field = 'status'

    def scanned_at_display(self, obj):
        return obj.scanned_at.strftime('%d/%m/%Y %H:%M:%S')
    scanned_at_display.short_description = 'Scanned At'
    scanned_at_display.admin_order_field = 'scanned_at'


# ============================================================
# DISCOUNT
# ============================================================

@admin.register(Discount)
class DiscountAdmin(admin.ModelAdmin):
    list_display = (
        'code', 'organization', 'name', 'type', 'value',
        'max_uses', 'used_count', 'is_active',
    )
    list_filter = ('organization', 'type', 'is_active')
    search_fields = ('code', 'name', 'organization__name')
    ordering = ('-created_at',)
    readonly_fields = ('created_at', 'used_count', 'organizer')
    autocomplete_fields = ('organization',)
    fieldsets = (
        ('Basic Information', {
            'fields': ('code', 'organization', 'organizer', 'name')
        }),
        ('Discount Details', {
            'fields': ('type', 'value', 'min_order_amount', 'max_discount')
        }),
        ('Usage Limits', {
            'fields': ('max_uses', 'used_count', 'max_uses_per_user', 'min_ticket_count')
        }),
        ('Eligibility', {
            'fields': ('first_time_buyers_only', 'stackable', 'applicable_events')
        }),
        ('Validity', {'fields': ('valid_from', 'valid_to', 'is_active')}),
        ('Metadata', {'fields': ('created_at',)}),
    )


# ============================================================
# USER PROFILE
# ============================================================

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'email', 'phone', 'whatsapp_number', 'city', 'created_at')
    list_filter = ('country', 'city')
    search_fields = ('user__username', 'email', 'phone')
    ordering = ('-created_at',)
    readonly_fields = ('created_at', 'updated_at')
    fieldsets = (
        ('User Information', {'fields': ('user', 'email')}),
        ('Contact Details', {'fields': ('phone', 'whatsapp_number')}),
        ('Address', {'fields': ('address', 'city', 'state', 'country', 'postal_code')}),
        ('Metadata', {'fields': ('created_at', 'updated_at')}),
    )


# ============================================================
# BRANDING (cosmetic)
# ============================================================

admin.site.site_header = "TiketVault Platform Admin"
admin.site.site_title = "TiketVault"
admin.site.index_title = "Platform Administration"