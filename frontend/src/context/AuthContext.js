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

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);

    // ✅ Check auth status on mount
    useEffect(() => {
        const checkAuth = () => {
            try {
                const token = localStorage.getItem('token') || sessionStorage.getItem('token');
                const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
                
                if (token && storedUser) {
                    try {
                        const userData = JSON.parse(storedUser);
                        setUser(userData);
                        setIsAuthenticated(true);
                        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                        console.log('✅ Auth restored from storage');
                        console.log('👤 User:', userData);
                        console.log('👤 Role from storage:', userData?.role);
                    } catch (error) {
                        console.error('Error parsing user:', error);
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        localStorage.removeItem('refresh_token');
                        sessionStorage.removeItem('token');
                        sessionStorage.removeItem('user');
                        sessionStorage.removeItem('refresh_token');
                    }
                }
            } catch (error) {
                console.error('Auth check error:', error);
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, []);

    // ✅ LOGIN FUNCTION - Fixed
    const login = useCallback(async (email, password) => {
        console.log('🔐 Login function called with:', { email, password: password ? '***' : 'missing' });
        
        try {
            if (!email || !password) {
                console.log('❌ Missing email or password');
                return { success: false, error: 'Email and password are required' };
            }

            console.log('📡 Attempting real API login...');
            const response = await api.post('/auth/login/', { 
                email: email, 
                password: password 
            });
            
            console.log('📡 API Response:', response.data);
            
            if (response.data && response.data.access) {
                const { access, refresh, user: userData } = response.data;
                
                console.log('📡 User data from API:', userData);
                console.log('📡 Role from API:', userData?.role);
                
                // ✅ Store the FULL user object with role
                const userToStore = {
                    ...userData,
                    role: userData?.role || 'user'
                };
                
                localStorage.setItem('token', access);
                localStorage.setItem('refresh_token', refresh || 'mock-refresh-token');
                localStorage.setItem('user', JSON.stringify(userToStore));
                
                sessionStorage.setItem('token', access);
                sessionStorage.setItem('refresh_token', refresh || 'mock-refresh-token');
                sessionStorage.setItem('user', JSON.stringify(userToStore));
                
                api.defaults.headers.common['Authorization'] = `Bearer ${access}`;
                
                setUser(userToStore);
                setIsAuthenticated(true);
                
                console.log('✅ Real API login successful!');
                console.log('👤 User role set to:', userToStore?.role);
                return { success: true, data: response.data };
            }
            
            console.error('❌ API login failed: No access token in response');
            return { 
                success: false, 
                error: 'Server returned invalid response. Please try again.' 
            };
            
        } catch (error) {
            console.error('❌ Login error:', error);
            
            if (error.response?.status === 401) {
                return { 
                    success: false, 
                    error: 'Invalid credentials. Please check your email and password.' 
                };
            }
            
            return { 
                success: false, 
                error: error.response?.data?.detail || error.response?.data?.error || error.message || 'Login failed' 
            };
        }
    }, []);

    // ✅ LOGOUT FUNCTION - FIXED with React Router navigation
    const logout = useCallback(() => {
        console.log('🔓 Logging out...');
        
        // ✅ Clear both localStorage and sessionStorage
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('refresh_token');
        sessionStorage.removeItem('user');
        
        // ✅ Clear API headers
        delete api.defaults.headers.common['Authorization'];
        
        // ✅ Reset state
        setUser(null);
        setIsAuthenticated(false);
        
        // ✅ Redirect to login
        window.location.href = '/login';
        
        console.log('✅ Logout complete');
    }, []);

    const value = {
        user,
        isAuthenticated,
        loading,
        login,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;