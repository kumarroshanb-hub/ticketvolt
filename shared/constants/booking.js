// shared/constants/booking.js
/**
 * Booking Status Constants
 * Single source of truth - DO NOT DUPLICATE
 * Used by: Admin Frontend, Scanner App, WhatsApp Gateway
 */

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

// ✅ MUI color names for Chip component
export const BOOKING_STATUS_COLORS = {
    [BOOKING_STATUS.PENDING]: 'warning',
    [BOOKING_STATUS.PROCESSING]: 'info',
    [BOOKING_STATUS.PAID]: 'info',
    [BOOKING_STATUS.CONFIRMED]: 'success',
    [BOOKING_STATUS.COMPLETED]: 'success',
    [BOOKING_STATUS.CANCELLED]: 'error',
    [BOOKING_STATUS.REFUNDED]: 'secondary',
};

// Hex colors for dots (kept separate)
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
    [BOOKING_STATUS.PENDING]: [
        BOOKING_STATUS.PROCESSING,
        BOOKING_STATUS.PAID,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.PROCESSING]: [
        BOOKING_STATUS.PAID,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.PAID]: [
        BOOKING_STATUS.CONFIRMED,
        BOOKING_STATUS.REFUNDED,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.CONFIRMED]: [
        BOOKING_STATUS.COMPLETED,
        BOOKING_STATUS.REFUNDED,
        BOOKING_STATUS.CANCELLED,
    ],
    [BOOKING_STATUS.COMPLETED]: [],
    [BOOKING_STATUS.CANCELLED]: [],
    [BOOKING_STATUS.REFUNDED]: [],
};

export const BookingStatusUtils = {
    isValid: (status) => Object.values(BOOKING_STATUS).includes(status),
    getLabel: (status) => BOOKING_STATUS_LABELS[status] || status,
    getColor: (status) => BOOKING_STATUS_COLORS[status] || 'default',
    getDotColor: (status) => BOOKING_STATUS_DOT_COLORS[status] || '#6b7280',
    canTransition: (from, to) => {
        const transitions = BOOKING_TRANSITIONS[from];
        return transitions ? transitions.includes(to) : false;
    },
    getAvailableActions: (status) => {
        const actions = [];
        switch (status) {
            case BOOKING_STATUS.PENDING:
            case BOOKING_STATUS.PROCESSING:
                actions.push('mark_payment_received', 'confirm_payment_and_issue', 'cancel');
                break;
            case BOOKING_STATUS.PAID:
                actions.push('issue_tickets', 'refund', 'cancel');
                break;
            case BOOKING_STATUS.CONFIRMED:
                actions.push('refund', 'cancel');
                break;
            case BOOKING_STATUS.COMPLETED:
            case BOOKING_STATUS.CANCELLED:
            case BOOKING_STATUS.REFUNDED:
                actions.push('view_only');
                break;
        }
        return actions;
    },
    isTerminal: (status) => {
        return [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.REFUNDED].includes(status);
    },
    requiresPayment: (status) => {
        return [BOOKING_STATUS.PENDING, BOOKING_STATUS.PROCESSING].includes(status);
    },
    hasTickets: (status) => {
        return [BOOKING_STATUS.PAID, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED].includes(status);
    },
    getOptions: () => {
        return Object.values(BOOKING_STATUS).map((status) => ({
            value: status,
            label: BOOKING_STATUS_LABELS[status] || status,
        }));
    },
};

export default BOOKING_STATUS;