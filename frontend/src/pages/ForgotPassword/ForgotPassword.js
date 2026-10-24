// frontend/src/pages/ForgotPassword/ForgotPassword.js
import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
    Box, Paper, Typography, TextField, Button, Alert, CircularProgress, Link
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { theme as appTheme } from '../../theme/tokens';
import Logo from '../../components/Logo';

const C = appTheme.colors;
const F = appTheme.fonts;

const ForgotPassword = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await api.post('/users/forgot_password/', { email });
            setSuccess(true);
            toast.success('Reset link sent!');
        } catch (err) {
            const msg = err.response?.data?.error || 'Failed to send reset link. Please try again.';
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                minHeight: '100vh', minHeight: '100dvh', bgcolor: C.bgDark,
                p: 2, fontFamily: F.family, position: 'relative',
            }}
        >
            <Box sx={{ position: 'absolute', top: 16, left: 16 }}>
                <Button
                    component={RouterLink} to="/login" startIcon={<ArrowBackIcon />}
                    sx={{ color: 'rgba(255, 255, 255, 0.6)', textTransform: 'none' }}
                >
                    Back to Login
                </Button>
            </Box>

            <Paper
                sx={{
                    p: 4, maxWidth: 440, width: '100%', borderRadius: 3,
                    bgcolor: C.bgDarkCard, border: `1px solid ${C.bgDarkBorder}`,
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
                    <Logo variant="full" height={60} inverse />
                    <Typography variant="h5" sx={{ color: 'white', mt: 3, fontWeight: 700 }}>
                        Forgot Password
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mt: 1, textAlign: 'center' }}>
                        Enter your email address and we'll send you a link to reset your password.
                    </Typography>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
                
                {success ? (
                    <Box textAlign="center">
                        <Alert severity="success" sx={{ mb: 3 }}>
                            If an account exists with this email, a reset link has been sent. Check your inbox.
                        </Alert>
                        <Button
                            component={RouterLink} to="/login" variant="outlined" fullWidth
                            sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
                        >
                            Return to Login
                        </Button>
                    </Box>
                ) : (
                    <form onSubmit={handleSubmit} noValidate>
                        <TextField
                            fullWidth label="Email Address" type="email" value={email}
                            onChange={(e) => setEmail(e.target.value)} required
                            autoComplete="email" disabled={loading}
                            sx={{
                                mb: 3,
                                '& .MuiOutlinedInput-root': {
                                    backgroundColor: 'rgba(255,255,255,0.04)', color: 'white',
                                    '& fieldset': { borderColor: C.bgDarkBorder },
                                    '&.Mui-focused fieldset': { borderColor: C.secondary },
                                },
                                '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
                            }}
                        />
                        <Button
                            type="submit" fullWidth variant="contained" disabled={loading}
                            sx={{
                                py: 1.5, background: C.secondary, color: 'white',
                                '&:hover': { background: C.secondaryDark },
                                fontWeight: 700,
                            }}
                        >
                            {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : 'Send Reset Link'}
                        </Button>
                    </form>
                )}
            </Paper>
        </Box>
    );
};

export default ForgotPassword;