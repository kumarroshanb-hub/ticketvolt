// frontend/src/components/Navbar/Navbar.js
import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Menu as MenuIcon,
    KeyboardArrowDown as KeyboardArrowDownIcon,
    Person as PersonIcon,
    Logout as LogoutIcon,
} from '@mui/icons-material';
import { theme } from '../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

// ============================================
// STYLED COMPONENTS
// ============================================

const NavbarContainer = styled.nav`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: ${props => (props.$fixed ? '12px 16px' : '12px 0')};
    margin-bottom: ${props => (props.$fixed ? '0' : '24px')};
    background: ${props => (props.$fixed ? 'rgba(255, 255, 255, 0.95)' : 'transparent')};
    backdrop-filter: ${props => (props.$fixed ? 'blur(8px)' : 'none')};
    -webkit-backdrop-filter: ${props => (props.$fixed ? 'blur(8px)' : 'none')};
    border-bottom: ${props => (props.$fixed ? `1px solid ${C.borderLight}` : 'none')};
    position: ${props => (props.$fixed ? 'fixed' : 'relative')};
    top: ${props => (props.$fixed ? '0' : 'auto')};
    left: ${props => (props.$fixed ? '0' : 'auto')};
    right: ${props => (props.$fixed ? '0' : 'auto')};
    z-index: 1100;
    box-sizing: border-box;
    font-family: ${F.family};

    padding-top: ${props => (props.$fixed ? 'max(12px, env(safe-area-inset-top))' : '12px')};
    padding-left: ${props => (props.$fixed ? 'max(16px, env(safe-area-inset-left))' : '0')};
    padding-right: ${props => (props.$fixed ? 'max(16px, env(safe-area-inset-right))' : '0')};
`;

const NavLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
`;

const MenuButton = styled.button`
    display: none;
    background: none;
    border: none;
    color: ${C.textPrimary};
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
    color: ${C.textPrimary};
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

const UserMenuWrapper = styled.div`
    position: relative;
`;

const UserInfo = styled.button`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px 6px 6px;
    border-radius: 30px;
    background: ${C.bgCard};
    border: 1px solid ${C.borderLight};
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 44px;
    touch-action: manipulation;
    font-family: ${F.family};

    &:hover {
        border-color: ${C.primary};
        box-shadow: 0 0 0 4px rgba(51, 51, 51, 0.08);
    }

    &:focus-visible {
        outline: 2px solid ${C.primary};
        outline-offset: 2px;
    }

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
    background: ${C.primaryGradient};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${C.textInverse};
    font-weight: 600;
    font-size: 14px;
`;

const UserDetails = styled.div`
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    text-align: left;

    @media (max-width: 900px) {
        display: none;
    }
`;

const UserName = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: ${C.textPrimary};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
`;

const UserRole = styled.span`
    font-size: 10px;
    color: ${C.textSecondary};
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.3px;
`;

const RoleBadge = styled.span`
    font-size: 9px;
    padding: 2px 10px;
    border-radius: 12px;
    background: ${props => {
        switch (props.role) {
            case 'super_admin': return `${C.success}1A`;
            case 'admin':       return `${C.info}1A`;
            case 'organizer':   return `${C.warning}1A`;
            default:            return C.bgInput;
        }
    }};
    color: ${props => {
        switch (props.role) {
            case 'super_admin': return C.successDark;
            case 'admin':       return C.infoDark;
            case 'organizer':   return C.warningDark;
            default:            return C.textSecondary;
        }
    }};
    font-weight: 600;

    @media (max-width: 900px) {
        display: none;
    }
`;

const Chevron = styled(KeyboardArrowDownIcon)`
    color: ${C.textSecondary};
    font-size: 18px !important;
    transition: transform 0.2s ease;
    transform: rotate(${props => (props.$open ? '180deg' : '0deg')});

    @media (max-width: 900px) {
        display: none;
    }
`;

const Dropdown = styled.div`
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 200px;
    background: ${C.bgCard};
    border: 1px solid ${C.borderLight};
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(15, 23, 42, 0.12);
    padding: 6px;
    z-index: 1200;
    animation: fadeIn 0.15s ease;

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
    }
`;

const DropdownHeader = styled.div`
    padding: 10px 12px 8px;
    border-bottom: 1px solid ${C.bgInput};
    margin-bottom: 4px;
`;

const DropdownName = styled.div`
    font-size: 13px;
    font-weight: 600;
    color: ${C.textPrimary};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const DropdownEmail = styled.div`
    font-size: 11px;
    color: ${C.textSecondary};
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const DropdownItem = styled.button`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border: none;
    background: none;
    border-radius: 8px;
    font-size: 14px;
    font-family: ${F.family};
    color: ${C.textPrimary};
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;

    svg { font-size: 18px; color: ${C.textSecondary}; }

    &:hover {
        background: ${C.bgInput};
    }

    &.danger {
        color: ${C.errorDark};
        svg { color: ${C.errorDark}; }
        &:hover { background: ${C.error}1A; }
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
    '/profile':   'Profile',
};

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

const Navbar = ({ onMenuToggle, isMobile = false }) => {
    const { user, logout } = useAuth();
    const { role, isSuperAdmin, isAdmin, isOrganizer } = useRole();
    const navigate = useNavigate();
    const location = useLocation();

    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handleClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [menuOpen]);

    useEffect(() => {
        if (!menuOpen) return;
        const handleKey = (e) => {
            if (e.key === 'Escape') setMenuOpen(false);
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [menuOpen]);

    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname]);

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

    const handleLogout = () => {
        setMenuOpen(false);
        if (typeof logout === 'function') {
            logout();
        }
        navigate('/login');
    };

    const handleGoToProfile = () => {
        setMenuOpen(false);
        navigate('/profile');
    };

    const pageTitle = getPageTitleFromPath(location.pathname);

    return (
        <NavbarContainer $fixed={isMobile}>
            <NavLeft>
                <MenuButton onClick={onMenuToggle} aria-label="Toggle navigation menu">
                    <MenuIcon />
                </MenuButton>
                <PageTitle $compact={isMobile} title={pageTitle}>
                    {pageTitle}
                </PageTitle>
            </NavLeft>

            <NavRight>
                <UserMenuWrapper ref={menuRef}>
                    <UserInfo
                        onClick={() => setMenuOpen(prev => !prev)}
                        aria-label="User menu"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                    >
                        <UserAvatar>{getInitial()}</UserAvatar>
                        <UserDetails>
                            <UserName>{user?.name || user?.username || 'User'}</UserName>
                            <UserRole>{getRoleLabel()}</UserRole>
                        </UserDetails>
                        <RoleBadge role={role}>
                            {isSuperAdmin ? '🔑' : isAdmin ? '🛡️' : isOrganizer ? '📋' : '👤'}
                        </RoleBadge>
                        <Chevron $open={menuOpen} />
                    </UserInfo>

                    {menuOpen && (
                        <Dropdown role="menu">
                            <DropdownHeader>
                                <DropdownName>
                                    {user?.name || user?.username || 'User'}
                                </DropdownName>
                                {user?.email && (
                                    <DropdownEmail>{user.email}</DropdownEmail>
                                )}
                            </DropdownHeader>

                            <DropdownItem role="menuitem" onClick={handleGoToProfile}>
                                <PersonIcon />
                                Profile
                            </DropdownItem>

                            <DropdownItem
                                role="menuitem"
                                className="danger"
                                onClick={handleLogout}
                            >
                                <LogoutIcon />
                                Logout
                            </DropdownItem>
                        </Dropdown>
                    )}
                </UserMenuWrapper>
            </NavRight>
        </NavbarContainer>
    );
};

export default Navbar;