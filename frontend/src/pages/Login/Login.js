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
    useMediaQuery,
    useTheme,
} from '@mui/material';

const Login = () => {
    const navigate = useNavigate();
    const { login, isAuthenticated, loading } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasRedirected, setHasRedirected] = useState(false);

    useEffect(() => {
        setEmail('superadmin@ticketvolt.com');
        setPassword('REDACTED');

        if (isAuthenticated && !loading) {
            console.log('ℹ️ Already authenticated, but staying on login page');
            console.log('👤 User:', JSON.parse(localStorage.getItem('user') || '{}'));
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            console.log('🔐 Form submitted with:', { email, password: password ? '***' : 'empty' });

            const result = await login(email, password);
            console.log('🔐 Login result:', result);

            if (!result) {
                setError('Login failed. Please try again.');
                toast.error('Login failed. Please try again.');
                setIsSubmitting(false);
                return;
            }

            if (result.success === true) {
                console.log('✅ Login successful! Navigating to dashboard...');
                toast.success('Login successful!');

                setHasRedirected(true);
                navigate('/dashboard', { replace: true });
            } else {
                const errorMsg = result.error || 'Login failed. Please try again.';
                console.error('❌ Login failed:', errorMsg);
                setError(errorMsg);
                toast.error(errorMsg);
            }
        } catch (error) {
            console.error('❌ Login error:', error);
            const errorMsg = error.message || 'An unexpected error occurred';
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

    const demoCreds = [
        { role: '👑 Super Admin', email: 'superadmin@ticketvolt.com', password: 'REDACTED' },
        { role: '🛡️ Admin', email: 'admin@ticketvolt.com', password: 'REDACTED' },
        { role: '📋 Organizer', email: 'organizer@ticketvolt.com', password: 'REDACTED' },
        { role: '👤 User', email: 'user@ticketvolt.com', password: 'REDACTED' },
    ];

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
                sx={{
                    p: isMobile ? 2.5 : 4,
                    maxWidth: 420,
                    width: '100%',
                    borderRadius: 3,
                    bgcolor: 'rgba(255, 255, 255, 0.03)',
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
                        }}
                    >
                        Ticket<span style={{ color: '#5B5FEF' }}>Volt</span>
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 1 }}>
                        Sign in to manage your events
                    </Typography>
                </Box>

                {error && (
                    <Alert severity="error" sx={{ mb: 3, bgcolor: 'rgba(255,0,0,0.1)', color: '#FF6B6B' }}>
                        {error}
                    </Alert>
                )}

                {isAuthenticated && !loading && !isMobile && (
                    <Alert severity="info" sx={{ mb: 3, bgcolor: 'rgba(91,95,239,0.1)', color: '#5B5FEF' }}>
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
                        sx={{
                            mb: 2,
                            '& .MuiOutlinedInput-root': {
                                color: 'white',
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.06)' },
                                '&:hover fieldset': { borderColor: 'rgba(91,95,239,0.4)' },
                                '&.Mui-focused fieldset': { borderColor: '#5B5FEF' },
                            },
                            '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
                            '& .MuiInputLabel-root.Mui-focused': { color: '#5B5FEF' },
                            '& .MuiInputBase-input': { fontSize: 16 },
                        }}
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
                        sx={{
                            mb: 3,
                            '& .MuiOutlinedInput-root': {
                                color: 'white',
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.06)' },
                                '&:hover fieldset': { borderColor: 'rgba(91,95,239,0.4)' },
                                '&.Mui-focused fieldset': { borderColor: '#5B5FEF' },
                            },
                            '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
                            '& .MuiInputLabel-root.Mui-focused': { color: '#5B5FEF' },
                            '& .MuiInputBase-input': { fontSize: 16 },
                        }}
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
                            background: 'linear-gradient(135deg, #5B5FEF 0%, #8B5CF6 100%)',
                            '&:hover': {
                                background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 0 40px rgba(91, 95, 239, 0.2)',
                            },
                            textTransform: 'none',
                            fontSize: '16px',
                            fontWeight: 600,
                        }}
                    >
                        {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
                    </Button>
                </form>

                {/* Demo Credentials */}
                <Box
                    sx={{
                        mt: 3,
                        pt: 2,
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        textAlign: 'center',
                        maxHeight: isMobile ? 180 : 'none',
                        overflowY: isMobile ? 'auto' : 'visible',
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Demo Credentials
                    </Typography>

                    <Box sx={{ mt: 1 }}>
                        {demoCreds.map((cred, index) => (
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
                                {cred.role}: <span style={{ color: '#5B5FEF' }}>{cred.email}</span> / {cred.password}
                            </Typography>
                        ))}
                    </Box>
                </Box>

                <Box textAlign="center" mt={2}>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        Don't have an account?{' '}
                        <Link component={RouterLink} to="/register" sx={{ color: '#5B5FEF' }}>
                            Register
                        </Link>
                    </Typography>
                </Box>
            </Paper>
        </Box>
    );
};

export default Login;