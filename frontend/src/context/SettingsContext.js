// frontend/src/context/SettingsContext.js
import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';

const SettingsContext = createContext(null);

const DEFAULTS = {
    currency_code: 'HKD',
    currency_symbol: 'HK$',
    currency_locale: 'en-HK',
    currency_name: 'Hong Kong Dollar',
    country: 'Hong Kong',
    country_code: 'HK',
    default_timezone: 'Asia/Hong_Kong',
    org_name: 'TicketVolt',
    org_email: '',
    org_logo_url: '',
    email_from_name: 'TicketVolt',
};

// ✅ FIX [SETTINGS-401-LANDING]:
// Don't call /api/settings/ when the user is logged out.
// The endpoint is public on the backend now, but this guard
// still prevents an unnecessary request on the public landing
// page (and prevents a stale token from being sent).
const hasAuthToken = () => {
    try {
        return Boolean(
            localStorage.getItem('token') ||
            sessionStorage.getItem('token')
        );
    } catch {
        // Private-mode / disabled storage → treat as no token.
        return false;
    }
};

export const SettingsProvider = ({ children }) => {
    const [settings, setSettingsState] = useState(DEFAULTS);
    const [catalog, setCatalog] = useState({
        countries: [],
        currency_codes: [],
        fallback: DEFAULTS,
    });
    const [loading, setLoading] = useState(true);
    const location = useLocation();

    const loadSettings = useCallback(async (silent = false) => {
        // ✅ FIX [SETTINGS-401-LANDING]:
        // Logged-out visitors keep DEFAULTS. No request → no 401
        // → no interceptor force-redirect on the public landing page.
        if (!hasAuthToken()) {
            if (!silent) setLoading(false);
            return;
        }

        if (!silent) setLoading(true);
        try {
            // ✅ Belt-and-braces: skipAuthRedirect tells api.js not to
            // bounce to /login on 401. Even if a token expires mid-session,
            // settings should never kick the user out of the app.
            const res = await api.get('/settings/', {
                skipAuthRedirect: true,
            });
            const { catalog: cat, ...payload } = res.data || {};
            setSettingsState((prev) => ({ ...prev, ...payload }));
            if (cat) setCatalog(cat);
        } catch (e) {
            const status = e?.response?.status;
            // ✅ 401/403 → keep current settings silently. The user
            // will get a fresh token on next login and settings will
            // refresh then. Don't toast, don't redirect.
            if (status !== 401 && status !== 403) {
                if (process.env.NODE_ENV === 'development') {
                    // eslint-disable-next-line no-console
                    console.warn('Failed to load system settings:', e?.message);
                }
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        loadSettings(false);
    }, [loadSettings]);

    // ✅ Refresh settings silently when the user navigates to a new page
    // This ensures if the Super Admin changed the currency, it updates immediately.
    // Skipped for logged-out visitors by the guard inside loadSettings().
    useEffect(() => {
        if (!loading) {
            loadSettings(true);
        }
    }, [location.pathname, loadSettings]); // eslint-disable-line react-hooks/exhaustive-deps

    const setSettings = useCallback((patch) => {
        setSettingsState((prev) => ({ ...prev, ...patch }));
    }, []);

    const formatMoney = useCallback(
        (amount, override = {}) => {
            const currency = override.currency || settings.currency_code || 'USD';
            const locale = override.locale || settings.currency_locale || 'en-US';
            const n = Number(amount || 0);
            try {
                return new Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency,
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                }).format(n);
            } catch (e) {
                return `${settings.currency_symbol || ''}${n.toFixed(2)}`;
            }
        },
        [settings.currency_code, settings.currency_locale, settings.currency_symbol],
    );

    const getCountryConfig = useCallback(
        (countryName) => {
            if (!countryName) return null;
            const target = String(countryName).trim().toLowerCase();
            return (
                catalog.countries.find(
                    (c) => (c.country_name || c.name || '').toLowerCase() === target,
                ) || null
            );
        },
        [catalog.countries],
    );

    const getCurrencyConfig = useCallback(
        (currencyCode) => {
            if (!currencyCode) return null;
            const target = String(currencyCode).trim().toUpperCase();
            return (
                catalog.countries.find(
                    (c) => (c.currency_code || c.code || '').toUpperCase() === target,
                ) || null
            );
        },
        [catalog.countries],
    );

    const value = useMemo(
        () => ({
            settings,
            catalog,
            loading,
            setSettings,
            refresh: loadSettings,
            reload: loadSettings,
            formatMoney,
            getCountryConfig,
            getCurrencyConfig,
        }),
        [settings, catalog, loading, setSettings, loadSettings, formatMoney, getCountryConfig, getCurrencyConfig],
    );

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
    return ctx;
};

export default SettingsContext;