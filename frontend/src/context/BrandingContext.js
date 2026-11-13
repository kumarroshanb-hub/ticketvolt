// frontend/src/context/BrandingContext.js
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useOrg } from './OrgContext';
import { theme as appTheme } from '../theme/tokens';
import i18n from '../i18n';

const BrandingContext = createContext(null);

const SAFE_HEX = /^#[0-9a-fA-F]{6}$/;

export const BrandingProvider = ({ children }) => {
    const { currentOrg } = useOrg() || {};

    const branding = useMemo(() => {
        const primary = SAFE_HEX.test(currentOrg?.brand_primary_color || '')
            ? currentOrg.brand_primary_color : '#333333';
        const secondary = SAFE_HEX.test(currentOrg?.brand_secondary_color || '')
            ? currentOrg.brand_secondary_color : '#FF2A2A';
        return {
            name: currentOrg?.name || 'TicketVault',
            legalName: currentOrg?.legal_name || currentOrg?.name || 'TicketVault',
            logoUrl: currentOrg?.org_logo_url || '',
            faviconUrl: currentOrg?.brand_favicon_url || '',
            primary,
            secondary,
            supportUrl: currentOrg?.support_url || '',
            email: currentOrg?.org_email || '',
            replyTo: currentOrg?.email_reply_to || '',
            customDomain: currentOrg?.custom_domain || '',
            isTenant: Boolean(currentOrg),
        };
    }, [currentOrg]);

    useEffect(() => {
        // Mutate the shared token object as well as the CSS variables so
        // components that already capture `theme.colors` re-render with the
        // tenant palette.
        appTheme.colors.primary = branding.primary;
        appTheme.colors.secondary = branding.secondary;
        appTheme.colors.accent = branding.secondary;
        appTheme.colors.primaryGradient = `linear-gradient(135deg, ${branding.primary} 0%, ${branding.primary} 100%)`;
        appTheme.colors.secondaryGradient = `linear-gradient(135deg, ${branding.secondary} 0%, ${branding.secondary} 100%)`;

        const root = document.documentElement;
        root.style.setProperty('--tv-primary', branding.primary);
        root.style.setProperty('--tv-secondary', branding.secondary);
        root.style.setProperty('--tv-accent', branding.secondary);
        if (currentOrg?.default_language && !localStorage.getItem('tv_language')) {
            i18n.changeLanguage(currentOrg.default_language);
        }
        document.title = branding.isTenant
            ? `${branding.name} · TicketVault`
            : 'TicketVault';
        if (branding.faviconUrl) {
            let link = document.querySelector("link[rel='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = branding.faviconUrl;
        }
    }, [branding]);

    return (
        <BrandingContext.Provider value={branding}>
            {children}
        </BrandingContext.Provider>
    );
};

export const useBranding = () => useContext(BrandingContext) || {
    name: 'TicketVault', legalName: 'TicketVault', logoUrl: '',
    faviconUrl: '', primary: '#333333', secondary: '#FF2A2A',
    supportUrl: '', email: '', replyTo: '', customDomain: '', isTenant: false,
};

export default BrandingContext;
