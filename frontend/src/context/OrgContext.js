// frontend/src/context/OrgContext.js
import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const OrgContext = createContext(null);

const STORAGE_KEY = 'current_org_id';

// Defensive sentinel the backend may emit for superusers viewing an org
// they are not a member of. Treated as "no tenant role" on the frontend.
const PLATFORM_ADMIN_SENTINEL = 'platform_admin';

/**
 * Organization context.
 *
 * `organizations` is the caller's membership list from
 * `/organizations/mine/`. Each item carries:
 *   { id, name, role, ... }
 * where `role` is the caller's MEMBERSHIP role in that org
 * (owner | admin | staff | member).
 *
 * IMPORTANT: A user can be a member of multiple orgs with different
 * roles in each. The role for the CURRENT org is
 * `currentOrg?.role` — never a value on the User object.
 *
 * NOTE: A superuser viewing an org they do not belong to may receive
 * `role: 'platform_admin'` from the backend (or `null`). Both are
 * normalized to `null` in `currentOrgRole` so tenant role checks never
 * see the sentinel. Platform-wide admin is exposed separately via
 * `isPlatformAdmin` / `isPlatformAdminOfCurrentOrg`.
 */
export const OrgProvider = ({ children }) => {
    const { isAuthenticated, user } = useAuth();
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentOrgId, setCurrentOrgIdState] = useState(
        () => localStorage.getItem(STORAGE_KEY) || null
    );

    const setCurrentOrgId = useCallback((id) => {
        setCurrentOrgIdState(id || null);
        if (id) localStorage.setItem(STORAGE_KEY, id);
        else localStorage.removeItem(STORAGE_KEY);
    }, []);

    const load = useCallback(async () => {
        if (!isAuthenticated) {
            setOrganizations([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await api.get('/organizations/mine/');
            const orgs = Array.isArray(res.data)
                ? res.data
                : (res.data?.results || []);
            setOrganizations(orgs);

            setCurrentOrgIdState((prev) => {
                const stillValid = prev && orgs.some((o) => String(o.id) === String(prev));
                if (stillValid) return prev;
                if (orgs.length > 0) {
                    // Tenant users always get ONE active org. The top-frame
                    // tenant filter is no longer shown; this keeps API
                    // requests scoped without a selector.
                    localStorage.setItem(STORAGE_KEY, orgs[0].id);
                    return orgs[0].id;
                }
                localStorage.removeItem(STORAGE_KEY);
                return null;
            });
        } catch (e) {
            if (e?.response?.status !== 403) {
                console.warn('Failed to load organizations:', e?.message);
            }
            setOrganizations([]);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, user?.id, user?.memberships]);

    useEffect(() => { load(); }, [load]);

    const currentOrg = useMemo(
        () => organizations.find(
            (o) => String(o.id) === String(currentOrgId)
        ) || null,
        [organizations, currentOrgId],
    );

    // The caller's MEMBERSHIP role in the currently-selected org.
    // null when the user hasn't selected an org, has no memberships,
    // or the backend returned the 'platform_admin' sentinel.
    const rawRole = currentOrg?.role || null;
    const currentOrgRole = (
        rawRole && String(rawRole).toLowerCase() !== PLATFORM_ADMIN_SENTINEL
    ) ? rawRole : null;

    // Only the system-level user sees all tenants. `is_staff` is not a
    // tenant-wide data privilege.
    const isPlatformAdmin = Boolean(user?.is_superuser);
    // Ownership is a property of an Admin-level membership; legacy rows
    // may still carry role='owner' until migrated.
    const isOwner = Boolean(
        currentOrg?.is_owner
        || (currentOrg?.role && String(currentOrg.role).toLowerCase() === 'owner')
    );

    // Superuser with no tenant membership in the current org.
    // Useful for consumers that need to distinguish "platform admin
    // who also owns this org" from "platform admin viewing a foreign org".
    const isPlatformAdminOfCurrentOrg = isPlatformAdmin && !currentOrgRole;

    const value = useMemo(() => ({
        organizations,
        currentOrg,
        currentOrgId,
        currentOrgRole,
        isOwner,
        setCurrentOrgId,
        loading,
        refresh: load,
        isPlatformAdmin,
        isPlatformAdminOfCurrentOrg,
        // True when the caller is a Regular User with zero memberships.
        // Any tenant page will prompt them to create/join an org.
        hasNoMemberships:
            !loading && isAuthenticated && !isPlatformAdmin &&
            organizations.length === 0,
        // Legacy alias — some pages still reference this name.
        needsOrganization:
            !loading && isAuthenticated && !isPlatformAdmin &&
            organizations.length === 0,
    }), [
        organizations, currentOrg, currentOrgId, currentOrgRole,
        isOwner, setCurrentOrgId, loading, load, isPlatformAdmin,
        isPlatformAdminOfCurrentOrg, isAuthenticated,
    ]);

    return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
};

export const useOrg = () => {
    const ctx = useContext(OrgContext);
    if (!ctx) throw new Error('useOrg must be used within OrgProvider');
    return ctx;
};

export default OrgContext;