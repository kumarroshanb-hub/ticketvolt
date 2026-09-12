// shared/constants/error.js
/**
 * Error Constants
 * Single source of truth for all error codes and messages
 * Used by: Backend, Admin Frontend, Scanner App, WhatsApp Gateway
 */

// ============================================
// ERROR CODES
// ============================================

export const ERROR_CODES = {
    // Authentication Errors (1000-1999)
    UNAUTHORIZED: 'ERR_1001',
    INVALID_CREDENTIALS: 'ERR_1002',
    TOKEN_EXPIRED: 'ERR_1003',
    TOKEN_INVALID: 'ERR_1004',
    PERMISSION_DENIED: 'ERR_1005',
    SESSION_EXPIRED: 'ERR_1006',
    ACCOUNT_LOCKED: 'ERR_1007',
    ACCOUNT_DISABLED: 'ERR_1008',

    // Validation Errors (2000-2999)
    VALIDATION_ERROR: 'ERR_2001',
    INVALID_INPUT: 'ERR_2002',
    MISSING_FIELD: 'ERR_2003',
    DUPLICATE_ENTRY: 'ERR_2004',
    INVALID_FORMAT: 'ERR_2005',
    INVALID_EMAIL: 'ERR_2006',
    INVALID_PHONE: 'ERR_2007',
    INVALID_DATE: 'ERR_2008',
    INVALID_AMOUNT: 'ERR_2009',
    FIELD_TOO_LONG: 'ERR_2010',
    FIELD_TOO_SHORT: 'ERR_2011',

    // Resource Errors (3000-3999)
    NOT_FOUND: 'ERR_3001',
    ALREADY_EXISTS: 'ERR_3002',
    CONFLICT: 'ERR_3003',
    RESOURCE_GONE: 'ERR_3004',
    RESOURCE_LOCKED: 'ERR_3005',

    // Booking Errors (4000-4999)
    BOOKING_NOT_FOUND: 'ERR_4001',
    BOOKING_INVALID_STATUS: 'ERR_4002',
    BOOKING_CANCELLED: 'ERR_4003',
    BOOKING_REFUNDED: 'ERR_4004',
    BOOKING_COMPLETED: 'ERR_4005',
    BOOKING_ALREADY_PAID: 'ERR_4006',
    BOOKING_NO_TICKETS: 'ERR_4007',
    BOOKING_EXPIRED: 'ERR_4008',
    BOOKING_NOT_ELIGIBLE: 'ERR_4009',
    BOOKING_LIMIT_EXCEEDED: 'ERR_4010',

    // Ticket Errors (5000-5999)
    TICKET_NOT_FOUND: 'ERR_5001',
    TICKET_ALREADY_USED: 'ERR_5002',
    TICKET_EXPIRED: 'ERR_5003',
    TICKET_CANCELLED: 'ERR_5004',
    TICKET_REFUNDED: 'ERR_5005',
    TICKET_ALREADY_CHECKED_IN: 'ERR_5006',
    TICKET_INVALID: 'ERR_5007',
    TICKET_NOT_ACTIVE: 'ERR_5008',
    TICKET_QR_GENERATION_FAILED: 'ERR_5009',

    // Event Errors (6000-6999)
    EVENT_NOT_FOUND: 'ERR_6001',
    EVENT_NOT_ACTIVE: 'ERR_6002',
    EVENT_CANCELLED: 'ERR_6003',
    EVENT_SOLD_OUT: 'ERR_6004',
    EVENT_NOT_PUBLIC: 'ERR_6005',
    EVENT_DATE_PASSED: 'ERR_6006',

    // Venue Errors (7000-7999)
    VENUE_NOT_FOUND: 'ERR_7001',
    VENUE_UNAVAILABLE: 'ERR_7002',
    VENUE_CAPACITY_EXCEEDED: 'ERR_7003',

    // Payment Errors (8000-8999)
    PAYMENT_FAILED: 'ERR_8001',
    PAYMENT_PENDING: 'ERR_8002',
    PAYMENT_DECLINED: 'ERR_8003',
    PAYMENT_TIMEOUT: 'ERR_8004',
    PAYMENT_ALREADY_PROCESSED: 'ERR_8005',
    INSUFFICIENT_FUNDS: 'ERR_8006',

    // WhatsApp Errors (9000-9999)
    WHATSAPP_NOT_CONNECTED: 'ERR_9001',
    WHATSAPP_SEND_FAILED: 'ERR_9002',
    WHATSAPP_INVALID_NUMBER: 'ERR_9003',
    WHATSAPP_BLOCKED: 'ERR_9004',
    WHATSAPP_TIMEOUT: 'ERR_9005',

    // System Errors (10000-10999)
    INTERNAL_ERROR: 'ERR_10001',
    SERVICE_UNAVAILABLE: 'ERR_10002',
    TIMEOUT: 'ERR_10003',
    DATABASE_ERROR: 'ERR_10004',
    NETWORK_ERROR: 'ERR_10005',
    RATE_LIMIT_EXCEEDED: 'ERR_10006',
    MAINTENANCE_MODE: 'ERR_10007',

    // QR Code Errors (11000-11999)
    QR_INVALID: 'ERR_11001',
    QR_EXPIRED: 'ERR_11002',
    QR_ALREADY_SCANNED: 'ERR_11003',
};

// ============================================
// ERROR MESSAGES
// ============================================

export const ERROR_MESSAGES = {};

// Authentication Errors
ERROR_MESSAGES[ERROR_CODES.UNAUTHORIZED] = 'You must be logged in to access this resource';
ERROR_MESSAGES[ERROR_CODES.INVALID_CREDENTIALS] = 'Invalid email or password';
ERROR_MESSAGES[ERROR_CODES.TOKEN_EXPIRED] = 'Your session has expired. Please log in again';
ERROR_MESSAGES[ERROR_CODES.TOKEN_INVALID] = 'Invalid authentication token';
ERROR_MESSAGES[ERROR_CODES.PERMISSION_DENIED] = 'You do not have permission to perform this action';
ERROR_MESSAGES[ERROR_CODES.SESSION_EXPIRED] = 'Your session has expired';
ERROR_MESSAGES[ERROR_CODES.ACCOUNT_LOCKED] = 'Your account has been locked. Please contact support';
ERROR_MESSAGES[ERROR_CODES.ACCOUNT_DISABLED] = 'Your account has been disabled';

// Validation Errors
ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR] = 'Validation failed';
ERROR_MESSAGES[ERROR_CODES.INVALID_INPUT] = 'Invalid input provided';
ERROR_MESSAGES[ERROR_CODES.MISSING_FIELD] = 'Required field is missing';
ERROR_MESSAGES[ERROR_CODES.DUPLICATE_ENTRY] = 'Duplicate entry found';
ERROR_MESSAGES[ERROR_CODES.INVALID_FORMAT] = 'Invalid format';
ERROR_MESSAGES[ERROR_CODES.INVALID_EMAIL] = 'Invalid email address';
ERROR_MESSAGES[ERROR_CODES.INVALID_PHONE] = 'Invalid phone number';
ERROR_MESSAGES[ERROR_CODES.INVALID_DATE] = 'Invalid date';
ERROR_MESSAGES[ERROR_CODES.INVALID_AMOUNT] = 'Invalid amount';
ERROR_MESSAGES[ERROR_CODES.FIELD_TOO_LONG] = 'Input is too long';
ERROR_MESSAGES[ERROR_CODES.FIELD_TOO_SHORT] = 'Input is too short';

// Resource Errors
ERROR_MESSAGES[ERROR_CODES.NOT_FOUND] = 'Resource not found';
ERROR_MESSAGES[ERROR_CODES.ALREADY_EXISTS] = 'Resource already exists';
ERROR_MESSAGES[ERROR_CODES.CONFLICT] = 'Resource conflict';
ERROR_MESSAGES[ERROR_CODES.RESOURCE_GONE] = 'Resource no longer available';
ERROR_MESSAGES[ERROR_CODES.RESOURCE_LOCKED] = 'Resource is locked';

// Booking Errors
ERROR_MESSAGES[ERROR_CODES.BOOKING_NOT_FOUND] = 'Booking not found';
ERROR_MESSAGES[ERROR_CODES.BOOKING_INVALID_STATUS] = 'Booking is in an invalid state for this operation';
ERROR_MESSAGES[ERROR_CODES.BOOKING_CANCELLED] = 'Booking has been cancelled';
ERROR_MESSAGES[ERROR_CODES.BOOKING_REFUNDED] = 'Booking has been refunded';
ERROR_MESSAGES[ERROR_CODES.BOOKING_COMPLETED] = 'Booking has been completed';
ERROR_MESSAGES[ERROR_CODES.BOOKING_ALREADY_PAID] = 'Booking has already been paid';
ERROR_MESSAGES[ERROR_CODES.BOOKING_NO_TICKETS] = 'No tickets found for this booking';
ERROR_MESSAGES[ERROR_CODES.BOOKING_EXPIRED] = 'Booking has expired';
ERROR_MESSAGES[ERROR_CODES.BOOKING_NOT_ELIGIBLE] = 'Booking is not eligible for this action';
ERROR_MESSAGES[ERROR_CODES.BOOKING_LIMIT_EXCEEDED] = 'Booking limit exceeded';

// Ticket Errors
ERROR_MESSAGES[ERROR_CODES.TICKET_NOT_FOUND] = 'Ticket not found';
ERROR_MESSAGES[ERROR_CODES.TICKET_ALREADY_USED] = 'Ticket has already been used';
ERROR_MESSAGES[ERROR_CODES.TICKET_EXPIRED] = 'Ticket has expired';
ERROR_MESSAGES[ERROR_CODES.TICKET_CANCELLED] = 'Ticket has been cancelled';
ERROR_MESSAGES[ERROR_CODES.TICKET_REFUNDED] = 'Ticket has been refunded';
ERROR_MESSAGES[ERROR_CODES.TICKET_ALREADY_CHECKED_IN] = 'Ticket has already been checked in';
ERROR_MESSAGES[ERROR_CODES.TICKET_INVALID] = 'Invalid ticket';
ERROR_MESSAGES[ERROR_CODES.TICKET_NOT_ACTIVE] = 'Ticket is not active';
ERROR_MESSAGES[ERROR_CODES.TICKET_QR_GENERATION_FAILED] = 'Failed to generate QR code for ticket';

// Event Errors
ERROR_MESSAGES[ERROR_CODES.EVENT_NOT_FOUND] = 'Event not found';
ERROR_MESSAGES[ERROR_CODES.EVENT_NOT_ACTIVE] = 'Event is not active';
ERROR_MESSAGES[ERROR_CODES.EVENT_CANCELLED] = 'Event has been cancelled';
ERROR_MESSAGES[ERROR_CODES.EVENT_SOLD_OUT] = 'Event is sold out';
ERROR_MESSAGES[ERROR_CODES.EVENT_NOT_PUBLIC] = 'Event is not public';
ERROR_MESSAGES[ERROR_CODES.EVENT_DATE_PASSED] = 'Event date has passed';

// Venue Errors
ERROR_MESSAGES[ERROR_CODES.VENUE_NOT_FOUND] = 'Venue not found';
ERROR_MESSAGES[ERROR_CODES.VENUE_UNAVAILABLE] = 'Venue is unavailable';
ERROR_MESSAGES[ERROR_CODES.VENUE_CAPACITY_EXCEEDED] = 'Venue capacity exceeded';

// Payment Errors
ERROR_MESSAGES[ERROR_CODES.PAYMENT_FAILED] = 'Payment processing failed';
ERROR_MESSAGES[ERROR_CODES.PAYMENT_PENDING] = 'Payment is pending';
ERROR_MESSAGES[ERROR_CODES.PAYMENT_DECLINED] = 'Payment was declined';
ERROR_MESSAGES[ERROR_CODES.PAYMENT_TIMEOUT] = 'Payment timed out';
ERROR_MESSAGES[ERROR_CODES.PAYMENT_ALREADY_PROCESSED] = 'Payment already processed';
ERROR_MESSAGES[ERROR_CODES.INSUFFICIENT_FUNDS] = 'Insufficient funds';

// WhatsApp Errors
ERROR_MESSAGES[ERROR_CODES.WHATSAPP_NOT_CONNECTED] = 'WhatsApp is not connected';
ERROR_MESSAGES[ERROR_CODES.WHATSAPP_SEND_FAILED] = 'Failed to send WhatsApp message';
ERROR_MESSAGES[ERROR_CODES.WHATSAPP_INVALID_NUMBER] = 'Invalid WhatsApp number';
ERROR_MESSAGES[ERROR_CODES.WHATSAPP_BLOCKED] = 'WhatsApp number is blocked';
ERROR_MESSAGES[ERROR_CODES.WHATSAPP_TIMEOUT] = 'WhatsApp request timed out';

// System Errors
ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR] = 'An unexpected error occurred';
ERROR_MESSAGES[ERROR_CODES.SERVICE_UNAVAILABLE] = 'Service is currently unavailable';
ERROR_MESSAGES[ERROR_CODES.TIMEOUT] = 'Request timed out';
ERROR_MESSAGES[ERROR_CODES.DATABASE_ERROR] = 'Database error occurred';
ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR] = 'Network error occurred';
ERROR_MESSAGES[ERROR_CODES.RATE_LIMIT_EXCEEDED] = 'Rate limit exceeded. Please try again later';
ERROR_MESSAGES[ERROR_CODES.MAINTENANCE_MODE] = 'System is under maintenance';

// QR Code Errors
ERROR_MESSAGES[ERROR_CODES.QR_INVALID] = 'Invalid QR code';
ERROR_MESSAGES[ERROR_CODES.QR_EXPIRED] = 'QR code has expired';
ERROR_MESSAGES[ERROR_CODES.QR_ALREADY_SCANNED] = 'QR code has already been scanned';

// ============================================
// ERROR UTILITIES
// ============================================

export const ErrorUtils = {
    /**
     * Get error message by code
     * @param {string} code - Error code
     * @param {string} defaultMessage - Default message if code not found
     * @returns {string}
     */
    getMessage: function(code, defaultMessage) {
        return ERROR_MESSAGES[code] || defaultMessage || 'An unknown error occurred';
    },

    /**
     * Create an error object
     * @param {string} code - Error code
     * @param {string} details - Additional details
     * @param {string} path - Request path
     * @returns {Object}
     */
    createError: function(code, details, path) {
        return {
            code: code,
            message: this.getMessage(code),
            details: details || null,
            timestamp: new Date().toISOString(),
            path: path || null,
        };
    },

    /**
     * Check if error is of a specific type
     * @param {string} code - Error code to check
     * @param {string} type - Error type category (auth, validation, booking, etc.)
     * @returns {boolean}
     */
    isType: function(code, type) {
        if (!code) return false;
        const prefixes = {
            auth: 'ERR_100',
            validation: 'ERR_200',
            resource: 'ERR_300',
            booking: 'ERR_400',
            ticket: 'ERR_500',
            event: 'ERR_600',
            venue: 'ERR_700',
            payment: 'ERR_800',
            whatsapp: 'ERR_900',
            system: 'ERR_1000',
            qr: 'ERR_1100',
        };
        const prefix = prefixes[type];
        return prefix ? code.startsWith(prefix) : false;
    },

    /**
     * Get the category of an error
     * @param {string} code - Error code
     * @returns {string}
     */
    getCategory: function(code) {
        if (!code) return 'unknown';
        if (code.startsWith('ERR_100')) return 'auth';
        if (code.startsWith('ERR_200')) return 'validation';
        if (code.startsWith('ERR_300')) return 'resource';
        if (code.startsWith('ERR_400')) return 'booking';
        if (code.startsWith('ERR_500')) return 'ticket';
        if (code.startsWith('ERR_600')) return 'event';
        if (code.startsWith('ERR_700')) return 'venue';
        if (code.startsWith('ERR_800')) return 'payment';
        if (code.startsWith('ERR_900')) return 'whatsapp';
        if (code.startsWith('ERR_1000')) return 'system';
        if (code.startsWith('ERR_1100')) return 'qr';
        return 'unknown';
    },

    /**
     * Check if an error is retryable
     * @param {string} code - Error code
     * @returns {boolean}
     */
    isRetryable: function(code) {
        const retryableCodes = [
            ERROR_CODES.TIMEOUT,
            ERROR_CODES.NETWORK_ERROR,
            ERROR_CODES.SERVICE_UNAVAILABLE,
            ERROR_CODES.WHATSAPP_TIMEOUT,
            ERROR_CODES.PAYMENT_TIMEOUT,
            ERROR_CODES.RATE_LIMIT_EXCEEDED,
        ];
        return retryableCodes.includes(code);
    },

    /**
     * Check if an error is client-side (user can fix)
     * @param {string} code - Error code
     * @returns {boolean}
     */
    isClientError: function(code) {
        if (!code) return false;
        const clientCodes = [
            ERROR_CODES.INVALID_CREDENTIALS,
            ERROR_CODES.INVALID_INPUT,
            ERROR_CODES.MISSING_FIELD,
            ERROR_CODES.INVALID_EMAIL,
            ERROR_CODES.INVALID_PHONE,
            ERROR_CODES.INVALID_AMOUNT,
            ERROR_CODES.FIELD_TOO_LONG,
            ERROR_CODES.FIELD_TOO_SHORT,
            ERROR_CODES.PAYMENT_DECLINED,
            ERROR_CODES.INSUFFICIENT_FUNDS,
        ];
        return clientCodes.includes(code);
    },

    /**
     * Get user-friendly error message for display
     * @param {string} code - Error code
     * @param {string} fallback - Fallback message
     * @returns {string}
     */
    getUserMessage: function(code, fallback) {
        const messages = {
            [ERROR_CODES.UNAUTHORIZED]: 'Please log in to continue',
            [ERROR_CODES.INVALID_CREDENTIALS]: 'Invalid email or password. Please try again',
            [ERROR_CODES.TOKEN_EXPIRED]: 'Your session has expired. Please log in again',
            [ERROR_CODES.PERMISSION_DENIED]: "You don't have permission to do that",
            [ERROR_CODES.BOOKING_NOT_FOUND]: 'Booking not found. Please check your reference number',
            [ERROR_CODES.TICKET_NOT_FOUND]: 'Ticket not found. Please check your ticket code',
            [ERROR_CODES.TICKET_ALREADY_USED]: 'This ticket has already been used',
            [ERROR_CODES.EVENT_SOLD_OUT]: 'This event is sold out',
            [ERROR_CODES.PAYMENT_FAILED]: 'Payment failed. Please try again',
            [ERROR_CODES.NETWORK_ERROR]: 'Network error. Please check your connection',
            [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable. Please try again later',
        };
        return messages[code] || fallback || this.getMessage(code);
    },
};

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
    ERROR_CODES,
    ERROR_MESSAGES,
    ErrorUtils,
};