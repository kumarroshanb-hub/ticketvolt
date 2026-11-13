import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
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
    FormControlLabel,
    RadioGroup,
    Radio,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import { 
    ArrowBack as ArrowBackIcon, 
    ArrowForward as ArrowForwardIcon,
    CheckCircleOutline as SuccessIcon
} from '@mui/icons-material';
import { theme as appTheme } from '../../theme/tokens';
import Logo from '../../components/Logo';
import LanguageSwitcher from '../../components/LanguageSwitcher';

const C = appTheme.colors;
const F = appTheme.fonts;

const DEFAULT_POST_LOGIN_PATH = '/app/dashboard';

const Register = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated, loading, login } = useAuth(); 
    const { t } = useTranslation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    // Auth Flow State
    const [authMethod, setAuthMethod] = useState('magic_link'); // 'magic_link' | 'otp'
    const [identifier, setIdentifier] = useState('');
    const [step, setStep] = useState('input'); // 'input' | 'otp' | 'success_magic'
    const [otpCode, setOtpCode] = useState('');
    
    // UI State
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [cooldown, setCooldown] = useState(0);

    const rawFrom = location.state?.from;
    const redirectTo = rawFrom && typeof rawFrom === 'string' && !rawFrom.startsWith('/register')
        ? rawFrom
        : DEFAULT_POST_LOGIN_PATH;

    // Redirect if already logged in
    useEffect(() => {
        if (isAuthenticated && !loading) {
            navigate(redirectTo, { replace: true });
        }
    }, [isAuthenticated, loading, navigate, redirectTo]);

    // Cooldown timer for Resend OTP
    useEffect(() => {
        if (cooldown > 0) {
            const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [cooldown]);

    const handleRequest = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            if (authMethod === 'magic_link') {
                if (!identifier.includes('@')) {
                    throw new Error(t('auth.invalidEmailMagicLink'));
                }
                await api.post('/auth/request-magic-link/', { email: identifier });
                setStep('success_magic');
            } else {
                // OTP Flow
                const channel = identifier.includes('@') ? 'email' : 'whatsapp';
                await api.post('/auth/request-otp/', { identifier, channel });
                setStep('otp');
                setCooldown(30); // 30 second cooldown
            }
        } catch (err) {
            const errorMsg = err.response?.data?.error || err.message || t('auth.sendCodeFailed');
            setError(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (otpCode.length !== 6) {
            setError(t('auth.enterCompleteCode'));
            return;
        }
        setError('');
        setIsSubmitting(true);

        try {
            const channel = identifier.includes('@') ? 'email' : 'whatsapp';
            const res = await api.post('/auth/verify-otp/', {
                identifier,
                channel,
                code: otpCode
            });
            
            // ✅ Log the user in and redirect
            if (res.data.access && res.data.refresh && res.data.user) {
                login(res.data.access, res.data.refresh, res.data.user);
                navigate(redirectTo, { replace: true });
            }
        } catch (err) {
            const errorMsg = err.response?.data?.error || t('auth.invalidExpiredCode');
            setError(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResendOtp = async () => {
        setError('');
        try {
            const channel = identifier.includes('@') ? 'email' : 'whatsapp';
            await api.post('/auth/request-otp/', { identifier, channel });
            setCooldown(30);
            toast.success(t('auth.newCodeSent'));
        } catch (err) {
            toast.error(err.response?.data?.error || t('auth.resendCodeFailed'));
        }
    };

    const resetFlow = () => {
        setStep('input');
        setIdentifier('');
        setOtpCode('');
        setError('');
    };

    if (loading) {
        return (
            <Box className="tv-auth-page" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', bgcolor: C.bgDark }}>
                <CircularProgress sx={{ color: C.secondary }} />
            </Box>
        );
    }

    // Shared Styles
    const labelSx = {
        color: 'rgba(255, 255, 255, 0.85)', fontSize: '12px', fontWeight: 600,
        letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: '6px',
        position: 'static', transform: 'none', fontFamily: F.family,
        '&.Mui-focused': { color: C.secondary },
    };

    const fieldSx = {
        '& .MuiOutlinedInput-root': {
            backgroundColor: 'rgba(255, 255, 255, 0.04)', color: C.textInverse,
            fontSize: 15, fontFamily: F.family,
            '& fieldset': { borderColor: C.bgDarkBorder },
            '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.25)' },
            '&.Mui-focused fieldset': { borderColor: C.secondary },
        },
        '& .MuiOutlinedInput-input': { padding: '14px 14px', fontFamily: F.family },
    };

    const primaryBtnSx = {
        py: 1.5, minHeight: 48, background: C.secondary, color: C.textInverse,
        borderRadius: 2, textTransform: 'none', fontSize: '15px', fontWeight: 700,
        letterSpacing: '0.3px', fontFamily: F.family, transition: 'all 0.2s ease',
        '&:hover': { background: C.secondaryDark, transform: 'translateY(-1px)', boxShadow: `0 8px 24px rgba(255, 42, 42, 0.30)` },
        '&:disabled': { background: 'rgba(255, 42, 42, 0.40)', color: 'rgba(255, 255, 255, 0.60)' },
    };

    return (
        <Box className="tv-auth-page" sx={{
            display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh',
            bgcolor: C.bgDark, p: isMobile ? 1.5 : 2, fontFamily: F.family, position: 'relative',
        }}>
            {/* Back to Home */}
            <Box sx={{ position: 'absolute', top: 16, left: 16, zIndex: 10 }}>
                <Button component={RouterLink} to="/" startIcon={<ArrowBackIcon />} sx={{
                    color: 'rgba(255, 255, 255, 0.6)', textTransform: 'none', fontWeight: 600, fontFamily: F.family,
                    '&:hover': { color: 'rgba(255, 255, 255, 0.95)', bgcolor: 'rgba(255, 255, 255, 0.08)' },
                }}>
                    {!isMobile && t('auth.backToHome')}
                </Button>
            </Box>

            <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
                <LanguageSwitcher variant="dark" compact={isMobile} />
            </Box>

            <Paper sx={{
                p: isMobile ? 3 : 4, maxWidth: 440, width: '100%', borderRadius: 3,
                bgcolor: C.bgDarkCard, border: `1px solid ${C.bgDarkBorder}`, boxShadow: 'none',
            }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
                    <Logo variant="full" height={80} inverse />
                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.65)', mt: 3, fontSize: '15px', fontFamily: F.family }}>
                        {step === 'input' ? t('register.title') :
                         step === 'otp' ? t('auth.verifyIdentity') : t('auth.checkInbox')}
                    </Typography>
                </Box>

                {error && (
                    <Alert severity="error" sx={{
                        mb: 3, bgcolor: 'rgba(239, 68, 68, 0.10)', color: C.errorLight,
                        border: `1px solid rgba(239, 68, 68, 0.25)`, fontFamily: F.family,
                    }}>
                        {error}
                    </Alert>
                )}

                {/* ==========================================
                    STEP 1: IDENTIFIER INPUT
                   ========================================== */}
                {step === 'input' && (
                    <form onSubmit={handleRequest} noValidate>
                        <FormControl fullWidth sx={{ mb: 2.5 }}>
                            <InputLabel shrink sx={labelSx}>
                                {authMethod === 'magic_link' ? t('auth.emailAddress') : t('auth.emailOrMobile')}
                            </InputLabel>
                            <TextField
                                fullWidth
                                type={authMethod === 'magic_link' ? 'email' : 'text'}
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                required
                                placeholder={authMethod === 'magic_link' ? t('auth.emailPlaceholder') : t('auth.emailOrPhonePlaceholder')}
                                sx={fieldSx}
                                disabled={isSubmitting}
                            />
                        </FormControl>

                        <FormControl component="fieldset" sx={{ mb: 3, width: '100%' }}>
                            <RadioGroup row value={authMethod} onChange={(e) => setAuthMethod(e.target.value)}>
                                <FormControlLabel 
                                    value="magic_link" 
                                    control={<Radio sx={{color: 'rgba(255,255,255,0.5)', '&.Mui-checked': {color: C.secondary}}} />} 
                                    label={<Typography sx={{color: C.textInverse, fontSize: 14}}>{t('auth.magicLink')}</Typography>} 
                                />
                                <FormControlLabel 
                                    value="otp" 
                                    control={<Radio sx={{color: 'rgba(255,255,255,0.5)', '&.Mui-checked': {color: C.secondary}}} />} 
                                    label={<Typography sx={{color: C.textInverse, fontSize: 14}}>{t('auth.otpCode')}</Typography>} 
                                />
                            </RadioGroup>
                        </FormControl>

                        <Button type="submit" fullWidth variant="contained" disabled={isSubmitting || !identifier}
                            endIcon={!isSubmitting && <ArrowForwardIcon />} sx={primaryBtnSx}>
                            {isSubmitting ? <CircularProgress size={22} sx={{ color: C.textInverse }} /> : t('auth.getStarted')}
                        </Button>

                        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2.5 }}>
                            <Link component={RouterLink} to="/login" sx={{
                                color: 'rgba(255, 255, 255, 0.65)', fontSize: '13px', fontFamily: F.family, textDecoration: 'none',
                                '&:hover': { color: C.secondary, textDecoration: 'underline' },
                            }}>
                                {t('auth.haveAccountLogin')}
                            </Link>
                        </Box>
                    </form>
                )}

                {/* ==========================================
                    STEP 2: OTP ENTRY
                   ========================================== */}
                {step === 'otp' && (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.8)', mb: 1, fontSize: 15 }}>
                            {t('auth.sentCodeTo')}
                        </Typography>
                        <Typography sx={{ color: C.textInverse, fontWeight: 700, fontSize: 18, mb: 3 }}>
                            {identifier}
                        </Typography>

                        <TextField
                            fullWidth
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="• • • • • •"
                            inputProps={{
                                maxLength: 6,
                                style: { 
                                    textAlign: 'center', 
                                    letterSpacing: '0.5em', 
                                    fontSize: '24px',
                                    fontFamily: F.familyMono,
                                    color: C.textInverse
                                },
                                inputMode: 'numeric',
                                pattern: '[0-9]*'
                            }}
                            sx={{
                                ...fieldSx,
                                mb: 3,
                                '& .MuiOutlinedInput-root': {
                                    ...fieldSx['& .MuiOutlinedInput-root'],
                                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                }
                            }}
                            disabled={isSubmitting}
                            autoFocus
                        />

                        <Button fullWidth variant="contained" onClick={handleVerifyOtp} 
                            disabled={isSubmitting || otpCode.length !== 6} sx={primaryBtnSx}>
                            {isSubmitting ? <CircularProgress size={22} sx={{ color: C.textInverse }} /> : t('auth.createAccountLogin')}
                        </Button>

                        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Button onClick={resetFlow} sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'none' }}>
                                {t('auth.changeEmailPhone')}
                            </Button>
                            <Button onClick={handleResendOtp} disabled={cooldown > 0} 
                                sx={{ color: cooldown > 0 ? 'rgba(255,255,255,0.3)' : C.secondary, textTransform: 'none' }}>
                                {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resendCode')}
                            </Button>
                        </Box>
                    </Box>
                )}

                {/* ==========================================
                    STEP 3: MAGIC LINK SUCCESS
                   ========================================== */}
                {step === 'success_magic' && (
                    <Box sx={{ textAlign: 'center' }}>
                        <SuccessIcon sx={{ fontSize: 60, color: C.success, mb: 2 }} />
                        <Typography variant="h6" sx={{ color: C.textInverse, mb: 1, fontWeight: 700 }}>
                            {t('auth.checkYourEmail')}
                        </Typography>
                        <Typography sx={{ color: 'rgba(255,255,255,0.6)', mb: 3, fontSize: 14 }}>
                            {t('auth.secureLinkSentRegister', { email: identifier })}
                            <br />
                            {t('auth.clickLinkRegister')}
                        </Typography>
                        <Button variant="outlined" onClick={resetFlow} sx={{
                            color: C.textInverse, borderColor: C.bgDarkBorder, textTransform: 'none',
                            '&:hover': { borderColor: C.secondary, color: C.secondary },
                        }}>
                            {t('login.tryAnotherEmail')}
                        </Button>
                    </Box>
                )}
            </Paper>
        </Box>
    );
};

export default Register;