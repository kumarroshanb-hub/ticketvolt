// frontend/src/pages/Register/Register.js
import React, { useState } from 'react';
import {
    Box, Paper, Typography, TextField, Button, Link,
    Alert, CircularProgress, useMediaQuery, useTheme,
} from '@mui/material';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { theme as appTheme } from '../../theme/tokens';
import Logo from '../../components/Logo';

const C = appTheme.colors;
const F = appTheme.fonts;

// Where to send the user after a successful registration
// when no explicit `from` intent was recorded.
const DEFAULT_POST_REGISTER_PATH = '/app/dashboard';

const Register = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        password_confirm: '',
        first_name: '',
        last_name: '',
    });

    // ------------------------------------------------------------
    // Preserve the redirect intent that came from Login.js.
    //
    //   Login.js sends us here with `state: { from: <booking-url> }`
    //   if the user clicked "Register" while trying to book. We keep
    //   it and hand it back on every path out of this page:
    //     • after successful registration → /login (with from)
    //     • if user clicks "Login" in the footer → /login (with from)
    // ------------------------------------------------------------
    const rawFrom = location.state?.from;
    const redirectTo =
        rawFrom && typeof rawFrom === 'string' && !rawFrom.startsWith('/login')
            ? rawFrom
            : DEFAULT_POST_REGISTER_PATH;

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await api.post('/users/register/', formData);
            toast.success('Registration successful! Please log in.');
            // Pass the redirect intent forward to Login.
            navigate('/login', { state: { from: redirectTo } });
        } catch (err) {
            console.error('Registration error:', err);
            const errorData = err.response?.data;

            let msg = 'Registration failed. Please try again.';

            if (typeof errorData === 'string') {
                msg = errorData;
            } else if (errorData && typeof errorData === 'object') {
                // Collect field-level errors (up to 3) so the user
                // sees everything they need to fix in one pass.
                const entries = Object.entries(errorData);
                if (entries.length > 0) {
                    const messages = entries.slice(0, 3).map(([field, val]) => {
                        const text = Array.isArray(val) ? val[0] : String(val);
                        return field === 'non_field_errors' || field === 'detail'
                            ? text
                            : `${field}: ${text}`;
                    });
                    msg = messages.join(' · ');
                }
            } else if (err.message) {
                msg = err.message;
            }

            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                minHeight: '100dvh',
                bgcolor: 'background.default',
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
                    maxWidth: 480,
                    width: '100%',
                    borderRadius: 3,
                    my: isMobile ? 1 : 0,
                    bgcolor: 'background.paper',
                    border: `1px solid ${C.borderLight}`,
                    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)',
                }}
            >
                {/* ==================================================
                    HEADER — logo + title
                   ================================================== */}
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        mb: 3,
                    }}
                >
                    <Logo variant="full" height={60} />
                    <Typography
                        variant="h5"
                        sx={{
                            fontWeight: 700,
                            color: 'text.primary',
                            mt: 2,
                            mb: 0.5,
                            fontSize: { xs: '1.35rem', sm: '1.5rem' },
                            fontFamily: F.family,
                        }}
                    >
                        Create your account
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            color: 'text.secondary',
                            fontSize: '13px',
                            fontFamily: F.family,
                        }}
                    >
                        Sign up to book tickets in seconds
                    </Typography>
                </Box>

                {error && (
                    <Alert severity="error" sx={{ mb: 3, fontFamily: F.family }}>
                        {error}
                    </Alert>
                )}

                {/* ==================================================
                    FORM
                   ================================================== */}
                <form onSubmit={handleSubmit} noValidate>
                    <TextField
                        fullWidth
                        label="Username"
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        required
                        autoComplete="username"
                        sx={{ mb: 2, '& .MuiInputBase-input': { fontSize: 16 } }}
                    />

                    <TextField
                        fullWidth
                        label="Email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        autoComplete="email"
                        inputProps={{ inputMode: 'email' }}
                        sx={{ mb: 2, '& .MuiInputBase-input': { fontSize: 16 } }}
                    />

                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: isMobile ? 'column' : 'row',
                            gap: 2,
                            mb: 2,
                        }}
                    >
                        <TextField
                            fullWidth
                            label="First Name"
                            name="first_name"
                            value={formData.first_name}
                            onChange={handleChange}
                            autoComplete="given-name"
                            sx={{ '& .MuiInputBase-input': { fontSize: 16 } }}
                        />
                        <TextField
                            fullWidth
                            label="Last Name"
                            name="last_name"
                            value={formData.last_name}
                            onChange={handleChange}
                            autoComplete="family-name"
                            sx={{ '& .MuiInputBase-input': { fontSize: 16 } }}
                        />
                    </Box>

                    <TextField
                        fullWidth
                        label="Password"
                        name="password"
                        type="password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                        autoComplete="new-password"
                        helperText="Minimum 10 characters."
                        sx={{
                            mb: 2,
                            '& .MuiInputBase-input': { fontSize: 16 },
                            '& .MuiFormHelperText-root': {
                                fontSize: '11px',
                                marginLeft: 0,
                            },
                        }}
                    />

                    <TextField
                        fullWidth
                        label="Confirm Password"
                        name="password_confirm"
                        type="password"
                        value={formData.password_confirm}
                        onChange={handleChange}
                        required
                        autoComplete="new-password"
                        sx={{ mb: 3, '& .MuiInputBase-input': { fontSize: 16 } }}
                    />

                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        disabled={loading}
                        sx={{
                            py: 1.5,
                            minHeight: 48,
                            textTransform: 'none',
                            fontSize: 15,
                            fontWeight: 700,
                            letterSpacing: '0.3px',
                            background: C.primaryGradient,
                            color: C.textInverse,
                            borderRadius: 2,
                            '&:hover': {
                                background: `linear-gradient(135deg, ${C.primaryDark} 0%, ${C.primaryLight} 100%)`,
                                transform: 'translateY(-1px)',
                                boxShadow: '0 8px 24px rgba(51, 51, 51, 0.30)',
                            },
                        }}
                    >
                        {loading ? (
                            <CircularProgress size={22} sx={{ color: C.textInverse }} />
                        ) : (
                            'Create Account'
                        )}
                    </Button>
                </form>

                {/* ==================================================
                    FOOTER — login link.
                    Preserves the redirect intent so a user who
                    realizes they already have an account still ends
                    up at their originally-intended destination.
                   ================================================== */}
                <Box textAlign="center" mt={3}>
                    <Typography
                        variant="body2"
                        sx={{
                            color: 'text.secondary',
                            fontSize: '13px',
                            fontFamily: F.family,
                        }}
                    >
                        Already have an account?{' '}
                        <Link
                            component={RouterLink}
                            to="/login"
                            state={{ from: redirectTo }}
                            sx={{
                                color: C.primary,
                                fontWeight: 700,
                                textDecoration: 'none',
                                '&:hover': {
                                    color: C.primaryDark,
                                    textDecoration: 'underline',
                                },
                            }}
                        >
                            Log in
                        </Link>
                    </Typography>
                </Box>
            </Paper>
        </Box>
    );
};

export default Register;