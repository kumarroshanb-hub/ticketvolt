// frontend/src/pages/Dashboard/Dashboard.js
import React, { useState, useEffect } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Paper,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    CircularProgress, useMediaQuery, useTheme, Divider, Button,
} from '@mui/material';
import {
    Event as EventIcon,
    People as PeopleIcon,
    ConfirmationNumber as TicketIcon,
    AttachMoney as MoneyIcon,
    Refresh as RefreshIcon,
    Business as BusinessIcon,
    ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';                   // ✅ NEW
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { useSettings } from '../../context/SettingsContext';
import { useOrg } from '../../context/OrgContext';                  // ✅ NEW
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';

import {
    PageContainer, PageHeader, PageTitle, PageHeaderLeft, PageHeaderRight,
    OutlineButton, StatusChip, LoadingWrapper,
} from '../../components/Common';

import EventCard from '../../components/Common/EventCard';
import { BOOKING_STATUS, ROLES } from '../../constants';

import { theme as appTheme } from '../../theme/tokens';

const C = appTheme.colors;
const F = appTheme.fonts;

// ============================================
// MONEY HELPERS (pure numeric only — no currency symbol here)
// Formatting now comes from SettingsContext via `useSettings().formatMoney`.
// ============================================
const getNetAmount = (booking) => {
    if (!booking) return 0;
    if (booking.net_amount !== undefined && booking.net_amount !== null) {
        return Number(booking.net_amount);
    }
    return Number(booking.total_amount || 0) - Number(booking.discount_applied || 0);
};

const getGrossAmount = (booking) => Number(booking?.total_amount || 0);
const getDiscountAmount = (booking) => Number(booking?.discount_applied || 0);

// ============================================
// AMOUNT DISPLAY
// ============================================
const AmountDisplay = ({ booking, align = 'right', size = 'body2' }) => {
    const { formatMoney } = useSettings();
    const net = getNetAmount(booking);
    const gross = getGrossAmount(booking);
    const discount = getDiscountAmount(booking);
    const hasDiscount = discount > 0;

    return (
        <Box sx={{ textAlign: align === 'right' ? 'right' : 'left' }}>
            <Typography
                variant={size}
                sx={{ fontWeight: 700, color: C.textPrimary, lineHeight: 1.2 }}
            >
                {formatMoney(net)}
            </Typography>

            {hasDiscount && (
                <>
                    <Typography
                        variant="caption"
                        sx={{
                            color: C.textLight,
                            textDecoration: 'line-through',
                            display: 'block',
                            mt: 0.25,
                        }}
                    >
                        {formatMoney(gross)}
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{
                            color: C.success,
                            fontWeight: 600,
                            display: 'block',
                            fontSize: '10px',
                        }}
                    >
                        −{formatMoney(discount)}
                        {booking.discount_code ? ` (${booking.discount_code})` : ''}
                    </Typography>
                </>
            )}
        </Box>
    );
};

// ============================================
// STAT CARD
// ============================================
const StatCard = ({ title, value, icon, color, subtitle }) => {
    const theme = useTheme();
    const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

    return (
        <Card sx={{ height: '100%', borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
            <CardContent sx={{ p: isSmall ? 1.5 : 2, '&:last-child': { pb: isSmall ? 1.5 : 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                            variant="caption"
                            sx={{
                                color: C.textSecondary,
                                fontWeight: 600,
                                letterSpacing: 0.5,
                                fontSize: isSmall ? '10px' : '12px',
                            }}
                        >
                            {title}
                        </Typography>
                        <Typography
                            variant="h4"
                            sx={{
                                fontWeight: 700,
                                color: C.textPrimary,
                                mt: 1,
                                fontSize: isSmall ? '1.25rem' : '2rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {value}
                        </Typography>
                        {subtitle && (
                            <Typography
                                variant="caption"
                                sx={{
                                    color: C.textSecondary,
                                    fontSize: isSmall ? '10px' : '12px',
                                    display: 'block',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                    <Box
                        sx={{
                            backgroundColor: `${color}15`,
                            borderRadius: '50%',
                            p: isSmall ? 0.75 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        {icon}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
};

// ============================================
// MOBILE BOOKING CARD
// ============================================
const MobileBookingCard = ({ booking, onClick }) => {
    const { t } = useTranslation();                                 // ✅ NEW
    const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;

    return (
        <Card
            onClick={onClick}
            sx={{
                borderRadius: 2,
                border: `1px solid ${C.borderLight}`,
                cursor: 'pointer',
                opacity: isCompleted ? 0.75 : 1,
                transition: 'all 0.2s ease',
                '&:active': {
                    transform: 'scale(0.99)',
                    backgroundColor: C.bgPrimary,
                },
            }}
        >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5, gap: 1 }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                            variant="subtitle1"
                            sx={{
                                fontFamily: F.familyMono,
                                fontWeight: 700,
                                color: C.textPrimary,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {booking.booking_reference}
                        </Typography>
                        <Typography variant="caption" sx={{ color: C.textSecondary, display: 'block' }}>
                            {booking.formatted_date || new Date(booking.created_at).toLocaleDateString()}
                        </Typography>
                    </Box>
                    <StatusChip status={booking.status} type="booking" size="small" showIcon variant="filled" />
                </Box>

                <Divider sx={{ mb: 1.5 }} />

                <Box sx={{ mb: 1 }}>
                    <Typography
                        variant="caption"
                        sx={{
                            color: C.textLight,
                            textTransform: 'uppercase',
                            fontSize: '10px',
                            fontWeight: 600,
                            letterSpacing: 0.5,
                        }}
                    >
                        {t('booking.customer')}                       {/* ✅ FIX */}
                    </Typography>
                    <Typography variant="body2" sx={{ color: C.textPrimary, fontWeight: 500 }}>
                        {booking.customer_name || t('common.nA')}     {/* ✅ FIX */}
                    </Typography>
                </Box>

                <Box sx={{ mb: 1.5 }}>
                    <Typography
                        variant="caption"
                        sx={{
                            color: C.textLight,
                            textTransform: 'uppercase',
                            fontSize: '10px',
                            fontWeight: 600,
                            letterSpacing: 0.5,
                        }}
                    >
                        {t('booking.event')}                          {/* ✅ FIX */}
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            color: C.textPrimary,
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {booking.event_title || t('common.nA')}       {/* ✅ FIX */}
                    </Typography>
                </Box>

                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        pt: 1.5,
                        borderTop: `1px dashed ${C.borderLight}`,
                    }}
                >
                    <AmountDisplay booking={booking} align="left" size="h6" />
                    <Typography variant="caption" sx={{ color: C.textSecondary, fontWeight: 600 }}>
                        {/* ✅ FIX: singular / plural aware */}
                        {t('booking.ticketCount', {
                            count: booking.ticket_count || 0,
                        })}
                    </Typography>
                </Box>

                {isCompleted && (
                    <Typography variant="caption" sx={{ color: C.success, display: 'block', mt: 1, fontWeight: 600 }}>
                        ✅ {t('booking.allTicketsUsed')}               {/* ✅ FIX */}
                    </Typography>
                )}
            </CardContent>
        </Card>
    );
};

// ============================================
// ORGANIZATION BANNER (BUG 8)
// Shown only while the user has no organization yet.
// ============================================
const NeedsOrganizationBanner = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <Paper
            elevation={0}
            sx={{
                mb: 3,
                p: { xs: 2, sm: 2.5 },
                borderRadius: 2,
                border: `1px solid ${C.primary}40`,
                backgroundColor: `${C.primary}08`,
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'flex-start', sm: 'center' },
                gap: { xs: 1.5, sm: 2 },
            }}
        >
            <Box
                sx={{
                    backgroundColor: `${C.primary}15`,
                    borderRadius: '50%',
                    p: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}
            >
                <BusinessIcon sx={{ color: C.primary }} />
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 700, color: C.textPrimary, lineHeight: 1.3 }}
                >
                    {t('dashboard.needsOrganizationTitle')}
                </Typography>
                <Typography
                    variant="body2"
                    sx={{ color: C.textSecondary, mt: 0.25 }}
                >
                    {t('dashboard.needsOrganizationBody')}
                </Typography>
            </Box>

            <Button
                variant="contained"
                size="small"
                endIcon={<ArrowForwardIcon />}
                onClick={() => navigate('/app/organizations')}
                sx={{
                    flexShrink: 0,
                    textTransform: 'none',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    alignSelf: { xs: 'stretch', sm: 'auto' },
                }}
            >
                {t('dashboard.needsOrganizationCta')}
            </Button>
        </Paper>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================
const Dashboard = () => {
    const { user } = useAuth();
    const { role } = useRole();
    const { formatMoney } = useSettings();
    const { needsOrganization } = useOrg();                         // ✅ NEW
    const { t } = useTranslation();                                 // ✅ NEW
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Admins, superadmins, and organizers see "View Details" on popular
    // events; regular users see the booking CTA that routes them into the wizard.
    const canManageEvents =
        role === ROLES.ADMIN ||
        role === ROLES.SUPER_ADMIN ||
        role === ROLES.ORGANIZER;

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        total_events: 0,
        active_events: 0,
        total_bookings: 0,
        pending_bookings: 0,
        confirmed_bookings: 0,
        total_tickets: 0,
        used_tickets: 0,
        total_revenue: 0,
        today_revenue: 0,
        recent_bookings: [],
        popular_events: [],
    });

    const loadDashboard = async () => {
        setLoading(true);
        try {
            const response = await api.get('/dashboard/stats/');
            console.log('📊 Dashboard stats:', response.data);
            setStats(response.data);
        } catch (error) {
            console.error('Dashboard error:', error);
            toast.error(t('dashboard.loadFailed'));                 // ✅ FIX
        }
        setLoading(false);
    };

    useEffect(() => {
        loadDashboard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: C.primary }} />
            </LoadingWrapper>
        );
    }

    const recentBookings = stats.recent_bookings || [];
    const popularEvents = stats.popular_events || [];

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle variant="h4">{t('dashboard.title')}</PageTitle>          {/* ✅ FIX */}
                    <Typography
                        variant="body2"
                        sx={{
                            color: C.textSecondary,
                            ml: isMobile ? 0 : 2,
                            display: 'block',
                            width: isMobile ? '100%' : 'auto',
                        }}
                    >
                        {/* ✅ FIX: user name interpolated */}
                        {t('dashboard.welcome', { name: user?.name || 'Admin' })}
                    </Typography>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton variant="outlined" startIcon={<RefreshIcon />} onClick={loadDashboard}>
                        {t('common.refresh')}                                  {/* ✅ FIX */}
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            {/* BUG 8: onboarding CTA for users without an organization */}
            {needsOrganization && <NeedsOrganizationBanner />}

            <Grid container spacing={isMobile ? 1.5 : 2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title={t('dashboard.statTotalEvents')}                 /* ✅ FIX */
                        value={stats.total_events || 0}
                        icon={<EventIcon sx={{ color: C.primary, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.primary}
                        subtitle={t('dashboard.statTotalEventsSubtitle', {
                            count: stats.active_events || 0,
                        })}                                                    /* ✅ FIX */
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title={t('dashboard.statTotalBookings')}               /* ✅ FIX */
                        value={stats.total_bookings || 0}
                        icon={<PeopleIcon sx={{ color: C.success, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.success}
                        subtitle={t('dashboard.statTotalBookingsSubtitle', {
                            count: stats.pending_bookings || 0,
                        })}                                                    /* ✅ FIX */
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title={t('dashboard.statTickets')}                     /* ✅ FIX */
                        value={stats.total_tickets || 0}
                        icon={<TicketIcon sx={{ color: C.secondary, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.secondary}
                        subtitle={t('dashboard.statTicketsSubtitle', {
                            count: stats.used_tickets || 0,
                        })}                                                    /* ✅ FIX */
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title={t('dashboard.statRevenue')}                     /* ✅ FIX */
                        value={formatMoney(stats.total_revenue || 0)}
                        icon={<MoneyIcon sx={{ color: C.warning, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.warning}
                        subtitle={t('dashboard.statRevenueSubtitle', {
                            amount: formatMoney(stats.today_revenue || 0),
                        })}                                                    /* ✅ FIX */
                    />
                </Grid>
            </Grid>

            <Box sx={{ mb: 4 }}>
                <Typography
                    variant="h6"
                    sx={{
                        color: C.textPrimary,
                        fontWeight: 600,
                        mb: 2,
                        fontSize: isMobile ? '1rem' : '1.25rem',
                    }}
                >
                    {t('dashboard.recentBookings')}                            {/* ✅ FIX */}
                </Typography>

                {isMobile ? (
                    recentBookings.length > 0 ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            {recentBookings.map((booking) => (
                                <MobileBookingCard
                                    key={booking.id}
                                    booking={booking}
                                    onClick={() => navigate(`/app/bookings/${booking.id}`)}
                                />
                            ))}
                        </Box>
                    ) : (
                        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
                            <Typography sx={{ color: C.textLight }}>
                                {t('dashboard.noRecentBookings')}              {/* ✅ FIX */}
                            </Typography>
                        </Paper>
                    )
                ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>
                                        {t('booking.reference')}                   {/* ✅ FIX */}
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>
                                        {t('booking.customer')}                    {/* ✅ FIX */}
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>
                                        {t('booking.event')}                       {/* ✅ FIX */}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600, color: C.textSecondary }}>
                                        {t('booking.amount')}                      {/* ✅ FIX */}
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 600, color: C.textSecondary }}>
                                        {t('booking.status')}                      {/* ✅ FIX */}
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 600, color: C.textSecondary }}>
                                        {t('booking.date')}                        {/* ✅ FIX */}
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {recentBookings.length > 0 ? (
                                    recentBookings.map((booking) => {
                                        const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;
                                        return (
                                            <TableRow
                                                key={booking.id}
                                                hover
                                                onClick={() => navigate(`/app/bookings/${booking.id}`)}
                                                sx={{
                                                    cursor: 'pointer',
                                                    opacity: isCompleted ? 0.7 : 1,
                                                    '&:hover': { backgroundColor: C.bgPrimary },
                                                }}
                                            >
                                                <TableCell sx={{ fontFamily: F.familyMono, color: C.textPrimary }}>
                                                    {booking.booking_reference}
                                                    {isCompleted && (
                                                        <Typography variant="caption" sx={{ color: C.success, display: 'block' }}>
                                                            ✅ {t('booking.allTicketsUsed')}  {/* ✅ FIX */}
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell sx={{ color: C.textPrimary }}>{booking.customer_name}</TableCell>
                                                <TableCell sx={{ color: C.textPrimary }}>{booking.event_title}</TableCell>
                                                <TableCell align="right">
                                                    <AmountDisplay booking={booking} align="right" size="body2" />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <StatusChip status={booking.status} type="booking" size="small" showIcon variant="filled" />
                                                </TableCell>
                                                <TableCell align="center" sx={{ color: C.textSecondary }}>
                                                    {booking.formatted_date || new Date(booking.created_at).toLocaleDateString()}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 4, color: C.textLight }}>
                                            {t('dashboard.noRecentBookings')}       {/* ✅ FIX */}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Box>

            {/* ==================================================
                POPULAR EVENTS
                Role-aware CTA + routing.
                - Admin / Organizer → "View Details" → /app/events/:id
                - Regular User      → "Book Tickets" / "Register" → wizard
               ================================================== */}
            <Box>
                <Typography
                    variant="h6"
                    sx={{
                        color: C.textPrimary,
                        fontWeight: 600,
                        mb: 2,
                        fontSize: isMobile ? '1rem' : '1.25rem',
                    }}
                >
                    {t('dashboard.popularEvents')}                             {/* ✅ FIX */}
                </Typography>
                <Grid container spacing={isMobile ? 1.5 : 2}>
                    {popularEvents.length > 0 ? (
                        popularEvents.map((event) => (
                            <Grid item xs={12} sm={6} md={4} key={event.id}>
                                <EventCard
                                    event={event}
                                    context={canManageEvents ? 'management' : 'public'}
                                    onSelect={
                                        canManageEvents
                                            ? (evt) => navigate(`/app/events/${evt.id}`)
                                            : undefined
                                    }
                                />
                            </Grid>
                        ))
                    ) : (
                        <Grid item xs={12}>
                            <Box sx={{ textAlign: 'center', py: 4, color: C.textLight }}>
                                {t('dashboard.noEvents')}                      {/* ✅ FIX */}
                            </Box>
                        </Grid>
                    )}
                </Grid>
            </Box>
        </PageContainer>
    );
};

export default Dashboard;