/**
 * Shared Constants - Single Source of Truth
 * Export all constants for use across the entire project
 */

// Ticket constants
export {
    TICKET_STATUS,
    TICKET_STATUS_LABELS,
    TICKET_STATUS_COLORS,
    TICKET_STATUS_ICONS,
    TERMINAL_TICKET_STATUSES,
    CHECKIN_ALLOWED_STATUSES,
    MODIFIABLE_TICKET_STATUSES,
    TicketStatusUtils,
} from './ticket';

// Booking constants
export {
    BOOKING_STATUS,
    BOOKING_STATUS_LABELS,
    BOOKING_STATUS_COLORS,
    BOOKING_STATUS_DOT_COLORS,
    BOOKING_TRANSITIONS,
    BookingStatusUtils,
} from './booking';

// Event constants
export {
    EVENT_STATUS,
    EVENT_STATUS_LABELS,
    EVENT_STATUS_COLORS,
    EVENT_STATUS_ICONS,
    EventStatusUtils,
    EVENT_TYPE,
    EVENT_TYPE_LABELS,
    EventTypeUtils,
    EVENT_CATEGORY,
    EVENT_CATEGORY_LABELS,
    EVENT_CATEGORY_ICONS,
    EventCategoryUtils,
    EVENT_CAPACITY,
    EVENT_CAPACITY_LABELS,
    EVENT_CAPACITY_RANGES,
    EventCapacityUtils,
} from './events';

// ✅ Role constants
export {
    ROLES,
    ROLE_LABELS,
    ROLE_HIERARCHY,
    ROLE_PERMISSIONS,
    RoleUtils,
} from './roles';

// ✅ Error constants
export {
    ERROR_CODES,
    ERROR_MESSAGES,
    ErrorUtils,
} from './error';

// Event Template constants
export {
    EVENT_TEMPLATE_TYPE,
    EVENT_TEMPLATE_TYPE_LABELS,
    EVENT_TEMPLATE_TYPE_ICONS,
    EventTemplateTypeUtils,
} from './events';

// Default exports for backward compatibility
export { default as TICKET_STATUS } from './ticket';
export { default as BOOKING_STATUS } from './booking';
export { default as EVENT_STATUS } from './events';
export { default as ERROR_CODES } from './error';
export { default as ROLES } from './roles';