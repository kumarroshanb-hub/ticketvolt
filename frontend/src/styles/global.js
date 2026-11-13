// frontend/src/styles/global.js
//
// Global styles + CSS custom properties.
// Font imports live in public/index.html — NOT here.

import { createGlobalStyle } from 'styled-components';
import { theme } from '../theme/tokens';

const c = theme.colors;

export const GlobalStyle = createGlobalStyle`
    /* ============================================================
       CSS CUSTOM PROPERTIES — one place raw CSS can read brand
       values from. Use anywhere: color: var(--tv-primary);
       ============================================================ */
    :root {
        /* Brand */
        --tv-charcoal: ${c.brandCharcoal};
        --tv-red:      ${c.brandRed};
        --tv-darkGray: ${c.brandDarkGray};

        /* Semantic */
        --tv-primary:          ${c.primary};
        --tv-primary-light:    ${c.primaryLight};
        --tv-primary-dark:     ${c.primaryDark};
        --tv-primary-gradient: ${c.primaryGradient};

        --tv-secondary:        ${c.secondary};
        --tv-secondary-dark:   ${c.secondaryDark};
        --tv-secondary-gradient: ${c.secondaryGradient};

        --tv-accent:           ${c.accent};
        --tv-accent-dark:      ${c.accentDark};

        /* Status */
        --tv-success: ${c.success};
        --tv-warning: ${c.warning};
        --tv-error:   ${c.error};
        --tv-info:    ${c.info};

        /* Surfaces */
        --tv-bg-primary:    ${c.bgPrimary};
        --tv-bg-card:       ${c.bgCard};
        --tv-bg-dark:       ${c.bgDark};
        --tv-bg-dark-card:  ${c.bgDarkCard};
        --tv-bg-dark-border:${c.bgDarkBorder};

        /* Text */
        --tv-text-primary:   ${c.textPrimary};
        --tv-text-secondary: ${c.textSecondary};
        --tv-text-muted:     ${c.textMuted};
        --tv-text-inverse:   ${c.textInverse};

        /* Borders */
        --tv-border-light: ${c.borderLight};
        --tv-border-hover: ${c.borderHover};

        /* Typography */
        --tv-font:      ${theme.fonts.family};
        --tv-font-mono: ${theme.fonts.familyMono};

        /* Radii */
        --tv-radius-sm: ${theme.borderRadius.sm};
        --tv-radius-md: ${theme.borderRadius.md};
        --tv-radius-lg: ${theme.borderRadius.lg};
    }

    /* ============================================================
       RESETS
       ============================================================ */
    * { margin: 0; padding: 0; box-sizing: border-box; }

    html {
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
        color-scheme: light;
        scroll-behavior: smooth;
    }

    html, body {
        font-family: var(--tv-font);
        background: ${props => props.theme.colors.bgPrimary};
        color: ${props => props.theme.colors.textPrimary};
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        overflow-x: hidden;
        min-height: 100vh;
        min-height: 100dvh;
        text-rendering: optimizeLegibility;
        -webkit-tap-highlight-color: transparent;
    }

    #root { min-height: 100vh; min-height: 100dvh; isolation: isolate; }

    h1, h2, h3, h4, h5, h6 { text-wrap: balance; }
    p { text-wrap: pretty; }

    /* ============================================================
       CROSS-BROWSER FORM CONTROLS
       Safari/iOS renders these differently to Chrome unless normalized.
       ============================================================ */
    input, textarea, select, button {
        font-family: var(--tv-font);
        color: inherit;
        touch-action: manipulation;
    }
    select {
        -webkit-appearance: none;
        appearance: none;
        background-image: linear-gradient(45deg, transparent 50%, #777 50%),
                          linear-gradient(135deg, #777 50%, transparent 50%);
        background-position: calc(100% - 16px) 50%, calc(100% - 11px) 50%;
        background-size: 5px 5px, 5px 5px;
        background-repeat: no-repeat;
        padding-right: 30px !important;
    }
    input[type="date"], input[type="datetime-local"], input[type="time"] {
        min-height: 44px;
        -webkit-appearance: none;
        appearance: none;
    }
    input[type="date"]::-webkit-date-and-time-value,
    input[type="datetime-local"]::-webkit-date-and-time-value,
    input[type="time"]::-webkit-date-and-time-value { text-align: left; }
    input[type="search"]::-webkit-search-decoration { -webkit-appearance: none; }
    textarea { resize: vertical; }
    ::placeholder { color: ${props => props.theme.colors.textMuted}; opacity: 1; }
    :-ms-input-placeholder { color: ${props => props.theme.colors.textMuted}; }

    @media (max-width: 900px) {
        input, select, textarea { font-size: 16px !important; }
    }

    /* ============================================================
       SCROLLBAR
       ============================================================ */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track {
        background: ${props => props.theme.colors.bgInput};
        border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb {
        background: ${props => props.theme.colors.primaryLight};
        border-radius: 10px;
        border: 2px solid transparent;
        background-clip: padding-box;
    }
    ::-webkit-scrollbar-thumb:hover {
        background: ${props => props.theme.colors.primary};
    }

    /* ============================================================
       SELECTION
       ============================================================ */
    ::selection {
        background: ${props => props.theme.colors.primary};
        color: ${props => props.theme.colors.textInverse};
    }

    /* ============================================================
       TYPOGRAPHY
       ============================================================ */
    h1, h2, h3, h4, h5, h6 {
        font-weight: 700;
        letter-spacing: -0.02em;
        color: ${props => props.theme.colors.textPrimary};
    }

    a {
        text-decoration: none;
        color: ${props => props.theme.colors.primary};
    }
    a:hover { color: ${props => props.theme.colors.primaryDark}; }

    button { font-family: var(--tv-font); }
    input, textarea, select { font-family: var(--tv-font); }

    /* ============================================================
       ANIMATIONS
       ============================================================ */
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideIn {
        from { opacity: 0; transform: translateX(-20px); }
        to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50%      { opacity: 0.5; }
    }
    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .fade-in  { animation: fadeIn  0.4s ease forwards; }
    .slide-in { animation: slideIn 0.4s ease forwards; }

    /* ============================================================
       UTILITIES
       ============================================================ */
    .text-gradient {
        background: ${props => props.theme.colors.primaryGradient};
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .card {
        background: ${props => props.theme.colors.bgCard};
        border: 1px solid ${props => props.theme.colors.borderLight};
        border-radius: ${props => props.theme.borderRadius.lg};
        padding: 24px;
        transition: all 0.3s ease;
        box-shadow: ${props => props.theme.shadows.card};
    }
    .card:hover {
        border-color: ${props => props.theme.colors.borderHover};
        transform: translateY(-2px);
        box-shadow: ${props => props.theme.shadows.cardHover};
    }

    /* ============================================================
       BADGES
       ============================================================ */
    .badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.6;
    }
    .badge-success { background: rgba(16,185,129,0.1); color: ${props => props.theme.colors.successDark}; }
    .badge-warning { background: rgba(245,158,11,0.1); color: ${props => props.theme.colors.warningDark}; }
    .badge-error   { background: rgba(239,68,68,0.1);  color: ${props => props.theme.colors.errorDark}; }
    .badge-info    { background: rgba(51,51,51,0.1);   color: ${props => props.theme.colors.primary}; }

    /* ============================================================
       QUICK UTILITY CLASSES
       ============================================================ */
    .text-center   { text-align: center; }
    .text-right    { text-align: right; }
    .text-muted    { color: ${props => props.theme.colors.textMuted}; }
    .text-secondary{ color: ${props => props.theme.colors.textSecondary}; }

    .font-bold     { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .font-medium   { font-weight: 500; }

    .flex          { display: flex; }
    .flex-center   { display: flex; align-items: center; justify-content: center; }
    .flex-between  { display: flex; align-items: center; justify-content: space-between; }
    .flex-col      { display: flex; flex-direction: column; }
    .gap-1 { gap: 4px; }  .gap-2 { gap: 8px; }
    .gap-3 { gap: 12px; } .gap-4 { gap: 16px; } .gap-5 { gap: 24px; }

    .mt-1 { margin-top: 4px; }  .mt-2 { margin-top: 8px; }
    .mt-3 { margin-top: 12px; } .mt-4 { margin-top: 16px; } .mt-5 { margin-top: 24px; }
    .mb-1 { margin-bottom: 4px; }  .mb-2 { margin-bottom: 8px; }
    .mb-3 { margin-bottom: 12px; } .mb-4 { margin-bottom: 16px; } .mb-5 { margin-bottom: 24px; }

    .w-full  { width: 100%; }
    .w-auto  { width: auto; }

    .rounded-sm   { border-radius: 8px; }
    .rounded-md   { border-radius: 12px; }
    .rounded-lg   { border-radius: 16px; }
    .rounded-full { border-radius: 9999px; }

    .transition      { transition: all 0.3s ease; }
    .transition-fast { transition: all 0.15s ease; }
    .transition-slow { transition: all 0.5s ease; }

    .cursor-pointer     { cursor: pointer; }
    .cursor-not-allowed { cursor: not-allowed; }
    .disabled           { opacity: 0.5; pointer-events: none; }

    /* ============================================================
       AUTH PAGES — VAULT CLEAN LIGHT SHELL
       Login/Register/Reset/Magic-link share these pages. Their legacy
       dark surfaces are overridden centrally so every auth route matches
       the public brand without duplicating page CSS.
       ============================================================ */
    .tv-auth-page {
        background:
            radial-gradient(circle at 88% 8%, rgba(255, 42, 42, 0.07), transparent 36%),
            var(--tv-bg-primary) !important;
        color: var(--tv-text-primary) !important;
    }
    .tv-auth-page .MuiPaper-root {
        background: var(--tv-bg-card) !important;
        border-color: var(--tv-border-light) !important;
        box-shadow: 0 18px 50px rgba(51, 51, 51, 0.08) !important;
    }
    .tv-auth-page .MuiTypography-root,
    .tv-auth-page .MuiFormLabel-root,
    .tv-auth-page .MuiInputLabel-root,
    .tv-auth-page .MuiFormControlLabel-label,
    .tv-auth-page .MuiLink-root {
        color: var(--tv-text-primary) !important;
    }
    .tv-auth-page .MuiTypography-root.MuiTypography-body2,
    .tv-auth-page .MuiFormHelperText-root,
    .tv-auth-page .MuiTypography-caption {
        color: var(--tv-text-secondary) !important;
    }
    .tv-auth-page .MuiButton-root .MuiTypography-root,
    .tv-auth-page .MuiButton-contained .MuiSvgIcon-root {
        color: inherit !important;
    }
    .tv-auth-page .MuiButton-text {
        color: var(--tv-text-secondary) !important;
    }
    .tv-auth-page .MuiButton-containedPrimary,
    .tv-auth-page .MuiButton-containedSecondary {
        background: var(--tv-secondary) !important;
        color: #fff !important;
    }
    .tv-auth-page .MuiButton-containedPrimary .MuiButton-label,
    .tv-auth-page .MuiButton-containedPrimary .MuiSvgIcon-root,
    .tv-auth-page .MuiButton-containedSecondary .MuiButton-label,
    .tv-auth-page .MuiButton-containedSecondary .MuiSvgIcon-root {
        color: #fff !important;
        opacity: 1;
    }
    .tv-auth-page .MuiButton-outlined {
        color: var(--tv-text-primary) !important;
        border-color: var(--tv-border-light) !important;
    }
    .tv-auth-page .MuiOutlinedInput-root {
        background: var(--tv-bg-card) !important;
        color: var(--tv-text-primary) !important;
    }
    .tv-auth-page .MuiOutlinedInput-root fieldset {
        border-color: var(--tv-border-light) !important;
    }
    .tv-auth-page .MuiOutlinedInput-root:hover fieldset {
        border-color: var(--tv-primary-light) !important;
    }
    .tv-auth-page .MuiOutlinedInput-root.Mui-focused fieldset {
        border-color: var(--tv-secondary) !important;
    }
    .tv-auth-page .MuiInputBase-input::placeholder {
        color: var(--tv-text-muted) !important;
        opacity: 1;
    }
    .tv-auth-page .MuiSvgIcon-root,
    .tv-auth-page .MuiRadio-root,
    .tv-auth-page .MuiCheckbox-root {
        color: var(--tv-primary) !important;
    }
    .tv-auth-page .MuiRadio-root.Mui-checked,
    .tv-auth-page .MuiCheckbox-root.Mui-checked {
        color: var(--tv-secondary) !important;
    }
    .tv-auth-page .MuiDivider-root {
        border-color: var(--tv-border-light) !important;
    }
    .tv-auth-page .MuiCircularProgress-root {
        color: var(--tv-secondary) !important;
    }
    .tv-auth-page img {
        filter: none;
    }

    /* ============================================================
       TICKET-STUB MOTIF
       ============================================================ */
    .tv-ticket-stub {
        position: relative;
        border: 1px solid ${props => props.theme.colors.borderLight};
        border-radius: ${props => props.theme.borderRadius.lg};
        background: ${props => props.theme.colors.bgCard};
    }
    .tv-ticket-stub::before,
    .tv-ticket-stub::after {
        content: "";
        position: absolute;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: ${props => props.theme.colors.bgPrimary};
        border: 1px solid ${props => props.theme.colors.borderLight};
        top: 68%;
        z-index: 2;
        pointer-events: none;
    }
    .tv-ticket-stub::before { left: -12px; }
    .tv-ticket-stub::after { right: -12px; }
    .tv-ticket-divider {
        border: 0;
        border-top: 1px dashed ${props => props.theme.colors.borderHover};
        margin: 16px 0;
    }

    /* ============================================================
       TENANT BRANDING OVERRIDES
       BrandingContext injects --tv-primary / --tv-secondary at runtime.
       These cover MUI primitives that still use the static palette.
       ============================================================ */
    .MuiButton-containedPrimary { background-color: var(--tv-primary) !important; color: var(--tv-text-inverse) !important; }
    .MuiButton-containedSecondary { background-color: var(--tv-secondary) !important; color: #fff !important; }
    .MuiButton-containedPrimary .MuiButton-label,
    .MuiButton-containedPrimary .MuiSvgIcon-root,
    .MuiButton-containedSecondary .MuiButton-label,
    .MuiButton-containedSecondary .MuiSvgIcon-root { color: inherit !important; opacity: 1; }
    .MuiButton-textPrimary,
    .MuiTab-root.Mui-selected,
    .MuiLink-root,
    .MuiFormLabel-root.Mui-focused { color: var(--tv-primary) !important; }
    .MuiButton-containedSecondary { background-color: var(--tv-secondary) !important; }
    .MuiTabs-indicator { background-color: var(--tv-primary) !important; }
`;

export default GlobalStyle;