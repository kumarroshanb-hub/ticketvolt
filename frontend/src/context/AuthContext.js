// frontend/src/context/AuthContext.js
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// ✅ Helper: write the user blob to whichever storages are active.
//    We keep both localStorage and sessionStorage in sync because
//    legacy code paths read from either one.
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

export const AuthProvider = ({ children }) => {
    const [user, setUserState] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);

    // ✅ Central setter — keeps state + storage + api header in sync.
    //    Exposed via context so a profile-save page can push a fresh
    //    user without forcing a re-login.
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

    // ✅ Merge a partial patch into the existing user (and storage).
    //    Convenience for pages that only know a couple of fields —
    //    e.g. after the user edits their phone on a profile form.
    const patchUser = useCallback((patch) => {
        setUserState((prev) => {
            if (!prev) return prev;
            const next = { ...prev, ...patch };
            // If the caller passes a nested `profile`, shallow-merge it
            // rather than clobbering the whole object.
            if (patch && typeof patch.profile === 'object' && prev.profile) {
                next.profile = { ...prev.profile, ...patch.profile };
            }
            persistUser(next);
            return next;
        });
    }, []);

    // ✅ On mount: restore from storage, then re-hydrate from /me/.
    //
    //    Why the second step matters:
    //      • Users who logged in BEFORE the backend started returning
    //        `phone` / `whatsapp_number` have a stale `user` blob in
    //        localStorage. Without the /me/ call, CreateBooking's
    //        prefill effect reads `user.phone === undefined` and does
    //        nothing.
    //      • Any profile edit (admin changes a phone, user updates
    //        their address) is invisible until the next login unless
    //        we refresh.
    //
    //    The cached blob is still painted immediately so there's no
    //    flash of "logged out" while the request is in flight.
    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            try {
                const token =
                    localStorage.getItem('token') ||
                    sessionStorage.getItem('token');
                const storedUser =
                    localStorage.getItem('user') ||
                    sessionStorage.getItem('user');

                if (!token) {
                    if (!cancelled) {
                        setUserState(null);
                        setIsAuthenticated(false);
                    }
                    return;
                }

                // Fast path: paint the cached user (may be stale).
                if (storedUser) {
                    try {
                        const cached = JSON.parse(storedUser);
                        if (!cancelled) {
                            setUserState(cached);
                            setIsAuthenticated(true);
                        }
                        console.log('✅ Auth restored from storage');
                    } catch (parseErr) {
                        console.error('Error parsing cached user:', parseErr);
                        localStorage.removeItem('user');
                        sessionStorage.removeItem('user');
                    }
                }

                // Authoritative refresh: pick up new fields
                // (phone / whatsapp_number / is_organizer / profile)
                // added since the last login, and any profile edits.
                api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                try {
                    const res = await api.get('/auth/me/');
                    if (cancelled) return;
                    // ✅ Store the FULL /me/ body — it now includes
                    //    phone, whatsapp_number, is_organizer, profile.
                    setUser(res.data);
                    console.log('✅ Auth refreshed from /auth/me/');
                    console.log('👤 User:', res.data);
                } catch (refreshErr) {
                    // 401 → token expired; 403 → forbidden. Either way,
                    // fall back to whatever we had cached (the interceptor
                    // will redirect on the next real request). Don't nuke
                    // the session on a transient network blip.
                    const status = refreshErr.response?.status;
                    console.warn(
                        '⚠️ /auth/me/ refresh failed',
                        status || refreshErr.message
                    );
                    if (status === 401) {
                        // Token is definitively dead — clear it.
                        localStorage.removeItem('token');
                        sessionStorage.removeItem('token');
                        localStorage.removeItem('refresh_token');
                        sessionStorage.removeItem('refresh_token');
                        delete api.defaults.headers.common['Authorization'];
                        if (!cancelled) {
                            setUserState(null);
                            setIsAuthenticated(false);
                        }
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
        // setUser is stable (useCallback with no deps).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const login = useCallback(async (email, password) => {
        console.log('🔐 Login function called with:', { email, password: password ? '***' : 'missing' });

        try {
            if (!email || !password) {
                return { success: false, error: 'Email and password are required' };
            }

            const response = await api.post('/auth/login/', { email, password });

            if (response.data && response.data.access) {
                const { access, refresh, user: userData } = response.data;

                // ✅ Store the FULL user object returned by LoginView.
                //    It now includes phone / whatsapp_number /
                //    is_organizer, so CreateBooking can prefill without
                //    an extra /me/ call.
                const userToStore = {
                    ...userData,
                    role: userData?.role || 'user',
                };

                localStorage.setItem('token', access);
                localStorage.setItem('refresh_token', refresh || 'mock-refresh-token');
                sessionStorage.setItem('token', access);
                sessionStorage.setItem('refresh_token', refresh || 'mock-refresh-token');

                // Central setter handles storage + state + header.
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

    const logout = useCallback(() => {
        console.log('🔓 Logging out...');
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('refresh_token');
        sessionStorage.removeItem('user');
        delete api.defaults.headers.common['Authorization'];
        setUserState(null);
        setIsAuthenticated(false);
        window.location.href = '/';
    }, []);

    const value = {
        user,
        isAuthenticated,
        loading,
        login,
        logout,
        // ✅ Exposed so profile-save pages can push fresh data into
        //    context without a re-login.
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