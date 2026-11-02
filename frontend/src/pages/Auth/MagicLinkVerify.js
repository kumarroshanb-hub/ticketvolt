import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
    Box,
    Paper,
    Typography,
    CircularProgress,
    Button,
} from '@mui/material';
import { CheckCircle as CheckCircleIcon, Error as ErrorIcon } from '@mui/icons-material';
import { theme as appTheme } from '../../theme/tokens';
import Logo from '../../components/Logo';

const C = appTheme.colors;
const F = appTheme.fonts;

const MagicLinkVerify = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    
    // Adjust this based on your AuthContext's actual method for setting tokens
    // e.g., login, setAuth, or setUser
    const { login } = useAuth(); 

    const token = searchParams.get('token');
    const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage(t('verify.invalidLink'));
            return;
        }

        const verifyToken = async () => {
            try {
                const response = await api.post('/auth/verify-magic-link/', { token });
                
                // ✅ Update Auth Context with the new tokens and user data
                // Note: Adjust the arguments here to match your AuthContext's login/setAuth signature
                if (login) {
                    login(response.data.access, response.data.refresh, response.data.user);
                }

                setStatus('success');
                setMessage(t('verify.successMessage'));
                
                // Redirect to dashboard after a brief delay so the user sees the success message
                setTimeout(() => {
                    navigate('/app/dashboard', { replace: true });
                }, 2000);

            } catch (err) {
                console.error('Magic link verification failed:', err);
                const errorMsg = err.response?.data?.error || t('verify.errorMessage');
                setStatus('error');
                setMessage(errorMsg);
                toast.error(errorMsg);
            }
        };

        verifyToken();
    }, [token, navigate, t, login]);

    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                minHeight: '100dvh',
                bgcolor: C.bgDark,
                p: 2,
                fontFamily: F.family,
            }}
        >
            <Paper
                sx={{
                    p: 4,
                    maxWidth: 440,
                    width: '100%',
                    borderRadius: 3,
                    bgcolor: C.bgDarkCard,
                    border: `1px solid ${C.bgDarkBorder}`,
                    textAlign: 'center',
                }}
            >
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                    <Logo variant="full" height={60} inverse />
                </Box>

                {status === 'loading' && (
                    <Box sx={{ py: 3 }}>
                        <CircularProgress sx={{ color: C.secondary, mb: 2 }} />
                        <Typography variant="h6" sx={{ color: C.textInverse, mb: 1 }}>
                            {t('verify.loadingTitle')}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                            {t('verify.loadingSubtitle')}
                        </Typography>
                    </Box>
                )}

                {status === 'success' && (
                    <Box sx={{ py: 2 }}>
                        <CheckCircleIcon sx={{ fontSize: 64, color: C.success, mb: 2 }} />
                        <Typography variant="h6" sx={{ color: C.textInverse, mb: 1 }}>
                            {t('verify.successTitle')}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                            {message}
                        </Typography>
                    </Box>
                )}

                {status === 'error' && (
                    <Box sx={{ py: 2 }}>
                        <ErrorIcon sx={{ fontSize: 64, color: C.error, mb: 2 }} />
                        <Typography variant="h6" sx={{ color: C.textInverse, mb: 1 }}>
                            {t('verify.errorTitle')}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>
                            {message}
                        </Typography>
                        <Button
                            variant="contained"
                            onClick={() => navigate('/login', { replace: true })}
                            sx={{
                                background: C.secondary,
                                color: C.textInverse,
                                textTransform: 'none',
                                fontWeight: 600,
                                '&:hover': { background: C.secondaryDark },
                            }}
                        >
                            {t('verify.goToLogin')}
                        </Button>
                    </Box>
                )}
            </Paper>
        </Box>
    );
};

export default MagicLinkVerify;