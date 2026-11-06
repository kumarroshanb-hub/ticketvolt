// frontend/src/services/membershipService.js
import api from './api';

const membershipService = {
    // ---- Tiers (public + admin) ----
    listTiers: async ({ organizationId } = {}) => {
        const res = await api.get('/membership-tiers/', {
            params: organizationId ? { organization_id: organizationId } : {},
        });
        return res.data?.results || res.data || [];
    },

    // Admin-scoped: returns ALL tiers of the org (incl. inactive/private),
    // regardless of the caller's membership role, because the viewset's
    // get_queryset already surfaces everything to owner/admin.
    listOrgTiers: async (organizationId) => {
        const res = await api.get('/membership-tiers/', {
            params: { organization_id: organizationId },
        });
        return res.data?.results || res.data || [];
    },

    getTier: async (id) => {
        const res = await api.get(`/membership-tiers/${id}/`);
        return res.data;
    },

    createTier: async (payload) => {
        const res = await api.post('/membership-tiers/', payload);
        return res.data;
    },

    updateTier: async (id, payload) => {
        const res = await api.patch(`/membership-tiers/${id}/`, payload);
        return res.data;
    },

    deleteTier: async (id) => {
        const res = await api.delete(`/membership-tiers/${id}/`);
        return res.data;
    },

    // ---- Membership (buyer-facing) ----
    myMemberships: async () => {
        const res = await api.get('/memberships/mine/');
        return res.data || [];
    },

    get: async (id) => {
        const res = await api.get(`/memberships/${id}/`);
        return res.data;
    },

    createCheckout: async ({ tierId, gateway }) => {
        const res = await api.post('/memberships/checkout/', {
            tier_id: tierId,
            ...(gateway ? { gateway } : {}),
        });
        return res.data;
    },

    verifyCheckout: async ({ membershipPaymentId, params }) => {
        const res = await api.post('/memberships/verify/', {
            membership_payment_id: membershipPaymentId,
            params,
        });
        return res.data;
    },

    cancel: async (id, reason = '') => {
        const res = await api.post(`/memberships/${id}/cancel/`, { reason });
        return res.data;
    },

    // ---- Dependents ----
    addDependent: async (membershipId, payload) => {
        const res = await api.post(`/memberships/${membershipId}/dependents/`, payload);
        return res.data;
    },

    removeDependent: async (membershipId, depId) => {
        const res = await api.delete(`/memberships/${membershipId}/dependents/${depId}/`);
        return res.data;
    },

    promoteDependent: async (membershipId, depId) => {
        const res = await api.post(
            `/memberships/${membershipId}/dependents/${depId}/promote/`,
        );
        return res.data;
    },

        // ---- Offline / cash signup ----
    requestOfflineMembership: async ({ tierId, method = 'cash', reference = '' }) => {
        const res = await api.post('/memberships/checkout/', {
            tier_id: tierId,
            payment_method: method,
            offline_reference: reference,
        });
        return res.data;
    },

    // ---- Owner/Admin review ----
    listPendingOffline: async ({ organizationId } = {}) => {
        const res = await api.get('/memberships/pending-offline/', {
            params: organizationId ? { organization_id: organizationId } : {},
        });
        return res.data;   // { count, results }
    },

    reviewOffline: async (membershipId, { action, reference = '', reason = '' }) => {
        const res = await api.post(`/memberships/${membershipId}/review/`, {
            action, reference, reason,
        });
        return res.data;
    },

    bulkReviewOffline: async ({ action, membershipIds, reference = '', reason = '' }) => {
        const res = await api.post('/memberships/bulk-review/', {
            action,
            membership_ids: membershipIds,
            reference,
            reason,
        });
        return res.data;
    },
};

export default membershipService;