// frontend/src/components/Navbar/Navbar.js
import React from 'react';
import styled from 'styled-components';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Menu as MenuIcon,
} from '@mui/icons-material';

// ============================================
// STYLED COMPONENTS
// ============================================

// ✅ When `$fixed` is set (mobile), the navbar sticks to the top of the
//     viewport with a blurred background so it stays visible while scrolling.
const NavbarContainer = styled.nav`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: ${props => (props.$fixed ? '12px 16px' : '12px 0')};
    margin-bottom: ${props => (props.$fixed ? '0' : '24px')};
    background: ${props => (props.$fixed ? 'rgba(255, 255, 255, 0.95)' : 'transparent')};
    backdrop-filter: ${props => (props.$fixed ? 'blur(8px)' : 'none')};
    -webkit-backdrop-filter: ${props => (props.$fixed ? 'blur(8px)' : 'none')};
    border-bottom: ${props => (props.$fixed ? '1px solid #e2e8f0' : 'none')};
    position: ${props => (props.$fixed ? 'fixed' : 'relative')};
    top: ${props => (props.$fixed ? '0' : 'auto')};
    left: ${props => (props.$fixed ? '0' : 'auto')};
    right: ${props => (props.$fixed ? '0' : 'auto')};
    z-index: 1100;
    box-sizing: border-box;

    /* Safe-area inset for notched phones (e.g. iPhone X+) */
    padding-top: ${props => (props.$fixed ? 'max(12px, env(safe-area-inset-top))' : '12px')};
    padding-left: ${props => (props.$fixed ? 'max(16px, env(safe-area-inset-left))' : '0')};
    padding-right: ${props => (props.$fixed ? 'max(16px, env(safe-area-inset-right))' : '0')};
`;

const NavLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0; /* allow PageTitle to shrink/truncate on small screens */
    flex: 1;
`;

// ✅ Hamburger — visible only on mobile
const MenuButton = styled.button`
    display: none;
    background: none;
    border: none;
    color: #0f172a;
    cursor: pointer;
    padding: 8px;
    border-radius: 8px;
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    flex-shrink: 0;

    &:hover {
        background: rgba(0, 0, 0, 0.04);
    }

    @media (max-width: 900px) {
        display: flex;
    }
`;

const PageTitle = styled.h1`
    font-size: ${props => (props.$compact ? '18px' : '24px')};
    font-weight: 700;
    color: #0f172a;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
`;

const NavRight = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
`;

const UserInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px 6px 6px;
    border-radius: 30px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 44px;
    touch-action: manipulation;

    &:hover {
        border-color: #4f46e5;
        box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.08);
    }

    /* Compact avatar-only chip on small screens */
    @media (max-width: 900px) {
        padding: 4px;
        gap: 0;
    }
`;

const UserAvatar = styled.div`
    width: 32px;
    height: 32px;
    min-width: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    font-size: 14px;
`;

// ✅ Hidden on mobile
const UserDetails = styled.div`
    display: flex;
    flex-direction: column;
    line-height: 1.2;

    @media (max-width: 900px) {
        display: none;
    }
`;

const UserName = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
`;

const UserRole = styled.span`
    font-size: 10px;
    color: #64748b;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.3px;
`;

// ✅ Hidden on mobile
const RoleBadge = styled.span`
    font-size: 9px;
    padding: 2px 10px;
    border-radius: 12px;
    background: ${props => {
        switch (props.role) {
            case 'super_admin': return '#dcfce7';
            case 'admin':       return '#dbeafe';
            case 'organizer':   return '#fef3c7';
            default:            return '#f1f5f9';
        }
    }};
    color: ${props => {
        switch (props.role) {
            case 'super_admin': return '#16a34a';
            case 'admin':       return '#2563eb';
            case 'organizer':   return '#d97706';
            default:            return '#64748b';
        }
    }};
    font-weight: 600;

    @media (max-width: 900px) {
        display: none;
    }
`;

// ============================================
// PAGE TITLE MAP
// ============================================

const PAGE_TITLES = {
    '/dashboard': 'Dashboard',
    '/events':    'Events',
    '/venues':    'Venues',
    '/bookings':  'Bookings',
    '/checkin':   'QR Scanner',
    '/scanner':   'QR Scanner',
    '/analytics': 'Analytics',
    '/discounts': 'Discounts',
    '/users':     'Users',
    '/settings':  'Settings',
};

// Match longest prefix so nested routes (e.g. /events/create) also work
const getPageTitleFromPath = (pathname) => {
    if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];

    let bestMatch = '';
    for (const prefix of Object.keys(PAGE_TITLES)) {
        if (pathname.startsWith(prefix) && prefix.length > bestMatch.length) {
            bestMatch = prefix;
        }
    }
    if (bestMatch) return PAGE_TITLES[bestMatch];

    if (pathname.startsWith('/bookings/')) return 'Bookings';
    if (pathname.startsWith('/tickets/'))  return 'Ticket';

    return 'Dashboard';
};

// ============================================
// COMPONENT
// ============================================

/**
 * Navbar
 *
 * Props:
 *   onMenuToggle {function} — called when the hamburger is tapped (mobile)
 *   isMobile     {boolean}  — when true, renders as a fixed mobile top bar
 */
const Navbar = ({ onMenuToggle, isMobile = false }) => {
    const { user } = useAuth();
    const { role, isSuperAdmin, isAdmin, isOrganizer } = useRole();
    const navigate = useNavigate();
    const location = useLocation();

    const getRoleLabel = () => {
        if (isSuperAdmin) return 'Super Admin';
        if (isAdmin) return 'Admin';
        if (isOrganizer) return 'Organizer';
        return 'User';
    };

    const getInitial = () => {
        if (user?.name) return user.name.charAt(0).toUpperCase();
        if (user?.username) return user.username.charAt(0).toUpperCase();
        return 'U';
    };

    const pageTitle = getPageTitleFromPath(location.pathname);

    return (
        <NavbarContainer $fixed={isMobile}>
            <NavLeft>
                <MenuButton
                    onClick={onMenuToggle}
                    aria-label="Toggle navigation menu"
                >
                    <MenuIcon />
                </MenuButton>
                <PageTitle $compact={isMobile} title={pageTitle}>
                    {pageTitle}
                </PageTitle>
            </NavLeft>

            <NavRight>
                <UserInfo onClick={() => navigate('/profile')} aria-label="User menu">
                    <UserAvatar>{getInitial()}</UserAvatar>
                    <UserDetails>
                        <UserName>{user?.name || user?.username || 'User'}</UserName>
                        <UserRole>{getRoleLabel()}</UserRole>
                    </UserDetails>
                    <RoleBadge role={role}>
                        {isSuperAdmin ? '🔑' : isAdmin ? '🛡️' : isOrganizer ? '📋' : '👤'}
                    </RoleBadge>
                </UserInfo>
            </NavRight>
        </NavbarContainer>
    );
};

export default Navbar;