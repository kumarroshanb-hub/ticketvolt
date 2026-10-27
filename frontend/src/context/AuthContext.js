// frontend/src/context/AuthContext.js
import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const IDLE_TIMEOUT_MS =
    (parseInt(process.env.REACT_APP_IDLE_TIMEOUT_MINUTES, 10) || 30) * 60 * 1000;

const REFRESH_CAP_ENFORCED = true;
const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

const IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const persistUser = (userData) => {
    if (!userData) {
        localStorage.removeItem('user');
        sessionStorage.removeItem('user');
        return;
    }
    const serialized = JSON.stringify(userData);
    localStorage.setItem('user', serialized);
    sessionStorage.setItem('user', serialized);
};

/**
 * Clear all auth material from both storages and the axios header.
 * Does NOT navigate — callers decide whether to redirect.
 */
const clearAuthStorage = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('user');
    delete api.defaults.headers.common['Authorization'];
};

/**
 * Decode a JWT's payload (second segment) without verifying the signature.
 * Returns null on any parse error. We only use this to read `exp`.
 */
const decodeJwtPayload = (token) => {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
};

/**
 * Returns true if the refresh token exists AND its `exp` claim is in the past.
 * Returns false if the token is missing, has no `exp`, or is still valid.
 */
const isRefreshTokenExpired = () => {
    const token =
        localStorage.getItem('refresh_token') ||
        sessionStorage.getItem('refresh_token');
    if (!token) return false;
    const payload = decodeJwtPayload(token);
    if (!payload || typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now();
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const AuthProvider = ({ children }) => {
    const [user, setUserState] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);

    // Refs so the idle-timer effect can read the latest values without
    // being recreated on every render.
    const isAuthenticatedRef = useRef(isAuthenticated);
    useEffect(() => {
        isAuthenticatedRef.current = isAuthenticated;
    }, [isAuthenticated]);

    // -----------------------------------------------------------------------
    // Central setters
    // -----------------------------------------------------------------------

    const setUser = useCallback((userData) => {
        if (!userData) {
            setUserState(null);
            setIsAuthenticated(false);
            persistUser(null);
            return;
        }
        persistUser(userData);
        setUserState(userData);
        setIsAuthenticated(true);
    }, []);

    const patchUser = useCallback((patch) => {
        setUserState((prev) => {
            if (!prev) return prev;
            const next = { ...prev, ...patch };
            if (patch && typeof patch.profile === 'object' && prev.profile) {
                next.profile = { ...prev.profile, ...patch.profile };
            }
            persistUser(next);
            return next;
        });
    }, []);

    // -----------------------------------------------------------------------
    // Logout
    // -----------------------------------------------------------------------
    const logout = useCallback(({ redirect = true, reason = null } = {}) => {
        if (reason) {
            console.warn(`🔓 Logging out (${reason})`);
        } else {
            console.log('🔓 Logging out...');
        }
        clearAuthStorage();
        setUserState(null);
        setIsAuthenticated(false);
        if (redirect && typeof window !== 'undefined') {
            const path = window.location.pathname;
            if (path !== '/login' && path !== '/register') {
                window.location.href = '/login';
            }
        }
    }, []);

    // -----------------------------------------------------------------------
    // ✅ FIX [REDIRECT-LOOP-2]: listen for the interceptor's force-logout
    // event. api.js dispatches this BEFORE navigating to /login, so we
    // clear React state synchronously.
    // -----------------------------------------------------------------------
    useEffect(() => {
        const handleForceLogout = () => {
            console.warn('🔓 Force-logout event received from API interceptor');
            clearAuthStorage();
            setUserState(null);
            setIsAuthenticated(false);
        };
        window.addEventListener('auth:force-logout', handleForceLogout);
        return () => {
            window.removeEventListener('auth:force-logout', handleForceLogout);
        };
    }, []);

    // -----------------------------------------------------------------------
    // Bootstrap
    // -----------------------------------------------------------------------
    //
    // ✅ FIX [BOOTSTRAP-VERIFY-BEFORE-PAINT]:
    // Do NOT paint the cached user optimistically. Paint only after
    // /auth/me/ succeeds. Painting first opens a window where
    // isAuthenticated=true is visible to PublicOnlyRoute on /login
    // (the interceptor's redirect lands there after the 401), causing
    // the visible redirect loop.
    //
    // The cost: a brief spinner instead of an instant paint of
    // possibly-stale user data. Worth it — the alternative is a
    // redirect loop.
    // -----------------------------------------------------------------------
    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            try {
                const token =
                    localStorage.getItem('token') ||
                    sessionStorage.getItem('token');

                if (!token) {
                    if (!cancelled) {
                        setUserState(null);
                        setIsAuthenticated(false);
                    }
                    return;
                }

                // Cheap pre-check: if the refresh token is already past
                // its `exp`, don't even attempt /auth/me/ — we're logged out.
                if (isRefreshTokenExpired()) {
                    console.warn('⚠️ Refresh token expired on bootstrap — logging out');
                    clearAuthStorage();
                    if (!cancelled) {
                        setUserState(null);
                        setIsAuthenticated(false);
                    }
                    return;
                }

                // Authoritative verify: /auth/me/. Paint user ONLY on success.
                api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                try {
                    const res = await api.get('/auth/me/');
                    if (cancelled) return;
                    setUser(res.data);
                    console.log('✅ Auth verified via /auth/me/');
                } catch (refreshErr) {
                    const status = refreshErr.response?.status;
                    console.warn(
                        '⚠️ /auth/me/ refresh failed',
                        status || refreshErr.message
                    );
                    // 401 → dead token; clear everything.
                    // Any other error (500, network) → also treat as
                    // logged out for this render, but still clear so
                    // the next mount starts clean.
                    clearAuthStorage();
                    if (!cancelled) {
                        setUserState(null);
                        setIsAuthenticated(false);
                    }
                }
            } catch (error) {
                console.error('Auth bootstrap error:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        bootstrap();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // -----------------------------------------------------------------------
    // Hard-cap check — the refresh token's `exp` claim.
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (!isAuthenticated || !REFRESH_CAP_ENFORCED) return undefined;

        const check = () => {
            if (!isAuthenticatedRef.current) return;
            if (isRefreshTokenExpired()) {
                logout({ reason: 'refresh token expired (hard cap)' });
            }
        };

        check();
        const id = setInterval(check, EXPIRY_CHECK_INTERVAL_MS);
        return () => clearInterval(id);
    }, [isAuthenticated, logout]);

    // -----------------------------------------------------------------------
    // Idle timeout.
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (!isAuthenticated) return undefined;
        if (IDLE_TIMEOUT_MS <= 0) return undefined;

        let idleTimer = null;
        let lastActivity = Date.now();

        const scheduleLogout = () => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                const elapsed = Date.now() - lastActivity;
                if (elapsed >= IDLE_TIMEOUT_MS) {
                    logout({ reason: `idle for ${Math.round(elapsed / 60000)} min` });
                } else {
                    scheduleLogout();
                }
            }, IDLE_TIMEOUT_MS);
        };

        const onActivity = () => {
            lastActivity = Date.now();
            scheduleLogout();
        };

        const onVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return;
            const elapsed = Date.now() - lastActivity;
            if (elapsed >= IDLE_TIMEOUT_MS) {
                logout({ reason: `idle for ${Math.round(elapsed / 60000)} min (background)` });
                return;
            }
            lastActivity = Date.now();
            scheduleLogout();
        };

        IDLE_EVENTS.forEach((evt) =>
            window.addEventListener(evt, onActivity, { passive: true })
        );
        document.addEventListener('visibilitychange', onVisibilityChange);
        scheduleLogout();

        return () => {
            if (idleTimer) clearTimeout(idleTimer);
            IDLE_EVENTS.forEach((evt) =>
                window.removeEventListener(evt, onActivity)
            );
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [isAuthenticated, logout]);

    // -----------------------------------------------------------------------
    // Login
    // -----------------------------------------------------------------------
    const login = useCallback(async (email, password) => {
        console.log('🔐 Login function called with:', { email, password: password ? '***' : 'missing' });

        try {
            if (!email || !password) {
                return { success: false, error: 'Email and password are required' };
            }

            const response = await api.post('/auth/login/', { email, password });

            if (response.data && response.data.access) {
                const { access, refresh, user: userData } = response.data;

                const userToStore = {
                    ...userData,
                    role: userData?.role || 'user',
                };

                localStorage.setItem('token', access);
                localStorage.setItem('refresh_token', refresh || 'mock-refresh-token');
                sessionStorage.setItem('token', access);
                sessionStorage.setItem('refresh_token', refresh || 'mock-refresh-token');

                setUser(userToStore);
                api.defaults.headers.common['Authorization'] = `Bearer ${access}`;

                console.log('✅ Login successful');
                return { success: true, data: response.data };
            }

            return {
                success: false,
                error: 'Server returned invalid response. Please try again.',
            };
        } catch (error) {
            console.error('❌ Login error:', error);
            if (error.response?.status === 401) {
                return {
                    success: false,
                    error: 'Invalid credentials. Please check your email and password.',
                };
            }
            return {
                success: false,
                error:
                    error.response?.data?.detail ||
                    error.response?.data?.error ||
                    error.message ||
                    'Login failed',
            };
        }
    }, [setUser]);

    // -----------------------------------------------------------------------
    // Context value
    // -----------------------------------------------------------------------
    const value = {
        user,
        isAuthenticated,
        loading,
        login,
        logout,
        setUser,
        patchUser,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;