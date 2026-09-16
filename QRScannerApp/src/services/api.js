// QRScannerApp/src/services/api.js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Network from 'expo-network';
import NetInfo from '@react-native-community/netinfo';

// ==================== CONFIGURATION ====================

// ⭐ EAS PRODUCTION FIX
// Injected by EAS at build time from eas.json's env block:
//   "env": { "EXPO_PUBLIC_API_URL": "https://ticketvault-backend-service.onrender.com/api" }
// When set, the app skips all local-network discovery and talks straight to Render.
// When undefined (local dev), behavior falls through to the auto-discovery below.
const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_URL;

let currentApiUrl = '';
let isInitialized = false;
let networkListenerActive = false;

console.log('📡 Initializing API...');
console.log(
    '📡 Production URL from env:',
    PRODUCTION_API_URL || '(not set — will auto-discover)'
);

// ==================== NETWORK DETECTION ====================

const getLocalIp = async () => {
    try {
        const ip = await Network.getIpAddressAsync();
        return ip;
    } catch (error) {
        console.error('❌ Failed to get local IP:', error.message);
        return null;
    }
};

const getNetworkInfo = async () => {
    try {
        const netInfo = await NetInfo.fetch();
        return netInfo;
    } catch (error) {
        console.error('❌ Failed to get network info:', error);
        return null;
    }
};

// ==================== FIXED: FIND LOCAL BACKEND ====================

const findLocalBackend = async () => {
    try {
        const localIp = await getLocalIp();
        if (!localIp) {
            console.log('⚠️ Could not get local IP');
            return null;
        }

        console.log('📡 Local IP:', localIp);

        const parts = localIp.split('.');
        if (parts.length !== 4) return null;

        const base = parts.slice(0, 3).join('.');
        const currentOctet = parseInt(parts[3]);

        // ✅ Build IP list to check
        const ipList = [];

        // 1. Current IP first
        ipList.push(currentOctet);

        // 2. Common development IPs (same subnet)
        const commonIps = [19, 20, 21, 22, 23, 24, 25, 30, 40, 50, 100, 101, 102, 103, 150, 151, 152, 200, 201, 202, 203, 250, 251, 252, 253, 254, 1, 2, 3];
        for (const ip of commonIps) {
            if (!ipList.includes(ip)) {
                ipList.push(ip);
            }
        }

        // 3. IPs around current IP (20 up, 20 down)
        const rangeStart = Math.max(1, currentOctet - 20);
        const rangeEnd = Math.min(254, currentOctet + 20);
        for (let i = rangeStart; i <= rangeEnd; i++) {
            if (!ipList.includes(i)) {
                ipList.push(i);
            }
        }

        // 4. Remaining IPs (1-254)
        for (let i = 1; i <= 254; i++) {
            if (!ipList.includes(i)) {
                ipList.push(i);
            }
        }

        // ✅ Check ports
        const ports = [8000, 8080, 3000];

        console.log('🔍 Searching for backend on subnet:', base);

        for (const ip of ipList) {
            for (const port of ports) {
                try {
                    const url = `http://${base}.${ip}:${port}/api/health/`;

                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 500);

                    const response = await fetch(url, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                        signal: controller.signal,
                    });

                    clearTimeout(timeoutId);

                    if (response.ok || response.status === 401 || response.status === 404 || response.status === 200) {
                        const backendUrl = `http://${base}.${ip}:${port}/api`;
                        console.log('✅ Found backend at:', backendUrl);
                        await AsyncStorage.setItem('lastWorkingIp', `${base}.${ip}`);
                        return backendUrl;
                    }
                } catch (e) {
                    // Continue
                }
            }
        }

        console.log('❌ No backend found on subnet:', base);
        return null;

    } catch (error) {
        console.error('❌ Error finding local backend:', error);
        return null;
    }
};

// ==================== GET BACKEND URL ====================

const getBackendUrl = async () => {
    try {
        // ⭐ EAS PRODUCTION FIX
        // Priority 0: if EAS injected a production URL, use it immediately.
        // This is what makes preview/production builds connect to Render.
        if (PRODUCTION_API_URL) {
            console.log('📡 Using production URL:', PRODUCTION_API_URL);
            return PRODUCTION_API_URL;
        }

        // 1. Check saved URL first (local dev only)
        const savedUrl = await AsyncStorage.getItem('apiUrl');
        if (savedUrl) {
            console.log('📡 Using saved URL:', savedUrl);
            return savedUrl;
        }

        // 2. Check last working IP
        const lastWorkingIp = await AsyncStorage.getItem('lastWorkingIp');
        if (lastWorkingIp) {
            const url = `http://${lastWorkingIp}:8000/api`;
            console.log('📡 Using last working IP:', url);
            return url;
        }

        // 3. Try to find local backend
        const netInfo = await getNetworkInfo();

        if (netInfo && netInfo.type === 'wifi' && netInfo.isConnected) {
            const localUrl = await findLocalBackend();
            if (localUrl) {
                return localUrl;
            }
        }

        // 4. Check cloud URLs
        if (netInfo && (netInfo.type === 'cellular' || netInfo.type === 'unknown')) {
            const cloudUrl = await AsyncStorage.getItem('cloudUrl');
            if (cloudUrl) {
                return cloudUrl;
            }
        }

        const ngrokUrl = await AsyncStorage.getItem('ngrokUrl');
        if (ngrokUrl) {
            return ngrokUrl;
        }

        // 5. Fallback - use localhost/emulator (local dev only)
        let fallbackUrl = 'http://localhost:8000/api';
        if (Platform.OS === 'android') {
            fallbackUrl = 'http://10.0.2.2:8000/api';
        }
        console.log('⚠️ Using fallback URL:', fallbackUrl);
        return fallbackUrl;

    } catch (error) {
        console.error('❌ Error getting backend URL:', error);
        let fallbackUrl = 'http://localhost:8000/api';
        if (Platform.OS === 'android') {
            fallbackUrl = 'http://10.0.2.2:8000/api';
        }
        return fallbackUrl;
    }
};

// ==================== EXPORT FUNCTIONS ====================

export const getCurrentApiUrl = () => currentApiUrl;

export const updateApiUrl = async (newUrl) => {
    try {
        // ⭐ EAS PRODUCTION FIX
        // Refuse to override the production URL at runtime.
        // Users cannot redirect the app to a malicious server.
        if (PRODUCTION_API_URL) {
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

        if (cleanUrl.includes('ngrok.io')) {
            await AsyncStorage.setItem('ngrokUrl', cleanUrl);
        } else if (cleanUrl.startsWith('https://')) {
            await AsyncStorage.setItem('cloudUrl', cleanUrl);
        }

        await AsyncStorage.setItem('apiUrl', cleanUrl);
        currentApiUrl = cleanUrl;
        api.defaults.baseURL = cleanUrl;
        console.log('✅ API URL updated to:', cleanUrl);
        return true;
    } catch (error) {
        console.error('Failed to update API URL:', error);
        throw error;
    }
};

export const resetApiUrl = async () => {
    try {
        // ⭐ EAS PRODUCTION FIX
        // Reset should reapply the production URL, not wipe it.
        if (PRODUCTION_API_URL) {
            currentApiUrl = PRODUCTION_API_URL;
            api.defaults.baseURL = PRODUCTION_API_URL;
            console.log('✅ Reset to production URL:', PRODUCTION_API_URL);
            return true;
        }

        await AsyncStorage.multiRemove(['apiUrl', 'ngrokUrl', 'cloudUrl', 'lastWorkingIp']);
        await initializeApiUrl();
        return true;
    } catch (error) {
        console.error('Failed to reset API URL:', error);
        throw error;
    }
};

export const initializeApiUrl = async () => {
    try {
        const url = await getBackendUrl();
        currentApiUrl = url;
        api.defaults.baseURL = url;
        isInitialized = true;
        console.log('✅ API initialized with URL:', url);
        return url;
    } catch (error) {
        console.error('❌ Failed to initialize API URL:', error);
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

// ==================== HEALTH CHECK ====================

export const checkApiHealth = async () => {
    try {
        const baseUrl = currentApiUrl || PRODUCTION_API_URL || 'http://localhost:8000/api';

        // Extract base URL without /api
        let base = baseUrl.replace(/\/api$/, '');

        // Try multiple endpoints
        const endpoints = [
            `${baseUrl}/health/`,           // /api/health/
            `${base}/health/`,              // /health/
            `${baseUrl}/`,                  // /api/
            `${base}/`,                     // /
        ];

        for (const url of endpoints) {
            try {
                console.log('🔍 Checking health at:', url);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);

                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                // Any response (even 401/404) means the server is up
                if (response.status < 500) {
                    console.log('✅ Health check passed:', url, 'Status:', response.status);
                    return true;
                }
            } catch (endpointError) {
                // Continue to next endpoint
                console.log('⚠️ Health check failed at:', url, '-', endpointError.message);
            }
        }

        console.log('❌ All health checks failed for:', baseUrl);
        return false;
    } catch (error) {
        console.error('❌ Health check error:', error);
        return false;
    }
};

// ==================== SMART DISCOVERY ====================

const testBackendAt = async (ip, port) => {
    try {
        const testEndpoints = [
            `http://${ip}:${port}/api/health/`,
            `http://${ip}:${port}/api/`,
            `http://${ip}:${port}/health/`,
            `http://${ip}:${port}/`,
        ];

        for (const url of testEndpoints) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 400);

                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (response.status < 500) {
                    return { found: true, url: `http://${ip}:${port}/api`, ip };
                }
            } catch (e) {
                // Continue
            }
        }
    } catch (e) {
        // Continue
    }
    return { found: false };
};

export const discoverBackend = async (progressCallback = null) => {
    try {
        // ⭐ EAS PRODUCTION FIX
        // Skip scanning in production builds — the URL is fixed.
        if (PRODUCTION_API_URL) {
            console.log('📡 Production build — skipping discovery, using:', PRODUCTION_API_URL);
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
        const currentOctet = parseInt(parts[3]);
        const ports = [8000, 8080];

        const ipList = [];
        ipList.push(currentOctet);

        const commonIps = [19, 20, 21, 22, 23, 24, 25, 30, 40, 50, 100, 101, 102, 103, 150, 151, 152, 200, 201, 202, 203, 250, 251, 252, 253, 254, 1, 2, 3];
        for (const ip of commonIps) {
            if (!ipList.includes(ip)) {
                ipList.push(ip);
            }
        }

        const rangeStart = Math.max(1, currentOctet - 20);
        const rangeEnd = Math.min(254, currentOctet + 20);
        for (let i = rangeStart; i <= rangeEnd; i++) {
            if (!ipList.includes(i)) {
                ipList.push(i);
            }
        }

        for (let i = 1; i <= 254; i++) {
            if (!ipList.includes(i)) {
                ipList.push(i);
            }
        }

        let totalChecked = 0;
        const totalIps = ipList.length;
        const batchSize = 8;

        for (let i = 0; i < ipList.length; i += batchSize) {
            const batch = ipList.slice(i, i + batchSize);
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
                const progress = Math.min(100, Math.round((totalChecked / (totalIps * ports.length)) * 100));
                progressCallback(progress);
            }
        }

        return { success: false, error: 'No backend found' };
    } catch (error) {
        console.error('❌ Discovery error:', error);
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
    // ⭐ EAS PRODUCTION FIX
    // In production builds, the backend URL is fixed. No need to watch the
    // network for re-discovery — that would just waste battery and CPU.
    if (PRODUCTION_API_URL) {
        console.log('📡 Production build — network listener disabled');
        return () => {};
    }

    if (networkListenerActive) {
        console.log('ℹ️ Network listener already active, skipping duplicate');
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
                    console.log('✅ Current API is healthy:', currentApiUrl);
                    return;
                }

                const now = Date.now();
                if (now - lastDiscoveryTime < DISCOVERY_COOLDOWN) {
                    console.log('⏳ Discovery cooldown active, skipping...');
                    return;
                }

                lastDiscoveryTime = now;
                console.log('🔍 Current API not healthy, discovering...');
                const result = await discoverBackend();
                if (result.success && callback && isSubscribed) {
                    console.log('✅ Found backend:', result.url);
                    callback(result.url);
                }
            } catch (error) {
                console.error('❌ Network check error:', error);
            }
        }
    };

    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);
    console.log('📡 Network listener registered');

    return () => {
        isSubscribed = false;
        networkListenerActive = false;
        unsubscribe();
        console.log('📡 Network listener removed');
    };
};

// ==================== CREATE AXIOS INSTANCE ====================

const api = axios.create({
    baseURL: PRODUCTION_API_URL || currentApiUrl || 'http://localhost:8000/api',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
    timeout: 10000,
});

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
        console.error('❌ Request Error:', error);
        return Promise.reject(error);
    }
);

api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            if (!error.config._retry) {
                error.config._retry = true;
                await initializeApiUrl();
                return api(error.config);
            }
        }

        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            try {
                const refreshToken = await AsyncStorage.getItem('refresh_token');
                if (refreshToken) {
                    const response = await axios.post(
                        `${currentApiUrl}/auth/refresh/`,
                        { refresh: refreshToken }
                    );
                    const { access } = response.data;
                    await AsyncStorage.setItem('token', access);
                    originalRequest.headers.Authorization = `Bearer ${access}`;
                    return api(originalRequest);
                }
            } catch (refreshError) {
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
            console.error('❌ Login failed:', error.response?.data || error.message);
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
    }
};

// ==================== SCANNER API ====================

export const scannerApi = {
    verify: async (ticketCode) => {
        try {
            const code = typeof ticketCode === 'string' ? ticketCode : String(ticketCode);
            const response = await api.get(`/checkin/verify/?code=${encodeURIComponent(code)}`, {
                timeout: 10000,
            });
            return response;
        } catch (error) {
            console.error('❌ Verify failed:', error.response?.data || error.message);
            throw error;
        }
    },

    validate: async (ticketCode) => {
        try {
            const code = typeof ticketCode === 'string' ? ticketCode : String(ticketCode);
            const response = await api.post('/checkin/validate/', {
                code: code
            }, {
                timeout: 10000,
            });
            return response;
        } catch (error) {
            console.error('❌ Validate failed:', error.response?.data || error.message);
            throw error;
        }
    },

    checkin: async (ticketCode) => {
        try {
            const code = typeof ticketCode === 'string' ? ticketCode : String(ticketCode);
            const response = await api.post('/checkin/', {
                code: code
            }, {
                timeout: 10000,
            });
            return response;
        } catch (error) {
            console.error('❌ Checkin failed:', error.response?.data || error.message);
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
            } else {
                return { data: { history: [] } };
            }
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
    }
};

export default api;