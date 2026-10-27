// frontend/src/services/api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// ============================================================
// PUBLIC ENDPOINT REGISTRY
// ------------------------------------------------------------
// ✅ FIX [AUTH-401-ON-PUBLIC]:
// DRF's JWTAuthentication runs BEFORE permission classes. If a
// stale/invalid token is present on an AllowAny endpoint, JWT auth
// raises AuthenticationFailed and the request returns 401 — even
// though the view would have allowed anonymous access. That 401
// then enters the refresh flow, which fails, which redirects to
// /login.
//
// The fix: never attach an Authorization header to these endpoints.
// JWTAuthentication.authenticate() returns None when no header is
// present, AllowAny lets the request through, and the endpoint
// returns 200.
// ============================================================

const PUBLIC_ENDPOINTS = [
    '/events/public/',
    '/auth/login/',
    '/auth/refresh/',
    '/auth/register/',
    '/auth/forgot-password/',
    '/auth/confirm-password-reset/',
    '/auth/verify-email/',
    '/settings/public/',
];

const isPublicEndpoint = (url) => {
    if (!url) return false;
    // Pre-signed S3/GCS URLs must never carry our bearer token.
    if (url.startsWith('http://') || url.startsWith('https://')) return true;
    return PUBLIC_ENDPOINTS.some((p) => url.includes(p));
};

// ============================================================
// REQUEST INTERCEPTOR
// ============================================================
api.interceptors.request.use(
    (config) => {
        if (!isPublicEndpoint(config.url)) {
            const token = localStorage.getItem('token');
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// ============================================================
// SINGLE-FLIGHT REFRESH + LOOP GUARD
// ------------------------------------------------------------
// Responsibilities:
//   • refresh an expired access token exactly once when N parallel
//     requests all get 401;
//   • persist the ROTATED refresh token (SIMPLE_JWT has
//     ROTATE_REFRESH_TOKENS=True);
//   • redirect to /login exactly once on unrecoverable auth failure
//     (never from public pages);
//   • notify AuthContext BEFORE navigating, so React state
//     (isAuthenticated) is false by the time /login renders;
//   • respect `skipAuthRedirect: true` for guest flows.
// ============================================================

let isRefreshing = false;
let refreshPromise = null;

/**
 * Wipe all auth material from storage + axios. Does NOT navigate.
 * Kept in sync with AuthContext.clearAuthStorage().
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

// ✅ FIX [REDIRECT-LOOP-PUBLIC-PATHS]:
// Never redirect away from a public page. If Landing.js is on "/"
// and a background request (e.g. /auth/me/ from bootstrap) 401s,
// we stay put and let the page render its own state.
const PUBLIC_PATHS = [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/gate',
    '/unauthorized',
];

// ✅ FIX [GUEST-FLOW]:
// Guest-allowed app paths. A guest is a *supported* state on these
// pages — the booking wizard intentionally allows anonymous checkout.
// A 401 here means "the guest tried an authenticated action from the
// wizard" (e.g. validate_discount), which should surface as an error
// in the UI, NOT trigger a hard redirect to /login. The submit call
// itself is guarded by `skipAuthRedirect: !isAuthenticated` in
// CreateBooking.js.
const GUEST_ALLOWED_PREFIXES = [
    '/app/bookings/create',
];

const isPublicPath = (path) =>
    PUBLIC_PATHS.includes(path) ||
    path.startsWith('/reset-password') ||
    GUEST_ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'));

/**
 * Navigate to /login and clear auth.
 *
 * ✅ FIX [REDIRECT-LOOP]: no module-level latch.
 * ✅ FIX [REDIRECT-LOOP-2]: dispatch force-logout event first.
 * ✅ FIX [REDIRECT-LOOP-PUBLIC-PATHS]: bail on public paths.
 * ✅ FIX [GUEST-FLOW]: bail on guest-allowed app paths.
 */
const redirectToLoginOnce = () => {
    clearAuthStorage();

    // Notify AuthContext first, synchronously.
    if (typeof window !== 'undefined') {
        try {
            window.dispatchEvent(new CustomEvent('auth:force-logout'));
        } catch {
            // Older browsers / SSR — ignore.
        }
    }

    if (typeof window === 'undefined') return;
    const path = window.location.pathname;

    // ✅ Never redirect away from public or guest-allowed pages.
    if (isPublicPath(path)) return;

    window.location.href = '/login';
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (!originalRequest) {
            return Promise.reject(error);
        }

        const isLogin = originalRequest.url?.includes('/auth/login/');
        const isRefresh = originalRequest.url?.includes('/auth/refresh/');
        const skipAuthRedirect = originalRequest.skipAuthRedirect === true;
        // ✅ Public endpoints never trigger the refresh/redirect flow.
        const isPublic = isPublicEndpoint(originalRequest.url);

        if (
            error.response?.status !== 401 ||
            isLogin ||
            isRefresh ||
            skipAuthRedirect ||
            isPublic
        ) {
            return Promise.reject(error);
        }

        // Loop guard: if this request has already been retried once,
        // do NOT refresh again. Give up and log out.
        if (originalRequest._retry) {
            console.error('❌ 401 after refresh — giving up and logging out');
            redirectToLoginOnce();
            return Promise.reject(error);
        }

        originalRequest._retry = true;

        // ---- Single-flight refresh ----
        if (!isRefreshing) {
            isRefreshing = true;
            refreshPromise = (async () => {
                try {
                    const refreshToken =
                        localStorage.getItem('refresh_token') ||
                        sessionStorage.getItem('refresh_token');
                    if (!refreshToken) {
                        throw new Error('No refresh token available');
                    }

                    const response = await axios.post(
                        `${API_URL}/auth/refresh/`,
                        { refresh: refreshToken }
                    );

                    const { access, refresh: rotatedRefresh } =
                        response.data || {};

                    if (!access) {
                        throw new Error(
                            'Refresh response missing access token'
                        );
                    }

                    localStorage.setItem('token', access);
                    sessionStorage.setItem('token', access);

                    if (rotatedRefresh) {
                        localStorage.setItem('refresh_token', rotatedRefresh);
                        sessionStorage.setItem('refresh_token', rotatedRefresh);
                    }

                    api.defaults.headers.common.Authorization = `Bearer ${access}`;
                    console.log('✅ Token refreshed successfully');
                    return access;
                } finally {
                    isRefreshing = false;
                }
            })();
        }

        try {
            const access = await refreshPromise;
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${access}`;
            return api(originalRequest);
        } catch (refreshError) {
            console.error(
                '❌ Token refresh failed:',
                refreshError.message
            );
            redirectToLoginOnce();
            return Promise.reject(refreshError);
        }
    }
);

export default api;