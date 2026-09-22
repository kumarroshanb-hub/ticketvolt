// QRScannerApp/src/services/api.js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Network from 'expo-network';
import NetInfo from '@react-native-community/netinfo';

// ==================== CONFIGURATION ====================

const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_URL;

let currentApiUrl = '';
let isInitialized = false;
let networkListenerActive = false;

if (__DEV__) {
    console.log('📡 Initializing API...');
    console.log(
        '📡 Build-time URL (EXPO_PUBLIC_API_URL):',
        PRODUCTION_API_URL || '(not set)'
    );
}

// ==================== TUNING CONSTANTS ====================
const HEALTH_CHECK_TIMEOUT_MS = 1500;
const DISCOVERY_PROBE_TIMEOUT_MS = 400;
const DEFAULT_PORTS = [8000, 8080];
const SCAN_BATCH_SIZE = 8;

// ==================== NETWORK DETECTION ====================

const getLocalIp = async () => {
    try {
        return await Network.getIpAddressAsync();
    } catch (error) {
        if (__DEV__) console.error('❌ Failed to get local IP:', error.message);
        return null;
    }
};

const getNetworkInfo = async () => {
    try {
        return await NetInfo.fetch();
    } catch (error) {
        if (__DEV__) console.error('❌ Failed to get network info:', error);
        return null;
    }
};

// ==================== HEALTH CHECK HELPERS ====================

const probeHealth = async (url, timeoutMs = HEALTH_CHECK_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'text/plain, application/json' },
            signal: controller.signal,
        });

        if (!response.ok) return false;

        const text = await response.text();
        const trimmed = (text || '').trim();

        if (trimmed === 'OK') return true;

        try {
            const json = JSON.parse(trimmed);
            if (json && (json.status === 'ok' || json.status === 'healthy')) {
                return true;
            }
        } catch {
            // Not JSON — fine, fall through.
        }

        return false;
    } catch {
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
};

// ==================== FIND LOCAL BACKEND ====================

const findLocalBackend = async () => {
    try {
        const localIp = await getLocalIp();
        if (!localIp) {
            if (__DEV__) console.log('⚠️ Could not get local IP');
            return null;
        }

        if (__DEV__) console.log('📡 Local IP:', localIp);

        const parts = localIp.split('.');
        if (parts.length !== 4) return null;

        const base = parts.slice(0, 3).join('.');
        const currentOctet = parseInt(parts[3], 10);

        const ipList = [];
        ipList.push(currentOctet);

        const commonIps = [19, 20, 21, 22, 23, 24, 25, 30, 40, 50, 100, 101, 102, 103, 150, 151, 152, 200, 201, 202, 203, 250, 251, 252, 253, 254, 1, 2, 3];
        for (const ip of commonIps) {
            if (!ipList.includes(ip)) ipList.push(ip);
        }

        const rangeStart = Math.max(1, currentOctet - 20);
        const rangeEnd = Math.min(254, currentOctet + 20);
        for (let i = rangeStart; i <= rangeEnd; i++) {
            if (!ipList.includes(i)) ipList.push(i);
        }

        for (let i = 1; i <= 254; i++) {
            if (!ipList.includes(i)) ipList.push(i);
        }

        if (__DEV__) console.log('🔍 Searching for backend on subnet:', base);

        const port = 8000;

        for (const ip of ipList) {
            const healthUrl = `http://${base}.${ip}:${port}/api/health/`;
            const ok = await probeHealth(healthUrl, DISCOVERY_PROBE_TIMEOUT_MS);

            if (ok) {
                const backendUrl = `http://${base}.${ip}:${port}/api`;
                if (__DEV__) console.log('✅ Found backend at:', backendUrl);
                await AsyncStorage.setItem('lastWorkingIp', `${base}.${ip}`);
                return backendUrl;
            }
        }

        if (__DEV__) console.log('❌ No backend found on subnet:', base);
        return null;

    } catch (error) {
        if (__DEV__) console.error('❌ Error finding local backend:', error);
        return null;
    }
};

// ==================== GET BACKEND URL ====================
//
// Priority (highest first):
//   1. Runtime override from Settings screen (AsyncStorage 'apiUrl')
//      — only honored in dev builds (__DEV__). This is what lets you
//      retarget the app without rebuilding.
//   2. Build-time EXPO_PUBLIC_API_URL — used in production always,
//      and in dev when no runtime override exists.
//   3. Last working IP from a previous discovery.
//   4. LAN discovery.
//   5. Cloud / tunnel URL.
//   6. Emulator fallback.
//
const getBackendUrl = async () => {
    try {
        // 1. Runtime override (Settings screen). Only in dev builds.
        if (__DEV__) {
            const savedUrl = await AsyncStorage.getItem('apiUrl');
            if (savedUrl) {
                if (__DEV__) console.log('📡 [dev override] Using saved URL:', savedUrl);
                return savedUrl;
            }
        }

        // 2. Build-time URL.
        if (PRODUCTION_API_URL) {
            if (__DEV__) console.log('📡 Using build-time URL:', PRODUCTION_API_URL);
            return PRODUCTION_API_URL;
        }

        // 3. Last known-good IP.
        const lastWorkingIp = await AsyncStorage.getItem('lastWorkingIp');
        if (lastWorkingIp) {
            const url = `http://${lastWorkingIp}:8000/api`;
            if (__DEV__) console.log('📡 Using last working IP:', url);
            return url;
        }

        // 4. LAN discovery.
        const netInfo = await getNetworkInfo();
        if (netInfo && netInfo.type === 'wifi' && netInfo.isConnected) {
            const localUrl = await findLocalBackend();
            if (localUrl) return localUrl;
        }

        // 5. Cloud fallbacks.
        if (netInfo && (netInfo.type === 'cellular' || netInfo.type === 'unknown')) {
            const cloudUrl = await AsyncStorage.getItem('cloudUrl');
            if (cloudUrl) return cloudUrl;
        }
        const ngrokUrl = await AsyncStorage.getItem('ngrokUrl');
        if (ngrokUrl) return ngrokUrl;

        // 6. Emulator fallback.
        let fallbackUrl = 'http://localhost:8000/api';
        if (Platform.OS === 'android') {
            fallbackUrl = 'http://10.0.2.2:8000/api';
        }
        if (__DEV__) console.log('⚠️ Using fallback URL:', fallbackUrl);
        return fallbackUrl;

    } catch (error) {
        if (__DEV__) console.error('❌ Error getting backend URL:', error);
        let fallbackUrl = 'http://localhost:8000/api';
        if (Platform.OS === 'android') {
            fallbackUrl = 'http://10.0.2.2:8000/api';
        }
        return fallbackUrl;
    }
};

// ==================== AXIOS INSTANCE ====================

const api = axios.create({
    baseURL: PRODUCTION_API_URL || 'http://localhost:8000/api',
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    },
    timeout: 10000,
});

// ==================== EXPORT FUNCTIONS ====================

export const getCurrentApiUrl = () => currentApiUrl;

/**
 * Persist a runtime override of the API URL.
 *
 * - In production builds (!__DEV__), this is a no-op if a build-time
 *   URL is present, since production should not be retargetable.
 * - In dev builds, this writes to AsyncStorage and takes effect on
 *   the next call to getBackendUrl / initializeApiUrl.
 */
export const updateApiUrl = async (newUrl) => {
    try {
        if (!__DEV__ && PRODUCTION_API_URL) {
            console.warn('⛔ updateApiUrl is disabled in production builds.');
            throw new Error('API URL is locked in production builds.');
        }

        if (!newUrl || !newUrl.startsWith('http')) {
            throw new Error('Invalid URL format');
        }

        let cleanUrl = newUrl.trim();
        if (!cleanUrl.endsWith('/api')) {
            cleanUrl = cleanUrl.endsWith('/') ? cleanUrl + 'api' : cleanUrl + '/api';
        }

        // Tag tunnel URLs so they can be preferred on cellular.
        const isTunnel =
            cleanUrl.includes('ngrok.io') ||
            cleanUrl.includes('ngrok-free.app') ||
            cleanUrl.includes('trycloudflare.com');

        if (isTunnel) {
            await AsyncStorage.setItem('ngrokUrl', cleanUrl);
        } else if (cleanUrl.startsWith('https://')) {
            await AsyncStorage.setItem('cloudUrl', cleanUrl);
        }

        await AsyncStorage.setItem('apiUrl', cleanUrl);
        currentApiUrl = cleanUrl;
        api.defaults.baseURL = cleanUrl;
        if (__DEV__) console.log('✅ API URL updated to:', cleanUrl);
        return true;
    } catch (error) {
        if (__DEV__) console.error('Failed to update API URL:', error);
        throw error;
    }
};

export const resetApiUrl = async () => {
    try {
        if (!__DEV__ && PRODUCTION_API_URL) {
            currentApiUrl = PRODUCTION_API_URL;
            api.defaults.baseURL = PRODUCTION_API_URL;
            if (__DEV__) console.log('✅ Reset to build-time URL:', PRODUCTION_API_URL);
            return true;
        }

        await AsyncStorage.multiRemove(['apiUrl', 'ngrokUrl', 'cloudUrl', 'lastWorkingIp']);
        await initializeApiUrl();
        return true;
    } catch (error) {
        if (__DEV__) console.error('Failed to reset API URL:', error);
        throw error;
    }
};

export const initializeApiUrl = async () => {
    try {
        const url = await getBackendUrl();
        currentApiUrl = url;
        api.defaults.baseURL = url;
        isInitialized = true;
        if (__DEV__) console.log('✅ API initialized with URL:', url);
        return url;
    } catch (error) {
        if (__DEV__) console.error('❌ Failed to initialize API URL:', error);
        return currentApiUrl;
    }
};

export const checkNetworkConnectivity = async () => {
    try {
        const netInfo = await getNetworkInfo();
        return {
            isConnected: netInfo?.isConnected || false,
            type: netInfo?.type || 'unknown',
            isWifi: netInfo?.type === 'wifi',
            isCellular: netInfo?.type === 'cellular',
            details: netInfo?.details || {},
        };
    } catch (error) {
        return { isConnected: false, type: 'unknown' };
    }
};

// ==================== HEALTH CHECK (public API) ====================

export const checkApiHealth = async () => {
    try {
        const baseUrl = currentApiUrl || PRODUCTION_API_URL;
        if (!baseUrl) {
            if (__DEV__) console.log('❌ checkApiHealth: no base URL configured');
            return false;
        }

        const normalized = baseUrl.replace(/\/+$/, '');
        const healthUrl = `${normalized}/health/`;

        if (__DEV__) console.log('🔍 Health check:', healthUrl);
        const ok = await probeHealth(healthUrl, HEALTH_CHECK_TIMEOUT_MS);

        if (__DEV__) {
            if (ok) console.log('✅ Health check passed:', healthUrl);
            else console.log('❌ Health check failed:', healthUrl);
        }
        return ok;
    } catch (error) {
        if (__DEV__) console.error('❌ Health check error:', error);
        return false;
    }
};

// ==================== SMART DISCOVERY ====================

const testBackendAt = async (ip, port) => {
    const healthUrl = `http://${ip}:${port}/api/health/`;
    const ok = await probeHealth(healthUrl, DISCOVERY_PROBE_TIMEOUT_MS);

    if (ok) {
        return { found: true, url: `http://${ip}:${port}/api`, ip };
    }
    return { found: false };
};

export const discoverBackend = async (progressCallback = null) => {
    try {
        // In production builds, discovery is pointless — return the
        // build-time URL. In dev builds, always scan.
        if (!__DEV__ && PRODUCTION_API_URL) {
            if (__DEV__) console.log('📡 Production build — skipping discovery, using:', PRODUCTION_API_URL);
            return { success: true, url: PRODUCTION_API_URL };
        }

        const localIp = await getLocalIp();
        if (!localIp) {
            return { success: false, error: 'Could not get local IP' };
        }

        const parts = localIp.split('.');
        if (parts.length !== 4) {
            return { success: false, error: 'Invalid IP format' };
        }

        const base = parts.slice(0, 3).join('.');
        const currentOctet = parseInt(parts[3], 10);
        const ports = DEFAULT_PORTS;

        const ipList = [];
        ipList.push(currentOctet);

        const commonIps = [19, 20, 21, 22, 23, 24, 25, 30, 40, 50, 100, 101, 102, 103, 150, 151, 152, 200, 201, 202, 203, 250, 251, 252, 253, 254, 1, 2, 3];
        for (const ip of commonIps) {
            if (!ipList.includes(ip)) ipList.push(ip);
        }

        const rangeStart = Math.max(1, currentOctet - 20);
        const rangeEnd = Math.min(254, currentOctet + 20);
        for (let i = rangeStart; i <= rangeEnd; i++) {
            if (!ipList.includes(i)) ipList.push(i);
        }

        for (let i = 1; i <= 254; i++) {
            if (!ipList.includes(i)) ipList.push(i);
        }

        let totalChecked = 0;
        const totalProbes = ipList.length * ports.length;

        for (let i = 0; i < ipList.length; i += SCAN_BATCH_SIZE) {
            const batch = ipList.slice(i, i + SCAN_BATCH_SIZE);
            const promises = [];

            for (const lastOctet of batch) {
                const ip = `${base}.${lastOctet}`;
                for (const port of ports) {
                    promises.push(testBackendAt(ip, port));
                }
            }

            const results = await Promise.all(promises);

            for (const result of results) {
                totalChecked++;
                if (result.found) {
                    await AsyncStorage.setItem('lastWorkingIp', result.ip);
                    return { success: true, url: result.url };
                }
            }

            if (progressCallback) {
                const progress = Math.min(
                    100,
                    Math.round((totalChecked / totalProbes) * 100)
                );
                progressCallback(progress);
            }
        }

        return { success: false, error: 'No backend found' };
    } catch (error) {
        if (__DEV__) console.error('❌ Discovery error:', error);
        return { success: false, error: error.message };
    }
};

export const getWorkingIp = async () => {
    try {
        return await AsyncStorage.getItem('lastWorkingIp');
    } catch (error) {
        return null;
    }
};

// ==================== SETUP NETWORK LISTENER ====================

export const setupNetworkListener = (callback) => {
    // In production builds, network changes shouldn't trigger discovery.
    if (!__DEV__ && PRODUCTION_API_URL) {
        if (__DEV__) console.log('📡 Production build — network listener disabled');
        return () => {};
    }

    if (networkListenerActive) {
        if (__DEV__) console.log('ℹ️ Network listener already active, skipping duplicate');
        return () => {};
    }

    networkListenerActive = true;
    let isSubscribed = true;
    let lastDiscoveryTime = 0;
    const DISCOVERY_COOLDOWN = 30000;

    const handleNetworkChange = async (state) => {
        if (!isSubscribed) return;
        if (!state.isConnected) return;

        if (state.type === 'wifi') {
            try {
                const healthCheck = await checkApiHealth();

                if (healthCheck) {
                    if (__DEV__) console.log('✅ Current API is healthy:', currentApiUrl);
                    return;
                }

                const now = Date.now();
                if (now - lastDiscoveryTime < DISCOVERY_COOLDOWN) {
                    if (__DEV__) console.log('⏳ Discovery cooldown active, skipping...');
                    return;
                }

                lastDiscoveryTime = now;
                if (__DEV__) console.log('🔍 Current API not healthy, discovering...');
                const result = await discoverBackend();
                if (result.success && callback && isSubscribed) {
                    if (__DEV__) console.log('✅ Found backend:', result.url);
                    callback(result.url);
                }
            } catch (error) {
                if (__DEV__) console.error('❌ Network check error:', error);
            }
        }
    };

    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);
    if (__DEV__) console.log('📡 Network listener registered');

    return () => {
        isSubscribed = false;
        networkListenerActive = false;
        unsubscribe();
        if (__DEV__) console.log('📡 Network listener removed');
    };
};

// ==================== INTERCEPTORS ====================

api.interceptors.request.use(
    async (config) => {
        const token = await AsyncStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        if (__DEV__) console.error('❌ Request Error:', error);
        return Promise.reject(error);
    }
);

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (!originalRequest) {
            return Promise.reject(error);
        }

        if (
            (error.code === 'ECONNABORTED' ||
                (error.message && error.message.includes('timeout'))) &&
            !originalRequest._retry
        ) {
            originalRequest._retry = true;
            try {
                await initializeApiUrl();
                return api(originalRequest);
            } catch (initError) {
                if (__DEV__) console.error('❌ Retry-after-timeout failed:', initError);
                return Promise.reject(error);
            }
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            try {
                const refreshToken = await AsyncStorage.getItem('refresh_token');
                if (refreshToken) {
                    const baseUrl = api.defaults.baseURL || currentApiUrl;
                    const refreshResponse = await axios.post(
                        `${baseUrl}/auth/refresh/`,
                        { refresh: refreshToken }
                    );
                    const { access } = refreshResponse.data;

                    if (access) {
                        await AsyncStorage.setItem('token', access);
                        originalRequest.headers.Authorization = `Bearer ${access}`;
                        return api(originalRequest);
                    }
                }
            } catch (refreshError) {
                console.warn('⚠️ Token refresh failed, logging out');
                await AsyncStorage.multiRemove(['token', 'refresh_token', 'user']);
            }
        }

        return Promise.reject(error);
    }
);

// ==================== AUTH API ====================

export const authApi = {
    login: async (email, password) => {
        try {
            const response = await api.post('/auth/login/', { email, password });

            if (response.data.access) {
                await AsyncStorage.setItem('token', response.data.access);
                await AsyncStorage.setItem('refresh_token', response.data.refresh);
                await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
            }
            return response;
        } catch (error) {
            if (__DEV__) console.error('❌ Login failed:', error.response?.data || error.message);
            throw error;
        }
    },

    logout: async () => {
        await AsyncStorage.multiRemove(['token', 'refresh_token', 'user']);
    },

    getCurrentUser: async () => {
        try {
            const userJson = await AsyncStorage.getItem('user');
            return userJson ? JSON.parse(userJson) : null;
        } catch (error) {
            return null;
        }
    },

    isAuthenticated: async () => {
        const token = await AsyncStorage.getItem('token');
        return !!token;
    },
};

// ==================== SCANNER API ====================
//
// Security note: the scanner client is NOT a trust boundary. Every
// payload sent here must be re-validated (schema + signature) on the
// server. We still send the full `{v, type, code, sig}` object rather
// than just the code so the server has everything it needs to do so.

export const scannerApi = {
    verify: async (payload) => {
        if (!payload || typeof payload !== 'object') {
            throw new Error('scannerApi.verify requires a payload object');
        }
        try {
            const response = await api.post(
                '/checkin/verify/',
                {
                    v: payload.v,
                    type: payload.type,
                    code: payload.code,
                    sig: payload.sig,
                },
                { timeout: 10000 }
            );
            return response;
        } catch (error) {
            if (__DEV__) console.error('❌ Verify failed:', error.response?.data || error.message);
            throw error;
        }
    },

    checkin: async (payload) => {
        if (!payload || typeof payload !== 'object') {
            throw new Error('scannerApi.checkin requires a payload object');
        }
        try {
            const response = await api.post(
                '/checkin/',
                {
                    v: payload.v,
                    type: payload.type,
                    code: payload.code,
                    sig: payload.sig,
                },
                { timeout: 10000 }
            );
            return response;
        } catch (error) {
            if (__DEV__) console.error('❌ Checkin failed:', error.response?.data || error.message);
            throw error;
        }
    },

    validate: async (payload) => {
        if (!payload || typeof payload !== 'object') {
            throw new Error('scannerApi.validate requires a payload object');
        }
        try {
            const response = await api.post(
                '/checkin/validate/',
                {
                    v: payload.v,
                    type: payload.type,
                    code: payload.code,
                    sig: payload.sig,
                },
                { timeout: 10000 }
            );
            return response;
        } catch (error) {
            if (__DEV__) console.error('❌ Validate failed:', error.response?.data || error.message);
            throw error;
        }
    },

    getStats: async () => {
        try {
            const response = await api.get('/dashboard/stats/', { timeout: 8000 });
            return response;
        } catch (error) {
            return { data: { total_scans: 0, today_checkins: 0 } };
        }
    },

    getHistory: async (limit = 20) => {
        try {
            const response = await api.get(`/checkin/history/?limit=${limit}`, {
                timeout: 10000,
            });

            if (response.data && typeof response.data === 'object') {
                return response;
            }
            return { data: { history: [] } };
        } catch (error) {
            return { data: { history: [] } };
        }
    },

    getEvents: async () => {
        try {
            const response = await api.get('/events/', { timeout: 8000 });
            return response;
        } catch (error) {
            return { data: [] };
        }
    },
};

export default api;