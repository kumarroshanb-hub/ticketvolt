// admin-frontend/src/styles/global.js
import { createGlobalStyle } from 'styled-components';

export const GlobalStyle = createGlobalStyle`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
    
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }
    
    body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        background: ${props => props.theme.colors.bgPrimary};
        color: ${props => props.theme.colors.textPrimary};
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        overflow-x: hidden;
    }
    
    /* Custom Scrollbar */
    ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    
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
    
    /* Selection */
    ::selection {
        background: ${props => props.theme.colors.primary};
        color: ${props => props.theme.colors.textInverse};
    }
    
    /* Typography */
    h1, h2, h3, h4, h5, h6 {
        font-weight: 700;
        letter-spacing: -0.02em;
        color: ${props => props.theme.colors.textPrimary};
    }
    
    /* Links */
    a {
        text-decoration: none;
        color: ${props => props.theme.colors.primary};
    }
    
    a:hover {
        color: ${props => props.theme.colors.primaryDark};
    }
    
    /* Buttons */
    button {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    
    /* Inputs */
    input, textarea, select {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    
    /* Animations */
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes slideIn {
        from { opacity: 0; transform: translateX(-20px); }
        to { opacity: 1; transform: translateX(0); }
    }
    
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
    
    /* Utility Classes */
    .fade-in {
        animation: fadeIn 0.4s ease forwards;
    }
    
    .slide-in {
        animation: slideIn 0.4s ease forwards;
    }
    
    .text-gradient {
        background: ${props => props.theme.colors.gradientPrimary};
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }
    
    /* Card Styles - Global */
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
    
    /* Status Colors */
    .status-success { color: ${props => props.theme.colors.success}; }
    .status-warning { color: ${props => props.theme.colors.warning}; }
    .status-error { color: ${props => props.theme.colors.error}; }
    .status-info { color: ${props => props.theme.colors.primary}; }
    
    /* Badge Styles - Global */
    .badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.6;
    }
    
    .badge-success {
        background: rgba(16, 185, 129, 0.1);
        color: ${props => props.theme.colors.successDark};
    }
    
    .badge-warning {
        background: rgba(245, 158, 11, 0.1);
        color: ${props => props.theme.colors.warningDark};
    }
    
    .badge-error {
        background: rgba(239, 68, 68, 0.1);
        color: ${props => props.theme.colors.errorDark};
    }
    
    .badge-info {
        background: rgba(79, 70, 229, 0.1);
        color: ${props => props.theme.colors.primary};
    }
    
    /* Typography Utilities */
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-muted { color: ${props => props.theme.colors.textMuted}; }
    .text-secondary { color: ${props => props.theme.colors.textSecondary}; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .font-medium { font-weight: 500; }
    
    /* Spacing Utilities */
    .mt-1 { margin-top: 4px; }
    .mt-2 { margin-top: 8px; }
    .mt-3 { margin-top: 12px; }
    .mt-4 { margin-top: 16px; }
    .mt-5 { margin-top: 24px; }
    .mb-1 { margin-bottom: 4px; }
    .mb-2 { margin-bottom: 8px; }
    .mb-3 { margin-bottom: 12px; }
    .mb-4 { margin-bottom: 16px; }
    .mb-5 { margin-bottom: 24px; }
    .p-1 { padding: 4px; }
    .p-2 { padding: 8px; }
    .p-3 { padding: 12px; }
    .p-4 { padding: 16px; }
    .p-5 { padding: 24px; }
    
    /* Flex Utilities */
    .flex { display: flex; }
    .flex-center { display: flex; align-items: center; justify-content: center; }
    .flex-between { display: flex; align-items: center; justify-content: space-between; }
    .flex-col { display: flex; flex-direction: column; }
    .gap-1 { gap: 4px; }
    .gap-2 { gap: 8px; }
    .gap-3 { gap: 12px; }
    .gap-4 { gap: 16px; }
    .gap-5 { gap: 24px; }
    
    /* Width Utilities */
    .w-full { width: 100%; }
    .w-auto { width: auto; }
    
    /* Border Radius */
    .rounded-sm { border-radius: 8px; }
    .rounded-md { border-radius: 12px; }
    .rounded-lg { border-radius: 16px; }
    .rounded-full { border-radius: 9999px; }
    
    /* Transitions */
    .transition { transition: all 0.3s ease; }
    .transition-fast { transition: all 0.15s ease; }
    .transition-slow { transition: all 0.5s ease; }
    
    /* Cursor */
    .cursor-pointer { cursor: pointer; }
    .cursor-not-allowed { cursor: not-allowed; }
    
    /* Disabled */
    .disabled {
        opacity: 0.5;
        pointer-events: none;
    }
`;