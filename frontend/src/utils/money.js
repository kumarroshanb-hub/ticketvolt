// frontend/src/utils/money.js
// Pure numeric money helpers — no React, fully unit-testable.
// Currency formatting is handled by SettingsContext
// (`useSettings().formatMoney`) so a currency change in Settings
// re-renders every page automatically.

export const getNetAmount = (booking) => {
    if (!booking) return 0;
    if (booking.net_amount !== undefined && booking.net_amount !== null) {
        return Number(booking.net_amount);
    }
    return Number(booking.total_amount || 0) - Number(booking.discount_applied || 0);
};

export const getGrossAmount = (booking) => Number(booking?.total_amount || 0);

export const getDiscountAmount = (booking) => Number(booking?.discount_applied || 0);

// Deprecated: kept only for any file that still imports it directly.
// Prefer `useSettings().formatMoney` in components so currency changes
// propagate. Uses USD to match the backend default.
export const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;