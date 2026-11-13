// frontend/src/components/Layout/Layout.js
import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { useMediaQuery, useTheme, Drawer } from '@mui/material';
import Sidebar from '../Sidebar';
import Navbar from '../Navbar';
import { theme } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import {
    Dashboard as DashboardIcon, Event as EventIcon,
    ConfirmationNumber as TicketIcon, Menu as MenuIcon,
} from '@mui/icons-material';

const C = theme.colors;

const LayoutContainer = styled.div`
    display: flex;
    min-height: 100vh;
    background: ${C.bgPrimary};
`;

const MainContent = styled.main`
    flex: 1;
    margin-left: ${props => (props.collapsed ? '80px' : '260px')};
    padding: 24px 32px;
    transition: margin-left 0.3s ease;
    min-height: 100vh;
    background: ${C.bgPrimary};

    @media (max-width: 900px) {
        margin-left: 0;
        padding: 16px;
        padding-top: 72px; /* space for fixed mobile navbar */
        padding-bottom: 92px; /* space for mobile bottom nav */
    }
`;

const ContentWrapper = styled.div`
    max-width: 1400px;
    margin: 0 auto;
`;

const MobileNav = styled.nav`
    display: none;

    @media (max-width: 900px) {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 45;
        background: rgba(255, 255, 255, 0.97);
        border-top: 1px solid ${C.borderLight};
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    }
`;

const MobileNavItem = styled(NavLink)`
    min-height: 50px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: ${C.textMuted};
    font-size: 10px;
    font-weight: 700;
    font-family: ${theme.fonts.family};

    svg { font-size: 21px; }
    &.active { color: ${C.secondary}; background: ${C.bgPrimary}; }
`;

const MobileMenuButton = styled.button`
    min-height: 50px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: ${C.textMuted};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 10px;
    font-weight: 700;
    font-family: ${theme.fonts.family};

    svg { font-size: 21px; }
`;

const GuestBookingShell = styled.div`
    min-height: 100vh;
    background: ${C.bgPrimary};
    padding: 24px;
    @media (max-width: 900px) { padding: 12px; }
`;

const GuestBookingContent = styled.div`
    max-width: 1400px;
    margin: 0 auto;
`;

const Layout = () => {
    const theme = useTheme();
    const location = useLocation();
    const { isAuthenticated, loading: authLoading } = useAuth();
    const { t } = useTranslation();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

    const handleMenuToggle = () => {
        if (isMobile) {
            setMobileDrawerOpen(prev => !prev);
        } else {
            setSidebarCollapsed(prev => !prev);
        }
    };

    const isGuestBooking = !authLoading
        && !isAuthenticated
        && location.pathname.startsWith('/app/bookings/create');

    if (isGuestBooking) {
        return (
            <GuestBookingShell>
                <GuestBookingContent>
                    <Outlet />
                </GuestBookingContent>
            </GuestBookingShell>
        );
    }

    return (
        <LayoutContainer>
            {isMobile ? (
                <Drawer
                    anchor="left"
                    open={mobileDrawerOpen}
                    onClose={() => setMobileDrawerOpen(false)}
                    ModalProps={{ keepMounted: true }}
                    PaperProps={{
                        sx: {
                            width: 260,
                            borderRight: `1px solid ${C.borderLight}`,
                        },
                    }}
                >
                    <Sidebar
                        collapsed={false}
                        onToggle={() => setMobileDrawerOpen(false)}
                        onNavigate={() => setMobileDrawerOpen(false)}
                    />
                </Drawer>
            ) : (
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggle={() => setSidebarCollapsed(prev => !prev)}
                />
            )}

            <MainContent collapsed={isMobile ? false : sidebarCollapsed}>
                <Navbar onMenuToggle={handleMenuToggle} isMobile={isMobile} />
                <ContentWrapper>
                    <Outlet />
                </ContentWrapper>
            </MainContent>

            {isAuthenticated && (
                <MobileNav aria-label={t('nav.mobileNavigation', 'Mobile navigation')}>
                    <MobileNavItem to="/app/dashboard">
                        <DashboardIcon />
                        {t('nav.dashboard')}
                    </MobileNavItem>
                    <MobileNavItem to="/app/events">
                        <EventIcon />
                        {t('nav.events')}
                    </MobileNavItem>
                    <MobileNavItem to="/app/bookings">
                        <TicketIcon />
                        {t('nav.bookings')}
                    </MobileNavItem>
                    <MobileMenuButton type="button" onClick={handleMenuToggle}>
                        <MenuIcon />
                        {t('common.menu', 'Menu')}
                    </MobileMenuButton>
                </MobileNav>
            )}
        </LayoutContainer>
    );
};

export default Layout;