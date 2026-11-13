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
// ROLE SEMANTICS (post-backend-fix)
// ---------------------------------------------------------------------------
// `user.role` is the GLOBAL account role and is one of:
//   'owner'  → organization manager (was 'admin' in older payloads)
//   'staff'
//   'member'
//   'user'   → regular user with no org membership
//
// It is NOT the per-org membership role. Per-org roles live on
// `useOrg().currentOrgRole`, never here.
//
// AuthContext is therefore ROLE-AGNOSTIC: it is a pass-through for
// whatever the backend emits and does not branch on `role`.
// Tenant role checks must read `useOrg().currentOrgRole`.
// Platform-admin checks read `user.is_staff` / `user.is_superuser`.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const IDLE_TIMEOUT_MS =
    (parseInt(process.env.REACT_APP_IDLE_TIMEOUT_MINUTES, 10) || 30) * 60 * 1000;

const REFRESH_CAP_ENFORCED = true;
const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

const IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

// Bump this whenever role semantics (or any persisted user shape) change.
// On mount, a mismatch invalidates the cached user in both storages so
// stale pre-fix payloads (e.g. role='admin') can't survive a deploy.
const AUTH_SCHEMA_VERSION = '2';
const AUTH_SCHEMA_VERSION_KEY = 'auth_schema_version';

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
    // ✅ FIX [AUTH-SCHEMA-VERSION]: invalidate stale cached user on deploy.
    // Runs BEFORE bootstrap so a pre-fix cached payload (role='admin') can
    // never be painted. We keep the tokens — bootstrap will re-fetch
    // /auth/me/ and repopulate `user` from the authoritative source.
    // -----------------------------------------------------------------------
    useEffect(() => {
        try {
            if (localStorage.getItem(AUTH_SCHEMA_VERSION_KEY) !== AUTH_SCHEMA_VERSION) {
                localStorage.removeItem('user');
                sessionStorage.removeItem('user');
                localStorage.setItem(AUTH_SCHEMA_VERSION_KEY, AUTH_SCHEMA_VERSION);
            }
        } catch {
            // Storage unavailable (private mode / quota) — ignore.
        }
    }, []);

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
        // Tell the backend before clearing tokens so the profile no longer
        // appears as an active JWT session on the admin sessions page.
        const refreshToken = localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
        if (refreshToken) {
            api.post('/auth/logout/', { refresh: refreshToken }).catch(() => {});
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
    // Login (Supports both Standard and Magic Link flows)
    // -----------------------------------------------------------------------
    //
    // NOTE: `userData.role` / `resUserData.role` is the GLOBAL account role
    // ('owner' | 'staff' | 'member' | 'user'). After the backend fix, a
    // manager arrives as role='owner' (previously 'admin'). It is NOT the
    // per-org membership role. Do not branch on it here.
    // -----------------------------------------------------------------------
    const login = useCallback(async (emailOrToken, passwordOrRefresh, userData) => {
        try {
            // ✅ MAGIC LINK FLOW: First argument is the access token string
            if (typeof emailOrToken === 'string' && emailOrToken.startsWith('ey')) {
                const token = emailOrToken;
                const refresh = passwordOrRefresh;
                const userToStore = {
                    ...userData,
                    // Global account role — pass-through. Backend now
                    // emits 'owner' for managers (was 'admin'). Only
                    // default when the field is genuinely absent.
                    role: userData?.role ?? 'user',
                };

                localStorage.setItem('token', token);
                localStorage.setItem('refresh_token', refresh || '');
                sessionStorage.setItem('token', token);
                sessionStorage.setItem('refresh_token', refresh || '');

                setUser(userToStore);
                api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

                if (process.env.NODE_ENV === 'development') {
                    // eslint-disable-next-line no-console
                    console.log(
                        '✅ Magic link login successful (global role =',
                        userToStore.role,
                        ')'
                    );
                }
                return { success: true, data: { access: token, refresh, user: userToStore } };
            }

            // ✅ STANDARD LOGIN FLOW
            if (process.env.NODE_ENV === 'development') {
                // eslint-disable-next-line no-console
                console.log('🔐 Standard login called with:', {
                    email: emailOrToken,
                    password: passwordOrRefresh ? '***' : 'missing',
                });
            }

            if (!emailOrToken || !passwordOrRefresh) {
                return { success: false, error: 'Email and password are required' };
            }

            const response = await api.post('/auth/login/', { 
                email: emailOrToken, 
                password: passwordOrRefresh 
            });

            if (response.data && response.data.access) {
                const { access, refresh, user: resUserData } = response.data;

                const userToStore = {
                    ...resUserData,
                    // Global account role — pass-through. Backend now
                    // emits 'owner' for managers (was 'admin'). Only
                    // default when the field is genuinely absent.
                    role: resUserData?.role ?? 'user',
                };

                localStorage.setItem('token', access);
                localStorage.setItem('refresh_token', refresh || 'mock-refresh-token');
                sessionStorage.setItem('token', access);
                sessionStorage.setItem('refresh_token', refresh || 'mock-refresh-token');

                setUser(userToStore);
                api.defaults.headers.common['Authorization'] = `Bearer ${access}`;

                if (process.env.NODE_ENV === 'development') {
                    // eslint-disable-next-line no-console
                    console.log(
                        '✅ Standard login successful (global role =',
                        userToStore.role,
                        ')'
                    );
                }
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