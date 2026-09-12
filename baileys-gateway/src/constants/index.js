/**
 * WhatsApp Gateway Constants
 * Re-export from shared constants
 */

// Import from shared
const ticket = require('../../../shared/constants/ticket');
const booking = require('../../../shared/constants/booking');

module.exports = {
    ...ticket,
    ...booking,
};