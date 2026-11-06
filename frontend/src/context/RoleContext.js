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
 *   platformRole  — from User.role (super_admin | staff | user).
 *                   One value per user, global. Determines whether the
 *                   user is a platform operator.
 *
 *   membershipRole — from the current OrganizationMembership.role
 *                   (owner | admin | staff | member) for the org the
 *                   user currently has selected (via OrgContext).
 *                   Changes when the user switches orgs. `null` if the
 *                   user has no active membership in the selected org.
 *
 * hasOrgRole() and canManageCurrentOrg() are the correct gates for
 * tenant-scoped routes. Never compare user.role against 'owner' or
 * 'member' — the user.role is never those values.
 */
export const RoleProvider = ({ children }) => {
    const { user, loading: authLoading } = useAuth();
    const { currentOrg, loading: orgLoading } = useOrg() || {};

    const [platformRole, setPlatformRole] = useState(PLATFORM_ROLES.USER);
    const [membershipRole, setMembershipRole] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Wait until both auth AND org context have settled, otherwise
        // we'd flash `membershipRole = null` on every page load while
        // OrgContext is still fetching `/organizations/mine/`.
        if (authLoading || orgLoading) return;

        // ---- Platform role ----
        let nextPlatformRole = PLATFORM_ROLES.USER;
        const incoming = user?.role;

        // Legacy safety: old backends may still return 'owner' or
        // 'member' on User.role. Normalise them down to 'user' — their
        // actual capabilities come from memberships, not from this field.
        const LEGACY_MEMBERSHIP_AS_PLATFORM = ['owner', 'member', 'admin'];

        if (incoming && !LEGACY_MEMBERSHIP_AS_PLATFORM.includes(incoming)) {
            const allowed = Object.values(PLATFORM_ROLES);
            if (allowed.includes(incoming)) {
                nextPlatformRole = incoming;
            } else {
                console.warn(
                    `⚠️ RoleProvider: unrecognised user.role ${JSON.stringify(incoming)}; defaulting to 'user'.`
                );
            }
        } else if (incoming && LEGACY_MEMBERSHIP_AS_PLATFORM.includes(incoming)) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn(
                    `⚠️ RoleProvider: legacy user.role=${incoming} — coercing to 'user'. ` +
                    `Migrate the backend to store membership roles on OrganizationMembership only.`
                );
            }
        }

        // is_superuser from the backend always wins — it's the
        // authoritative platform-admin signal regardless of `role`.
        if (user?.is_superuser) {
            nextPlatformRole = PLATFORM_ROLES.SUPER_ADMIN;
        }

        setPlatformRole(nextPlatformRole);

        // ---- Membership role (from current org) ----
        // OrgContext already returns each org's `role` field for the
        // caller in `/organizations/mine/`. Use that if present.
        const orgRole = currentOrg?.role || null;
        if (orgRole && Object.values(MEMBERSHIP_ROLES).includes(orgRole)) {
            setMembershipRole(orgRole);
        } else {
            setMembershipRole(null);
        }

        setLoading(false);
    }, [user, authLoading, currentOrg, orgLoading]);

    // ----- Convenience flags -----

    const isSuperAdmin = platformRole === PLATFORM_ROLES.SUPER_ADMIN;
    const isPlatformStaff = platformRole === PLATFORM_ROLES.STAFF;
    const isPlatformUser = platformRole === PLATFORM_ROLES.USER;

    const isGuest = !user;

    // "Does this user have a membership in the current org?" — used by
    // member-only pages. True for owner/admin/staff/member alike.
    const isOrgMember =
        !!membershipRole && Object.values(MEMBERSHIP_ROLES).includes(membershipRole);

    const isOwner = membershipRole === MEMBERSHIP_ROLES.OWNER;
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
        if (!membershipRole) return false;
        return MembershipRoleUtils.isAtLeast(membershipRole, required);
    };

    const canManageCurrentOrg = () => {
        if (isSuperAdmin) return true;
        return !!membershipRole && MembershipRoleUtils.canManageOrg(membershipRole);
    };

    const value = useMemo(() => ({
        // New API
        platformRole,
        membershipRole,
        hasOrgRole,
        canManageCurrentOrg,
        // Legacy API — kept so un-migrated files keep compiling.
        role: platformRole,          // was user.role before; now the platform role
        isSuperAdmin,
        isPlatformStaff,
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
        platformRole, membershipRole, isSuperAdmin, isPlatformStaff,
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