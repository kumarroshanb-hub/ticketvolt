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
            // UPDATED FOR 6-TIER HIERARCHY:
            // The API now returns one of:
            // super_admin | owner | admin | staff | member | user
            let userRole = ROLES.USER;

            const incomingRole = user.role;

            // UPDATED: Legacy safety mapping.
            // If old data or an old backend response still returns 'organizer',
            // normalize it to the new 'owner' role.
            const normalizedRole =
                incomingRole === 'organizer' || incomingRole === ROLES.ORGANIZER
                    ? ROLES.OWNER
                    : incomingRole;

            // ✅ Bug 24 retained:
            // Trust the API role only. No is_staff / is_superuser legacy fallbacks.
            //
            // UPDATED FOR 6-TIER HIERARCHY:
            // Explicitly allow new role values even if constants are mid-migration.
            const allowedRoles = [
                ...Object.values(ROLES),
                'owner',
                'member',
            ].filter(
                (value, index, self) => Boolean(value) && self.indexOf(value) === index
            );

            if (normalizedRole && allowedRoles.includes(normalizedRole)) {
                userRole = normalizedRole;
                console.log(`✅ Using role from API: ${userRole}`);
            } else {
                console.warn(
                    `⚠️ RoleProvider: user.role is missing or unrecognized ` +
                    `(got ${JSON.stringify(user.role)}); defaulting to USER. ` +
                    `The backend /me endpoint should always return a 'role' field.`
                );
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

    // UPDATED FOR 6-TIER HIERARCHY:
    // Helper methods for sidebar/page visibility.
    //
    // New roles:
    // super_admin -> platform owner
    // owner       -> organization owner
    // admin       -> organization admin
    // staff       -> operational/check-in
    // member      -> registered organization member
    // user        -> guest / regular platform user
    const isSuperAdmin = role === ROLES.SUPER_ADMIN || role === 'super_admin';

    const isOwner = role === ROLES.OWNER || role === 'owner';

    // UPDATED:
    // Keep isAdmin backward-compatible for existing UI checks, but include
    // Owner and Super Admin because they also have administrative capability.
    const isAdmin =
        role === ROLES.ADMIN ||
        role === 'admin' ||
        isOwner ||
        isSuperAdmin;

    // UPDATED:
    // Preserve isOrganizer as a legacy alias for managers.
    // Owner/Admin/SuperAdmin should behave like the old Organizer for
    // event/venue management screens.
    const isOrganizer =
        role === ROLES.ORGANIZER ||
        role === 'organizer' ||
        isOwner ||
        isAdmin;

    const isStaff = role === ROLES.STAFF || role === 'staff';

    // NEW for 6-tier hierarchy
    const isMember = role === ROLES.MEMBER || role === 'member';

    // NEW for 6-tier hierarchy
    const isGuest = !user || role === ROLES.USER || role === 'user';

    const value = {
        role,
        loading,
        hasPermission,
        isAtLeast,
        isSuperAdmin,
        isOwner,       // NEW
        isAdmin,
        isOrganizer,
        isStaff,       // ✅ Bug 23
        isMember,      // NEW
        isGuest,       // NEW
        isUser: true,  // All authenticated users are at least users
    };

    console.log('📊 RoleProvider final state:', {
        role,
        isSuperAdmin,
        isOwner,
        isAdmin,
        isOrganizer,
        isStaff,
        isMember,
        isGuest,
    });

    return (
        <RoleContext.Provider value={value}>
            {children}
        </RoleContext.Provider>
    );
};

export default RoleContext;