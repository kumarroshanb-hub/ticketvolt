// frontend/src/pages/Login/Login.js
import React, { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Alert,
    CircularProgress,
    Link,
    InputLabel,
    FormControl,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import { theme as appTheme } from '../../theme/tokens';
import Logo from '../../components/Logo';

const C = appTheme.colors;
const F = appTheme.fonts;

const SHOW_DEMO_CREDS = process.env.REACT_APP_SHOW_DEMO_CREDS === 'true';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Fail fast if demo creds are enabled in a production build.
if (IS_PRODUCTION && SHOW_DEMO_CREDS) {
    throw new Error(
        '🚨 SECURITY: REACT_APP_SHOW_DEMO_CREDS must NOT be "true" in production builds.'
    );
}

const DEMO_CREDS = SHOW_DEMO_CREDS
    ? [
          {
              role: '👑 Super Admin',
              email: process.env.REACT_APP_DEMO_SUPERADMIN_EMAIL,
              password: process.env.REACT_APP_DEMO_SUPERADMIN_PASSWORD,
          },
          {
              role: '🛡️ Admin',
              email: process.env.REACT_APP_DEMO_ADMIN_EMAIL,
              password: process.env.REACT_APP_DEMO_ADMIN_PASSWORD,
          },
          {
              role: '📋 Organizer',
              email: process.env.REACT_APP_DEMO_ORGANIZER_EMAIL,
              password: process.env.REACT_APP_DEMO_ORGANIZER_PASSWORD,
          },
          {
              role: '👤 User',
              email: process.env.REACT_APP_DEMO_USER_EMAIL,
              password: process.env.REACT_APP_DEMO_USER_PASSWORD,
          },
      ].filter((c) => c.email && c.password)
    : [];

const Login = () => {
    const navigate = useNavigate();
    const { login, isAuthenticated, loading } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isAuthenticated && !loading) {
            console.log('ℹ️ Already authenticated, but staying on login page');
        }
    }, [isAuthenticated, loading]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const result = await login(email, password);

            if (!result) {
                setError('Login failed. Please try again.');
                toast.error('Login failed. Please try again.');
                return;
            }

            if (result.success === true) {
                toast.success('Login successful!');
                navigate('/app/dashboard', { replace: true });
            } else {
                const errorMsg = result.error || 'Login failed. Please try again.';
                setError(errorMsg);
                toast.error(errorMsg);
            }
        } catch (err) {
            const errorMsg = err.message || 'An unexpected error occurred';
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const fillCredentials = (emailVal, passwordVal) => {
        setEmail(emailVal);
        setPassword(passwordVal);
        toast.info(`Credentials loaded: ${emailVal}`);
    };

    if (loading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '100vh',
                    minHeight: '100dvh',
                    bgcolor: C.bgDark,
                }}
            >
                <CircularProgress sx={{ color: C.secondary }} />
            </Box>
        );
    }

    // ------------------------------------------------------------
    // Shared dark-mode input styles.
    //
    // Layout decision:
    //   We use `FormControl` + a plain `<InputLabel>` sitting ABOVE the
    //   input (position: static), NOT MUI's floating `InputLabel`.
    //   This is the fix for the "labels overlapping inputs" bug.
    // ------------------------------------------------------------
    const labelSx = {
        color: 'rgba(255, 255, 255, 0.85)',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.4px',
        textTransform: 'uppercase',
        marginBottom: '6px',
        position: 'static',
        transform: 'none',
        fontFamily: F.family,
        '&.Mui-focused': { color: C.secondary },
    };

    const fieldSx = {
        '& .MuiOutlinedInput-root': {
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            color: C.textInverse,
            fontSize: 15,
            fontFamily: F.family,

            '& fieldset': { borderColor: C.bgDarkBorder },
            '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.25)' },
            '&.Mui-focused fieldset': { borderColor: C.secondary },
        },
        '& .MuiOutlinedInput-input': {
            padding: '14px 14px',
            fontFamily: F.family,
        },
        '& .MuiFormHelperText-root': {
            color: C.errorLight,
            marginLeft: 0,
        },
    };

    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                minHeight: '100dvh',
                bgcolor: C.bgDark,
                p: isMobile ? 1.5 : 2,
                pt: isMobile ? 'max(12px, env(safe-area-inset-top))' : 2,
                pb: isMobile ? 'max(12px, env(safe-area-inset-bottom))' : 2,
                pl: isMobile ? 'max(12px, env(safe-area-inset-left))' : 2,
                pr: isMobile ? 'max(12px, env(safe-area-inset-right))' : 2,
                fontFamily: F.family,
            }}
        >
            <Paper
                sx={{
                    p: isMobile ? 3 : 4,
                    maxWidth: 440,
                    width: '100%',
                    borderRadius: 3,
                    bgcolor: C.bgDarkCard,
                    border: `1px solid ${C.bgDarkBorder}`,
                    boxShadow: 'none',
                    my: isMobile ? 1 : 0,
                }}
            >
                {/* ==================================================
                    HEADER — logo image + subtitle
                   ================================================== */}
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        mb: 4,
                    }}
                >
                    {/*
                      Wordmark: 56px height reads with the same visual
                      weight as the subtitle below it without dominating
                      the card. The native aspect ratio (620:260) renders
                      this at roughly 133px wide inside the 440px card.
                    */}
                    <Logo variant="full" height={80} inverse />
                    <Typography
                        variant="body2"
                        sx={{
                            color: 'rgba(255, 255, 255, 0.65)',
                            mt: 3,
                            fontSize: '15px',
                            fontFamily: F.family,
                        }}
                    >
                        Sign in to manage your events
                    </Typography>
                </Box>

                {error && (
                    <Alert
                        severity="error"
                        sx={{
                            mb: 3,
                            bgcolor: 'rgba(239, 68, 68, 0.10)',
                            color: C.errorLight,
                            border: `1px solid rgba(239, 68, 68, 0.25)`,
                            fontFamily: F.family,
                            '& .MuiAlert-icon': { color: C.errorLight },
                        }}
                    >
                        {error}
                    </Alert>
                )}

                {isAuthenticated && !loading && !isMobile && (
                    <Alert
                        severity="info"
                        sx={{
                            mb: 3,
                            bgcolor: 'rgba(51, 51, 51, 0.10)',
                            color: C.primaryLight,
                            border: `1px solid rgba(255, 255, 255, 0.10)`,
                            fontFamily: F.family,
                        }}
                    >
                        You are already logged in. Click "Sign In" to continue to dashboard.
                    </Alert>
                )}

                {/* ==================================================
                    FORM
                   ================================================== */}
                <form onSubmit={handleSubmit} noValidate>
                    {/* Email field */}
                    <FormControl fullWidth sx={{ mb: 2.5 }}>
                        <InputLabel
                            htmlFor="login-email"
                            shrink
                            sx={labelSx}
                        >
                            Email Address
                        </InputLabel>
                        <TextField
                            id="login-email"
                            fullWidth
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            placeholder="admin@ticketvolt.com"
                            inputProps={{ inputMode: 'email' }}
                            sx={fieldSx}
                            disabled={isSubmitting}
                        />
                    </FormControl>

                    {/* Password field */}
                    <FormControl fullWidth sx={{ mb: 3 }}>
                        <InputLabel
                            htmlFor="login-password"
                            shrink
                            sx={labelSx}
                        >
                            Password
                        </InputLabel>
                        <TextField
                            id="login-password"
                            fullWidth
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            placeholder="••••••••"
                            sx={fieldSx}
                            disabled={isSubmitting}
                        />
                    </FormControl>

                    {/* Submit */}
                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        disabled={isSubmitting}
                        sx={{
                            py: 1.5,
                            minHeight: 48,
                            background: C.secondary,        // #FF2A2A
                            color: C.textInverse,
                            borderRadius: 2,
                            '&:hover': {
                                background: C.secondaryDark,
                                transform: 'translateY(-1px)',
                                boxShadow: `0 8px 24px rgba(255, 42, 42, 0.30)`,
                            },
                            '&:disabled': {
                                background: 'rgba(255, 42, 42, 0.40)',
                                color: 'rgba(255, 255, 255, 0.60)',
                            },
                            textTransform: 'none',
                            fontSize: '15px',
                            fontWeight: 700,
                            letterSpacing: '0.3px',
                            fontFamily: F.family,
                            transition: 'all 0.2s ease',
                        }}
                    >
                        {isSubmitting ? (
                            <CircularProgress size={22} sx={{ color: C.textInverse }} />
                        ) : (
                            'Sign In'
                        )}
                    </Button>
                </form>

                {/* ==================================================
                    DEMO CREDENTIALS (dev only)
                   ================================================== */}
                {DEMO_CREDS.length > 0 && (
                    <Box
                        sx={{
                            mt: 3,
                            pt: 2.5,
                            borderTop: `1px solid ${C.bgDarkBorder}`,
                            textAlign: 'center',
                            maxHeight: isMobile ? 180 : 'none',
                            overflowY: isMobile ? 'auto' : 'visible',
                            WebkitOverflowScrolling: 'touch',
                        }}
                    >
                        <Typography
                            variant="caption"
                            sx={{
                                color: 'rgba(255, 255, 255, 0.35)',
                                textTransform: 'uppercase',
                                letterSpacing: 1,
                                fontSize: '10px',
                                fontWeight: 600,
                                fontFamily: F.family,
                            }}
                        >
                            Demo Credentials (Dev Only)
                        </Typography>

                        <Box sx={{ mt: 1.5 }}>
                            {DEMO_CREDS.map((cred, index) => (
                                <Typography
                                    key={index}
                                    variant="caption"
                                    sx={{
                                        display: 'block',
                                        color: 'rgba(255, 255, 255, 0.55)',
                                        fontFamily: F.familyMono,
                                        fontSize: { xs: '11px', sm: '12px' },
                                        py: 0.75,
                                        cursor: 'pointer',
                                        wordBreak: 'break-all',
                                        borderRadius: 1,
                                        transition: 'background 0.15s ease, color 0.15s ease',
                                        '&:hover': {
                                            color: 'rgba(255, 255, 255, 0.95)',
                                            background: 'rgba(255, 255, 255, 0.05)',
                                        },
                                    }}
                                    onClick={() => fillCredentials(cred.email, cred.password)}
                                >
                                    {cred.role}:{' '}
                                    <span style={{ color: C.secondary }}>{cred.email}</span>{' '}
                                    / {cred.password}
                                </Typography>
                            ))}
                        </Box>
                    </Box>
                )}

                {/* ==================================================
                    FOOTER — register link
                   ================================================== */}
                <Box textAlign="center" mt={3}>
                    <Typography
                        variant="body2"
                        sx={{
                            color: 'rgba(255, 255, 255, 0.55)',
                            fontFamily: F.family,
                            fontSize: '13px',
                        }}
                    >
                        Don't have an account?{' '}
                        <Link
                            component={RouterLink}
                            to="/register"
                            sx={{
                                color: C.secondary,
                                fontWeight: 600,
                                textDecoration: 'none',
                                '&:hover': {
                                    color: C.secondaryLight,
                                    textDecoration: 'underline',
                                },
                            }}
                        >
                            Register
                        </Link>
                    </Typography>
                </Box>
            </Paper>
        </Box>
    );
};

export default Login;