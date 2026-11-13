import React from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const TABS = [
    { key: 'overview', label: 'Overview', path: '/app/organizations' },
    { key: 'plans', label: 'Membership plans', path: '/app/membership/manage' },
    { key: 'offline', label: 'Offline reviews', path: '/app/membership/review-offline' },
    { key: 'bulk', label: 'Bulk upload', path: '/app/membership/bulk-upload' },
];

const OrganizationAdminTabs = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const current = TABS.find((tab) => location.pathname === tab.path)?.key || 'overview';

    return (
        <Box sx={{ borderBottom: `1px solid ${C.borderLight}`, mb: 3 }}>
            <Tabs
                value={current}
                variant="scrollable"
                allowScrollButtonsMobile
                onChange={(_, value) => {
                    const tab = TABS.find((item) => item.key === value);
                    if (tab) navigate(tab.path);
                }}
                sx={{ '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 46 } }}
            >
                {TABS.map((tab) => (
                    <Tab key={tab.key} value={tab.key} label={t(`organizations.tabs.${tab.key}`, tab.label)} />
                ))}
            </Tabs>
        </Box>
    );
};

export default OrganizationAdminTabs;
