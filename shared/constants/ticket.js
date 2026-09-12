// shared/constants/ticket.js
/**
 * Ticket Status Constants
 * Single source of truth - DO NOT DUPLICATE
 * Used by: Admin Frontend, Scanner App, WhatsApp Gateway
 */

export const TICKET_STATUS = {
    /** Ticket is valid and ready for use */
    ACTIVE: 'active',
    /** Ticket has been used (checked in) */
    USED: 'used',
    /** Ticket has been cancelled */
    CANCELLED: 'cancelled',
    /** Ticket has been refunded */
    REFUNDED: 'refunded',
    /** Ticket has expired */
    EXPIRED: 'expired',
};

export const TICKET_STATUS_LABELS = {
    [TICKET_STATUS.ACTIVE]: 'Active',
    [TICKET_STATUS.USED]: 'Used',
    [TICKET_STATUS.CANCELLED]: 'Cancelled',
    [TICKET_STATUS.REFUNDED]: 'Refunded',
    [TICKET_STATUS.EXPIRED]: 'Expired',
};

// ✅ MUI color names for Chip component
export const TICKET_STATUS_COLORS = {
    [TICKET_STATUS.ACTIVE]: 'success',
    [TICKET_STATUS.USED]: 'error',
    [TICKET_STATUS.CANCELLED]: 'default',
    [TICKET_STATUS.REFUNDED]: 'secondary',
    [TICKET_STATUS.EXPIRED]: 'warning',
};

export const TICKET_STATUS_ICONS = {
    [TICKET_STATUS.ACTIVE]: '🎫',
    [TICKET_STATUS.USED]: '✅',
    [TICKET_STATUS.CANCELLED]: '❌',
    [TICKET_STATUS.REFUNDED]: '💳',
    [TICKET_STATUS.EXPIRED]: '⏰',
};

export const TERMINAL_TICKET_STATUSES = [
    TICKET_STATUS.USED,
    TICKET_STATUS.CANCELLED,
    TICKET_STATUS.REFUNDED,
    TICKET_STATUS.EXPIRED,
];

export const CHECKIN_ALLOWED_STATUSES = [
    TICKET_STATUS.ACTIVE,
];

export const MODIFIABLE_TICKET_STATUSES = [
    TICKET_STATUS.ACTIVE,
];

export const TicketStatusUtils = {
    isValid: (status) => Object.values(TICKET_STATUS).includes(status),
    getLabel: (status) => TICKET_STATUS_LABELS[status] || status,
    getColor: (status) => TICKET_STATUS_COLORS[status] || 'default',
    getIcon: (status) => TICKET_STATUS_ICONS[status] || '🎫',
    isTerminal: (status) => TERMINAL_TICKET_STATUSES.includes(status),
    canCheckIn: (status) => CHECKIN_ALLOWED_STATUSES.includes(status),
    isModifiable: (status) => MODIFIABLE_TICKET_STATUSES.includes(status),
    getOptions: () => {
        return Object.values(TICKET_STATUS).map((status) => ({
            value: status,
            label: TICKET_STATUS_LABELS[status] || status,
        }));
    },
};

export default TICKET_STATUS;