export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  OWNER: 'owner',
  ADMIN: 'admin',
  STAFF: 'staff',
  MEMBER: 'member',
};

export const ROLE_HIERARCHY = {
  [ROLES.SUPER_ADMIN]: 5,
  [ROLES.OWNER]: 4,
  [ROLES.ADMIN]: 3,
  [ROLES.STAFF]: 2,
  [ROLES.MEMBER]: 1,
};

export const PERMISSIONS = {
  canManageEvents: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
  canManageVenues: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
  canScanTickets: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN, ROLES.STAFF],
  canViewAnalytics: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
  canManageUsers: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
  canManageDiscounts: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
  canViewBookings: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN, ROLES.STAFF, ROLES.MEMBER],
  canDeleteOrg: [ROLES.SUPER_ADMIN, ROLES.OWNER],
  canManageOrg: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
  canViewAllOrgs: [ROLES.SUPER_ADMIN],
};

export const RoleUtils = {
  hasPermission: (role, permissionKey) => {
    if (!role || !PERMISSIONS[permissionKey]) return false;
    return PERMISSIONS[permissionKey].includes(role);
  },
  
  getRoleLevel: (role) => {
    return ROLE_HIERARCHY[role] || 0;
  },
  
  isAtLeast: (userRole, requiredRole) => {
    const userLevel = ROLE_HIERARCHY[userRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
  },
  
  getRoleLabel: (role) => {
    const labels = {
      [ROLES.SUPER_ADMIN]: 'Super Admin',
      [ROLES.OWNER]: 'Owner',
      [ROLES.ADMIN]: 'Admin',
      [ROLES.STAFF]: 'Staff',
      [ROLES.MEMBER]: 'Member',
    };
    return labels[role] || 'Guest';
  },
  
  getRoleColor: (role) => {
    const colors = {
      [ROLES.SUPER_ADMIN]: '#dc2626',
      [ROLES.OWNER]: '#f59e0b',
      [ROLES.ADMIN]: '#3b82f6',
      [ROLES.STAFF]: '#8b5cf6',
      [ROLES.MEMBER]: '#6b7280',
    };
    return colors[role] || '#9ca3af';
  },
};

export default ROLES;