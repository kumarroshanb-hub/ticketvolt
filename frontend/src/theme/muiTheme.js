// frontend/src/theme/muiTheme.js
import { createTheme, responsiveFontSizes } from '@mui/material/styles';

let muiTheme = createTheme({
  palette: {
    primary:    { main: '#4f46e5' },
    secondary:  { main: '#7c3aed' },
    success:    { main: '#10b981' },
    warning:    { main: '#f59e0b' },
    error:      { main: '#ef4444' },
    info:       { main: '#3b82f6' },
    background: { default: '#f8fafc', paper: '#ffffff' },
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    // Fluid type scale
    h1: { fontSize: 'clamp(1.75rem, 5vw, 2.5rem)' },
    h2: { fontSize: 'clamp(1.5rem, 4vw, 2rem)' },
    h3: { fontSize: 'clamp(1.25rem, 3.5vw, 1.75rem)' },
    h4: { fontSize: 'clamp(1.1rem, 3vw, 1.5rem)' },
    h5: { fontSize: 'clamp(1rem, 2.5vw, 1.25rem)' },
    h6: { fontSize: 'clamp(0.95rem, 2.2vw, 1.1rem)' },
    body1: { fontSize: 'clamp(0.875rem, 2.2vw, 1rem)' },
    body2: { fontSize: 'clamp(0.8rem, 2vw, 0.875rem)' },
  },
  breakpoints: {
    values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          textTransform: 'none',
        },
      },
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
        root: {
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          '@media (max-width: 600px)': {
            padding: '8px 10px',
            fontSize: '0.75rem',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          maxWidth: '100%',
        },
        label: {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        },
      },
    },
  },
});

muiTheme = responsiveFontSizes(muiTheme);
export default muiTheme;