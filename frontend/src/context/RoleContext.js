// frontend/src/context/RoleContext.js
import React, { createContext, useState, useContext, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useOrg } from './OrgContext';
import {
    PLATFORM_ROLES,
    MEMBERSHIP_ROLES,
    PlatformRoleUtils,
    MembershipRoleUtils,
} from '../constants';

const RoleContext = createContext();

/**
 * Derived tenant labels emitted by the backend's
 * `tenancy.effective_role_label()` in `user.role` / `user.effective_role`.
 *
 * These are NOT platform roles. They are the highest per-org label the
 * user holds, and they describe TENANT capabilities only. The backend
 * docs (auth_api.py header) are explicit:
 *
 *   "effective_role_label() returns the *highest* per-org label the
 *    user holds, which can now legitimately be 'owner' (not just
 *    'admin'). There is no separate 'Platform Staff' label — platform
 *    admins are identified by is_superuser / is_platform_admin(),
 *    never by the role string."
 *
 * `'owner'` and `'admin'` therefore belong to THIS set, not to
 * `PLATFORM_ROLES`. Adding them to PLATFORM_ROLES would let UI gate
 * platform-wide features on tenant privilege — a privilege-escalation
 * bug. Keep the two enums separate.
 */
const TENANT_ROLE_LABELS = Object.freeze([
    'owner',
    'admin',
    'manager',
    'operator',
    'staff',
    'member',
    'user',
]);

const TENANT_ROLE_LABEL_SET = new Set(TENANT_ROLE_LABELS);

export const useRole = () => {
    const context = useContext(RoleContext);
    if (!context) {
        throw new Error('useRole must be used within a RoleProvider');
    }
    return context;
};

/**
 * RoleProvider resolves TWO independent role concepts:
 *
 *   platformRole  — PLATFORM_ROLES.SUPER_ADMIN iff `user.is_superuser`,
 *                   otherwise PLATFORM_ROLES.USER. This is the ONLY
 *                   authority for platform-wide UI. It is derived from
 *                   `is_superuser`, never from `user.role`.
 *
 *   membershipRole — from the current OrganizationMembership.role
 *                   (owner | admin | staff | member) for the org the
 *                   user currently has selected (via OrgContext).
 *                   Changes when the user switches orgs. `null` if the
 *                   user has no active membership in the selected org.
 *
 * `user.role` / `user.effective_role` is a DERIVED TENANT LABEL — one
 * of TENANT_ROLE_LABELS — and is exposed as `tenantLabel` for display
 * only. Do NOT gate on it. Use:
 *
 *   • `isSuperAdmin` for platform admin routes
 *   • `hasOrgRole(required)` / `canManageCurrentOrg()` for tenant routes
 *   • `user.memberships[]` (from useAuth) for per-org decisions when
 *     the org is not the currently-selected one
 *
 * Never compare `user.role` against 'owner' or 'member' — that string
 * is a single collapsed label, not a per-org capability.
 */
export const RoleProvider = ({ children }) => {
    const { user, loading: authLoading } = useAuth();
    const { currentOrg, loading: orgLoading } = useOrg() || {};

    const [platformRole, setPlatformRole] = useState(PLATFORM_ROLES.USER);
    const [tenantLabel, setTenantLabel] = useState(null);
    const [membershipRole, setMembershipRole] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Wait until both auth AND org context have settled, otherwise
        // we'd flash `membershipRole = null` on every page load while
        // OrgContext is still fetching `/organizations/mine/`.
        if (authLoading || orgLoading) return;

        // ---- Platform role -------------------------------------------------
        // The ONLY authority for platform admin is `is_superuser`. The
        // backend is explicit about this in auth_api.py. `user.role`
        // never influences platformRole.
        const nextPlatformRole = user?.is_superuser
            ? PLATFORM_ROLES.SUPER_ADMIN
            : PLATFORM_ROLES.USER;
        setPlatformRole(nextPlatformRole);

        // ---- Tenant label (display only) -----------------------------------
        // `'owner'` is a legitimate label now. Validate against
        // TENANT_ROLE_LABELS so we don't warn on the expected new value.
        const incomingLabel = user?.role || user?.effective_role || null;
        if (incomingLabel == null) {
            setTenantLabel(null);
        } else if (TENANT_ROLE_LABEL_SET.has(incomingLabel)) {
            setTenantLabel(incomingLabel);
        } else {
            console.warn(
                `⚠️ RoleProvider: user.role ${JSON.stringify(incomingLabel)} is not a ` +
                `recognised tenant label (expected one of ` +
                `${JSON.stringify(TENANT_ROLE_LABELS)}). ` +
                `Falling back to 'user' for display only. ` +
                `Platform capabilities are resolved from is_superuser; ` +
                `tenant capabilities from hasOrgRole(), never from user.role.`
            );
            setTenantLabel('user');
        }

        // ---- Membership role (from current org) ----------------------------
        // OrgContext returns each org's `role` field from
        // `/organizations/mine/`. Use it if valid.
        const orgRole = currentOrg?.role || null;
        if (orgRole && Object.values(MEMBERSHIP_ROLES).includes(orgRole)) {
            setMembershipRole(orgRole);
        } else {
            setMembershipRole(null);
        }

        setLoading(false);
    }, [user, authLoading, currentOrg, orgLoading]);

    // ----- Convenience flags ----------------------------------------------

    const isSuperAdmin = platformRole === PLATFORM_ROLES.SUPER_ADMIN;
    const isPlatformUser = platformRole === PLATFORM_ROLES.USER;

    const isGuest = !user;

    // "Does this user have a membership in the current org?" — used by
    // member-only pages. True for owner/admin/staff/member alike.
    const isOrgMember =
        !!membershipRole && Object.values(MEMBERSHIP_ROLES).includes(membershipRole);

    // Ownership is a property of the Org (Admin role + is_owner).
    const orgIsOwner = Boolean(
        currentOrg?.is_owner
        || (currentOrg?.role && String(currentOrg.role).toLowerCase() === 'owner')
    );
    const isOwner = orgIsOwner || membershipRole === MEMBERSHIP_ROLES.OWNER;
    const isOrgAdmin = membershipRole === MEMBERSHIP_ROLES.ADMIN;
    const isOrgStaff = membershipRole === MEMBERSHIP_ROLES.STAFF;
    const isMember = membershipRole === MEMBERSHIP_ROLES.MEMBER;

    // Backwards-compat aliases.
    //   isOrganizer was the old "does this user own/manage events?"
    //   flag. In the new model that's "owner or admin of the current org".
    //   Platform admins also pass (they bypass org checks).
    const isOrganizer = isSuperAdmin || isOwner || isOrgAdmin;
    const isAdmin = isSuperAdmin || isOwner || isOrgAdmin;

    const hasOrgRole = (required) => {
        if (isSuperAdmin) return true;      // platform admins bypass
        if (required === MEMBERSHIP_ROLES.OWNER) return isOwner;
        if (!membershipRole) return false;
        if (!required) return false;
        // 'operator'/'staff' are accepted as synonyms — scanner access is
        // granted by STAFF on an org per the backend auth_api header.
        const normalizedRequired =
            required === 'operator' ? MEMBERSHIP_ROLES.STAFF : required;
        try {
            return MembershipRoleUtils.isAtLeast(membershipRole, normalizedRequired);
        } catch {
            return false;
        }
    };

    const canManageCurrentOrg = () => {
        if (isSuperAdmin) return true;
        return !!membershipRole && MembershipRoleUtils.canManageOrg(membershipRole);
    };

    const value = useMemo(() => ({
        // New API
        platformRole,
        tenantLabel,           // display-only: 'owner' | 'admin' | 'manager' | 'operator' | 'user'
        membershipRole,
        hasOrgRole,
        canManageCurrentOrg,
        // Legacy API — kept so un-migrated files keep compiling.
        role: platformRole,    // PLATFORM role only, not the tenant label
        isSuperAdmin,
        isPlatformUser,
        isOrgMember,
        isOwner,
        isOrgAdmin,
        isOrgStaff,
        isMember,
        isOrganizer,
        isAdmin,
        isStaff: isOrgStaff,
        isGuest,
        isUser: !!user,
        loading,
        hasPermission: () => false,
        isAtLeast: () => false,
    }), [
        platformRole, tenantLabel, membershipRole, isSuperAdmin,
        isPlatformUser, isOrgMember, isOwner, isOrgAdmin, isOrgStaff,
        isMember, isOrganizer, isAdmin, isGuest, user, loading,
    ]);

    return (
        <RoleContext.Provider value={value}>
            {children}
        </RoleContext.Provider>
    );
};

export default RoleContext;