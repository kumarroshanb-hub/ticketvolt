// frontend/src/context/OrgContext.js
import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const OrgContext = createContext(null);

const STORAGE_KEY = 'current_org_id';

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

            // Auto-select: keep existing selection if still valid; else
            // pick the only org if there is exactly one.
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
            // Guest users / unaffiliated users won't have any orgs — this
            // is expected. Don't spam the console.
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

    const isPlatformAdmin = Boolean(user?.is_staff || user?.is_superuser);

    const value = useMemo(() => ({
        organizations,
        currentOrg,
        currentOrgId,
        setCurrentOrgId,
        loading,
        refresh: load,
        isPlatformAdmin,
        // ✅ True when the caller has no orgs but needs one to create
        // venues / events. Frontend surfaces this as a "create org"
        // call-to-action.
        needsOrganization:
            !loading && isAuthenticated && !isPlatformAdmin &&
            organizations.length === 0,
    }), [
        organizations, currentOrg, currentOrgId, setCurrentOrgId,
        loading, load, isPlatformAdmin, isAuthenticated,
    ]);

    return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
};

export const useOrg = () => {
    const ctx = useContext(OrgContext);
    if (!ctx) throw new Error('useOrg must be used within OrgProvider');
    return ctx;
};

export default OrgContext;