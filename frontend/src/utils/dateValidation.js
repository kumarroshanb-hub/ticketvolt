// frontend/src/utils/dateValidation.js
/**
 * Shared date-range validation.
 *
 * All helpers return `null` on success and a human-readable error string on
 * failure — the same convention already used by `canLeaveBasics` in
 * `pages/Events/Create.js`.
 */
import i18n from '../i18n';

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
        return requireBoth ? i18n.t('validation.startRequired', { label: startLabel }) : null;
    }
    if (!start) return i18n.t('validation.startRequired', { label: startLabel });
    if (!end) return i18n.t('validation.startRequired', { label: endLabel });

    const s = start instanceof Date ? start : new Date(start);
    const e = end instanceof Date ? end : new Date(end);

    if (Number.isNaN(s.getTime())) return i18n.t('validation.invalidDate', { label: startLabel });
    if (Number.isNaN(e.getTime())) return i18n.t('validation.invalidDate', { label: endLabel });

    if (allowEqual ? e < s : e <= s) {
        return i18n.t(
            allowEqual ? 'validation.endAfterStart' : 'validation.endAfterStartStrict',
            { endLabel, startLabel: startLabel.toLowerCase() },
        );
    }

    if (requireFuture && s < now) {
        return i18n.t('validation.startFuture', { label: startLabel });
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