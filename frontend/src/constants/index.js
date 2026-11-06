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

export const EVENT_CATEGORY_ICONS = {
    [EVENT_CATEGORY.CONCERT]:    '🎵',
    [EVENT_CATEGORY.SPORTS]:     '⚽',
    [EVENT_CATEGORY.THEATER]:    '🎭',
    [EVENT_CATEGORY.CONFERENCE]: '💼',
    [EVENT_CATEGORY.WORKSHOP]:   '🔧',
    [EVENT_CATEGORY.PARTY]:      '🎉',
    [EVENT_CATEGORY.DINING]:     '🍽️',
    [EVENT_CATEGORY.FESTIVAL]:   '🎪',
    [EVENT_CATEGORY.EXHIBITION]: '🖼️',
    [EVENT_CATEGORY.COMMUNITY]:  '🤝',
    [EVENT_CATEGORY.VIRTUAL]:    '💻',
    [EVENT_CATEGORY.OTHER]:      '📌',
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

// ============================================================================
// ROLES — TWO SEPARATE CONCEPTS
// ----------------------------------------------------------------------------
// PLATFORM_ROLES  → stored on User.role. One value per user, globally.
//                   Controls platform-wide capabilities (access the admin
//                   app at all, manage all tenants, etc).
//
// MEMBERSHIP_ROLES → stored on OrganizationMembership.role. One value per
//                   (user, organization) pair. Controls what the user can
//                   do *inside that specific tenant*.
//
// A user is NOT "a member" or "an owner". They have a platform role, and
// separately they hold memberships with per-org roles. A user with zero
// memberships is still a valid Regular User — they can book events as a
// customer. A user with memberships in 3 orgs may be owner of one, admin
// of another, and member of the third; all three are true simultaneously.
// ============================================================================

export const PLATFORM_ROLES = {
    SUPER_ADMIN: 'super_admin',  // platform operator — sees every tenant
    STAFF:       'staff',        // platform staff — internal tooling only
    USER:        'user',         // the default for every signup
};

export const MEMBERSHIP_ROLES = {
    OWNER:  'owner',   // full control over ONE organization
    ADMIN:  'admin',   // manage events/venues/bookings within ONE org
    STAFF:  'staff',   // check-in, bookings within ONE org
    MEMBER: 'member',  // read-mostly member of ONE org (buyer/attendee)
};

export const PLATFORM_ROLE_LABELS = {
    [PLATFORM_ROLES.SUPER_ADMIN]: 'Platform Admin',
    [PLATFORM_ROLES.STAFF]:       'Platform Staff',
    [PLATFORM_ROLES.USER]:        'Regular User',
};

export const MEMBERSHIP_ROLE_LABELS = {
    [MEMBERSHIP_ROLES.OWNER]:  'Owner',
    [MEMBERSHIP_ROLES.ADMIN]:  'Admin',
    [MEMBERSHIP_ROLES.STAFF]:  'Staff',
    [MEMBERSHIP_ROLES.MEMBER]: 'Member',
};

// Ranked, for "is at least admin?" checks *within an org*.
export const MEMBERSHIP_ROLE_HIERARCHY = {
    [MEMBERSHIP_ROLES.OWNER]:  4,
    [MEMBERSHIP_ROLES.ADMIN]:  3,
    [MEMBERSHIP_ROLES.STAFF]:  2,
    [MEMBERSHIP_ROLES.MEMBER]: 1,
};

export const PLATFORM_ROLE_HIERARCHY = {
    [PLATFORM_ROLES.SUPER_ADMIN]: 2,
    [PLATFORM_ROLES.STAFF]:       1,
    [PLATFORM_ROLES.USER]:        0,
};

// ---------------------------------------------------------------------------
// Backwards-compat alias.
// ---------------------------------------------------------------------------
// The legacy code imported `ROLES` and compared against ROLES.OWNER,
// ROLES.MEMBER, etc. To avoid a 40-file shotgun edit, we keep ROLES as
// a merged bag so old imports don't crash. NEW code should import
// PLATFORM_ROLES / MEMBERSHIP_ROLES explicitly.
//
// NOTE: ROLES.OWNER and ROLES.MEMBER are MEMBERSHIP roles. Comparing
// `user.role === ROLES.OWNER` is a bug — the user's platform role is
// never 'owner'. Use `useRole().hasOrgRole(...)` instead. The helpers
// below make that migrate direction obvious.
// ---------------------------------------------------------------------------
export const ROLES = {
    // Platform roles
    SUPER_ADMIN: PLATFORM_ROLES.SUPER_ADMIN,
    STAFF:       PLATFORM_ROLES.STAFF,
    USER:        PLATFORM_ROLES.USER,

    // Membership roles — DO NOT compare against User.role.
    OWNER:  MEMBERSHIP_ROLES.OWNER,
    ADMIN:  MEMBERSHIP_ROLES.ADMIN,
    MEMBER: MEMBERSHIP_ROLES.MEMBER,
};

export const ROLE_LABELS = {
    ...PLATFORM_ROLE_LABELS,
    ...MEMBERSHIP_ROLE_LABELS,
};

export const ROLE_HIERARCHY = {
    ...PLATFORM_ROLE_HIERARCHY,
    ...MEMBERSHIP_ROLE_HIERARCHY,
};

// ============================================================================
// PERMISSION HELPERS
// ----------------------------------------------------------------------------
// These functions take a PLATFORM role and a MEMBERSHIP role separately.
// Passing the wrong kind of value in either slot is a bug; the labelled
// parameters make that visible at the call site.
// ============================================================================

export const PlatformRoleUtils = {
    getLabel: (role) => PLATFORM_ROLE_LABELS[role] || 'Regular User',
    isSuperAdmin: (role) => role === PLATFORM_ROLES.SUPER_ADMIN,
    isPlatformStaff: (role) => role === PLATFORM_ROLES.STAFF,
    isAtLeast: (role, minRole) =>
        (PLATFORM_ROLE_HIERARCHY[role] || 0) >= (PLATFORM_ROLE_HIERARCHY[minRole] || 0),
    // Platform admins bypass all org-membership checks.
    canAccessAdminApp: (role) =>
        role === PLATFORM_ROLES.SUPER_ADMIN ||
        role === PLATFORM_ROLES.STAFF ||
        role === PLATFORM_ROLES.USER,   // every authenticated user can access /app
};

export const MembershipRoleUtils = {
    getLabel: (role) => MEMBERSHIP_ROLE_LABELS[role] || role || '',
    getLevel: (role) => MEMBERSHIP_ROLE_HIERARCHY[role] || 0,
    isAtLeast: (role, minRole) =>
        (MEMBERSHIP_ROLE_HIERARCHY[role] || 0) >= (MEMBERSHIP_ROLE_HIERARCHY[minRole] || 0),
    canManageOrg: (role) =>
        role === MEMBERSHIP_ROLES.OWNER || role === MEMBERSHIP_ROLES.ADMIN,
    canScanTickets: (role) =>
        role === MEMBERSHIP_ROLES.OWNER ||
        role === MEMBERSHIP_ROLES.ADMIN ||
        role === MEMBERSHIP_ROLES.STAFF,
    canViewAllBookings: (role) =>
        role === MEMBERSHIP_ROLES.OWNER ||
        role === MEMBERSHIP_ROLES.ADMIN ||
        role === MEMBERSHIP_ROLES.STAFF,
    canDeleteOrg: (role) => role === MEMBERSHIP_ROLES.OWNER,
};

// ---------------------------------------------------------------------------
// Legacy `RoleUtils` shim.
// ---------------------------------------------------------------------------
// Retained ONLY so files we haven't migrated yet continue to compile.
// It behaves like the old version but is documented as deprecated. If
// you're editing a file anyway, replace usages with
// PlatformRoleUtils / MembershipRoleUtils.
// ---------------------------------------------------------------------------
export const RoleUtils = {
    getLabel: (role) => ROLE_LABELS[role] || role,
    getLevel: (role) => ROLE_HIERARCHY[role] || 0,
    isAtLeast: (role, minRole) =>
        (ROLE_HIERARCHY[role] || 0) >= (ROLE_HIERARCHY[minRole] || 0),
    hasPermission: () => false,          // deprecated, no longer meaningful
    getAvailableRoles: () => Object.values(MEMBERSHIP_ROLES),
};

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
    EVENT_CATEGORY_ICONS,
    EventStatusUtils,
    EVENT_TEMPLATE_TYPE,
    EVENT_TEMPLATE_TYPE_LABELS,
    EVENT_TEMPLATE_TYPE_ICONS,
    EventTemplateTypeUtils,
    PLATFORM_ROLES,
    MEMBERSHIP_ROLES,
    PLATFORM_ROLE_LABELS,
    MEMBERSHIP_ROLE_LABELS,
    MEMBERSHIP_ROLE_HIERARCHY,
    PLATFORM_ROLE_HIERARCHY,
    PlatformRoleUtils,
    MembershipRoleUtils,
    ROLES, ROLE_LABELS, ROLE_HIERARCHY, RoleUtils,
};