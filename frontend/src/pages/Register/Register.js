// frontend/src/pages/Register/Register.js
import React, { useState } from 'react';
import {
    Box, Paper, Typography, TextField, Button, Link,
    Alert, CircularProgress, useMediaQuery, useTheme,
} from '@mui/material';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { theme as appTheme } from '../../theme/tokens';

const C = appTheme.colors;
const F = appTheme.fonts;

const Register = () => {
    const navigate = useNavigate();
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
            toast.success('Registration successful! Please login.');
            navigate('/login');
        } catch (err) {
            console.error('Registration error:', err);
            const errorData = err.response?.data;
            if (errorData) {
                const firstKey = Object.keys(errorData)[0];
                if (firstKey) {
                    setError(Array.isArray(errorData[firstKey]) ? errorData[firstKey][0] : errorData[firstKey]);
                } else {
                    setError('Registration failed. Please try again.');
                }
            } else {
                setError('Registration failed. Please try again.');
            }
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
                fontFamily: F.family,
            }}
        >
            <Paper
                sx={{
                    p: isMobile ? 2.5 : 4,
                    maxWidth: 500,
                    width: '100%',
                    borderRadius: 3,
                    my: isMobile ? 1 : 0,
                    bgcolor: 'background.paper',
                    border: `1px solid ${C.borderLight}`,
                }}
            >
                <Typography
                    variant="h4"
                    sx={{
                        fontWeight: 700,
                        color: 'text.primary',
                        textAlign: 'center',
                        mb: 3,
                        fontSize: { xs: '1.5rem', sm: '2rem' },
                        fontFamily: F.family,
                    }}
                >
                    🎫 Create Account
                </Typography>

                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

                <form onSubmit={handleSubmit}>
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
                    <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 2, mb: 2 }}>
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
                        sx={{ mb: 2, '& .MuiInputBase-input': { fontSize: 16 } }}
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
                            fontSize: 16,
                            fontWeight: 600,
                            background: C.primaryGradient,
                            color: C.textInverse,
                            '&:hover': {
                                background: `linear-gradient(135deg, ${C.primaryDark} 0%, ${C.primaryLight} 100%)`,
                            },
                        }}
                    >
                        {loading ? <CircularProgress size={24} sx={{ color: C.textInverse }} /> : 'Register'}
                    </Button>
                </form>

                <Box textAlign="center" mt={3}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Already have an account?{' '}
                        <Link component={RouterLink} to="/login" sx={{ color: 'primary.main', fontWeight: 600 }}>
                            Login
                        </Link>
                    </Typography>
                </Box>
            </Paper>
        </Box>
    );
};

export default Register;