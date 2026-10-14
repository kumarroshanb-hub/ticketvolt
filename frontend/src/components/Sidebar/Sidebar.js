// frontend/src/components/Sidebar/Sidebar.js
import React from 'react';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';
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
} from '@mui/icons-material';
import { useRole } from '../../context/RoleContext';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../constants';
import { theme } from '../../theme/tokens';
import Logo from '../Logo';

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
    color: ${props => props.theme?.colors?.textPrimary || C.textPrimary};
    overflow: hidden;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    box-shadow: ${props => (props.$drawer ? 'none' : theme.shadows.card)};
    box-sizing: border-box;
    font-family: ${F.family};
`;

const LogoWrap = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 20px;
    border-bottom: 1px solid ${props => props.theme?.colors?.borderLight || C.borderLight};
    margin-bottom: 20px;
    /* Bumped from 60 → 68 so the larger logo has breathing room
       and the drawer close button doesn't clip it. */
    min-height: 76px;
    position: relative;
`;

const RoleBadge = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    margin-bottom: 12px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: ${props => {
        if (props.role === 'super_admin') return `${C.success}1A`;
        if (props.role === 'admin')       return `${C.info}1A`;
        if (props.role === 'organizer')   return `${C.warning}1A`;
        return C.bgInput;
    }};
    color: ${props => {
        if (props.role === 'super_admin') return C.successDark;
        if (props.role === 'admin')       return C.infoDark;
        if (props.role === 'organizer')   return C.warningDark;
        return C.textSecondary;
    }};
    opacity: ${props => (props.collapsed && !props.$drawer ? 0 : 1)};
    transition: opacity 0.3s ease;

    .role-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: ${props => {
            if (props.role === 'super_admin') return C.successDark;
            if (props.role === 'admin')       return C.infoDark;
            if (props.role === 'organizer')   return C.warningDark;
            return C.textSecondary;
        }};
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
    &::-webkit-scrollbar-thumb:hover {
        background: ${C.scrollbarThumbHover};
    }
`;

const NavSection = styled.div`
    margin-top: ${props => props.marginTop || '0'};
`;

const NavSectionLabel = styled.div`
    font-size: 10px;
    font-weight: 600;
    color: ${C.textLight};
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 14px 4px;
    opacity: ${props => (props.collapsed && !props.$drawer ? 0 : 1)};
    transition: opacity 0.3s ease;
    white-space: nowrap;
`;

const NavItem = styled(NavLink)`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    min-height: 44px;
    border-radius: 10px;
    color: ${props => props.theme?.colors?.textSecondary || C.textSecondary};
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
    white-space: nowrap;
    position: relative;
    cursor: pointer;
    touch-action: manipulation;

    .icon {
        min-width: 24px;
        font-size: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${props => props.theme?.colors?.textMuted || C.textMuted};
    }

    .label {
        opacity: ${props => (props.collapsed && !props.$drawer ? 0 : 1)};
        transition: opacity 0.3s ease;
    }

    .badge {
        margin-left: auto;
        padding: 2px 10px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        background: ${C.primary};
        color: ${C.textInverse};
        opacity: ${props => (props.collapsed && !props.$drawer ? 0 : 1)};
        transition: opacity 0.3s ease;
    }

    &:hover {
        color: ${props => props.theme?.colors?.textPrimary || C.textPrimary};
        background: ${props => props.theme?.colors?.bgCardHover || C.bgCardHover};

        .icon {
            color: ${C.primary};
        }
    }

    &.active {
        color: ${C.primary};
        background: ${C.hoverMedium};

        .icon {
            color: ${C.primary};
        }

        &::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 3px;
            height: 24px;
            background: ${C.primary};
            border-radius: 0 3px 3px 0;
        }
    }
`;

const LogoutSection = styled.div`
    margin-top: auto;
    border-top: 1px solid ${props => props.theme?.colors?.borderLight || C.borderLight};
    padding-top: 12px;
`;

const LogoutButton = styled.button`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    min-height: 44px;
    border-radius: 10px;
    border: none;
    background: transparent;
    color: ${C.error};
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 100%;
    white-space: nowrap;
    touch-action: manipulation;
    font-family: ${F.family};

    .icon {
        min-width: 24px;
        font-size: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .label {
        opacity: ${props => (props.collapsed && !props.$drawer ? 0 : 1)};
        transition: opacity 0.3s ease;
    }

    &:hover {
        background: ${C.error}1A;
    }
`;

const ToggleButton = styled.button`
    position: absolute;
    bottom: 20px;
    right: -12px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid ${props => props.theme?.colors?.borderLight || C.borderLight};
    background: ${props => props.theme?.colors?.bgSecondary || C.bgSecondary};
    color: ${props => props.theme?.colors?.textSecondary || C.textSecondary};
    cursor: pointer;
    display: ${props => (props.$drawer ? 'none' : 'flex')};
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    box-shadow: ${theme.shadows.toggle};

    &:hover {
        border-color: ${C.primary};
        color: ${C.primary};
        box-shadow: 0 0 0 4px ${C.hoverStrong};
    }
`;

const DrawerCloseButton = styled.button`
    position: absolute;
    top: 10px;
    right: 10px;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: ${C.textSecondary};
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    touch-action: manipulation;

    &:hover {
        background: ${C.hoverSubtle};
        color: ${C.textPrimary};
    }
`;

// ============================================
// MENU DEFINITIONS
// ============================================

const MENU_ITEMS = {
    dashboard: {
        path: '/dashboard',
        icon: <DashboardIcon />,
        label: 'Dashboard',
        roles: [ROLES.USER, ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
        section: 'main',
    },
    bookings: {
        path: '/bookings',
        icon: <TicketIcon />,
        label: 'Bookings',
        roles: [ROLES.USER, ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
        section: 'main',
        badge: true,
    },
    events: {
        path: '/events',
        icon: <EventIcon />,
        label: 'Events',
        roles: [ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
        section: 'management',
    },
    venues: {
        path: '/venues',
        icon: <VenueIcon />,
        label: 'Venues',
        roles: [ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
        section: 'management',
    },
    discounts: {
        path: '/discounts',
        icon: <DiscountIcon />,
        label: 'Discounts',
        roles: [ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
        section: 'management',
    },
    cancellationPolicies: {
        path: '/cancellation-policies',
        icon: <PolicyIcon />,
        label: 'Cancellation Policies',
        roles: [ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
        section: 'management',
    },
    analytics: {
        path: '/analytics',
        icon: <AnalyticsIcon />,
        label: 'Analytics',
        roles: [ROLES.ORGANIZER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
        section: 'management',
    },
    scanner: {
        path: '/checkin',
        icon: <ScannerIcon />,
        label: 'QR Scanner',
        roles: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
        section: 'admin',
    },
    users: {
        path: '/users',
        icon: <PeopleIcon />,
        label: 'Users',
        roles: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
        section: 'admin',
    },
    settings: {
        path: '/settings',
        icon: <SettingsIcon />,
        label: 'Settings',
        roles: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
        section: 'admin',
    },
};

const SECTION_LABELS = {
    main: 'MAIN',
    management: 'MANAGEMENT',
    admin: 'ADMIN',
};

// ============================================
// COMPONENT
// ============================================

const Sidebar = ({ collapsed = false, onToggle, onNavigate }) => {
    const { role, isSuperAdmin } = useRole();
    const { logout } = useAuth();

    const isDrawer = Boolean(onNavigate);
    const effectiveCollapsed = isDrawer ? false : collapsed;

    const getVisibleItems = () => {
        return Object.entries(MENU_ITEMS)
            .filter(([key, item]) => {
                if (isSuperAdmin) return true;
                return item.roles.includes(role);
            })
            .map(([key, item]) => ({ key, ...item }));
    };

    const visibleItems = getVisibleItems();

    const groupedItems = visibleItems.reduce((acc, item) => {
        const section = item.section || 'main';
        if (!acc[section]) acc[section] = [];
        acc[section].push(item);
        return acc;
    }, {});

    const handleLogout = () => {
        if (window.confirm('Are you sure you want to logout?')) {
            logout();
        }
    };

    return (
        <SidebarContainer collapsed={effectiveCollapsed} $drawer={isDrawer}>
            <LogoWrap>
                {/*
                  variant="both" renders the compact mark + wordmark
                  side-by-side. At height=32 the wordmark is legible
                  without crowding the drawer close button on the
                  mobile drawer.
                */}
                <Logo
                    variant="both"
                    height={44}
                    hidden={effectiveCollapsed && !isDrawer}
                />
                {isDrawer && (
                    <DrawerCloseButton onClick={onNavigate} aria-label="Close menu">
                        <CloseIcon fontSize="small" />
                    </DrawerCloseButton>
                )}
            </LogoWrap>

            <RoleBadge role={role} collapsed={effectiveCollapsed} $drawer={isDrawer}>
                <span className="role-dot" />
                {role === ROLES.SUPER_ADMIN ? 'Super Admin' :
                 role === ROLES.ADMIN ? 'Admin' :
                 role === ROLES.ORGANIZER ? 'Organizer' : 'User'}
            </RoleBadge>

            <NavItems>
                {Object.entries(groupedItems).map(([section, items]) => (
                    <NavSection key={section}>
                        <NavSectionLabel collapsed={effectiveCollapsed} $drawer={isDrawer}>
                            {SECTION_LABELS[section] || section.toUpperCase()}
                        </NavSectionLabel>
                        {items.map((item) => (
                            <NavItem
                                key={item.key}
                                to={item.path}
                                collapsed={effectiveCollapsed}
                                $drawer={isDrawer}
                                activeClassName="active"
                                onClick={() => {
                                    if (onNavigate) onNavigate();
                                }}
                            >
                                <span className="icon">{item.icon}</span>
                                <span className="label">{item.label}</span>
                                {item.badge && (
                                    <span className="badge">New</span>
                                )}
                            </NavItem>
                        ))}
                    </NavSection>
                ))}
            </NavItems>

            <LogoutSection>
                <LogoutButton
                    onClick={handleLogout}
                    collapsed={effectiveCollapsed}
                    $drawer={isDrawer}
                >
                    <span className="icon"><LogoutIcon fontSize="small" /></span>
                    <span className="label">Logout</span>
                </LogoutButton>
            </LogoutSection>

            <ToggleButton
                onClick={onToggle}
                $drawer={isDrawer}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                {collapsed ? <ChevronRight fontSize="small" /> : <ChevronLeft fontSize="small" />}
            </ToggleButton>
        </SidebarContainer>
    );
};

export default Sidebar;