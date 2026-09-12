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
} from '@mui/icons-material';
import { useRole } from '../../context/RoleContext';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../constants';

// ============================================
// STYLED COMPONENTS
// ============================================

// ✅ When used inside a mobile Drawer, the parent (Drawer) already provides
//     the fixed positioning. So we switch `position: fixed` → `position: relative`
//     via the `$drawer` transient prop. (styled-components v6 needs `$` prefix
//     for transient props, otherwise it forwards to the DOM and warns.)
const SidebarContainer = styled.aside`
    position: ${props => (props.$drawer ? 'relative' : 'fixed')};
    top: ${props => (props.$drawer ? 'auto' : '0')};
    left: ${props => (props.$drawer ? 'auto' : '0')};
    height: ${props => (props.$drawer ? '100%' : '100vh')};
    width: ${props => {
        if (props.$drawer) return '100%';
        return props.collapsed ? '80px' : '260px';
    }};
    background: ${props => props.theme?.colors?.bgSidebar || '#ffffff'};
    border-right: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    transition: ${props => (props.$drawer ? 'none' : 'width 0.3s ease')};
    padding: 20px;
    color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    overflow: hidden;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    box-shadow: ${props => (props.$drawer ? 'none' : '0 1px 3px rgba(0,0,0,0.06)')};
    box-sizing: border-box;
`;

const Logo = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 20px;
    border-bottom: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    margin-bottom: 20px;
    min-height: 60px;
    position: relative;
`;

const LogoIcon = styled.div`
    width: 40px;
    height: 40px;
    min-width: 40px;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: bold;
    color: white;
`;

const LogoText = styled.h3`
    color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    margin: 0;
    font-weight: 700;
    font-size: 20px;
    white-space: nowrap;
    opacity: ${props => (props.collapsed && !props.$drawer ? 0 : 1)};
    transition: opacity 0.3s ease;
    
    span {
        color: #4f46e5;
    }
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
        if (props.role === 'super_admin') return '#dcfce7';
        if (props.role === 'admin') return '#dbeafe';
        if (props.role === 'organizer') return '#fef3c7';
        return '#f1f5f9';
    }};
    color: ${props => {
        if (props.role === 'super_admin') return '#16a34a';
        if (props.role === 'admin') return '#2563eb';
        if (props.role === 'organizer') return '#d97706';
        return '#64748b';
    }};
    opacity: ${props => (props.collapsed && !props.$drawer ? 0 : 1)};
    transition: opacity 0.3s ease;
    
    .role-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: ${props => {
            if (props.role === 'super_admin') return '#16a34a';
            if (props.role === 'admin') return '#2563eb';
            if (props.role === 'organizer') return '#d97706';
            return '#64748b';
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

    /* nicer scrollbar when inside drawer */
    &::-webkit-scrollbar { width: 4px; }
    &::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.1);
        border-radius: 4px;
    }
`;

const NavSection = styled.div`
    margin-top: ${props => props.marginTop || '0'};
`;

const NavSectionLabel = styled.div`
    font-size: 10px;
    font-weight: 600;
    color: #94a3b8;
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
    color: ${props => props.theme?.colors?.textSecondary || '#64748b'};
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
        color: ${props => props.theme?.colors?.textMuted || '#94a3b8'};
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
        background: #4f46e5;
        color: white;
        opacity: ${props => (props.collapsed && !props.$drawer ? 0 : 1)};
        transition: opacity 0.3s ease;
    }
    
    &:hover {
        color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
        background: ${props => props.theme?.colors?.bgCardHover || '#f1f5f9'};
        
        .icon {
            color: #4f46e5;
        }
    }
    
    &.active {
        color: #4f46e5;
        background: rgba(79, 70, 229, 0.08);
        
        .icon {
            color: #4f46e5;
        }
        
        &::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 3px;
            height: 24px;
            background: #4f46e5;
            border-radius: 0 3px 3px 0;
        }
    }
`;

const LogoutSection = styled.div`
    margin-top: auto;
    border-top: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
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
    color: #ef4444;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 100%;
    white-space: nowrap;
    touch-action: manipulation;
    
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
        background: rgba(239, 68, 68, 0.1);
    }
`;

// ✅ Toggle button — hidden when in drawer mode (mobile), shown on desktop
const ToggleButton = styled.button`
    position: absolute;
    bottom: 20px;
    right: -12px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    background: ${props => props.theme?.colors?.bgSecondary || '#ffffff'};
    color: ${props => props.theme?.colors?.textSecondary || '#64748b'};
    cursor: pointer;
    display: ${props => (props.$drawer ? 'none' : 'flex')};
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    
    &:hover {
        border-color: #4f46e5;
        color: #4f46e5;
        box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
    }
`;

// ✅ Close (X) button — only rendered when in drawer mode
const DrawerCloseButton = styled.button`
    position: absolute;
    top: 10px;
    right: 10px;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    touch-action: manipulation;

    &:hover {
        background: rgba(0, 0, 0, 0.05);
        color: #0f172a;
    }
`;

// ============================================
// MENU DEFINITIONS WITH ROLE CHECKS
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
    // ❌ REMOVE ORGANIZERS MENU ITEM
    /*
    organizers: {
        path: '/organizers',
        icon: <GroupIcon />,
        label: 'Organizers',
        roles: [ROLES.ADMIN, ROLES.SUPER_ADMIN],
        section: 'admin',
    },
    */
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

/**
 * Sidebar
 *
 * Props:
 *   collapsed  {boolean}  — desktop collapse state
 *   onToggle   {function} — desktop toggle button handler
 *   onNavigate {function} — optional. When provided, the sidebar is being
 *                           rendered inside a Drawer; clicking a nav item
 *                           will call this (usually to close the drawer).
 *                           The X button in the top-right also calls this.
 */
const Sidebar = ({ collapsed = false, onToggle, onNavigate }) => {
    const { role, isSuperAdmin } = useRole();
    const { logout } = useAuth();

    // When onNavigate is provided, we're inside a mobile drawer.
    // In drawer mode we never visually collapse — everything shows at full width.
    const isDrawer = Boolean(onNavigate);
    const effectiveCollapsed = isDrawer ? false : collapsed;

    // Filter menu items based on user role
    const getVisibleItems = () => {
        return Object.entries(MENU_ITEMS)
            .filter(([key, item]) => {
                if (isSuperAdmin) return true;
                return item.roles.includes(role);
            })
            .map(([key, item]) => ({ key, ...item }));
    };

    const visibleItems = getVisibleItems();

    // Group items by section
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
        <SidebarContainer
            collapsed={effectiveCollapsed}
            $drawer={isDrawer}
        >
            <Logo>
                <LogoIcon>🎫</LogoIcon>
                <LogoText collapsed={effectiveCollapsed} $drawer={isDrawer}>
                    Ticket<span>Volt</span>
                </LogoText>
                {isDrawer && (
                    <DrawerCloseButton
                        onClick={onNavigate}
                        aria-label="Close menu"
                    >
                        <CloseIcon fontSize="small" />
                    </DrawerCloseButton>
                )}
            </Logo>
            
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
                                    // In drawer mode, close the drawer after navigation
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