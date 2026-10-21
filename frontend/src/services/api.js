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
// REQUEST INTERCEPTOR
// ============================================================
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// ============================================================
// ✅ FIX [P31]: single-flight refresh + loop guard
// ------------------------------------------------------------
// The old interceptor fired a separate refresh call for EVERY
// parallel 401. When the refresh itself returned 401 (expired
// refresh token), `_retry` was already true on the original request
// so the code fell through to `window.location.href = '/login'` for
// each in-flight request — producing a redirect storm that
// occasionally looped back to the same page.
//
// Three fixes:
//   1. One shared `refreshPromise` — parallel 401s await the same
//      refresh.
//   2. If the *retried* request returns 401 again, we give up and
//      reject immediately. No further refresh attempts.
//   3. We never redirect if we're already on `/login` — that was the
//      source of the redirect loop.
//
// ✅ FIX [GUEST-BOOKING]: config.skipAuthRedirect honours callers
// that expect a request may be unauthenticated (e.g. a guest
// submitting a booking). Without this flag, any 401 on such a
// request triggered a hard redirect to /login — wiping the guest's
// in-progress booking. Passing `skipAuthRedirect: true` on the
// request means:
//   • The refresh flow is skipped (there's nothing to refresh if
//     the caller is a guest).
//   • No hard redirect happens.
//   • The 401 (or whatever error) is rejected to the caller so the
//     component can surface an inline error message.
// ============================================================
let isRefreshing = false;
let refreshPromise = null;

const redirectToLoginOnce = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    if (
        typeof window !== 'undefined' &&
        window.location.pathname !== '/login' &&
        window.location.pathname !== '/register'
    ) {
        window.location.href = '/login';
    }
};

api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        const originalRequest = error.config;
        if (!originalRequest) {
            return Promise.reject(error);
        }

        // Only handle 401 for non-login requests.
        const isLogin = originalRequest.url?.includes('/auth/login/');

        // ✅ FIX [GUEST-BOOKING]: some requests are *expected* to be
        // unauthenticated — e.g. a guest submitting a booking. If the
        // caller set `skipAuthRedirect` on the request config, we must
        // NOT attempt a token refresh and MUST NOT hard-redirect to
        // /login when the response is 401. We just reject and let the
        // calling component show the error inline.
        const skipAuthRedirect = originalRequest.skipAuthRedirect === true;

        if (error.response?.status !== 401 || isLogin || skipAuthRedirect) {
            return Promise.reject(error);
        }

        // ✅ FIX [P31]: if we've already retried this request once,
        // do NOT try to refresh again. This is the loop guard.
        if (originalRequest._retry) {
            console.error('❌ 401 after refresh — giving up and logging out');
            redirectToLoginOnce();
            return Promise.reject(error);
        }

        originalRequest._retry = true;

        // ✅ FIX [P31]: single-flight refresh. Parallel requests that
        // all got 401 wait on the SAME refresh call instead of firing
        // N separate refresh attempts.
        if (!isRefreshing) {
            isRefreshing = true;
            refreshPromise = (async () => {
                try {
                    const refreshToken = localStorage.getItem('refresh_token');
                    if (!refreshToken) {
                        throw new Error('No refresh token available');
                    }
                    const response = await axios.post(`${API_URL}/auth/refresh/`, {
                        refresh: refreshToken,
                    });
                    const { access } = response.data || {};
                    if (!access) {
                        throw new Error('Refresh response missing access token');
                    }
                    localStorage.setItem('token', access);
                    api.defaults.headers.common['Authorization'] = `Bearer ${access}`;
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
            console.error('❌ Token refresh failed:', refreshError.message);
            redirectToLoginOnce();
            return Promise.reject(refreshError);
        }
    }
);

export default api;