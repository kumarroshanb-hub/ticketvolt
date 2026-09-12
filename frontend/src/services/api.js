// admin-frontend/src/services/api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor - Add token to every request
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

// Response interceptor - Handle 401 errors
api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        const originalRequest = error.config;
        
        // Only handle 401 for non-login requests
        if (error.response?.status === 401 && !originalRequest.url?.includes('/auth/login/')) {
            console.log('🔒 401 Unauthorized - Trying to refresh...');
            
            // Try to refresh token
            if (!originalRequest._retry) {
                originalRequest._retry = true;
                
                try {
                    const refreshToken = localStorage.getItem('refresh_token');
                    if (refreshToken) {
                        const response = await axios.post(`${API_URL}/auth/refresh/`, {
                            refresh: refreshToken,
                        });
                        
                        const { access } = response.data;
                        localStorage.setItem('token', access);
                        api.defaults.headers.common['Authorization'] = `Bearer ${access}`;
                        originalRequest.headers.Authorization = `Bearer ${access}`;
                        
                        return api(originalRequest);
                    }
                } catch (refreshError) {
                    console.error('❌ Token refresh failed');
                    // Clear auth data and redirect
                    localStorage.removeItem('token');
                    localStorage.removeItem('refresh_token');
                    localStorage.removeItem('user');
                    window.location.href = '/login';
                }
            }
            
            // If no refresh token or retry failed
            localStorage.removeItem('token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        
        return Promise.reject(error);
    }
);

export default api;