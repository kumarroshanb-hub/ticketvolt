// frontend/src/pages/Login/Login.js
import React, { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import {
    Box, Paper, Typography, TextField, Button, Alert,
    CircularProgress, Link, useMediaQuery, useTheme,
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
                navigate('/dashboard', { replace: true });
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

    // Shared styles for the dark-mode text fields (computed once)
    const darkFieldSx = {
        mb: 2,
        '& .MuiOutlinedInput-root': {
            color: C.textInverse,
            '& fieldset': { borderColor: C.bgDarkBorder },
            '&:hover fieldset': { borderColor: C.secondary },
            '&.Mui-focused fieldset': { borderColor: C.secondary },
        },
        '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
        '& .MuiInputLabel-root.Mui-focused': { color: C.secondary },
        '& .MuiInputBase-input': { fontSize: 16, fontFamily: F.family },
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
                    p: isMobile ? 2.5 : 4,
                    maxWidth: 420,
                    width: '100%',
                    borderRadius: 3,
                    bgcolor: C.bgDarkCard,
                    border: `1px solid ${C.bgDarkBorder}`,
                    boxShadow: 'none',
                    my: isMobile ? 1 : 0,
                }}
            >
                <Box textAlign="center" mb={3}>
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            mb: 1,
                        }}
                    >
                        <Logo variant="full" size={32} inverse />
                    </Box>
                    <Typography
                        variant="body2"
                        sx={{ color: 'rgba(255,255,255,0.7)', mt: 1 }}
                    >
                        Sign in to manage your events
                    </Typography>
                </Box>

                {error && (
                    <Alert
                        severity="error"
                        sx={{
                            mb: 3,
                            bgcolor: 'rgba(255,0,0,0.1)',
                            color: C.errorLight,
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
                            bgcolor: 'rgba(51,51,51,0.1)',
                            color: C.primaryLight,
                        }}
                    >
                        You are already logged in. Click "Sign In" to continue to dashboard.
                    </Alert>
                )}

                <form onSubmit={handleSubmit}>
                    <TextField
                        fullWidth
                        label="Email Address"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        inputProps={{ inputMode: 'email' }}
                        sx={darkFieldSx}
                        disabled={isSubmitting}
                    />
                    <TextField
                        fullWidth
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        sx={{ ...darkFieldSx, mb: 3 }}
                        disabled={isSubmitting}
                    />
                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        disabled={isSubmitting}
                        sx={{
                            py: 1.5,
                            minHeight: 48,
                            background: C.secondaryGradient,
                            '&:hover': {
                                background: `linear-gradient(135deg, ${C.secondaryDark} 0%, ${C.secondary} 100%)`,
                                transform: 'translateY(-2px)',
                                boxShadow: `0 0 40px rgba(255,42,42,0.25)`,
                            },
                            textTransform: 'none',
                            fontSize: '16px',
                            fontWeight: 600,
                            fontFamily: F.family,
                            color: C.textInverse,
                        }}
                    >
                        {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
                    </Button>
                </form>

                {DEMO_CREDS.length > 0 && (
                    <Box
                        sx={{
                            mt: 3,
                            pt: 2,
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
                                color: 'rgba(255,255,255,0.4)',
                                textTransform: 'uppercase',
                                letterSpacing: 1,
                            }}
                        >
                            Demo Credentials (Dev Only)
                        </Typography>

                        <Box sx={{ mt: 1 }}>
                            {DEMO_CREDS.map((cred, index) => (
                                <Typography
                                    key={index}
                                    variant="caption"
                                    sx={{
                                        display: 'block',
                                        color: 'rgba(255,255,255,0.5)',
                                        fontFamily: 'monospace',
                                        fontSize: { xs: '11px', sm: '12px' },
                                        py: 0.5,
                                        cursor: 'pointer',
                                        wordBreak: 'break-all',
                                        '&:hover': { color: 'rgba(255,255,255,0.8)' },
                                    }}
                                    onClick={() => fillCredentials(cred.email, cred.password)}
                                >
                                    {cred.role}:{' '}
                                    <span style={{ color: C.secondary }}>{cred.email}</span> /{' '}
                                    {cred.password}
                                </Typography>
                            ))}
                        </Box>
                    </Box>
                )}

                <Box textAlign="center" mt={2}>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        Don't have an account?{' '}
                        <Link
                            component={RouterLink}
                            to="/register"
                            sx={{ color: C.secondary }}
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