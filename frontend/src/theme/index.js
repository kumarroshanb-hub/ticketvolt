// admin-frontend/src/theme/index.js
export const theme = {
    colors: {
        // Primary colors
        primary: '#4f46e5',
        primaryLight: '#818cf8',
        primaryDark: '#4338ca',
        primaryGradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
        
        // Secondary colors
        secondary: '#7c3aed',
        secondaryLight: '#a78bfa',
        secondaryDark: '#6d28d9',
        
        // Status colors
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
        
        // Background colors
        bgPrimary: '#f8fafc',
        bgSecondary: '#ffffff',
        bgCard: '#ffffff',
        bgCardHover: '#f1f5f9',
        bgSidebar: '#ffffff',
        bgInput: '#f1f5f9',
        bgHover: '#f8fafc',
        
        // Text colors
        textPrimary: '#0f172a',
        textSecondary: '#334155',
        textMuted: '#64748b',
        textLight: '#94a3b8',
        textInverse: '#ffffff',
        
        // Border colors
        borderLight: '#e2e8f0',
        borderHover: '#c7d2fe',
        borderActive: '#818cf8',
        
        // Gradients
        gradientPrimary: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
        gradientSuccess: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
        gradientWarning: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
        gradientError: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
        gradientCard: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    },
    
    shadows: {
        card: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
        cardHover: '0 4px 24px rgba(79, 70, 229, 0.10), 0 2px 8px rgba(0, 0, 0, 0.04)',
        glow: '0 0 40px rgba(79, 70, 229, 0.08)',
        glowStrong: '0 0 60px rgba(79, 70, 229, 0.12)',
        sidebar: '4px 0 24px rgba(0, 0, 0, 0.04)',
        dropdown: '0 8px 32px rgba(0, 0, 0, 0.08)',
        modal: '0 24px 64px rgba(0, 0, 0, 0.12)',
        button: '0 2px 8px rgba(79, 70, 229, 0.20)',
        buttonHover: '0 4px 16px rgba(79, 70, 229, 0.30)',
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
};

export default theme;