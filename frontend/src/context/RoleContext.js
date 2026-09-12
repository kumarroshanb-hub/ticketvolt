// frontend/src/context/RoleContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { ROLES, RoleUtils } from '../constants';

const RoleContext = createContext();

export const useRole = () => {
    const context = useContext(RoleContext);
    if (!context) {
        throw new Error('useRole must be used within a RoleProvider');
    }
    return context;
};

export const RoleProvider = ({ children }) => {
    const { user, loading: authLoading } = useAuth();
    const [role, setRole] = useState(ROLES.USER);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading) {
            console.log('⏳ RoleProvider: Waiting for auth loading...');
            return;
        }
        
        console.log('👤 RoleProvider: Processing user:', user);
        
        if (user) {
            // ✅ FIX: Use the role from the API response directly
            // The API returns: { role: 'super_admin' | 'admin' | 'organizer' | 'user' }
            let userRole = ROLES.USER;
            
            // ✅ First priority: Use the role field from the API
            if (user.role && Object.values(ROLES).includes(user.role)) {
                userRole = user.role;
                console.log(`✅ Using role from API: ${userRole}`);
            } 
            // ✅ Fallback: Determine from user properties (backward compatibility)
            else if (user.is_superuser) {
                userRole = ROLES.SUPER_ADMIN;
                console.log(`⚠️ Fallback: is_superuser -> ${userRole}`);
            } else if (user.is_staff) {
                userRole = ROLES.ADMIN;
                console.log(`⚠️ Fallback: is_staff -> ${userRole}`);
            } else if (user.is_organizer) {
                userRole = ROLES.ORGANIZER;
                console.log(`⚠️ Fallback: is_organizer -> ${userRole}`);
            }
            
            setRole(userRole);
            console.log(`👤 User role set: ${userRole} (${RoleUtils.getLabel(userRole)})`);
        } else {
            console.log('👤 No user, defaulting to USER role');
            setRole(ROLES.USER);
        }
        setLoading(false);
    }, [user, authLoading]);

    const hasPermission = (permission) => {
        return RoleUtils.hasPermission(role, permission);
    };

    const isAtLeast = (minRole) => {
        return RoleUtils.isAtLeast(role, minRole);
    };

    // ✅ Helper methods for sidebar visibility
    const isSuperAdmin = role === ROLES.SUPER_ADMIN;
    const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
    const isOrganizer = role === ROLES.ORGANIZER || isAdmin;

    const value = {
        role,
        loading,
        hasPermission,
        isAtLeast,
        isSuperAdmin,
        isAdmin,
        isOrganizer,
        isUser: true, // All authenticated users are at least users
    };

    console.log('📊 RoleProvider final state:', { role, isSuperAdmin, isAdmin, isOrganizer });

    return (
        <RoleContext.Provider value={value}>
            {children}
        </RoleContext.Provider>
    );
};

export default RoleContext;