# backend/ticket_bookings/constants.py
"""
Shared Constants for Django Backend
These must match the JavaScript constants in shared/constants/
"""

# ============================================
# ERROR CODES
# ============================================

class ErrorCodes:
    # Authentication Errors
    UNAUTHORIZED = 'ERR_1001'
    INVALID_CREDENTIALS = 'ERR_1002'
    TOKEN_EXPIRED = 'ERR_1003'
    TOKEN_INVALID = 'ERR_1004'
    PERMISSION_DENIED = 'ERR_1005'
    
    # Validation Errors
    VALIDATION_ERROR = 'ERR_2001'
    INVALID_INPUT = 'ERR_2002'
    MISSING_FIELD = 'ERR_2003'
    DUPLICATE_ENTRY = 'ERR_2004'
    
    # Resource Errors
    NOT_FOUND = 'ERR_3001'
    ALREADY_EXISTS = 'ERR_3002'
    CONFLICT = 'ERR_3003'
    
    # Booking Errors
    BOOKING_NOT_FOUND = 'ERR_4001'
    BOOKING_INVALID_STATUS = 'ERR_4002'
    BOOKING_CANCELLED = 'ERR_4003'
    BOOKING_REFUNDED = 'ERR_4004'
    BOOKING_COMPLETED = 'ERR_4005'
    BOOKING_ALREADY_PAID = 'ERR_4006'
    BOOKING_NO_TICKETS = 'ERR_4007'
    
    # Ticket Errors
    TICKET_NOT_FOUND = 'ERR_5001'
    TICKET_ALREADY_USED = 'ERR_5002'
    TICKET_EXPIRED = 'ERR_5003'
    TICKET_CANCELLED = 'ERR_5004'
    TICKET_REFUNDED = 'ERR_5005'
    TICKET_ALREADY_CHECKED_IN = 'ERR_5006'
    
    # Event Errors
    EVENT_NOT_FOUND = 'ERR_6001'
    EVENT_NOT_ACTIVE = 'ERR_6002'
    EVENT_CANCELLED = 'ERR_6003'
    EVENT_SOLD_OUT = 'ERR_6004'
    EVENT_POSTPONED = 'ERR_6005'
    
    # Payment Errors
    PAYMENT_FAILED = 'ERR_8001'
    PAYMENT_PENDING = 'ERR_8002'
    
    # Template Errors
    TEMPLATE_NOT_FOUND = 'ERR_7001'
    TEMPLATE_TYPE_NOT_FOUND = 'ERR_7002'
    TEMPLATE_INVALID_TYPE = 'ERR_7003'
    
    # System Errors
    INTERNAL_ERROR = 'ERR_10001'
    SERVICE_UNAVAILABLE = 'ERR_10002'
    TIMEOUT = 'ERR_10003'
    DATABASE_ERROR = 'ERR_10004'
    NETWORK_ERROR = 'ERR_10005'


# ============================================
# ERROR MESSAGES
# ============================================

class ErrorMessages:
    MESSAGES = {
        ErrorCodes.UNAUTHORIZED: 'You must be logged in to access this resource',
        ErrorCodes.INVALID_CREDENTIALS: 'Invalid email or password',
        ErrorCodes.TOKEN_EXPIRED: 'Your session has expired. Please log in again',
        ErrorCodes.TOKEN_INVALID: 'Invalid authentication token',
        ErrorCodes.PERMISSION_DENIED: 'You do not have permission to perform this action',
        ErrorCodes.VALIDATION_ERROR: 'Validation failed',
        ErrorCodes.INVALID_INPUT: 'Invalid input provided',
        ErrorCodes.MISSING_FIELD: 'Required field is missing',
        ErrorCodes.DUPLICATE_ENTRY: 'Duplicate entry found',
        ErrorCodes.NOT_FOUND: 'Resource not found',
        ErrorCodes.ALREADY_EXISTS: 'Resource already exists',
        ErrorCodes.CONFLICT: 'Resource conflict',
        ErrorCodes.BOOKING_NOT_FOUND: 'Booking not found',
        ErrorCodes.BOOKING_INVALID_STATUS: 'Booking is in an invalid state for this operation',
        ErrorCodes.BOOKING_CANCELLED: 'Booking has been cancelled',
        ErrorCodes.BOOKING_REFUNDED: 'Booking has been refunded',
        ErrorCodes.BOOKING_COMPLETED: 'Booking has been completed',
        ErrorCodes.BOOKING_ALREADY_PAID: 'Booking has already been paid',
        ErrorCodes.BOOKING_NO_TICKETS: 'No tickets found for this booking',
        ErrorCodes.TICKET_NOT_FOUND: 'Ticket not found',
        ErrorCodes.TICKET_ALREADY_USED: 'Ticket has already been used',
        ErrorCodes.TICKET_EXPIRED: 'Ticket has expired',
        ErrorCodes.TICKET_CANCELLED: 'Ticket has been cancelled',
        ErrorCodes.TICKET_REFUNDED: 'Ticket has been refunded',
        ErrorCodes.TICKET_ALREADY_CHECKED_IN: 'Ticket has already been checked in',
        ErrorCodes.EVENT_NOT_FOUND: 'Event not found',
        ErrorCodes.EVENT_NOT_ACTIVE: 'Event is not active',
        ErrorCodes.EVENT_CANCELLED: 'Event has been cancelled',
        ErrorCodes.EVENT_SOLD_OUT: 'Event is sold out',
        ErrorCodes.EVENT_POSTPONED: 'Event has been postponed',
        ErrorCodes.PAYMENT_FAILED: 'Payment processing failed',
        ErrorCodes.PAYMENT_PENDING: 'Payment is pending',
        ErrorCodes.TEMPLATE_NOT_FOUND: 'Template not found',
        ErrorCodes.TEMPLATE_TYPE_NOT_FOUND: 'Template type not found',
        ErrorCodes.TEMPLATE_INVALID_TYPE: 'Invalid template type',
        ErrorCodes.INTERNAL_ERROR: 'An unexpected error occurred',
        ErrorCodes.SERVICE_UNAVAILABLE: 'Service is currently unavailable',
        ErrorCodes.TIMEOUT: 'Request timed out',
        ErrorCodes.DATABASE_ERROR: 'Database error occurred',
        ErrorCodes.NETWORK_ERROR: 'Network error occurred',
    }

    @classmethod
    def get(cls, code, default_message=None):
        return cls.MESSAGES.get(code, default_message or 'An unknown error occurred')


# ============================================
# ERROR UTILITIES
# ============================================

class ErrorUtils:
    @classmethod
    def get_message(cls, code, default_message=None):
        return ErrorMessages.get(code, default_message)

    @classmethod
    def create_error(cls, code, details=None, path=None):
        from datetime import datetime
        return {
            'code': code,
            'message': cls.get_message(code),
            'details': details,
            'timestamp': datetime.now().isoformat(),
            'path': path,
        }

    @classmethod
    def is_retryable(cls, code):
        retryable = [
            ErrorCodes.TIMEOUT,
            ErrorCodes.NETWORK_ERROR,
            ErrorCodes.SERVICE_UNAVAILABLE,
        ]
        return code in retryable


# ============================================
# EVENT STATUS - Matches JS EVENT_STATUS
# ============================================

class EventStatus:
    DRAFT = 'draft'
    PUBLISHED = 'published'
    ACTIVE = 'active'
    CANCELLED = 'cancelled'
    COMPLETED = 'completed'
    SOLD_OUT = 'sold_out'
    POSTPONED = 'postponed'
    
    @classmethod
    def choices(cls):
        return [
            (cls.DRAFT, 'Draft'),
            (cls.PUBLISHED, 'Published'),
            (cls.ACTIVE, 'Active'),
            (cls.CANCELLED, 'Cancelled'),
            (cls.COMPLETED, 'Completed'),
            (cls.SOLD_OUT, 'Sold Out'),
            (cls.POSTPONED, 'Postponed'),
        ]
    
    @classmethod
    def is_valid(cls, status):
        return status in [
            cls.DRAFT, cls.PUBLISHED, cls.ACTIVE, 
            cls.CANCELLED, cls.COMPLETED, cls.SOLD_OUT, cls.POSTPONED
        ]
    
    @classmethod
    def is_active(cls, status):
        return status in [cls.ACTIVE, cls.PUBLISHED]
    
    @classmethod
    def is_terminal(cls, status):
        return status in [cls.COMPLETED, cls.CANCELLED]
    
    @classmethod
    def is_bookable(cls, status):
        return status in [cls.ACTIVE, cls.PUBLISHED]
    
    @classmethod
    def get_label(cls, status):
        labels = {
            cls.DRAFT: 'Draft',
            cls.PUBLISHED: 'Published',
            cls.ACTIVE: 'Active',
            cls.CANCELLED: 'Cancelled',
            cls.COMPLETED: 'Completed',
            cls.SOLD_OUT: 'Sold Out',
            cls.POSTPONED: 'Postponed',
        }
        return labels.get(status, status)
    
    @classmethod
    def get_color(cls, status):
        colors = {
            cls.DRAFT: '#94a3b8',
            cls.PUBLISHED: '#3b82f6',
            cls.ACTIVE: '#22c55e',
            cls.CANCELLED: '#ef4444',
            cls.COMPLETED: '#8b5cf6',
            cls.SOLD_OUT: '#f59e0b',
            cls.POSTPONED: '#f97316',
        }
        return colors.get(status, '#94a3b8')


# ============================================
# EVENT TYPE - Matches JS EVENT_TYPE
# ============================================

class EventType:
    SINGLE = 'single'
    MULTI_DAY = 'multi_day'
    RECURRING = 'recurring'
    VIRTUAL = 'virtual'
    HYBRID = 'hybrid'
    
    @classmethod
    def choices(cls):
        return [
            (cls.SINGLE, 'Single Day'),
            (cls.MULTI_DAY, 'Multi Day'),
            (cls.RECURRING, 'Recurring'),
            (cls.VIRTUAL, 'Virtual'),
            (cls.HYBRID, 'Hybrid'),
        ]
    
    @classmethod
    def is_valid(cls, event_type):
        return event_type in [
            cls.SINGLE, cls.MULTI_DAY, cls.RECURRING,
            cls.VIRTUAL, cls.HYBRID
        ]
    
    @classmethod
    def get_label(cls, event_type):
        labels = {
            cls.SINGLE: 'Single Day',
            cls.MULTI_DAY: 'Multi Day',
            cls.RECURRING: 'Recurring',
            cls.VIRTUAL: 'Virtual',
            cls.HYBRID: 'Hybrid',
        }
        return labels.get(event_type, event_type)
    
    @classmethod
    def is_multi_day(cls, event_type):
        return event_type in [cls.MULTI_DAY, cls.RECURRING]
    
    @classmethod
    def is_virtual(cls, event_type):
        return event_type in [cls.VIRTUAL, cls.HYBRID]


# ============================================
# EVENT CATEGORY - Matches JS EVENT_CATEGORY
# ============================================

class EventCategory:
    CONCERT = 'concert'
    SPORTS = 'sports'
    THEATER = 'theater'
    CONFERENCE = 'conference'
    WORKSHOP = 'workshop'
    PARTY = 'party'
    DINING = 'dining'
    FESTIVAL = 'festival'
    EXHIBITION = 'exhibition'
    COMMUNITY = 'community'
    VIRTUAL = 'virtual'
    OTHER = 'other'
    
    @classmethod
    def choices(cls):
        return [
            (cls.CONCERT, 'Concert'),
            (cls.SPORTS, 'Sports'),
            (cls.THEATER, 'Theater'),
            (cls.CONFERENCE, 'Conference'),
            (cls.WORKSHOP, 'Workshop'),
            (cls.PARTY, 'Party'),
            (cls.DINING, 'Dining'),
            (cls.FESTIVAL, 'Festival'),
            (cls.EXHIBITION, 'Exhibition'),
            (cls.COMMUNITY, 'Community'),
            (cls.VIRTUAL, 'Virtual'),
            (cls.OTHER, 'Other'),
        ]
    
    @classmethod
    def is_valid(cls, category):
        return category in [
            cls.CONCERT, cls.SPORTS, cls.THEATER,
            cls.CONFERENCE, cls.WORKSHOP, cls.PARTY,
            cls.DINING, cls.FESTIVAL, cls.EXHIBITION,
            cls.COMMUNITY, cls.VIRTUAL, cls.OTHER
        ]
    
    @classmethod
    def get_label(cls, category):
        labels = {
            cls.CONCERT: 'Concert',
            cls.SPORTS: 'Sports',
            cls.THEATER: 'Theater',
            cls.CONFERENCE: 'Conference',
            cls.WORKSHOP: 'Workshop',
            cls.PARTY: 'Party',
            cls.DINING: 'Dining',
            cls.FESTIVAL: 'Festival',
            cls.EXHIBITION: 'Exhibition',
            cls.COMMUNITY: 'Community',
            cls.VIRTUAL: 'Virtual',
            cls.OTHER: 'Other',
        }
        return labels.get(category, category)
    
    @classmethod
    def get_icon(cls, category):
        icons = {
            cls.CONCERT: '🎵',
            cls.SPORTS: '⚽',
            cls.THEATER: '🎭',
            cls.CONFERENCE: '💼',
            cls.WORKSHOP: '🔧',
            cls.PARTY: '🎉',
            cls.DINING: '🍽️',
            cls.FESTIVAL: '🎪',
            cls.EXHIBITION: '🖼️',
            cls.COMMUNITY: '🤝',
            cls.VIRTUAL: '💻',
            cls.OTHER: '📌',
        }
        return icons.get(category, '📌')
    
    @classmethod
    def is_entertainment(cls, category):
        return category in [
            cls.CONCERT, cls.THEATER, cls.PARTY, cls.FESTIVAL
        ]
    
    @classmethod
    def is_professional(cls, category):
        return category in [
            cls.CONFERENCE, cls.WORKSHOP, cls.EXHIBITION
        ]


# ============================================
# TICKET STATUS - Matches JS TICKET_STATUS
# ============================================

class TicketStatus:
    ACTIVE = 'active'
    USED = 'used'
    CANCELLED = 'cancelled'
    REFUNDED = 'refunded'
    EXPIRED = 'expired'
    
    @classmethod
    def choices(cls):
        return [
            (cls.ACTIVE, 'Active'),
            (cls.USED, 'Used'),
            (cls.CANCELLED, 'Cancelled'),
            (cls.REFUNDED, 'Refunded'),
            (cls.EXPIRED, 'Expired'),
        ]
    
    @classmethod
    def is_valid(cls, status):
        return status in [cls.ACTIVE, cls.USED, cls.CANCELLED, cls.REFUNDED, cls.EXPIRED]
    
    @classmethod
    def is_terminal(cls, status):
        return status in [cls.USED, cls.CANCELLED, cls.REFUNDED, cls.EXPIRED]
    
    @classmethod
    def can_check_in(cls, status):
        return status == cls.ACTIVE
    
    @classmethod
    def get_label(cls, status):
        labels = {
            cls.ACTIVE: 'Active',
            cls.USED: 'Used',
            cls.CANCELLED: 'Cancelled',
            cls.REFUNDED: 'Refunded',
            cls.EXPIRED: 'Expired',
        }
        return labels.get(status, status)
    
    @classmethod
    def get_color(cls, status):
        colors = {
            cls.ACTIVE: '#22c55e',
            cls.USED: '#ef4444',
            cls.CANCELLED: '#94a3b8',
            cls.REFUNDED: '#8b5cf6',
            cls.EXPIRED: '#f59e0b',
        }
        return colors.get(status, '#94a3b8')
    
    @classmethod
    def get_icon(cls, status):
        icons = {
            cls.ACTIVE: '✅',
            cls.USED: '🔴',
            cls.CANCELLED: '❌',
            cls.REFUNDED: '🔄',
            cls.EXPIRED: '⏰',
        }
        return icons.get(status, '📌')


# ============================================
# BOOKING STATUS - Matches JS BOOKING_STATUS
# ============================================

class BookingStatus:
    PENDING = 'pending'
    PROCESSING = 'processing'
    PAID = 'paid'
    CONFIRMED = 'confirmed'
    COMPLETED = 'completed'
    CANCELLED = 'cancelled'
    REFUNDED = 'refunded'
    
    @classmethod
    def choices(cls):
        return [
            (cls.PENDING, 'Pending'),
            (cls.PROCESSING, 'Processing'),
            (cls.PAID, 'Paid'),
            (cls.CONFIRMED, 'Confirmed'),
            (cls.COMPLETED, 'Completed'),
            (cls.CANCELLED, 'Cancelled'),
            (cls.REFUNDED, 'Refunded'),
        ]
    
    @classmethod
    def is_valid(cls, status):
        return status in [
            cls.PENDING, cls.PROCESSING, cls.PAID, cls.CONFIRMED,
            cls.COMPLETED, cls.CANCELLED, cls.REFUNDED
        ]
    
    @classmethod
    def can_transition(cls, from_status, to_status):
        transitions = {
            cls.PENDING: [cls.PROCESSING, cls.PAID, cls.CANCELLED],
            cls.PROCESSING: [cls.PAID, cls.CANCELLED],
            cls.PAID: [cls.CONFIRMED, cls.REFUNDED, cls.CANCELLED],
            cls.CONFIRMED: [cls.COMPLETED, cls.REFUNDED, cls.CANCELLED],
            cls.COMPLETED: [],
            cls.CANCELLED: [],
            cls.REFUNDED: [],
        }
        return to_status in transitions.get(from_status, [])
    
    @classmethod
    def is_terminal(cls, status):
        return status in [cls.COMPLETED, cls.CANCELLED, cls.REFUNDED]
    
    @classmethod
    def requires_payment(cls, status):
        return status in [cls.PENDING, cls.PROCESSING]
    
    @classmethod
    def has_tickets(cls, status):
        return status in [cls.PAID, cls.CONFIRMED, cls.COMPLETED]
    
    @classmethod
    def get_label(cls, status):
        labels = {
            cls.PENDING: 'Pending',
            cls.PROCESSING: 'Processing',
            cls.PAID: 'Paid',
            cls.CONFIRMED: 'Confirmed',
            cls.COMPLETED: 'Completed',
            cls.CANCELLED: 'Cancelled',
            cls.REFUNDED: 'Refunded',
        }
        return labels.get(status, status)
    
    @classmethod
    def get_color(cls, status):
        colors = {
            cls.PENDING: '#f59e0b',
            cls.PROCESSING: '#3b82f6',
            cls.PAID: '#3b82f6',
            cls.CONFIRMED: '#22c55e',
            cls.COMPLETED: '#22c55e',
            cls.CANCELLED: '#ef4444',
            cls.REFUNDED: '#8b5cf6',
        }
        return colors.get(status, '#94a3b8')
    
    @classmethod
    def get_available_actions(cls, status):
        if status in [cls.PENDING, cls.PROCESSING]:
            return ['mark_payment_received', 'confirm_payment_and_issue', 'cancel']
        if status == cls.PAID:
            return ['issue_tickets', 'refund', 'cancel']
        if status == cls.CONFIRMED:
            return ['refund', 'cancel']
        if status == cls.COMPLETED:
            return ['view_only']
        if status in [cls.CANCELLED, cls.REFUNDED]:
            return ['view_only']
        return ['view_only']


# ============================================
# TEMPLATE TYPES - Matches JS EVENT_TEMPLATE_TYPE
# ============================================

class TemplateTypes:
    ANNOUNCEMENT = 'announcement'
    TICKET = 'ticket'
    FLYER = 'flyer'
    SOCIAL = 'social'
    INVITE = 'invite'
    CERTIFICATE = 'certificate'
    
    @classmethod
    def choices(cls):
        return [
            (cls.ANNOUNCEMENT, 'Announcement'),
            (cls.TICKET, 'Ticket'),
            (cls.FLYER, 'Flyer'),
            (cls.SOCIAL, 'Social Media'),
            (cls.INVITE, 'Invitation'),
            (cls.CERTIFICATE, 'Certificate'),
        ]
    
    @classmethod
    def is_valid(cls, slug):
        return slug in [
            cls.ANNOUNCEMENT, cls.TICKET, cls.FLYER, 
            cls.SOCIAL, cls.INVITE, cls.CERTIFICATE
        ]
    
    @classmethod
    def get_label(cls, slug):
        labels = {
            cls.ANNOUNCEMENT: 'Announcement',
            cls.TICKET: 'Ticket',
            cls.FLYER: 'Flyer',
            cls.SOCIAL: 'Social Media',
            cls.INVITE: 'Invitation',
            cls.CERTIFICATE: 'Certificate',
        }
        return labels.get(slug, slug)
    
    @classmethod
    def get_icon(cls, slug):
        icons = {
            cls.ANNOUNCEMENT: '📢',
            cls.TICKET: '🎫',
            cls.FLYER: '📄',
            cls.SOCIAL: '📱',
            cls.INVITE: '💌',
            cls.CERTIFICATE: '🏆',
        }
        return icons.get(slug, '📄')
    
    @classmethod
    def get_all(cls):
        return [
            {'slug': cls.ANNOUNCEMENT, 'name': 'Announcement', 'icon': '📢'},
            {'slug': cls.TICKET, 'name': 'Ticket', 'icon': '🎫'},
            {'slug': cls.FLYER, 'name': 'Flyer', 'icon': '📄'},
            {'slug': cls.SOCIAL, 'name': 'Social Media', 'icon': '📱'},
            {'slug': cls.INVITE, 'name': 'Invitation', 'icon': '💌'},
            {'slug': cls.CERTIFICATE, 'name': 'Certificate', 'icon': '🏆'},
        ]


# ============================================
# TEMPLATE TYPE MAP (for easy lookup)
# ============================================

TEMPLATE_TYPE_MAP = {
    TemplateTypes.ANNOUNCEMENT: {'name': 'Announcement', 'icon': '📢'},
    TemplateTypes.TICKET: {'name': 'Ticket', 'icon': '🎫'},
    TemplateTypes.FLYER: {'name': 'Flyer', 'icon': '📄'},
    TemplateTypes.SOCIAL: {'name': 'Social Media', 'icon': '📱'},
    TemplateTypes.INVITE: {'name': 'Invitation', 'icon': '💌'},
    TemplateTypes.CERTIFICATE: {'name': 'Certificate', 'icon': '🏆'},
}


# ============================================
# EVENT CAPACITY
# ============================================

class EventCapacity:
    SMALL = 'small'
    MEDIUM = 'medium'
    LARGE = 'large'
    ARENA = 'arena'
    STADIUM = 'stadium'
    
    @classmethod
    def choices(cls):
        return [
            (cls.SMALL, 'Small (1-50)'),
            (cls.MEDIUM, 'Medium (50-200)'),
            (cls.LARGE, 'Large (200-500)'),
            (cls.ARENA, 'Arena (500-5000)'),
            (cls.STADIUM, 'Stadium (5000+)'),
        ]
    
    @classmethod
    def is_valid(cls, capacity):
        return capacity in [
            cls.SMALL, cls.MEDIUM, cls.LARGE, cls.ARENA, cls.STADIUM
        ]
    
    @classmethod
    def get_label(cls, capacity):
        labels = {
            cls.SMALL: 'Small (1-50)',
            cls.MEDIUM: 'Medium (50-200)',
            cls.LARGE: 'Large (200-500)',
            cls.ARENA: 'Arena (500-5000)',
            cls.STADIUM: 'Stadium (5000+)',
        }
        return labels.get(capacity, capacity)


# ============================================
# DEFAULT EXPORT (for convenience)
# ============================================

__all__ = [
    'ErrorCodes',
    'ErrorMessages',
    'ErrorUtils',
    'EventStatus',
    'EventType',
    'EventCategory',
    'TicketStatus',
    'BookingStatus',
    'TemplateTypes',
    'TEMPLATE_TYPE_MAP',
    'EventCapacity',
]