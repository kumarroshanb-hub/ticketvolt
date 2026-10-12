// frontend/src/theme/muiTheme.js
//
// MUI theme that reads from tokens.js (single source of truth).
// Includes global component overrides so that even components WITHOUT
// an explicit color="primary" prop use brand colors.

import { createTheme, responsiveFontSizes } from '@mui/material/styles';
import { theme } from './tokens';

const c = theme.colors;
const f = theme.fonts;

let muiTheme = createTheme({
    palette: {
        primary:    { main: c.primary,   light: c.primaryLight,   dark: c.primaryDark },
        secondary:  { main: c.secondary, light: c.secondaryLight, dark: c.secondaryDark },
        success:    { main: c.success,   light: c.successLight,   dark: c.successDark },
        warning:    { main: c.warning,   light: c.warningLight,   dark: c.warningDark },
        error:      { main: c.error,     light: c.errorLight,     dark: c.errorDark },
        info:       { main: c.info,      light: c.infoLight,      dark: c.infoDark },
        background: { default: c.bgPrimary, paper: c.bgCard },
        text: {
            primary:   c.textPrimary,
            secondary: c.textSecondary,
            disabled:  c.textMuted,
        },
        divider: c.borderLight,
    },

    typography: {
        fontFamily: f.family,
        h1: { fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 700 },
        h2: { fontSize: 'clamp(1.5rem, 4vw, 2rem)',     fontWeight: 700 },
        h3: { fontSize: 'clamp(1.25rem, 3.5vw, 1.75rem)', fontWeight: 700 },
        h4: { fontSize: 'clamp(1.1rem, 3vw, 1.5rem)',    fontWeight: 700 },
        h5: { fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',   fontWeight: 700 },
        h6: { fontSize: 'clamp(0.95rem, 2.2vw, 1.1rem)', fontWeight: 600 },
        body1:   { fontSize: 'clamp(0.875rem, 2.2vw, 1rem)' },
        body2:   { fontSize: 'clamp(0.8rem, 2vw, 0.875rem)' },
        button:  { fontWeight: 600, textTransform: 'none' },
    },

    breakpoints: {
        values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 },
    },

    components: {
        // ============================================================
        // GLOBAL COMPONENT OVERRIDES
        // These ensure that even pages that forget to use theme tokens
        // still get branded styling.
        // ============================================================

        MuiCssBaseline: {
            styleOverrides: {
                body: { fontFamily: f.family },
                'input, textarea, select, button': { fontFamily: f.family },
            },
        },

        MuiButton: {
            styleOverrides: {
                root: {
                    minHeight: 44,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontFamily: f.family,
                },
                containedPrimary: {
                    background: c.primaryGradient,
                    color: c.textInverse,
                    '&:hover': {
                        background: `linear-gradient(135deg, ${c.primaryDark} 0%, ${c.primaryLight} 100%)`,
                        boxShadow: theme.shadows.buttonHover,
                    },
                },
                containedSecondary: {
                    background: c.secondaryGradient,
                    color: c.textInverse,
                    '&:hover': {
                        background: `linear-gradient(135deg, ${c.secondaryDark} 0%, ${c.secondary} 100%)`,
                    },
                },
                outlinedPrimary: {
                    borderColor: c.primary,
                    color: c.primary,
                    '&:hover': {
                        borderColor: c.primaryDark,
                        background: 'rgba(51,51,51,0.04)',
                    },
                },
                textPrimary: {
                    color: c.primary,
                    '&:hover': { background: 'rgba(51,51,51,0.04)' },
                },
            },
        },

        MuiTypography: {
            styleOverrides: {
                root: { fontFamily: f.family },
            },
        },

        MuiInputBase: {
            styleOverrides: {
                root:  { fontFamily: f.family },
                input: { fontFamily: 'inherit' },
            },
        },

        MuiInputLabel: {
            styleOverrides: {
                root: {
                    fontFamily: f.family,
                    '&.Mui-focused': { color: c.primary },
                },
            },
        },

        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: c.primary,
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: c.borderHover,
                    },
                },
                notchedOutline: { borderColor: c.borderLight },
            },
        },

        MuiInput: {
            styleOverrides: {
                underline: {
                    '&:after': { borderBottomColor: c.primary },
                    '&:hover:not(.Mui-disabled):before': { borderBottomColor: c.borderHover },
                },
            },
        },

        MuiChip: {
            styleOverrides: {
                root:  { fontFamily: f.family, fontWeight: 600 },
                label: { overflow: 'hidden', textOverflow: 'ellipsis' },
            },
        },

        MuiCheckbox: {
            styleOverrides: {
                root: {
                    color: c.textMuted,
                    '&.Mui-checked': { color: c.primary },
                },
            },
        },

        MuiRadio: {
            styleOverrides: {
                root: {
                    color: c.textMuted,
                    '&.Mui-checked': { color: c.primary },
                },
            },
        },

        MuiSwitch: {
            styleOverrides: {
                switchBase: {
                    '&.Mui-checked': { color: c.primary },
                    '&.Mui-checked + .MuiSwitch-track': { backgroundColor: c.primary },
                },
            },
        },

        MuiLink: {
            styleOverrides: {
                root: {
                    color: c.primary,
                    fontFamily: f.family,
                    '&:hover': { color: c.primaryDark },
                },
            },
        },

        MuiTabs: {
            styleOverrides: {
                indicator: { backgroundColor: c.primary },
            },
        },

        MuiTab: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    fontWeight: 600,
                    fontFamily: f.family,
                    '&.Mui-selected': { color: c.primary },
                },
            },
        },

        MuiLinearProgress: {
            styleOverrides: {
                bar: { backgroundColor: c.primary },
            },
        },

        MuiCircularProgress: {
            defaultProps: { color: 'primary' },
        },

        MuiDialog: {
            styleOverrides: {
                paper: {
                    margin: 16,
                    width: 'calc(100% - 32px)',
                    maxWidth: 'calc(100% - 32px)',
                    '@media (min-width: 600px)': {
                        margin: 32,
                        width: 'auto',
                        maxWidth: 'auto',
                    },
                },
            },
        },

        MuiTableContainer: {
            styleOverrides: {
                root: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
            },
        },

        MuiTableCell: {
            styleOverrides: {
                root: {
                    fontFamily: f.family,
                    '@media (max-width: 600px)': {
                        padding: '8px 10px',
                        fontSize: '0.75rem',
                    },
                },
                head: { fontWeight: 600, color: c.textSecondary },
            },
        },

        MuiPaper: {
            styleOverrides: {
                root: { fontFamily: f.family },
            },
        },

        MuiCard: {
            styleOverrides: {
                root: { fontFamily: f.family },
            },
        },

        MuiListItemText: {
            styleOverrides: {
                primary:   { fontFamily: f.family },
                secondary: { fontFamily: f.family },
            },
        },

        MuiMenuItem: {
            styleOverrides: {
                root: {
                    fontFamily: f.family,
                    '&.Mui-selected': {
                        backgroundColor: 'rgba(51,51,51,0.08)',
                        '&:hover': { backgroundColor: 'rgba(51,51,51,0.12)' },
                    },
                },
            },
        },

        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    fontFamily: f.family,
                    backgroundColor: c.primaryDark,
                    fontSize: '0.75rem',
                },
            },
        },

        MuiAlert: {
            styleOverrides: {
                root: { fontFamily: f.family },
            },
        },

        MuiSnackbarContent: {
            styleOverrides: {
                root: { fontFamily: f.family },
            },
        },
    },
});

muiTheme = responsiveFontSizes(muiTheme);
export default muiTheme;