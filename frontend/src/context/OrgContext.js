// frontend/src/context/OrgContext.js
import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const OrgContext = createContext(null);

const STORAGE_KEY = 'current_org_id';

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
                if (orgs.length === 1) {
                    localStorage.setItem(STORAGE_KEY, orgs[0].id);
                    return orgs[0].id;
                }
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
    }, [isAuthenticated]);

    useEffect(() => { load(); }, [load]);

    const currentOrg = useMemo(
        () => organizations.find(
            (o) => String(o.id) === String(currentOrgId)
        ) || null,
        [organizations, currentOrgId],
    );

    // The caller's MEMBERSHIP role in the currently-selected org.
    // null when the user hasn't selected an org or has no memberships.
    const currentOrgRole = currentOrg?.role || null;

    const isPlatformAdmin = Boolean(user?.is_staff || user?.is_superuser);

    const value = useMemo(() => ({
        organizations,
        currentOrg,
        currentOrgId,
        currentOrgRole,
        setCurrentOrgId,
        loading,
        refresh: load,
        isPlatformAdmin,
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
        setCurrentOrgId, loading, load, isPlatformAdmin, isAuthenticated,
    ]);

    return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
};

export const useOrg = () => {
    const ctx = useContext(OrgContext);
    if (!ctx) throw new Error('useOrg must be used within OrgProvider');
    return ctx;
};

export default OrgContext;