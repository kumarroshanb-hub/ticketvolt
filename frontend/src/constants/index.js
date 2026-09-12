// frontend/src/constants/index.js

// ============================================
// TICKET CONSTANTS - MUI Color Names
// ============================================

export const TICKET_STATUS = {
    ACTIVE: 'active',
    USED: 'used',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded',
    EXPIRED: 'expired',
};

export const TICKET_STATUS_LABELS = {
    [TICKET_STATUS.ACTIVE]: 'Active',
    [TICKET_STATUS.USED]: 'Used',
    [TICKET_STATUS.CANCELLED]: 'Cancelled',
    [TICKET_STATUS.REFUNDED]: 'Refunded',
    [TICKET_STATUS.EXPIRED]: 'Expired',
};

export const TICKET_STATUS_COLORS = {
    [TICKET_STATUS.ACTIVE]: 'success',
    [TICKET_STATUS.USED]: 'error',
    [TICKET_STATUS.CANCELLED]: 'default',
    [TICKET_STATUS.REFUNDED]: 'secondary',
    [TICKET_STATUS.EXPIRED]: 'warning',
};

export const TICKET_STATUS_ICONS = {
    [TICKET_STATUS.ACTIVE]: '✅',
    [TICKET_STATUS.USED]: '🔴',
    [TICKET_STATUS.CANCELLED]: '❌',
    [TICKET_STATUS.REFUNDED]: '🔄',
    [TICKET_STATUS.EXPIRED]: '⏰',
};

export const TERMINAL_TICKET_STATUSES = [
    TICKET_STATUS.USED,
    TICKET_STATUS.CANCELLED,
    TICKET_STATUS.REFUNDED,
    TICKET_STATUS.EXPIRED,
];

export const CHECKIN_ALLOWED_STATUSES = [TICKET_STATUS.ACTIVE];
export const MODIFIABLE_TICKET_STATUSES = [TICKET_STATUS.ACTIVE];

export const TicketStatusUtils = {
    isValid: function(status) {
        return Object.values(TICKET_STATUS).includes(status);
    },
    getLabel: function(status) {
        return TICKET_STATUS_LABELS[status] || status;
    },
    getColor: function(status) {
        return TICKET_STATUS_COLORS[status] || 'default';
    },
    isTerminal: function(status) {
        return TERMINAL_TICKET_STATUSES.includes(status);
    },
    canCheckIn: function(status) {
        return CHECKIN_ALLOWED_STATUSES.includes(status);
    },
};

// ============================================
// BOOKING CONSTANTS - MUI Color Names
// ============================================

export const BOOKING_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    PAID: 'paid',
    CONFIRMED: 'confirmed',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded',
};

export const BOOKING_STATUS_LABELS = {
    [BOOKING_STATUS.PENDING]: 'Pending',
    [BOOKING_STATUS.PROCESSING]: 'Processing',
    [BOOKING_STATUS.PAID]: 'Paid',
    [BOOKING_STATUS.CONFIRMED]: 'Confirmed',
    [BOOKING_STATUS.COMPLETED]: 'Completed',
    [BOOKING_STATUS.CANCELLED]: 'Cancelled',
    [BOOKING_STATUS.REFUNDED]: 'Refunded',
};

export const BOOKING_STATUS_COLORS = {
    [BOOKING_STATUS.PENDING]: 'warning',
    [BOOKING_STATUS.PROCESSING]: 'info',
    [BOOKING_STATUS.PAID]: 'info',
    [BOOKING_STATUS.CONFIRMED]: 'success',
    [BOOKING_STATUS.COMPLETED]: 'success',
    [BOOKING_STATUS.CANCELLED]: 'error',
    [BOOKING_STATUS.REFUNDED]: 'secondary',
};

export const BOOKING_STATUS_DOT_COLORS = {
    [BOOKING_STATUS.PENDING]: '#f59e0b',
    [BOOKING_STATUS.PROCESSING]: '#3b82f6',
    [BOOKING_STATUS.PAID]: '#22c55e',
    [BOOKING_STATUS.CONFIRMED]: '#8b5cf6',
    [BOOKING_STATUS.COMPLETED]: '#10b981',
    [BOOKING_STATUS.CANCELLED]: '#ef4444',
    [BOOKING_STATUS.REFUNDED]: '#f97316',
};

export const BOOKING_TRANSITIONS = {
    [BOOKING_STATUS.PENDING]: [BOOKING_STATUS.PROCESSING, BOOKING_STATUS.PAID, BOOKING_STATUS.CANCELLED],
    [BOOKING_STATUS.PROCESSING]: [BOOKING_STATUS.PAID, BOOKING_STATUS.CANCELLED],
    [BOOKING_STATUS.PAID]: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.REFUNDED, BOOKING_STATUS.CANCELLED],
    [BOOKING_STATUS.CONFIRMED]: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.REFUNDED, BOOKING_STATUS.CANCELLED],
    [BOOKING_STATUS.COMPLETED]: [],
    [BOOKING_STATUS.CANCELLED]: [],
    [BOOKING_STATUS.REFUNDED]: [],
};

export const BookingStatusUtils = {
    isValid: function(status) {
        return Object.values(BOOKING_STATUS).includes(status);
    },
    getLabel: function(status) {
        return BOOKING_STATUS_LABELS[status] || status;
    },
    getColor: function(status) {
        return BOOKING_STATUS_COLORS[status] || 'default';
    },
    getDotColor: function(status) {
        return BOOKING_STATUS_DOT_COLORS[status] || '#6b7280';
    },
    canTransition: function(from, to) {
        var transitions = BOOKING_TRANSITIONS[from] || [];
        return transitions.includes(to);
    },
    getAvailableActions: function(status) {
        if ([BOOKING_STATUS.PENDING, BOOKING_STATUS.PROCESSING].includes(status)) {
            return ['mark_payment_received', 'confirm_payment_and_issue', 'cancel'];
        }
        if (status === BOOKING_STATUS.PAID) {
            return ['issue_tickets', 'refund', 'cancel'];
        }
        if (status === BOOKING_STATUS.CONFIRMED) {
            return ['refund', 'cancel'];
        }
        return ['view_only'];
    },
    isTerminal: function(status) {
        return [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.REFUNDED].includes(status);
    },
    requiresPayment: function(status) {
        return [BOOKING_STATUS.PENDING, BOOKING_STATUS.PROCESSING].includes(status);
    },
    hasTickets: function(status) {
        return [BOOKING_STATUS.PAID, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED].includes(status);
    },
    getOptions: function() {
        return Object.values(BOOKING_STATUS).map(function(status) {
            return {
                value: status,
                label: BOOKING_STATUS_LABELS[status] || status,
            };
        });
    },
};

// ============================================
// EVENT CONSTANTS - MUI Color Names
// ============================================

export const EVENT_STATUS = {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    ACTIVE: 'active',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed',
    SOLD_OUT: 'sold_out',
    POSTPONED: 'postponed',
};

export const EVENT_STATUS_LABELS = {
    [EVENT_STATUS.DRAFT]: 'Draft',
    [EVENT_STATUS.PUBLISHED]: 'Published',
    [EVENT_STATUS.ACTIVE]: 'Active',
    [EVENT_STATUS.CANCELLED]: 'Cancelled',
    [EVENT_STATUS.COMPLETED]: 'Completed',
    [EVENT_STATUS.SOLD_OUT]: 'Sold Out',
    [EVENT_STATUS.POSTPONED]: 'Postponed',
};

export const EVENT_STATUS_COLORS = {
    [EVENT_STATUS.DRAFT]: 'default',
    [EVENT_STATUS.PUBLISHED]: 'info',
    [EVENT_STATUS.ACTIVE]: 'success',
    [EVENT_STATUS.CANCELLED]: 'error',
    [EVENT_STATUS.COMPLETED]: 'secondary',
    [EVENT_STATUS.SOLD_OUT]: 'warning',
    [EVENT_STATUS.POSTPONED]: 'warning',
};

export const EVENT_TYPE = {
    SINGLE: 'single',
    MULTI_DAY: 'multi_day',
    RECURRING: 'recurring',
    VIRTUAL: 'virtual',
    HYBRID: 'hybrid',
};

export const EVENT_TYPE_LABELS = {
    [EVENT_TYPE.SINGLE]: 'Single Day',
    [EVENT_TYPE.MULTI_DAY]: 'Multi Day',
    [EVENT_TYPE.RECURRING]: 'Recurring',
    [EVENT_TYPE.VIRTUAL]: 'Virtual',
    [EVENT_TYPE.HYBRID]: 'Hybrid',
};

export const EVENT_CATEGORY = {
    CONCERT: 'concert',
    SPORTS: 'sports',
    THEATER: 'theater',
    CONFERENCE: 'conference',
    WORKSHOP: 'workshop',
    PARTY: 'party',
    DINING: 'dining',
    FESTIVAL: 'festival',
    EXHIBITION: 'exhibition',
    COMMUNITY: 'community',
    VIRTUAL: 'virtual',
    OTHER: 'other',
};

export const EVENT_CATEGORY_LABELS = {
    [EVENT_CATEGORY.CONCERT]: 'Concert',
    [EVENT_CATEGORY.SPORTS]: 'Sports',
    [EVENT_CATEGORY.THEATER]: 'Theater',
    [EVENT_CATEGORY.CONFERENCE]: 'Conference',
    [EVENT_CATEGORY.WORKSHOP]: 'Workshop',
    [EVENT_CATEGORY.PARTY]: 'Party',
    [EVENT_CATEGORY.DINING]: 'Dining',
    [EVENT_CATEGORY.FESTIVAL]: 'Festival',
    [EVENT_CATEGORY.EXHIBITION]: 'Exhibition',
    [EVENT_CATEGORY.COMMUNITY]: 'Community',
    [EVENT_CATEGORY.VIRTUAL]: 'Virtual',
    [EVENT_CATEGORY.OTHER]: 'Other',
};

export const EventStatusUtils = {
    isValid: function(status) {
        return Object.values(EVENT_STATUS).includes(status);
    },
    getLabel: function(status) {
        return EVENT_STATUS_LABELS[status] || status;
    },
    getColor: function(status) {
        return EVENT_STATUS_COLORS[status] || 'default';
    },
    isActive: function(status) {
        return status === EVENT_STATUS.ACTIVE || status === EVENT_STATUS.PUBLISHED;
    },
    isTerminal: function(status) {
        return [EVENT_STATUS.COMPLETED, EVENT_STATUS.CANCELLED].includes(status);
    },
    isBookable: function(status) {
        return status === EVENT_STATUS.ACTIVE || status === EVENT_STATUS.PUBLISHED;
    },
};

// ============================================
// EVENT TEMPLATE TYPES
// ============================================

export const EVENT_TEMPLATE_TYPE = {
    ANNOUNCEMENT: 'announcement',
    TICKET: 'ticket',
    FLYER: 'flyer',
    SOCIAL: 'social',
    INVITE: 'invite',
    CERTIFICATE: 'certificate',
};

export const EVENT_TEMPLATE_TYPE_LABELS = {
    [EVENT_TEMPLATE_TYPE.ANNOUNCEMENT]: 'Announcement',
    [EVENT_TEMPLATE_TYPE.TICKET]: 'Ticket',
    [EVENT_TEMPLATE_TYPE.FLYER]: 'Flyer',
    [EVENT_TEMPLATE_TYPE.SOCIAL]: 'Social Media',
    [EVENT_TEMPLATE_TYPE.INVITE]: 'Invitation',
    [EVENT_TEMPLATE_TYPE.CERTIFICATE]: 'Certificate',
};

export const EVENT_TEMPLATE_TYPE_ICONS = {
    [EVENT_TEMPLATE_TYPE.ANNOUNCEMENT]: '📢',
    [EVENT_TEMPLATE_TYPE.TICKET]: '🎫',
    [EVENT_TEMPLATE_TYPE.FLYER]: '📄',
    [EVENT_TEMPLATE_TYPE.SOCIAL]: '📱',
    [EVENT_TEMPLATE_TYPE.INVITE]: '💌',
    [EVENT_TEMPLATE_TYPE.CERTIFICATE]: '🏆',
};

export const EventTemplateTypeUtils = {
    isValid: function(type) {
        return Object.values(EVENT_TEMPLATE_TYPE).includes(type);
    },
    getLabel: function(type) {
        return EVENT_TEMPLATE_TYPE_LABELS[type] || type;
    },
    getIcon: function(type) {
        return EVENT_TEMPLATE_TYPE_ICONS[type] || '📄';
    },
    getOptions: function() {
        return Object.values(EVENT_TEMPLATE_TYPE).map(function(type) {
            return {
                value: type,
                label: EVENT_TEMPLATE_TYPE_LABELS[type] || type,
                icon: EVENT_TEMPLATE_TYPE_ICONS[type] || '📄',
            };
        });
    },
};

// ============================================
// ROLES CONSTANTS  <-- THIS WAS MISSING!
// ============================================

export const ROLES = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    ORGANIZER: 'organizer',
    USER: 'user',
};

export const ROLE_LABELS = {
    [ROLES.SUPER_ADMIN]: 'Super Admin',
    [ROLES.ADMIN]: 'Admin',
    [ROLES.ORGANIZER]: 'Organizer',
    [ROLES.USER]: 'User',
};

export const ROLE_HIERARCHY = {
    [ROLES.SUPER_ADMIN]: 4,
    [ROLES.ADMIN]: 3,
    [ROLES.ORGANIZER]: 2,
    [ROLES.USER]: 1,
};

export const ROLE_PERMISSIONS = {
    [ROLES.SUPER_ADMIN]: {
        canManageUsers: true,
        canManageAllEvents: true,
        canManageAllBookings: true,
        canManageOrganizers: true,
        canManageVenues: true,
        canViewAnalytics: true,
        canManageSystem: true,
        canManageDiscounts: true,
        canAccessScanner: true,
    },
    [ROLES.ADMIN]: {
        canManageUsers: true,
        canManageAllEvents: true,
        canManageAllBookings: true,
        canManageOrganizers: false,
        canManageVenues: true,
        canViewAnalytics: true,
        canManageSystem: false,
        canManageDiscounts: true,
        canAccessScanner: true,
    },
    [ROLES.ORGANIZER]: {
        canManageUsers: false,
        canManageAllEvents: false,
        canManageAllBookings: false,
        canManageOrganizers: false,
        canManageVenues: false,
        canViewAnalytics: true,
        canManageSystem: false,
        canManageDiscounts: true,
        canAccessScanner: false,
    },
    [ROLES.USER]: {
        canManageUsers: false,
        canManageAllEvents: false,
        canManageAllBookings: false,
        canManageOrganizers: false,
        canManageVenues: false,
        canViewAnalytics: false,
        canManageSystem: false,
        canManageDiscounts: false,
        canAccessScanner: false,
    },
};

export const RoleUtils = {
    getLabel: function(role) {
        return ROLE_LABELS[role] || role;
    },
    getLevel: function(role) {
        return ROLE_HIERARCHY[role] || 0;
    },
    hasPermission: function(role, permission) {
        var perms = ROLE_PERMISSIONS[role];
        return perms ? perms[permission] || false : false;
    },
    isAtLeast: function(role, minRole) {
        return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole];
    },
    getAvailableRoles: function(currentRole) {
        var currentLevel = ROLE_HIERARCHY[currentRole] || 0;
        return Object.keys(ROLE_HIERARCHY).filter(function(role) {
            return ROLE_HIERARCHY[role] <= currentLevel;
        });
    },
};

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
    TICKET_STATUS,
    TICKET_STATUS_LABELS,
    TICKET_STATUS_COLORS,
    TICKET_STATUS_ICONS,
    TERMINAL_TICKET_STATUSES,
    CHECKIN_ALLOWED_STATUSES,
    MODIFIABLE_TICKET_STATUSES,
    TicketStatusUtils,
    BOOKING_STATUS,
    BOOKING_STATUS_LABELS,
    BOOKING_STATUS_COLORS,
    BOOKING_STATUS_DOT_COLORS,
    BOOKING_TRANSITIONS,
    BookingStatusUtils,
    EVENT_STATUS,
    EVENT_STATUS_LABELS,
    EVENT_STATUS_COLORS,
    EVENT_TYPE,
    EVENT_TYPE_LABELS,
    EVENT_CATEGORY,
    EVENT_CATEGORY_LABELS,
    EventStatusUtils,
    EVENT_TEMPLATE_TYPE,
    EVENT_TEMPLATE_TYPE_LABELS,
    EVENT_TEMPLATE_TYPE_ICONS,
    EventTemplateTypeUtils,
    ROLES,
    ROLE_LABELS,
    ROLE_HIERARCHY,
    ROLE_PERMISSIONS,
    RoleUtils,
};