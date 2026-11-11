// frontend/src/services/eventService.js
import api from './api';

const eventService = {
    // ============================================================
    // PUBLIC ENDPOINTS (no auth required)
    // Used by the landing page and any unauthenticated view.
    // ============================================================
    //
    // ✅ FIX [PUBLIC-EVENTS-SKIP-REDIRECT]:
    // Both public methods accept an optional `config` object and set
    // `skipAuthRedirect: true` by default. This is belt-and-braces on
    // top of api.js's PUBLIC_ENDPOINTS list:
    //
    //   • api.js already refuses to attach an Authorization header to
    //     URLs matching `/events/public/`, so a stale token can't be
    //     sent and JWTAuthentication can't reject the request.
    //
    //   • Even if that URL match somehow misses (e.g. a future
    //     endpoint rename that isn't reflected in api.js yet), the
    //     interceptor's 401 handler will see `skipAuthRedirect: true`
    //     and pass the error through without refreshing or
    //     redirecting to /login.
    //
    // The result: getPublicEvents() can NEVER cause a redirect away
    // from the landing page, no matter what state the token is in.
    // ============================================================

    /**
     * Fetch all public, upcoming events for the landing page.
     * Backend: GET /events/public/
     * Returns: { count, results: [...] }
     */
    getPublicEvents: async (config = {}) => {
        const response = await api.get('/events/public/', {
            skipAuthRedirect: true,
            ...config,
        });
        const payload = response.data;
        const publicRows = Array.isArray(payload)
            ? payload
            : (payload?.results || []);

        // A signed-in member should also see their organization's PRIVATE
        // events (and any other events they are entitled to). Guests never
        // reach this branch.
        const token = (
            localStorage.getItem('token') || sessionStorage.getItem('token')
        );
        if (!token) return payload;

        try {
            const memberRes = await api.get('/events/', {
                skipAuthRedirect: true,
            });
            const raw = memberRes.data;
            const memberRows = Array.isArray(raw)
                ? raw
                : (raw?.results || []);
            const entitled = memberRows.filter(
                (e) => e && (e.status === 'active' || e.status === 'published')
            );

            const byId = new Map();
            [...publicRows, ...entitled].forEach((event) => {
                if (event?.id) byId.set(event.id, event);
            });
            const results = Array.from(byId.values());
            return { count: results.length, results };
        } catch {
            return payload;
        }
    },

    /**
     * Fetch a single public event's details.
     * Backend: GET /events/public/:id/
     */
    getPublicEventDetails: async (id, config = {}) => {
        try {
            const response = await api.get(`/events/public/${id}/`, {
                skipAuthRedirect: true,
                ...config,
            });
            return response.data;
        } catch (err) {
            // Private event: public detail intentionally 404s. A signed-in
            // member can read it through the authenticated endpoint.
            const token = (
                localStorage.getItem('token') || sessionStorage.getItem('token')
            );
            if (
                token
                && [403, 404].includes(err?.response?.status)
            ) {
                const response = await api.get(`/events/${id}/`, {
                    skipAuthRedirect: true,
                });
                return response.data;
            }
            throw err;
        }
    },

    // ============================================================
    // AUTHENTICATED ENDPOINTS (admin / organizer)
    // ============================================================

    // Get all events (auth required — admin/organizer view)
    getAll: async () => {
        const response = await api.get('/events/');
        return response.data;
    },

    // Get single event (auth required)
    getById: async (id) => {
        const response = await api.get(`/events/${id}/`);
        return response.data;
    },

    // Create event
    create: async (eventData) => {
        const response = await api.post('/events/', eventData);
        return response.data;
    },

    // Update event
    update: async (id, eventData) => {
        const response = await api.put(`/events/${id}/`, eventData);
        return response.data;
    },

    // Delete event
    delete: async (id) => {
        const response = await api.delete(`/events/${id}/`);
        return response.data;
    },

    // Publish event
    publish: async (id) => {
        const response = await api.post(`/events/${id}/publish/`);
        return response.data;
    },

    // Duplicate event
    duplicate: async (id) => {
        const response = await api.post(`/events/${id}/duplicate/`);
        return response.data;
    },

    // Get event stats
    getStats: async (id) => {
        const response = await api.get(`/events/${id}/stats/`);
        return response.data;
    },
};

export default eventService;