// frontend/src/pages/ResetPassword/ResetPassword.js
import React, { useState } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
    Box, Paper, Typography, TextField, Button, Alert, CircularProgress
} from '@mui/material';
import { theme as appTheme } from '../../theme/tokens';
import Logo from '../../components/Logo';

const C = appTheme.colors;
const F = appTheme.fonts;

const ResetPassword = () => {
    const { t } = useTranslation();
    const { uid, token } = useParams();
    const navigate = useNavigate();
    
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError(t('resetPassword.mismatch'));
            return;
        }

        if (password.length < 10) {
            setError(t('resetPassword.tooShort'));
            return;
        }

        setLoading(true);

        try {
            await api.post('/users/confirm_password_reset/', {
                uid,
                token,
                password,
            });
            toast.success(t('resetPassword.success'));
            navigate('/login', { replace: true });
        } catch (err) {
            const msg = err.response?.data?.error || t('resetPassword.failed');
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            className="tv-auth-page"
            sx={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                minHeight: '100vh', minHeight: '100dvh', bgcolor: C.bgDark,
                p: 2, fontFamily: F.family,
            }}
        >
            <Paper
                sx={{
                    p: 4, maxWidth: 440, width: '100%', borderRadius: 3,
                    bgcolor: C.bgDarkCard, border: `1px solid ${C.bgDarkBorder}`,
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
                    <Logo variant="full" height={60} inverse />
                    <Typography variant="h5" sx={{ color: 'white', mt: 3, fontWeight: 700 }}>
                        {t('resetPassword.title')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mt: 1, textAlign: 'center' }}>
                        {t('resetPassword.subtitle')}
                    </Typography>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

                <form onSubmit={handleSubmit} noValidate>
                    <TextField
                        fullWidth label={t('resetPassword.newPassword')} type="password" value={password}
                        onChange={(e) => setPassword(e.target.value)} required
                        disabled={loading}
                        sx={{
                            mb: 2.5,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: 'rgba(255,255,255,0.04)', color: 'white',
                                '& fieldset': { borderColor: C.bgDarkBorder },
                                '&.Mui-focused fieldset': { borderColor: C.secondary },
                            },
                            '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
                        }}
                    />
                    <TextField
                        fullWidth label={t('resetPassword.confirmPassword')} type="password" value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)} required
                        disabled={loading}
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
                        {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : t('resetPassword.submit')}
                    </Button>
                </form>
            </Paper>
        </Box>
    );
};

export default ResetPassword;