// frontend/src/features/events/eventRequirements.js
//
// Centralised business rules for when Sessions and Tiers are mandatory.
// Kept in one place so the form validator, the editors, and the submit
// payload builder all agree.

export const EVENT_FLOW = {
    TICKETED: 'ticketed',
    PAID_REGISTRATION: 'paid_registration',
    FREE_REGISTRATION: 'free_registration',
};

/**
 * @param {object} opts
 * @param {string} opts.eventFlow         one of EVENT_FLOW.*
 * @param {boolean} opts.hasReservedSeating
 * @returns {{
 *   tiersRequired: boolean,
 *   tiersApplicable: boolean,   // should the TiersEditor render at all?
 *   sessionsRequired: boolean,
 *   sessionsApplicable: boolean, // should the SessionsEditor render at all?
 * }}
 */
export const getEventRequirements = ({ eventFlow, hasReservedSeating }) => {
    const flow = eventFlow || EVENT_FLOW.TICKETED;

    // Reserved seating prices via the Seats step — tiers are never
    // applicable there, regardless of flow.
    const tiersApplicable = !hasReservedSeating
        && (flow === EVENT_FLOW.TICKETED || flow === EVENT_FLOW.PAID_REGISTRATION);

    // Free registration auto-creates a GA tier, so the editor is hidden
    // and nothing is required.
    const tiersRequired = tiersApplicable && flow === EVENT_FLOW.PAID_REGISTRATION
        ? true
        : tiersApplicable && flow === EVENT_FLOW.TICKETED;

    // Sessions are only meaningful/required for ticketed events.
    const sessionsApplicable = flow === EVENT_FLOW.TICKETED;
    const sessionsRequired = sessionsApplicable;

    return {
        tiersApplicable,
        tiersRequired,
        sessionsApplicable,
        sessionsRequired,
    };
};

/**
 * Validate sessions against the requirement. Returns an error string or null.
 * A session is considered "filled" when it has a start and end time.
 */
export const validateSessions = (sessions, { required }) => {
    if (!required) return null;
    const filled = (sessions || []).filter(
        (s) => s && s.start_time && s.end_time
    );
    if (filled.length === 0) {
        return 'Add at least one session (start and end time).';
    }
    return null;
};

/**
 * Validate tiers against the requirement. Returns an error string or null.
 * A tier is considered "filled" when it has a name and a non-negative price.
 */
export const validateTiers = (tiers, { required }) => {
    if (!required) return null;
    const filled = (tiers || []).filter(
        (t) => t && String(t.name || '').trim() !== '' && t.price !== '' && t.price !== null
    );
    if (filled.length === 0) {
        return 'Add at least one ticket tier (name and price).';
    }
    return null;
};