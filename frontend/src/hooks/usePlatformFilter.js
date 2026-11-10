// frontend/src/hooks/usePlatformFilter.js
import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';

/**
 * Centralized hook for platform-admin-aware list filtering.
 *
 * Platform Admins (Super Admins) see ALL records across ALL organizations
 * by default, with an optional per-org filter. Tenant users are automatically
 * scoped to their own organization(s) by the backend's visible_* helpers.
 *
 * Usage in any list view:
 *   const {
 *     params, isPlatformAdmin, orgFilter, setOrgFilter,
 *     organizations, resetPage,
 *   } = usePlatformFilter();
 *
 *   // Merge `params` into your API query:
 *   const res = await api.get('/events/', { params: { ...params, page, search } });
 *
 *   // Render the filter dropdown in the toolbar:
 *   <OrgFilterSelect ... />
 */
export const usePlatformFilter = () => {
    const { user } = useAuth();
    const { organizations = [], currentOrgId } = useOrg() || {};

    // Only a SYSTEM-LEVEL user (superuser) may see cross-tenant data.
    // `is_staff` is Django-admin access only and must not widen tenant scope.
    const isPlatformAdmin = Boolean(user?.is_superuser);

    // Platform admins can optionally narrow to one org; '' = all orgs
    const [orgFilter, setOrgFilter] = useState('');

    // Build query params based on role
    const params = useMemo(() => {
        const p = {};
        if (isPlatformAdmin) {
            // Super Admin: only filter when they explicitly pick an org.
            // Empty string → no org filter → backend returns ALL records.
            if (orgFilter) {
                p.organization_id = orgFilter;
            }
        } else {
            // Tenant user: scope to their active org (backend enforces anyway).
            if (currentOrgId) {
                p.organization_id = currentOrgId;
            }
        }
        return p;
    }, [isPlatformAdmin, orgFilter, currentOrgId]);

    // Convenience: reset to page 1 whenever the filter changes
    const resetPage = useCallback(() => {
        // List views should call their own setPage(1) here.
        // Kept as a no-op hook so callers can wire it up.
    }, []);

    return {
        params,
        isPlatformAdmin,
        orgFilter,
        setOrgFilter,
        organizations,
        resetPage,
    };
};

export default usePlatformFilter;