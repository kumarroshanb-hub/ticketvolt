// frontend/src/pages/Gate/GuestOrRegisterGate.js
//
// The "Guest or Register?" gate.
//
// Purpose
// -------
// When an unauthenticated visitor clicks "Book Tickets" or "Register"
// on an event card, we don't force them to create an account, but we
// also don't silently drop them into the booking wizard as an anonymous
// user — they'd then have no way to track their booking later.
//
// This page makes the trade-off explicit:
//
//   • "Continue as Guest" → booking wizard with an anonymous purchaser.
//   • "Register / Log in" → auth flow that preserves the event intent.
//
// Both paths preserve `?event=<id>` so the user always lands where
// they intended.

import React, { useMemo } from 'react';
import { useNavigate, useLocation, Link as RouterLink, Navigate } from 'react-router-dom';
import {
    Box, Container, Paper, Typography, Button, Divider,
    Stack, useMediaQuery, useTheme, CircularProgress,
} from '@mui/material';
import {
    PersonAdd as PersonAddIcon,
    Login as LoginIcon,
    EventAvailable as EventAvailableIcon,
    ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';

import { useAuth } from '../../context/AuthContext';
import Logo from '../../components/Logo';
import { theme as appTheme } from '../../theme/tokens';

const C = appTheme.colors;
const F = appTheme.fonts;

// ---------------------------------------------------------------------------
// Shared style tokens
// ---------------------------------------------------------------------------
const cardSx = {
    p: { xs: 2.5, sm: 3 },
    borderRadius: 3,
    bgcolor: C.bgCard,
    border: `1px solid ${C.borderLight}`,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    transition: 'all 0.2s ease',
};

const primaryBtnSx = {
    py: 1.4,
    minHeight: 48,
    borderRadius: 2,
    textTransform: 'none',
    fontWeight: 700,
    fontSize: 15,
    fontFamily: F.family,
    background: C.primaryGradient,
    color: C.textInverse,
    '&:hover': {
        background: `linear-gradient(135deg, ${C.primaryDark} 0%, ${C.primaryLight} 100%)`,
        transform: 'translateY(-1px)',
        boxShadow: '0 8px 24px rgba(51,51,51,0.25)',
    },
};

const secondaryBtnSx = {
    py: 1.4,
    minHeight: 48,
    borderRadius: 2,
    textTransform: 'none',
    fontWeight: 700,
    fontSize: 15,
    fontFamily: F.family,
    borderColor: C.borderLight,
    color: C.textPrimary,
    '&:hover': {
        borderColor: C.primary,
        color: C.primary,
        background: 'rgba(51,51,51,0.04)',
    },
};

const GuestOrRegisterGate = () => {
    const navigate = useNavigate();
    const location = useLocation();
    // ✅ FIX [GATE-LOADING-GUARD]: read `loading` too. While auth is
    // still bootstrapping, we don't know whether the user is a guest
    // or a logged-in user who bookmarked this URL. Render a spinner
    // instead of either path.
    const { isAuthenticated, loading } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // -------------------------------------------------------------------
    // Resolve intent
    // -------------------------------------------------------------------
    const search = new URLSearchParams(location.search);
    const eventId = search.get('event');

    const eventTitle = location.state?.eventTitle || null;
    const flow = location.state?.flow || 'ticketed';

    const hasIntent = Boolean(eventId);

    const guestPath = useMemo(
        () => (eventId ? `/app/bookings/create?event=${eventId}` : '/app/bookings/create'),
        [eventId]
    );

    const loginTarget = useMemo(
        () => (eventId ? `/app/bookings/create?event=${eventId}` : '/app/dashboard'),
        [eventId]
    );

    // ✅ FIX [GATE-LOADING-GUARD]:
    // Don't render either branch until auth is resolved. Otherwise we
    // can flash the gate for a logged-in user, or (with the old
    // optimistic bootstrap) short-circuit the guest path with a
    // navigate() that runs on every render.
    if (loading) {
        return (
            <Box
                sx={{
                    minHeight: '100vh',
                    minHeight: '100dvh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: C.bgPrimary,
                }}
            >
                <CircularProgress />
            </Box>
        );
    }

    // ✅ FIX [GATE-RENDER-NAVIGATE]:
    // Use <Navigate /> instead of calling navigate() during render.
    // navigate() in the render body is invalid in React Router v6 —
    // it fires on every render and produces double-navigation warnings.
    // <Navigate> is the supported way to redirect during render.
    if (isAuthenticated) {
        return <Navigate to={guestPath} replace />;
    }

    const flowCopy = {
        free_registration: {
            headline: 'Register for this free event',
            subhead: 'No payment required. You can register as a guest or create an account.',
        },
        paid_registration: {
            headline: 'Register for this event',
            subhead: 'Create an account or continue as a guest to complete your registration.',
        },
        ticketed: {
            headline: 'Book tickets for this event',
            subhead: 'Create an account or continue as a guest to complete your booking.',
        },
    }[flow] || {
        headline: 'Continue to booking',
        subhead: 'Create an account or continue as a guest.',
    };

    // -------------------------------------------------------------------
    // The gate screen
    // -------------------------------------------------------------------
    return (
        <Box
            sx={{
                minHeight: '100vh',
                minHeight: '100dvh',
                bgcolor: C.bgPrimary,
                py: { xs: 3, sm: 6 },
                px: { xs: 2, sm: 3 },
                fontFamily: F.family,
            }}
        >
            <Container maxWidth="md">
                {/* Back link */}
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate(-1)}
                    sx={{
                        textTransform: 'none',
                        color: C.textSecondary,
                        fontWeight: 600,
                        mb: 2,
                        '&:hover': { color: C.primary },
                    }}
                >
                    Back
                </Button>

                {/* Header */}
                <Box sx={{ textAlign: 'center', mb: { xs: 3, sm: 5 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                        <Logo variant="full" height={isMobile ? 44 : 56} />
                    </Box>

                    {eventTitle ? (
                        <Typography
                            variant="overline"
                            sx={{
                                color: C.textMuted,
                                fontWeight: 700,
                                letterSpacing: 0.6,
                                display: 'block',
                                mb: 1,
                            }}
                        >
                            {eventTitle}
                        </Typography>
                    ) : null}

                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 800,
                            color: C.textPrimary,
                            fontSize: { xs: '1.4rem', sm: '1.9rem' },
                            lineHeight: 1.2,
                        }}
                    >
                        {flowCopy.headline}
                    </Typography>

                    <Typography
                        variant="body2"
                        sx={{
                            color: C.textSecondary,
                            mt: 1,
                            maxWidth: 520,
                            mx: 'auto',
                            fontSize: { xs: '0.85rem', sm: '0.95rem' },
                        }}
                    >
                        {flowCopy.subhead}
                    </Typography>
                </Box>

                {/* Two paths */}
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                        gap: 2.5,
                    }}
                >
                    {/* -------- Register card -------- */}
                    <Paper elevation={0} sx={cardSx}>
                        <Box
                            sx={{
                                width: 56,
                                height: 56,
                                borderRadius: 2,
                                bgcolor: 'rgba(51,51,51,0.08)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: C.primary,
                                mb: 2,
                            }}
                        >
                            <PersonAddIcon />
                        </Box>

                        <Typography
                            variant="h6"
                            sx={{ fontWeight: 700, color: C.textPrimary, mb: 1 }}
                        >
                            Create an account
                        </Typography>

                        <Typography
                            variant="body2"
                            sx={{ color: C.textSecondary, mb: 2, flex: 1 }}
                        >
                            Save time on future bookings, track your tickets
                            from any device, and get instant access to
                            e-tickets and check-in history.
                        </Typography>

                        <Divider sx={{ my: 2 }} />

                        <Typography
                            component="ul"
                            sx={{
                                pl: 2.5,
                                mb: 2.5,
                                '& li': {
                                    color: C.textSecondary,
                                    fontSize: '0.85rem',
                                    mb: 0.5,
                                },
                            }}
                        >
                            <li>View all your bookings in one place</li>
                            <li>Resend tickets to yourself anytime</li>
                            <li>Faster checkout on your next event</li>
                        </Typography>

                        <Stack spacing={1.2}>
                            <Button
                                fullWidth
                                variant="contained"
                                startIcon={<PersonAddIcon />}
                                component={RouterLink}
                                to="/register"
                                state={{ from: loginTarget }}
                                sx={primaryBtnSx}
                            >
                                Register Now
                            </Button>
                            <Button
                                fullWidth
                                variant="outlined"
                                startIcon={<LoginIcon />}
                                component={RouterLink}
                                to="/login"
                                state={{ from: loginTarget }}
                                sx={secondaryBtnSx}
                            >
                                Already have an account? Log in
                            </Button>
                        </Stack>
                    </Paper>

                    {/* -------- Guest card -------- */}
                    <Paper elevation={0} sx={cardSx}>
                        <Box
                            sx={{
                                width: 56,
                                height: 56,
                                borderRadius: 2,
                                bgcolor: 'rgba(59,130,246,0.10)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: C.info,
                                mb: 2,
                            }}
                        >
                            <EventAvailableIcon />
                        </Box>

                        <Typography
                            variant="h6"
                            sx={{ fontWeight: 700, color: C.textPrimary, mb: 1 }}
                        >
                            Continue as guest
                        </Typography>

                        <Typography
                            variant="body2"
                            sx={{ color: C.textSecondary, mb: 2, flex: 1 }}
                        >
                            Skip the account and go straight to the booking.
                            You'll receive your ticket by email, and you can
                            look up your booking later with the reference
                            number we send you.
                        </Typography>

                        <Divider sx={{ my: 2 }} />

                        <Typography
                            component="ul"
                            sx={{
                                pl: 2.5,
                                mb: 2.5,
                                '& li': {
                                    color: C.textSecondary,
                                    fontSize: '0.85rem',
                                    mb: 0.5,
                                },
                            }}
                        >
                            <li>No account required</li>
                            <li>Tickets delivered to your email</li>
                            <li>Use your booking reference to look up later</li>
                        </Typography>

                        <Button
                            fullWidth
                            variant="outlined"
                            startIcon={<EventAvailableIcon />}
                            onClick={() => navigate(guestPath)}
                            disabled={!hasIntent}
                            sx={{
                                ...secondaryBtnSx,
                                borderColor: C.info,
                                color: C.infoDark,
                                '&:hover': {
                                    borderColor: C.infoDark,
                                    background: 'rgba(59,130,246,0.05)',
                                },
                            }}
                        >
                            Continue as Guest
                        </Button>

                        {!hasIntent && (
                            <Typography
                                variant="caption"
                                sx={{ color: C.error, mt: 1, textAlign: 'center' }}
                            >
                                No event selected. Please go back and choose
                                an event first.
                            </Typography>
                        )}
                    </Paper>
                </Box>

                {/* Footer note */}
                <Typography
                    variant="caption"
                    sx={{
                        display: 'block',
                        textAlign: 'center',
                        color: C.textMuted,
                        mt: 4,
                    }}
                >
                    You can always create an account later — your guest
                    bookings will be linked to it automatically once you
                    sign up with the same email address.
                </Typography>
            </Container>
        </Box>
    );
};

export default GuestOrRegisterGate;