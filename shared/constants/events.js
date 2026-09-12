// shared/constants/events.js
// Plain JavaScript - No TypeScript

// ============================================
// EVENT STATUS
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

export const EVENT_STATUS_LABELS = {};
EVENT_STATUS_LABELS[EVENT_STATUS.DRAFT] = 'Draft';
EVENT_STATUS_LABELS[EVENT_STATUS.PUBLISHED] = 'Published';
EVENT_STATUS_LABELS[EVENT_STATUS.ACTIVE] = 'Active';
EVENT_STATUS_LABELS[EVENT_STATUS.CANCELLED] = 'Cancelled';
EVENT_STATUS_LABELS[EVENT_STATUS.COMPLETED] = 'Completed';
EVENT_STATUS_LABELS[EVENT_STATUS.SOLD_OUT] = 'Sold Out';
EVENT_STATUS_LABELS[EVENT_STATUS.POSTPONED] = 'Postponed';

// ✅ MUI color names for Chip component
export const EVENT_STATUS_COLORS = {
    [EVENT_STATUS.DRAFT]: 'default',
    [EVENT_STATUS.PUBLISHED]: 'info',
    [EVENT_STATUS.ACTIVE]: 'success',
    [EVENT_STATUS.CANCELLED]: 'error',
    [EVENT_STATUS.COMPLETED]: 'secondary',
    [EVENT_STATUS.SOLD_OUT]: 'warning',
    [EVENT_STATUS.POSTPONED]: 'warning',
};

// ============================================
// EVENT TYPE
// ============================================
export const EVENT_TYPE = {
    SINGLE: 'single',
    MULTI_DAY: 'multi_day',
    RECURRING: 'recurring',
    VIRTUAL: 'virtual',
    HYBRID: 'hybrid',
};

export const EVENT_TYPE_LABELS = {};
EVENT_TYPE_LABELS[EVENT_TYPE.SINGLE] = 'Single Day';
EVENT_TYPE_LABELS[EVENT_TYPE.MULTI_DAY] = 'Multi Day';
EVENT_TYPE_LABELS[EVENT_TYPE.RECURRING] = 'Recurring';
EVENT_TYPE_LABELS[EVENT_TYPE.VIRTUAL] = 'Virtual';
EVENT_TYPE_LABELS[EVENT_TYPE.HYBRID] = 'Hybrid';

// ============================================
// EVENT CATEGORY
// ============================================
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

export const EVENT_CATEGORY_LABELS = {};
EVENT_CATEGORY_LABELS[EVENT_CATEGORY.CONCERT] = 'Concert';
EVENT_CATEGORY_LABELS[EVENT_CATEGORY.SPORTS] = 'Sports';
EVENT_CATEGORY_LABELS[EVENT_CATEGORY.THEATER] = 'Theater';
EVENT_CATEGORY_LABELS[EVENT_CATEGORY.CONFERENCE] = 'Conference';
EVENT_CATEGORY_LABELS[EVENT_CATEGORY.WORKSHOP] = 'Workshop';
EVENT_CATEGORY_LABELS[EVENT_CATEGORY.PARTY] = 'Party';
EVENT_CATEGORY_LABELS[EVENT_CATEGORY.DINING] = 'Dining';
EVENT_CATEGORY_LABELS[EVENT_CATEGORY.FESTIVAL] = 'Festival';
EVENT_CATEGORY_LABELS[EVENT_CATEGORY.EXHIBITION] = 'Exhibition';
EVENT_CATEGORY_LABELS[EVENT_CATEGORY.COMMUNITY] = 'Community';
EVENT_CATEGORY_LABELS[EVENT_CATEGORY.VIRTUAL] = 'Virtual';
EVENT_CATEGORY_LABELS[EVENT_CATEGORY.OTHER] = 'Other';

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

export const EVENT_TEMPLATE_TYPE_LABELS = {};
EVENT_TEMPLATE_TYPE_LABELS[EVENT_TEMPLATE_TYPE.ANNOUNCEMENT] = 'Announcement';
EVENT_TEMPLATE_TYPE_LABELS[EVENT_TEMPLATE_TYPE.TICKET] = 'Ticket';
EVENT_TEMPLATE_TYPE_LABELS[EVENT_TEMPLATE_TYPE.FLYER] = 'Flyer';
EVENT_TEMPLATE_TYPE_LABELS[EVENT_TEMPLATE_TYPE.SOCIAL] = 'Social Media';
EVENT_TEMPLATE_TYPE_LABELS[EVENT_TEMPLATE_TYPE.INVITE] = 'Invitation';
EVENT_TEMPLATE_TYPE_LABELS[EVENT_TEMPLATE_TYPE.CERTIFICATE] = 'Certificate';

export const EVENT_TEMPLATE_TYPE_ICONS = {};
EVENT_TEMPLATE_TYPE_ICONS[EVENT_TEMPLATE_TYPE.ANNOUNCEMENT] = '📢';
EVENT_TEMPLATE_TYPE_ICONS[EVENT_TEMPLATE_TYPE.TICKET] = '🎫';
EVENT_TEMPLATE_TYPE_ICONS[EVENT_TEMPLATE_TYPE.FLYER] = '📄';
EVENT_TEMPLATE_TYPE_ICONS[EVENT_TEMPLATE_TYPE.SOCIAL] = '📱';
EVENT_TEMPLATE_TYPE_ICONS[EVENT_TEMPLATE_TYPE.INVITE] = '💌';
EVENT_TEMPLATE_TYPE_ICONS[EVENT_TEMPLATE_TYPE.CERTIFICATE] = '🏆';

// ============================================
// EVENT UTILITIES
// ============================================
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
// DEFAULT EXPORT
// ============================================
export default {
    EVENT_STATUS,
    EVENT_STATUS_LABELS,
    EVENT_STATUS_COLORS,
    EVENT_TYPE,
    EVENT_TYPE_LABELS,
    EVENT_CATEGORY,
    EVENT_CATEGORY_LABELS,
    EVENT_TEMPLATE_TYPE,
    EVENT_TEMPLATE_TYPE_LABELS,
    EVENT_TEMPLATE_TYPE_ICONS,
    EventStatusUtils,
    EventTemplateTypeUtils,
};