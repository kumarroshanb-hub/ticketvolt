// frontend/src/theme/index.js

export const theme = {
    colors: {
        // --- NEW BRAND COLORS from branding sheet ---
        // Charcoal Gray MEX #333333
        brandCharcoal: '#333333',
        // Vibrant Red HEX #FF2A2A
        brandRed: '#FF2A2A',
        // Dark Gray HEX #555555
        brandDarkGray: '#555555',

        // --- Mapped to Semantic Colors ---
        // Primary color is the brand's Charcoal Gray for a strong, neutral base.
        primary: '#333333',
        primaryLight: '#555555',
        primaryDark: '#1a1a1a',
        primaryGradient: 'linear-gradient(135deg, #333333 0%, #555555 100%)',

        // Secondary color is now the brand's Vibrant Red, used for highlighting actions.
        secondary: '#FF2A2A',
        secondaryLight: '#FF6B6B',
        secondaryDark: '#CC0000',
        
        // Status colors remain as they are essential for UI feedback.
        success: '#10b981',
        successLight: '#34d399',
        successDark: '#059669',
        warning: '#f59e0b',
        warningLight: '#fbbf24',
        warningDark: '#d97706',
        error: '#ef4444',
        errorLight: '#f87171',
        errorDark: '#dc2626',
        info: '#3b82f6',
        infoLight: '#60a5fa',
        infoDark: '#2563eb',
        
        // Background colors remain mostly the same for readability.
        bgPrimary: '#f8fafc',
        bgSecondary: '#ffffff',
        bgCard: '#ffffff',
        bgCardHover: '#f1f5f9',
        bgSidebar: '#ffffff',
        bgInput: '#f1f5f9',
        bgHover: '#f8fafc',

        // Text colors are now based on the brand's charcoal and gray.
        textPrimary: '#333333',
        textSecondary: '#555555',
        textMuted: '#777777',
        textLight: '#94a3b8',
        textInverse: '#ffffff',

        // Border colors
        borderLight: '#e2e8f0',
        borderHover: '#cbd5e1',
        borderActive: '#333333',
        
        // Gradients
        gradientPrimary: 'linear-gradient(135deg, #333333 0%, #555555 100%)',
        gradientSuccess: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
        gradientWarning: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
        gradientError: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
        gradientCard: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    },
    
    // Typography is set to Montserrat.
    typography: {
        fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },

    shadows: {
        // Shadows are updated to be more neutral.
        card: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
        cardHover: '0 4px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
        glow: '0 0 40px rgba(51, 51, 51, 0.08)',
        glowStrong: '0 0 60px rgba(51, 51, 51, 0.12)',
        sidebar: '4px 0 24px rgba(0, 0, 0, 0.04)',
        dropdown: '0 8px 32px rgba(0, 0, 0, 0.08)',
        modal: '0 24px 64px rgba(0, 0, 0, 0.12)',
        button: '0 2px 8px rgba(51, 51, 51, 0.20)',
        buttonHover: '0 4px 16px rgba(51, 51, 51, 0.30)',
    },
    
    borderRadius: {
        xs: '4px',
        sm: '8px',
        md: '10px',
        lg: '12px',
        xl: '16px',
        xxl: '20px',
        full: '9999px',
    },
    
    spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        xxl: '24px',
        xxxl: '32px',
    },
    
    fontSize: {
        xs: '11px',
        sm: '12px',
        md: '14px',
        lg: '16px',
        xl: '18px',
        xxl: '20px',
        xxxl: '24px',
        xxxxl: '32px',
    },
    
    fontWeight: {
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800,
    },
    
    breakpoints: {
        xs: '480px',
        sm: '768px',
        md: '1024px',
        lg: '1280px',
        xl: '1440px',
        xxl: '1920px',
    },
    
    transitions: {
        default: '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        fast: '0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        slow: '0.5s cubic-bezier(0.4, 0, 0.2, 1)',
    },
    
    zIndex: {
        base: 1,
        dropdown: 100,
        sticky: 200,
        fixed: 300,
        modal: 400,
        popover: 500,
        tooltip: 600,
    },

    // A dedicated section for brand-specific assets like logos.
    branding: {
        logoText: 'TiKetVault', // Can be used for text-based logos
        logoCharcoal: '#333333',
        logoRed: '#FF2A2A',
        // You can add paths to your SVG logo files here
        // logoPrimary: '/assets/logo-primary.svg',
        // logoIcon: '/assets/logo-icon.svg',
    }
};

export default theme;