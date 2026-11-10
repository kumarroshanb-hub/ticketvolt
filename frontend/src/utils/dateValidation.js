// frontend/src/utils/dateValidation.js
/**
 * Shared date-range validation.
 *
 * All helpers return `null` on success and a human-readable error string on
 * failure — the same convention already used by `canLeaveBasics` in
 * `pages/Events/Create.js`.
 */

/**
 * Validate a start/end date pair.
 *
 * @param {string|Date|undefined|null} start
 * @param {string|Date|undefined|null} end
 * @param {Object}  [opts]
 * @param {boolean} [opts.allowEqual=true]    permit end == start
 * @param {boolean} [opts.requireFuture=false] require start >= now
 * @param {boolean} [opts.requireBoth=false]  treat "both empty" as invalid
 * @param {string}  [opts.startLabel='Start date']
 * @param {string}  [opts.endLabel='End date']
 * @param {Date}    [opts.now=new Date()]
 * @returns {string|null}
 */
export function validateDateRange(start, end, opts = {}) {
    const {
        allowEqual = true,
        requireFuture = false,
        requireBoth = false,
        startLabel = 'Start date',
        endLabel = 'End date',
        now = new Date(),
    } = opts;

    if (!start && !end) {
        return requireBoth ? `${startLabel} is required.` : null;
    }
    if (!start) return `${startLabel} is required.`;
    if (!end) return `${endLabel} is required.`;

    const s = start instanceof Date ? start : new Date(start);
    const e = end instanceof Date ? end : new Date(end);

    if (Number.isNaN(s.getTime())) return `${startLabel} is not a valid date.`;
    if (Number.isNaN(e.getTime())) return `${endLabel} is not a valid date.`;

    if (allowEqual ? e < s : e <= s) {
        return `${endLabel} must be ${
            allowEqual ? 'on or ' : ''
        }after ${startLabel.toLowerCase()}.`;
    }

    if (requireFuture && s < now) {
        return `${startLabel} must be in the future.`;
    }

    return null;
}

/**
 * Throw-style variant for use inside submit handlers.
 * @throws {Error} when the range is invalid.
 */
export function assertDateRange(start, end, opts = {}) {
    const err = validateDateRange(start, end, opts);
    if (err) throw new Error(err);
}

export default validateDateRange;