// frontend/src/utils/money.js
// Pure money helpers — no React, fully unit-testable.

export const getNetAmount = (booking) => {
    if (!booking) return 0;
    if (booking.net_amount !== undefined && booking.net_amount !== null) {
        return Number(booking.net_amount);
    }
    return Number(booking.total_amount || 0) - Number(booking.discount_applied || 0);
};

export const getGrossAmount = (booking) => Number(booking?.total_amount || 0);

export const getDiscountAmount = (booking) => Number(booking?.discount_applied || 0);

export const formatMoney = (value) => `₹${Number(value || 0).toFixed(2)}`;