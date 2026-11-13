import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import { useOrg } from './OrgContext';

const FeatureContext = createContext(null);

export const FeatureProvider = ({ children }) => {
    const { isAuthenticated } = useAuth();
    const { currentOrgId } = useOrg() || {};
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!isAuthenticated || !currentOrgId) {
            setData(null);
            return;
        }
        setLoading(true);
        try {
            const res = await api.get('/features/mine/', {
                params: { organization_id: currentOrgId },
                skipAuthRedirect: true,
            });
            setData(res.data);
        } catch {
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, currentOrgId]);

    useEffect(() => { refresh(); }, [refresh]);

    const enabled = useMemo(() => new Set(data?.features || []), [data]);
    const value = useMemo(() => ({
        features: data?.features || [],
        definitions: data?.definitions || [],
        package: data?.package || null,
        loading,
        refresh,
        hasFeature: (key) => enabled.has(key),
    }), [data, enabled, loading, refresh]);

    return <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>;
};

export const useFeature = () => useContext(FeatureContext) || {
    features: [], definitions: [], package: null, loading: false,
    refresh: () => {}, hasFeature: () => false,
};

export default FeatureContext;
