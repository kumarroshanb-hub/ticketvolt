// frontend/src/components/Sidebar/Sidebar.js
import React from 'react';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import {
  Dashboard as DashboardIcon,
  Event as EventIcon,
  Place as VenueIcon,
  ConfirmationNumber as TicketIcon,
  Analytics as AnalyticsIcon,
  Discount as DiscountIcon,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  QrCodeScanner as ScannerIcon,
  People as PeopleIcon,
  Close as CloseIcon,
  Logout as LogoutIcon,
  Business as BusinessIcon,
  WorkspacePremium as MembershipIcon,
} from '@mui/icons-material';
import { useRole } from '../../context/RoleContext';
import { useAuth } from '../../context/AuthContext';
import {
  PLATFORM_ROLES,
  MEMBERSHIP_ROLES,
  PlatformRoleUtils,
  MembershipRoleUtils,
  MEMBERSHIP_ROLE_LABELS,
} from '../../constants';
import Logo from '../Logo';
import { theme } from '../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

// ============================================
// STYLED COMPONENTS  (unchanged from original)
// ============================================
const SidebarContainer = styled.aside`
  position: ${props => (props.$drawer ? 'relative' : 'fixed')};
  top: ${props => (props.$drawer ? 'auto' : '0')};
  left: ${props => (props.$drawer ? 'auto' : '0')};
  height: ${props => (props.$drawer ? '100%' : '100vh')};
  width: ${props => {
    if (props.$drawer) return '100%';
    return props.collapsed ? '80px' : '260px';
  }};
  background: ${props => props.theme?.colors?.bgSidebar || C.bgSidebar};
  border-right: 1px solid ${props => props.theme?.colors?.borderLight || C.borderLight};
  transition: ${props => (props.$drawer ? 'none' : 'width 0.3s ease')};
  padding: 20px;
  display: flex;
  flex-direction: column;
  z-index: 100;
`;

const LogoWrap = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
  position: relative;
`;

const LogoLink = styled(NavLink)`
  text-decoration: none;
  display: flex;
  justify-content: center;
`;

const RoleBadge = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: ${props => (props.collapsed ? '8px' : '10px 16px')};
  background: ${props => {
    switch (props.$kind) {
      case 'platform-super': return C.successDark;
      case 'platform-staff': return C.secondaryDark;
      case 'org-owner':      return C.warningDark;
      case 'org-admin':      return C.infoDark;
      case 'org-staff':      return C.secondaryDark;
      case 'org-member':     return C.primaryDark;
      default:               return C.textSecondary;
    }
  }};
  border-radius: 8px;
  margin-bottom: 8px;
  justify-content: ${props => (props.collapsed ? 'center' : 'flex-start')};

  .role-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    display: inline-block;
    margin-right: 8px;
  }

  .role-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: white;
    display: ${props => (props.collapsed ? 'none' : 'block')};
    line-height: 1.3;
  }

  .role-sub {
    font-size: 0.7rem;
    font-weight: 500;
    color: rgba(255,255,255,0.7);
    display: ${props => (props.collapsed ? 'none' : 'block')};
    line-height: 1.3;
  }
`;

const NavItems = styled.nav`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  padding-bottom: 10px;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb {
    background: ${C.scrollbarThumb};
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb:hover { background: ${C.scrollbarThumbHover}; }
`;

const NavSection = styled.div`
  margin-top: ${props => props.marginTop || '0'};
`;

const SectionLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${C.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 12px 16px 8px;
  display: ${props => (props.collapsed ? 'none' : 'block')};
`;

const NavItem = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: ${props => (props.collapsed ? '12px' : '12px 16px')};
  border-radius: 8px;
  text-decoration: none;
  color: ${props => (props.isActive ? 'white' : C.textSecondary)};
  background: ${props => (props.isActive ? C.primaryDark : 'transparent')};
  transition: all 0.2s ease;
  justify-content: ${props => (props.collapsed ? 'center' : 'flex-start')};

  &:hover {
    background: ${props => (props.isActive ? C.primaryDark : C.bgHover)};
    color: ${props => (props.isActive ? 'white' : C.textPrimary)};
  }

  .icon { display: flex; align-items: center; justify-content: center; min-width: 24px; }

  .label {
    font-size: 0.875rem;
    font-weight: ${props => (props.isActive ? '600' : '500')};
    display: ${props => (props.collapsed ? 'none' : 'block')};
    white-space: nowrap;
  }
`;

const LogoutSection = styled.div`
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid ${C.borderLight};
`;

const LogoutButton = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: ${props => (props.collapsed ? '12px' : '12px 16px')};
  border-radius: 8px;
  border: none;
  background: transparent;
  color: ${C.textSecondary};
  cursor: pointer;
  width: 100%;
  transition: all 0.2s ease;
  justify-content: ${props => (props.collapsed ? 'center' : 'flex-start')};

  &:hover { background: ${C.bgHover}; color: ${C.textPrimary}; }

  .icon { display: flex; align-items: center; justify-content: center; min-width: 24px; }
  .label {
    font-size: 0.875rem;
    font-weight: 500;
    display: ${props => (props.collapsed ? 'none' : 'block')};
    white-space: nowrap;
  }
`;

const ToggleButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 8px;
  border: none;
  background: ${C.bgHover};
  color: ${C.textSecondary};
  cursor: pointer;
  margin-top: 12px;
  transition: all 0.2s ease;

  &:hover { background: ${C.bgHover}; color: ${C.textPrimary}; }
`;

const DrawerCloseButton = styled.button`
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 8px;
  border-radius: 8px;
  border: none;
  background: ${C.bgHover};
  color: ${C.textSecondary};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover { background: ${C.bgHover}; color: ${C.textPrimary}; }
`;

// ============================================
// COMPONENT
// ============================================
const Sidebar = ({ collapsed = false, onToggle, onNavigate }) => {
  const {
    platformRole,
    membershipRole,
    hasOrgRole,
    isSuperAdmin,
  } = useRole();
  const { logout, isAuthenticated } = useAuth();
  const { t } = useTranslation();

  const isGuest = !isAuthenticated;
  const effectiveCollapsed = isGuest ? false : collapsed;
  const isDrawer = !!onNavigate;

  const handleLogout = () => {
    logout();
    if (onNavigate) onNavigate();
  };

  // ---------------------------------------------------------------
  // Nav items now declare:
  //   platformRoles   — which PLATFORM_ROLES see this item
  //   minOrgRole      — the minimum MEMBERSHIP_ROLE required (if any)
  //
  // An item is visible iff:
  //   • the user's platform role is in platformRoles (or super admin), AND
  //   • if minOrgRole is set, the user has at least that membership role
  //     in the CURRENT org (super admins bypass).
  //
  // A user with no memberships (Regular User only) sees dashboard,
  // bookings, membership, and settings — but NOT the tenant management
  // sections until they create/join an org.
  // ---------------------------------------------------------------
  const navItems = [
    {
      path: '/app/dashboard',
      icon: <DashboardIcon />,
      label: t('nav.dashboard'),
      platformRoles: [PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.STAFF, PLATFORM_ROLES.USER],
      section: 'main',
    },
    {
      path: '/app/events',
      icon: <EventIcon />,
      label: t('nav.events'),
      platformRoles: [PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.STAFF, PLATFORM_ROLES.USER],
      minOrgRole: MEMBERSHIP_ROLES.ADMIN,
      section: 'management',
    },
    {
      path: '/app/venues',
      icon: <VenueIcon />,
      label: t('nav.venues'),
      platformRoles: [PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.STAFF, PLATFORM_ROLES.USER],
      minOrgRole: MEMBERSHIP_ROLES.ADMIN,
      section: 'management',
    },
    {
      path: '/app/bookings',
      icon: <TicketIcon />,
      label: t('nav.bookings'),
      platformRoles: [PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.STAFF, PLATFORM_ROLES.USER],
      section: 'main',
    },
    {
      path: '/app/membership',
      icon: <MembershipIcon />,
      label: t('nav.membership', 'Membership'),
      platformRoles: [PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.STAFF, PLATFORM_ROLES.USER],
      section: 'main',
    },
    {
      path: '/app/membership/review-offline',
      icon: <MembershipIcon />,
      label: t('nav.reviewOfflineMemberships', 'Offline Requests'),
      platformRoles: [PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.STAFF, PLATFORM_ROLES.USER],
      minOrgRole: MEMBERSHIP_ROLES.ADMIN,
      section: 'management',
    },
    {
      path: '/app/checkin',
      icon: <ScannerIcon />,
      label: t('nav.checkin'),
      platformRoles: [PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.STAFF, PLATFORM_ROLES.USER],
      minOrgRole: MEMBERSHIP_ROLES.STAFF,
      section: 'operations',
    },
    {
      path: '/app/discounts',
      icon: <DiscountIcon />,
      label: t('nav.discounts'),
      platformRoles: [PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.STAFF, PLATFORM_ROLES.USER],
      minOrgRole: MEMBERSHIP_ROLES.ADMIN,
      section: 'management',
    },
    {
      path: '/app/analytics',
      icon: <AnalyticsIcon />,
      label: t('nav.analytics'),
      platformRoles: [PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.STAFF, PLATFORM_ROLES.USER],
      minOrgRole: MEMBERSHIP_ROLES.ADMIN,
      section: 'management',
    },
    {
      path: '/app/users',
      icon: <PeopleIcon />,
      label: t('nav.users'),
      platformRoles: [PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.STAFF],
      // also visible to org owners/admins via the minOrgRole gate below
      alsoVisibleToOrgRole: MEMBERSHIP_ROLES.ADMIN,
      section: 'management',
    },
    {
      path: '/app/organizations',
      icon: <BusinessIcon />,
      label: t('nav.organizations'),
      platformRoles: [PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.STAFF, PLATFORM_ROLES.USER],
      // every authenticated user can land here — it's where they CREATE
      // a first org or accept an invite. Individual actions are gated inside.
      section: 'management',
    },
    {
      path: '/app/settings',
      icon: <SettingsIcon />,
      label: t('nav.settings'),
      platformRoles: [PLATFORM_ROLES.SUPER_ADMIN, PLATFORM_ROLES.STAFF, PLATFORM_ROLES.USER],
      section: 'main',
    },
  ];

  const canSee = (item) => {
    // Platform admin bypasses everything.
    if (isSuperAdmin) return true;

    const platformOk = item.platformRoles?.includes(platformRole);
    const orgRoleOk = item.minOrgRole ? hasOrgRole(item.minOrgRole) : false;
    const altOrgRoleOk = item.alsoVisibleToOrgRole
      ? hasOrgRole(item.alsoVisibleToOrgRole)
      : false;

    // Visible if either (a) platform role permits and no org gate,
    // or (b) the current-org membership role satisfies the gate.
    if (platformOk && !item.minOrgRole) return true;
    if (orgRoleOk) return true;
    if (altOrgRoleOk) return true;
    return false;
  };

  const visibleItems = navItems.filter(canSee);

  const mainItems = visibleItems.filter(item => item.section === 'main');
  const managementItems = visibleItems.filter(item => item.section === 'management');
  const operationsItems = visibleItems.filter(item => item.section === 'operations');
  const adminItems = visibleItems.filter(item => item.section === 'admin');

  // ---------------------------------------------------------------
  // Two badges:
  //   1. platform role (if super_admin or staff — Regular Users don't
  //      need a "Regular User" label; it clutters the sidebar)
  //   2. current-org membership role (only when a membership exists)
  // ---------------------------------------------------------------
  const showPlatformBadge =
    platformRole === PLATFORM_ROLES.SUPER_ADMIN ||
    platformRole === PLATFORM_ROLES.STAFF;

  const platformBadgeKind =
    platformRole === PLATFORM_ROLES.SUPER_ADMIN ? 'platform-super' :
    platformRole === PLATFORM_ROLES.STAFF ? 'platform-staff' : null;

  const orgBadgeKind = (() => {
    // ✅ FIX: Superusers are platform-wide. Never show them an org role.
    if (isSuperAdmin) return null;
    switch (membershipRole) {
      case MEMBERSHIP_ROLES.OWNER:  return 'org-owner';
      case MEMBERSHIP_ROLES.ADMIN:  return 'org-admin';
      case MEMBERSHIP_ROLES.STAFF:  return 'org-staff';
      case MEMBERSHIP_ROLES.MEMBER: return 'org-member';
      default: return null;
    }
  })();

  return (
    <SidebarContainer collapsed={effectiveCollapsed} $drawer={isDrawer}>
      <LogoWrap>
        <LogoLink
          to={isGuest ? '/' : '/app/dashboard'}
          onClick={() => onNavigate && onNavigate()}
        >
          <Logo
            variant="full"
            height={84}
            hidden={effectiveCollapsed && !isDrawer}
          />
        </LogoLink>
        {isDrawer && (
          <DrawerCloseButton
            onClick={onNavigate}
            aria-label={t('common.closeMenu')}
          >
            <CloseIcon fontSize="small" />
          </DrawerCloseButton>
        )}
      </LogoWrap>

      {!isGuest && showPlatformBadge && (
        <RoleBadge $kind={platformBadgeKind} collapsed={effectiveCollapsed} $drawer={isDrawer}>
          <span className="role-label">
            <span className="role-dot" />
            {PlatformRoleUtils.getLabel(platformRole)}
          </span>
          <span className="role-sub">
            {t('roles.platformRole', 'platform-wide')}
          </span>
        </RoleBadge>
      )}

      {!isGuest && orgBadgeKind && (
        <RoleBadge $kind={orgBadgeKind} collapsed={effectiveCollapsed} $drawer={isDrawer}>
          <span className="role-label">
            <span className="role-dot" />
            {MembershipRoleUtils.getLabel(membershipRole)}
          </span>
          <span className="role-sub">
            {t('roles.inCurrentOrg', 'in current organization')}
          </span>
        </RoleBadge>
      )}

      <NavItems>
        {mainItems.length > 0 && (
          <NavSection>
            {mainItems.map(item => (
              <NavItem
                key={item.path}
                to={item.path}
                onClick={() => onNavigate && onNavigate()}
              >
                <span className="icon">{item.icon}</span>
                <span className="label">{item.label}</span>
              </NavItem>
            ))}
          </NavSection>
        )}

        {managementItems.length > 0 && (
          <NavSection marginTop="16px">
            <SectionLabel collapsed={effectiveCollapsed}>
              {t('sections.management')}
            </SectionLabel>
            {managementItems.map(item => (
              <NavItem
                key={item.path}
                to={item.path}
                onClick={() => onNavigate && onNavigate()}
              >
                <span className="icon">{item.icon}</span>
                <span className="label">{item.label}</span>
              </NavItem>
            ))}
          </NavSection>
        )}

        {operationsItems.length > 0 && (
          <NavSection marginTop="16px">
            <SectionLabel collapsed={effectiveCollapsed}>
              {t('sections.operations')}
            </SectionLabel>
            {operationsItems.map(item => (
              <NavItem
                key={item.path}
                to={item.path}
                onClick={() => onNavigate && onNavigate()}
              >
                <span className="icon">{item.icon}</span>
                <span className="label">{item.label}</span>
              </NavItem>
            ))}
          </NavSection>
        )}

        {adminItems.length > 0 && (
          <NavSection marginTop="16px">
            <SectionLabel collapsed={effectiveCollapsed}>
              {t('sections.admin')}
            </SectionLabel>
            {adminItems.map(item => (
              <NavItem
                key={item.path}
                to={item.path}
                onClick={() => onNavigate && onNavigate()}
              >
                <span className="icon">{item.icon}</span>
                <span className="label">{item.label}</span>
              </NavItem>
            ))}
          </NavSection>
        )}
      </NavItems>

      {!isGuest && (
        <LogoutSection>
          <LogoutButton
            onClick={handleLogout}
            collapsed={effectiveCollapsed}
            $drawer={isDrawer}
          >
            <span className="icon">
              <LogoutIcon fontSize="small" />
            </span>
            <span className="label">{t('nav.logout')}</span>
          </LogoutButton>
        </LogoutSection>
      )}

      <ToggleButton
        onClick={onToggle}
        $drawer={isDrawer}
        aria-label={collapsed ? t('common.expandSidebar') : t('common.collapseSidebar')}
      >
        {collapsed ? <ChevronRight fontSize="small" /> : <ChevronLeft fontSize="small" />}
      </ToggleButton>
    </SidebarContainer>
  );
};

export default Sidebar;