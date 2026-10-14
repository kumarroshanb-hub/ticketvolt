// frontend/src/utils/datetime.js
// Datetime <-> input helpers shared by Events and Bookings.

/**
 * Convert an ISO-8601 string (from the API, always UTC / aware) into
 * the string format that `<input type="datetime-local">` expects, using
 * the BROWSER's local timezone.
 */
export const formatDateForInput = (isoString) => {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return '';
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
        return '';
    }
};

/**
 * Convert the value from `<input type="datetime-local">` into an
 * ISO-8601 string WITH an explicit UTC offset.
 */
export const inputToIso = (localValue) => {
    if (!localValue) return null;
    try {
        const d = new Date(localValue);
        if (isNaN(d.getTime())) return null;
        return d.toISOString();
    } catch {
        return null;
    }
};