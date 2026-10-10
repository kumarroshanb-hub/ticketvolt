// frontend/src/theme/muiTheme.js
import { createTheme, responsiveFontSizes } from '@mui/material/styles';

let muiTheme = createTheme({
  palette: {
    // Primary is now the brand's Charcoal Gray
    primary:    { main: '#333333' },
    // Secondary is now the brand's Vibrant Red for accents
    secondary:  { main: '#FF2A2A' },
    // Status colors remain unchanged
    success:    { main: '#10b981' },
    warning:    { main: '#f59e0b' },
    error:      { main: '#ef4444' },
    info:       { main: '#3b82f6' },
    background: { default: '#f8fafc', paper: '#ffffff' },
  },
  typography: {
    // Font family is updated to Montserrat
    fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    // The fluid type scale is kept for responsiveness.
    h1: { fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 700 },
    h2: { fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700 },
    h3: { fontSize: 'clamp(1.25rem, 3.5vw, 1.75rem)', fontWeight: 700 },
    h4: { fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', fontWeight: 700 },
    h5: { fontSize: 'clamp(1rem, 2.5vw, 1.25rem)', fontWeight: 700 },
    h6: { fontSize: 'clamp(0.95rem, 2.2vw, 1.1rem)', fontWeight: 600 },
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
          fontWeight: 600, // Buttons now use semibold weight
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
          fontWeight: 600, // Chips are now semibold
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