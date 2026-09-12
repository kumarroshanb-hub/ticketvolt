import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { useMediaQuery, useTheme, Drawer, Box } from '@mui/material';
import Sidebar from '../Sidebar';
import Navbar from '../Navbar';

const LayoutContainer = styled.div`
    display: flex;
    min-height: 100vh;
    background: #f1f5f9;
`;

const MainContent = styled.main`
    flex: 1;
    margin-left: ${props => props.collapsed ? '80px' : '260px'};
    padding: 24px 32px;
    transition: margin-left 0.3s ease;
    min-height: 100vh;
    background: #f1f5f9;

    @media (max-width: 900px) {
        margin-left: 0;
        padding: 16px;
        padding-top: 72px; /* space for fixed mobile navbar */
    }
`;

const ContentWrapper = styled.div`
    max-width: 1400px;
    margin: 0 auto;
`;

const Layout = () => {
    const theme = useTheme();
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
                            borderRight: '1px solid #e2e8f0',
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
        </LayoutContainer>
    );
};

export default Layout;