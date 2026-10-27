// QRScannerApp/src/theme/index.js
//
// Single source of truth for the scanner app's visual language.
// Mirrors frontend/src/theme/tokens.js so the mobile scanner, web admin,
// and printed tickets all share one brand identity.
//
// If you ever change a brand color, change it in BOTH places:
//   • frontend/src/theme/tokens.js
//   • QRScannerApp/src/theme/index.js
//
// Design notes:
//   • primary   = charcoal #333333  (surfaces, buttons, headers)
//   • secondary = brand red #FF2A2A (accents, CTAs, active states)
//   • Typography is Montserrat. The font must be loaded via
//     @expo-google-fonts/montserrat in App.js BEFORE any screen renders,
//     otherwise React Native silently falls back to the system font.

export const theme = {
    colors: {
        // ---- Brand ----
        primary: '#333333',
        primaryDark: '#1a1a1a',
        primaryLight: '#4a4a4a',
        secondary: '#FF2A2A',
        secondaryDark: '#cc1f1f',
        secondaryLight: '#ff5c5c',

        // ---- Surfaces (dark, matching admin login) ----
        bgDark: '#1a1a1a',
        bgDarkCard: '#2b2b2b',
        bgDarkBorder: 'rgba(255, 255, 255, 0.08)',
        bgPrimary: '#0f0f0f',

        // ---- Text on dark ----
        textInverse: '#ffffff',
        textMuted: 'rgba(255, 255, 255, 0.65)',
        textLight: 'rgba(255, 255, 255, 0.45)',
        textDisabled: 'rgba(255, 255, 255, 0.30)',

        // ---- Semantic ----
        success: '#22c55e',
        successDark: '#16a34a',
        error: '#ef4444',
        errorDark: '#dc2626',
        warning: '#f59e0b',
        warningDark: '#d97706',
        info: '#3b82f6',
        infoDark: '#2563eb',
    },

    fonts: {
        // These family names MUST match the keys passed to useFonts()
        // in App.js. If you add a weight there, add it here too.
        family: 'Montserrat_500Medium',
        familySemiBold: 'Montserrat_600SemiBold',
        familyBold: 'Montserrat_700Bold',
        familyExtraBold: 'Montserrat_800ExtraBold',
        familyRegular: 'Montserrat_400Regular',
        // Monospace is kept ONLY for ticket codes / URLs, never for UI copy.
        familyMono: 'Courier',
    },

    radius: {
        sm: 8,
        md: 12,
        lg: 16,
        xl: 20,
        pill: 999,
    },

    spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
    },

    // Pre-composed styles used across screens so we don't repeat
    // the same shadow/glow block in every file.
    shadows: {
        card: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 4,
        },
        button: {
            shadowColor: '#FF2A2A',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 4,
        },
    },
};

export default theme;