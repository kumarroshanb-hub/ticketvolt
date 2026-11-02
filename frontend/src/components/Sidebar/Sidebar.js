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
  Policy as PolicyIcon,
  Business as BusinessIcon,
} from '@mui/icons-material';
import { useRole } from '../../context/RoleContext';
import { useAuth } from '../../context/AuthContext';
// UPDATED FOR 6-TIER HIERARCHY:
// Use central constants instead of a separate constants/roles.js file.
// This prevents build failures if roles.js is not maintained.
import { ROLES, RoleUtils } from '../../constants';
import Logo from '../Logo';
import { theme } from '../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

// ============================================
// STYLED COMPONENTS
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

const LogoImage = styled.img`
  height: ${props => props.height || '84px'};
  width: auto;
  display: ${props => (props.hidden ? 'none' : 'block')};
`;

const RoleBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: ${props => (props.collapsed ? '8px' : '10px 16px')};
  background: ${props => {
    // UPDATED FOR 6-TIER HIERARCHY:
    // Added explicit member styling and kept organizer as legacy fallback.
    if (props.role === 'super_admin') return C.successDark;
    if (props.role === 'owner') return C.warningDark;
    if (props.role === 'admin') return C.infoDark;
    if (props.role === 'staff') return C.secondaryDark;
    if (props.role === 'member') return C.primaryDark;
    if (props.role === 'organizer') return C.warningDark;
    return C.textSecondary;
  }};
  border-radius: 8px;
  margin-bottom: 16px;
  justify-content: ${props => (props.collapsed ? 'center' : 'flex-start')};
  
  .role-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }
  
  .role-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: white;
    display: ${props => (props.collapsed ? 'none' : 'block')};
  }
`;

const NavItems = styled.nav`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  padding-bottom: 10px;
  
  &::-webkit-scrollbar {
    width: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: ${C.scrollbarThumb};
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: ${C.scrollbarThumbHover};
  }
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
  
  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
  }
  
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
  
  &:hover {
    background: ${C.bgHover};
    color: ${C.textPrimary};
  }
  
  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
  }
  
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
  
  &:hover {
    background: ${C.bgHover};
    color: ${C.textPrimary};
  }
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
  
  &:hover {
    background: ${C.bgHover};
    color: ${C.textPrimary};
  }
`;

// ============================================
// COMPONENT
// ============================================
const Sidebar = ({ collapsed = false, onToggle, onNavigate }) => {
  const { role, isSuperAdmin } = useRole();
  const { logout, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  
  const isGuest = !isAuthenticated;
  const effectiveCollapsed = isGuest ? false : collapsed;
  const isDrawer = !!onNavigate;
  
  const handleLogout = () => {
    logout();
    if (onNavigate) onNavigate();
  };
  
  // Navigation items with role-based visibility
  // UPDATED FOR 6-TIER HIERARCHY:
  // - MEMBER can see Dashboard, Bookings, Settings.
  // - OWNER and ADMIN can see Organizations.
  // - STAFF can see Scanner.
  const navItems = [
    {
      path: '/app/dashboard',
      icon: <DashboardIcon />,
      label: t('nav.dashboard'),
      roles: [
        ROLES.SUPER_ADMIN,
        ROLES.OWNER,
        ROLES.ADMIN,
        ROLES.STAFF,
        ROLES.MEMBER,
        ROLES.USER,
      ],
      section: 'main',
    },
    {
      path: '/app/events',
      icon: <EventIcon />,
      label: t('nav.events'),
      roles: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
      section: 'management',
    },
    {
      path: '/app/venues',
      icon: <VenueIcon />,
      label: t('nav.venues'),
      roles: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
      section: 'management',
    },
    {
      path: '/app/bookings',
      icon: <TicketIcon />,
      label: t('nav.bookings'),
      roles: [
        ROLES.SUPER_ADMIN,
        ROLES.OWNER,
        ROLES.ADMIN,
        ROLES.STAFF,
        ROLES.MEMBER,
        ROLES.USER,
      ],
      section: 'main',
    },
    {
      path: '/app/checkin',
      icon: <ScannerIcon />,
      label: t('nav.checkin'),
      roles: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN, ROLES.STAFF],
      section: 'operations',
    },
    {
      path: '/app/discounts',
      icon: <DiscountIcon />,
      label: t('nav.discounts'),
      roles: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
      section: 'management',
    },
    {
      path: '/app/analytics',
      icon: <AnalyticsIcon />,
      label: t('nav.analytics'),
      roles: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
      section: 'management',
    },
    {
      path: '/app/users',
      icon: <PeopleIcon />,
      label: t('nav.users'),
      roles: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
      section: 'management',
    },
    {
      path: '/app/organizations',
      icon: <BusinessIcon />,
      label: t('nav.organizations'),
      // ✅ FIXED: Removed ROLES.USER. Only Admins/Owners/SuperAdmins see this.
      roles: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
      section: 'management',
    },
    {
      path: '/app/settings',
      icon: <SettingsIcon />,
      label: t('nav.settings'),
      roles: [
        ROLES.SUPER_ADMIN,
        ROLES.OWNER,
        ROLES.ADMIN,
        ROLES.MEMBER,
        ROLES.USER,
      ],
      section: 'main',
    },
  ];
  
  // Filter items based on role
  const visibleItems = navItems.filter(item => 
    item.roles.includes(role) || isSuperAdmin
  );
  
  // Group items by section
  const mainItems = visibleItems.filter(item => item.section === 'main');
  const managementItems = visibleItems.filter(item => item.section === 'management');
  const operationsItems = visibleItems.filter(item => item.section === 'operations');
  const adminItems = visibleItems.filter(item => item.section === 'admin');
  
  // UPDATED FOR 6-TIER HIERARCHY:
  // Added Owner / Member labels and safe fallbacks using RoleUtils.
  const getRoleLabel = () => {
    if (role === ROLES.SUPER_ADMIN) {
      return t('roles.superAdmin', RoleUtils.getLabel(ROLES.SUPER_ADMIN));
    }
    if (role === ROLES.OWNER) {
      return t('roles.owner', RoleUtils.getLabel(ROLES.OWNER));
    }
    if (role === ROLES.ADMIN) {
      return t('roles.admin', RoleUtils.getLabel(ROLES.ADMIN));
    }
    if (role === ROLES.STAFF) {
      return t('roles.staff', RoleUtils.getLabel(ROLES.STAFF));
    }
    if (role === ROLES.MEMBER) {
      return t('roles.member', RoleUtils.getLabel(ROLES.MEMBER));
    }
    if (role === ROLES.ORGANIZER || role === 'organizer') {
      return t('roles.organizer', 'Organizer');
    }
    return t('roles.user', RoleUtils.getLabel(ROLES.USER));
  };
  
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
      
      {!isGuest && (
        <RoleBadge role={role} collapsed={effectiveCollapsed} $drawer={isDrawer}>
          <span className="role-dot" />
          <span className="role-label">{getRoleLabel()}</span>
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
        aria-label={
          collapsed
            ? t('common.expandSidebar')
            : t('common.collapseSidebar')
        }
      >
        {collapsed ? (
          <ChevronRight fontSize="small" />
        ) : (
          <ChevronLeft fontSize="small" />
        )}
      </ToggleButton>
    </SidebarContainer>
  );
};

export default Sidebar;