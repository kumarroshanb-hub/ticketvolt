// frontend/src/services/venueMasterService.js
import api from './api';

/**
 * Normalise the API response shape for the venue-masters endpoint.
 */
function unwrapList(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    return [];
}

/**
 * Group key for a master row: the Venue it belongs to.
 * Falls back to the master's own id if no venue linkage is present,
 * which treats every row as distinct (matching legacy behavior).
 */
const venueGroupKey = (m) =>
    m?.venue_id
    ?? m?.venue?.id
    ?? m?.venue_name
    ?? m?.venue?.name
    ?? `__solo__${m?.id}`;

/**
 * Rank a master row so the "latest" one wins within its venue group.
 * Preference order:
 *   1. is_current === true  (backend-authoritative)
 *   2. numeric `version`    (highest)
 *   3. `updated_at`         (newest)
 *   4. `id`                 (highest, last resort)
 */
const masterRank = (m) => {
    const current = m?.is_current ? 1 : 0;
    const version = Number(m?.version);
    const v = Number.isFinite(version) ? version : 0;
    const ts = Date.parse(m?.updated_at || m?.created_at || '');
    const t = Number.isNaN(ts) ? 0 : ts;
    const id = Number(m?.id);
    const i = Number.isFinite(id) ? id : 0;
    return [current, v, t, i];
};

const compareRank = (a, b) => {
    for (let idx = 0; idx < a.length; idx += 1) {
        if (a[idx] !== b[idx]) return a[idx] - b[idx];
    }
    return 0;
};

/**
 * Collapse a raw master list to one row per venue — the latest version.
 * Preserves the order in which each venue first appeared in the input.
 */
export function pickLatestMasters(masters) {
    if (!Array.isArray(masters) || masters.length === 0) return [];

    const latestByVenue = new Map();
    for (const m of masters) {
        const key = venueGroupKey(m);
        const current = latestByVenue.get(key);
        if (!current || compareRank(masterRank(m), masterRank(current)) > 0) {
            latestByVenue.set(key, m);
        }
    }
    return Array.from(latestByVenue.values());
}

const venueMasterService = {
    /**
     * List venue masters (every version, as returned by the API).
     *
     * Supported filters:
     *   - search                → free-text search
     *   - hasReservedSeating     → boolean
     *   - hasLayout              → boolean
     *   - venueId                → only masters for a specific Venue
     *   - organizationId         → only masters owned by that tenant
     */
    async list({ search, hasReservedSeating, hasLayout, venueId, organizationId } = {}) {
        const params = {};
        if (search) params.search = search;
        if (hasReservedSeating !== undefined) {
            params.has_reserved_seating = hasReservedSeating ? '1' : '0';
        }
        if (hasLayout !== undefined) {
            params.has_layout = hasLayout ? '1' : '0';
        }
        if (venueId) params.venue_id = venueId;
        if (organizationId) params.organization_id = organizationId;
        const { data } = await api.get('/venue-masters/', { params });
        return unwrapList(data);
    },

    /**
     * ✅ List venue masters collapsed to the latest version per venue.
     * This is what pickers/dropdowns should use. Use `list()` if you
     * need the full history (e.g. an audit view).
     */
    async listLatest(options = {}) {
        const all = await this.list(options);
        return pickLatestMasters(all);
    },

    /**
     * Convenience helper: latest master for a specific venue.
     */
    async listForVenue(venueId) {
        if (!venueId) return [];
        try {
            return await this.listLatest({ venueId });
        } catch (err) {
            const all = await this.list();
            const mine = all.filter(
                (m) => String(m.venue_id) === String(venueId),
            );
            return pickLatestMasters(mine);
        }
    },

    async get(id) {
        const { data } = await api.get(`/venue-masters/${id}/`);
        return data;
    },
};

export default venueMasterService;