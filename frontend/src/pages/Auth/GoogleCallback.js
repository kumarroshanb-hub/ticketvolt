import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Alert, Button } from '@mui/material';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Logo from '../../components/Logo';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const GoogleCallback = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { login } = useAuth();
    const { t } = useTranslation();
    const [error, setError] = useState('');

    useEffect(() => {
        const ticket = params.get('ticket');
        if (!ticket) {
            setError(t('auth.googleInvalid', 'Google sign-in could not be completed.'));
            return;
        }
        api.post('/auth/google/exchange/', { ticket })
            .then((res) => {
                if (!res.data?.access || !res.data?.refresh || !res.data?.user) {
                    throw new Error(t('auth.googleInvalid', 'Google sign-in could not be completed.'));
                }
                login(res.data.access, res.data.refresh, res.data.user);
                navigate('/app/dashboard', { replace: true });
            })
            .catch((err) => setError(err.response?.data?.error || err.message));
    }, [params, login, navigate, t]);

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: C.bgPrimary, display: 'grid', placeItems: 'center', p: 2 }}>
            <Box sx={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
                <Logo height={56} />
                {error ? (
                    <>
                        <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>
                        <Button onClick={() => navigate('/login', { replace: true })} sx={{ mt: 2 }}>
                            {t('auth.backToLogin', 'Back to login')}
                        </Button>
                    </>
                ) : (
                    <Box sx={{ mt: 4 }}>
                        <CircularProgress sx={{ color: C.secondary }} />
                        <Alert severity="info" sx={{ mt: 3 }}>
                            {t('auth.googleSigningIn', 'Completing Google sign-in…')}
                        </Alert>
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default GoogleCallback;
