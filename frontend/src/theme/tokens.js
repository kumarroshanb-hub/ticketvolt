// frontend/src/theme/tokens.js
//
// ============================================================================
// SINGLE SOURCE OF TRUTH FOR ALL BRAND TOKENS
// ----------------------------------------------------------------------------
// Change a value here → it propagates EVERYWHERE:
//   • styled-components      (via ThemeProvider → props.theme.colors.*)
//   • MUI components         (via createTheme in muiTheme.js)
//   • Raw CSS                (via CSS variables --tv-* injected in global.js)
//   • Any component directly (import { theme } from '../theme/tokens')
//
// DO NOT hardcode colors anywhere else in the app.
// ============================================================================

// -------- BRAND PRIMITIVES --------
export const BRAND = {
    charcoal: '#333333',   // Primary brand — MEX #333333
    red:      '#FF2A2A',   // Accent brand — Vibrant Red
    redLight: '#FF6B6B',   // Secondary-light / accent-light
    redDark:  '#CC0000',   // Secondary-dark / accent-dark
    darkGray: '#555555',   // Secondary brand — Dark Gray
    // Additional accent hues used sparingly for data viz / avatars
    pink:     '#ec4899',
    cyan:     '#06b6d4',
    lime:     '#84cc16',
};

// -------- NEUTRAL PALETTE --------
export const NEUTRAL = {
    white:   '#ffffff',
    gray50:  '#f8fafc',
    gray100: '#f1f5f9',
    gray200: '#e2e8f0',
    gray300: '#cbd5e1',
    gray400: '#94a3b8',
    gray500: '#777777',
    gray600: '#555555',
    gray700: '#333333',
    gray800: '#1a1a1a',
    black:   '#0a0a0a',
    // Dark-mode app shell surface (Login, Scanner, App root)
    darkBg:  '#0A0B1A',
};

// -------- STATUS COLORS --------
export const STATUS = {
    success:      '#10b981',
    successLight: '#34d399',
    successDark:  '#059669',
    warning:      '#f59e0b',
    warningLight: '#fbbf24',
    warningDark:  '#d97706',
    error:        '#ef4444',
    errorLight:   '#f87171',
    errorDark:    '#dc2626',
    info:         '#3b82f6',
    infoLight:    '#60a5fa',
    infoDark:     '#2563eb',
    // Focus ring — single source for all input focus states.
    // Note: also re-exported on theme.colors.focusRing below.
    focusRing:    'rgba(51, 51, 51, 0.10)',
};

// -------- TYPOGRAPHY --------
export const FONT = {
    family:     "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    familyMono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
};

// ============================================================================
// THE THEME OBJECT
// Consumed by:
//   • styled-components ThemeProvider
//   • Any component importing { theme } from './tokens'
// ============================================================================
export const theme = {
    colors: {
        // --- Brand primitives (rarely used directly) ---
        brandCharcoal: BRAND.charcoal,
        brandRed:      BRAND.red,
        brandDarkGray: BRAND.darkGray,

        // --- Primary (charcoal) ---
        primary:         BRAND.charcoal,
        primaryLight:    BRAND.darkGray,
        primaryDark:     NEUTRAL.gray800,
        primaryGradient: `linear-gradient(135deg, ${BRAND.charcoal} 0%, ${BRAND.darkGray} 100%)`,

        // --- Secondary (red) ---
        secondary:         BRAND.red,
        secondaryLight:    BRAND.redLight,
        secondaryDark:     BRAND.redDark,
        secondaryGradient: `linear-gradient(135deg, ${BRAND.red} 0%, ${BRAND.redDark} 100%)`,

        // --- Accent (alias of secondary for CTA-style buttons) ---
        accent:         BRAND.red,
        accentLight:    BRAND.redLight,
        accentDark:     BRAND.redDark,
        accentGradient: `linear-gradient(135deg, ${BRAND.red} 0%, ${BRAND.redDark} 100%)`,

        // --- Status (spread also brings `focusRing` into scope) ---
        ...STATUS,

        // --- Surfaces (light mode) ---
        bgPrimary:   NEUTRAL.gray50,
        bgSecondary: NEUTRAL.white,
        bgCard:      NEUTRAL.white,
        bgCardHover: NEUTRAL.gray100,
        bgSidebar:   NEUTRAL.white,
        bgInput:     NEUTRAL.gray100,
        bgHover:     NEUTRAL.gray50,

        // --- Surfaces (dark mode — used on Login / Scanner / App shell) ---
        bgDark:       NEUTRAL.darkBg,
        bgDarkCard:   'rgba(255, 255, 255, 0.03)',
        bgDarkBorder: 'rgba(255, 255, 255, 0.06)',

        // --- Text ---
        textPrimary:   NEUTRAL.gray700,
        textSecondary: NEUTRAL.gray600,
        textMuted:     NEUTRAL.gray500,
        textLight:     NEUTRAL.gray400,
        textInverse:   NEUTRAL.white,

        // --- Borders ---
        borderLight:  NEUTRAL.gray200,
        borderHover:  NEUTRAL.gray300,
        borderActive: BRAND.charcoal,

        // --- Interaction states ---
        // Alpha-suffixed brand colors for hover / focus / active states.
        // Use these instead of one-off rgba(51,51,51,…) literals.
        hoverSubtle: 'rgba(51, 51, 51, 0.04)',   // 4%  — subtle button/nav hover
        hoverMedium: 'rgba(51, 51, 51, 0.08)',   // 8%  — active nav bg
        hoverStrong: 'rgba(51, 51, 51, 0.10)',   // 10% — pressed / focus ring
        activeBar:   'rgba(51, 51, 51, 0.08)',   // 8%  — nav ::before accent bar

        // Frosted-glass nav surface (used by fixed mobile Navbar)
        surfaceGlass: 'rgba(255, 255, 255, 0.95)',

        // Scrollbar thumbs on light surfaces
        scrollbarThumb:      'rgba(0, 0, 0, 0.10)',
        scrollbarThumbHover: 'rgba(0, 0, 0, 0.20)',

        // Info banner (BulkActionsBar and similar toolbars)
        infoBanner:       'rgba(238, 242, 255, 1)',   // = #eef2ff
        infoBannerBorder: 'rgba(199, 210, 254, 1)',   // = #c7d2fe

        // --- Gradients (convenience) ---
        gradientPrimary: `linear-gradient(135deg, ${BRAND.charcoal} 0%, ${BRAND.darkGray} 100%)`,
        gradientSuccess: `linear-gradient(135deg, ${STATUS.success} 0%, ${STATUS.successLight} 100%)`,
        gradientWarning: `linear-gradient(135deg, ${STATUS.warning} 0%, ${STATUS.warningLight} 100%)`,
        gradientError:   `linear-gradient(135deg, ${STATUS.error} 0%, ${STATUS.errorLight} 100%)`,
        gradientCard:    `linear-gradient(135deg, ${NEUTRAL.gray50} 0%, ${NEUTRAL.gray100} 100%)`,

        // --- Extra accent hues (data viz / avatars) ---
        pink: BRAND.pink,
        cyan: BRAND.cyan,
        lime: BRAND.lime,
    },

    fonts: FONT,

    typography: {
        fontFamily: FONT.family,
    },

    shadows: {
        card:        '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        cardHover:   '0 4px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
        glow:        '0 0 40px rgba(51,51,51,0.08)',
        glowStrong:  '0 0 60px rgba(51,51,51,0.12)',
        sidebar:     '4px 0 24px rgba(0,0,0,0.04)',
        dropdown:    '0 8px 32px rgba(0,0,0,0.08)',
        modal:       '0 24px 64px rgba(0,0,0,0.12)',
        button:      '0 2px 8px rgba(51,51,51,0.20)',
        buttonHover: '0 4px 16px rgba(51,51,51,0.30)',
        // Small toggle button (Sidebar collapse handle, similar)
        toggle:      '0 1px 3px rgba(0,0,0,0.10)',
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
        xs: '4px', sm: '8px', md: '12px', lg: '16px',
        xl: '20px', xxl: '24px', xxxl: '32px',
    },

    fontSize: {
        xs: '11px', sm: '12px', md: '14px', lg: '16px',
        xl: '18px', xxl: '20px', xxxl: '24px', xxxxl: '32px',
    },

    fontWeight: {
        normal: 400, medium: 500, semibold: 600,
        bold: 700, extrabold: 800,
    },

    breakpoints: {
        xs: '480px', sm: '768px', md: '1024px',
        lg: '1280px', xl: '1440px', xxl: '1920px',
    },

    transitions: {
        default: '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        fast:    '0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        slow:    '0.5s cubic-bezier(0.4, 0, 0.2, 1)',
    },

    zIndex: {
        base: 1, dropdown: 100, sticky: 200,
        fixed: 300, modal: 400, popover: 500, tooltip: 600,
    },

    branding: {
        logoText:     'TiKetVault',
        logoCharcoal: BRAND.charcoal,
        logoRed:      BRAND.red,
    },
};

// Convenience alias — allows `import theme, { BRAND } from './tokens'`
export default theme;