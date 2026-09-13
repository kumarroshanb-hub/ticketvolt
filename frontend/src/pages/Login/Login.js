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
    InputAdornment,
    IconButton,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import {
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';

/**
 * Build-time configuration for demo credentials.
 * In production (Render), REACT_APP_SHOW_DEMO_CREDS is unset → array is empty.
 */
const SHOW_DEMO_CREDS = process.env.REACT_APP_SHOW_DEMO_CREDS === 'true';

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

// ============================================================
// Reusable dark input styling — keeps the MUI label above the
// input and forces a dark background regardless of GlobalStyle.
// ============================================================
const darkFieldSx = {
    '& .MuiInputLabel-root': {
        color: 'rgba(255,255,255,0.65)',
        // Ensure the label does NOT float over the input
        transform: 'translate(14px, 14px) scale(1)',
        '&.MuiInputLabel-shrink': {
            transform: 'translate(14px, -9px) scale(0.75)',
            color: '#5B5FEF',
        },
    },
    '& .MuiOutlinedInput-root': {
        color: '#ffffff',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: '8px',
        fontSize: '16px',
        '& fieldset': {
            borderColor: 'rgba(255,255,255,0.15)',
        },
        '&:hover fieldset': {
            borderColor: 'rgba(91,95,239,0.6)',
        },
        '&.Mui-focused fieldset': {
            borderColor: '#5B5FEF',
        },
        '&.Mui-disabled': {
            backgroundColor: 'rgba(255,255,255,0.02)',
            color: 'rgba(255,255,255,0.3)',
        },
        '& input': {
            padding: '16.5px 14px',
            color: '#ffffff',
            '&::placeholder': {
                color: 'rgba(255,255,255,0.35)',
                opacity: 1,
            },
        },
    },
    '& .MuiFormHelperText-root': {
        color: '#FF6B6B',
    },
};

const Login = () => {
    const navigate = useNavigate();
    const { login, isAuthenticated, loading } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

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
                    bgcolor: '#0A0B1A',
                }}
            >
                <CircularProgress sx={{ color: '#5B5FEF' }} />
            </Box>
        );
    }

    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                minHeight: '100dvh',
                bgcolor: '#0A0B1A',
                p: isMobile ? 1.5 : 2,
                pt: isMobile ? 'max(12px, env(safe-area-inset-top))' : 2,
                pb: isMobile ? 'max(12px, env(safe-area-inset-bottom))' : 2,
                pl: isMobile ? 'max(12px, env(safe-area-inset-left))' : 2,
                pr: isMobile ? 'max(12px, env(safe-area-inset-right))' : 2,
            }}
        >
            <Paper
                elevation={0}
                sx={{
                    p: isMobile ? 2.5 : 4,
                    maxWidth: 420,
                    width: '100%',
                    borderRadius: 3,
                    // Force dark card background so GlobalStyle can't override
                    backgroundColor: 'rgba(255, 255, 255, 0.03) !important',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    boxShadow: 'none',
                    my: isMobile ? 1 : 0,
                }}
            >
                <Box textAlign="center" mb={3}>
                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 800,
                            color: 'white',
                            fontSize: { xs: '1.75rem', sm: '2rem' },
                            letterSpacing: '-0.5px',
                        }}
                    >
                        Ticket<span style={{ color: '#5B5FEF' }}>Volt</span>
                    </Typography>
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
                            color: '#FF6B6B',
                            border: '1px solid rgba(255,0,0,0.2)',
                            '& .MuiAlert-icon': { color: '#FF6B6B' },
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
                            bgcolor: 'rgba(91,95,239,0.1)',
                            color: '#5B5FEF',
                            border: '1px solid rgba(91,95,239,0.2)',
                            '& .MuiAlert-icon': { color: '#5B5FEF' },
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
                        variant="outlined"
                        disabled={isSubmitting}
                        sx={{ ...darkFieldSx, mb: 2.5 }}
                    />

                    <TextField
                        fullWidth
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        variant="outlined"
                        disabled={isSubmitting}
                        sx={{ ...darkFieldSx, mb: 3 }}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        onClick={() => setShowPassword((s) => !s)}
                                        edge="end"
                                        sx={{ color: 'rgba(255,255,255,0.5)' }}
                                        aria-label="toggle password visibility"
                                    >
                                        {showPassword ? (
                                            <VisibilityOffIcon fontSize="small" />
                                        ) : (
                                            <VisibilityIcon fontSize="small" />
                                        )}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />

                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        disabled={isSubmitting}
                        sx={{
                            py: 1.5,
                            minHeight: 48,
                            background:
                                'linear-gradient(135deg, #5B5FEF 0%, #8B5CF6 100%)',
                            color: '#ffffff',
                            textTransform: 'none',
                            fontSize: '16px',
                            fontWeight: 600,
                            borderRadius: '10px',
                            boxShadow: '0 4px 14px rgba(91, 95, 239, 0.35)',
                            '&:hover': {
                                background:
                                    'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                                transform: 'translateY(-1px)',
                                boxShadow: '0 6px 20px rgba(91, 95, 239, 0.45)',
                            },
                            '&.Mui-disabled': {
                                background: 'rgba(91,95,239,0.4)',
                                color: 'rgba(255,255,255,0.7)',
                            },
                        }}
                    >
                        {isSubmitting ? (
                            <CircularProgress size={24} color="inherit" />
                        ) : (
                            'Sign In'
                        )}
                    </Button>
                </form>

                {/*
                  Demo credentials block.
                  Renders ONLY in local dev builds (REACT_APP_SHOW_DEMO_CREDS=true).
                  In production, DEMO_CREDS.length === 0 → this entire block is skipped.
                */}
                {DEMO_CREDS.length > 0 && (
                    <Box
                        sx={{
                            mt: 3,
                            pt: 2,
                            borderTop: '1px solid rgba(255,255,255,0.08)',
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
                                        color: 'rgba(255,255,255,0.55)',
                                        fontFamily:
                                            'ui-monospace, SFMono-Regular, Menlo, monospace',
                                        fontSize: { xs: '11px', sm: '12px' },
                                        py: 0.75,
                                        cursor: 'pointer',
                                        wordBreak: 'break-all',
                                        borderRadius: '4px',
                                        transition: 'background 0.2s',
                                        '&:hover': {
                                            color: '#ffffff',
                                            backgroundColor: 'rgba(91,95,239,0.12)',
                                        },
                                    }}
                                    onClick={() =>
                                        fillCredentials(cred.email, cred.password)
                                    }
                                >
                                    {cred.role}:{' '}
                                    <span style={{ color: '#5B5FEF' }}>
                                        {cred.email}
                                    </span>{' '}
                                    / {cred.password}
                                </Typography>
                            ))}
                        </Box>
                    </Box>
                )}

                <Box textAlign="center" mt={3}>
                    <Typography
                        variant="body2"
                        sx={{ color: 'rgba(255,255,255,0.5)' }}
                    >
                        Don't have an account?{' '}
                        <Link
                            component={RouterLink}
                            to="/register"
                            sx={{
                                color: '#5B5FEF',
                                fontWeight: 600,
                                textDecoration: 'none',
                                '&:hover': {
                                    color: '#8B5CF6',
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