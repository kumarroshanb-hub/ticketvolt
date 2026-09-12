// shared/constants/roles.js
/**
 * Role Constants
 * Single source of truth for all roles
 * Used by: Backend, Admin Frontend, Scanner App
 */

export const ROLES = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    ORGANIZER: 'organizer',
    USER: 'user',
};

export const ROLE_LABELS = {
    [ROLES.SUPER_ADMIN]: 'Super Admin',
    [ROLES.ADMIN]: 'Admin',
    [ROLES.ORGANIZER]: 'Organizer',
    [ROLES.USER]: 'User',
};

export const ROLE_HIERARCHY = {
    [ROLES.SUPER_ADMIN]: 4,
    [ROLES.ADMIN]: 3,
    [ROLES.ORGANIZER]: 2,
    [ROLES.USER]: 1,
};

export const ROLE_PERMISSIONS = {
    [ROLES.SUPER_ADMIN]: {
        canManageUsers: true,
        canManageAllEvents: true,
        canManageAllBookings: true,
        canManageOrganizers: true,
        canManageVenues: true,
        canViewAnalytics: true,
        canManageSystem: true,
    },
    [ROLES.ADMIN]: {
        canManageUsers: true,
        canManageAllEvents: true,
        canManageAllBookings: true,
        canManageOrganizers: false,
        canManageVenues: true,
        canViewAnalytics: true,
        canManageSystem: false,
    },
    [ROLES.ORGANIZER]: {
        canManageUsers: false,
        canManageAllEvents: false,
        canManageAllBookings: false,
        canManageOrganizers: false,
        canManageVenues: false,
        canViewAnalytics: true,
        canManageSystem: false,
    },
    [ROLES.USER]: {
        canManageUsers: false,
        canManageAllEvents: false,
        canManageAllBookings: false,
        canManageOrganizers: false,
        canManageVenues: false,
        canViewAnalytics: false,
        canManageSystem: false,
    },
};

export const RoleUtils = {
    getLabel: (role) => ROLE_LABELS[role] || role,
    getLevel: (role) => ROLE_HIERARCHY[role] || 0,
    hasPermission: (role, permission) => {
        const perms = ROLE_PERMISSIONS[role];
        return perms ? perms[permission] || false : false;
    },
    isAtLeast: (role, minRole) => {
        return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole];
    },
    getAvailableRoles: (currentRole) => {
        const currentLevel = ROLE_HIERARCHY[currentRole] || 0;
        return Object.keys(ROLE_HIERARCHY).filter(
            (role) => ROLE_HIERARCHY[role] <= currentLevel
        );
    },
};

export default {
    ROLES,
    ROLE_LABELS,
    ROLE_HIERARCHY,
    ROLE_PERMISSIONS,
    RoleUtils,
};