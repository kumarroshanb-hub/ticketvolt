// frontend/src/pages/Dashboard/Dashboard.js
import React, { useState, useEffect } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Paper,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    CircularProgress, useMediaQuery, useTheme, Divider,
} from '@mui/material';
import {
    Event as EventIcon,
    People as PeopleIcon,
    ConfirmationNumber as TicketIcon,
    AttachMoney as MoneyIcon,
    Refresh as RefreshIcon,
    Schedule as ScheduleIcon,
    LocationOn as LocationIcon,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';

import {
    PageContainer, PageHeader, PageTitle, PageHeaderLeft, PageHeaderRight,
    OutlineButton, StatusChip, LoadingWrapper,
} from '../../components/Common';

import {
    BOOKING_STATUS,
    BookingStatusUtils,
    EventStatusUtils,
} from '../../constants';

import { theme as appTheme } from '../../theme/tokens';

const C = appTheme.colors;
const F = appTheme.fonts;

// ============================================
// MONEY HELPERS
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
const formatMoney = (value) => `₹${Number(value || 0).toFixed(2)}`;

// ============================================
// AMOUNT DISPLAY
// ============================================
const AmountDisplay = ({ booking, align = 'right', size = 'body2' }) => {
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
                        Customer
                    </Typography>
                    <Typography variant="body2" sx={{ color: C.textPrimary, fontWeight: 500 }}>
                        {booking.customer_name || 'N/A'}
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
                        Event
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
                        {booking.event_title || 'N/A'}
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
                        {booking.ticket_count || 0} ticket{(booking.ticket_count || 0) !== 1 ? 's' : ''}
                    </Typography>
                </Box>

                {isCompleted && (
                    <Typography variant="caption" sx={{ color: C.success, display: 'block', mt: 1, fontWeight: 600 }}>
                        ✅ All tickets used
                    </Typography>
                )}
            </CardContent>
        </Card>
    );
};

// ============================================
// POPULAR EVENT CARD
// ============================================
const PopularEventCard = ({ event, onClick, isMobile }) => {
    const isActive = EventStatusUtils.isActive(event.status);
    const isTerminal = EventStatusUtils.isTerminal(event.status);

    const tierCount = event.tier_count ?? 0;
    const sessionCount = event.session_count ?? 0;
    const totalCapacity = event.total_capacity ?? 0;

    const venueName = event.venue_name || null;
    const venueCity = event.venue_city || null;

    const formattedDate = event.start_date
        ? new Date(event.start_date).toLocaleDateString('en-IN', {
              day: '2-digit', month: 'short', year: 'numeric',
          })
        : 'TBD';

    return (
        <Card
            onClick={onClick}
            sx={{
                borderRadius: 2,
                border: `1px solid ${C.borderLight}`,
                cursor: 'pointer',
                opacity: isTerminal ? 0.7 : 1,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.2s ease',
                '&:hover': {
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    transform: 'translateY(-2px)',
                },
                '&:active': { transform: 'scale(0.99)' },
            }}
        >
            <CardContent
                sx={{
                    p: isMobile ? 1.5 : 2,
                    flexGrow: 1,
                    '&:last-child': { pb: isMobile ? 1.5 : 2 },
                }}
            >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                    <Typography
                        variant="h6"
                        sx={{
                            color: C.textPrimary,
                            fontWeight: 600,
                            fontSize: isMobile ? '1rem' : '1.1rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                            minWidth: 0,
                        }}
                    >
                        {event.title}
                    </Typography>
                    <StatusChip status={event.status} type="event" size="small" showIcon variant="filled" />
                </Box>

                <Typography
                    variant="body2"
                    sx={{
                        color: C.textSecondary,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 0.75,
                    }}
                >
                    <ScheduleIcon sx={{ fontSize: 16, color: C.textLight }} />
                    {formattedDate}
                </Typography>

                {venueName || venueCity ? (
                    <Typography
                        variant="body2"
                        sx={{
                            color: C.textSecondary,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            mb: 0.75,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <LocationIcon sx={{ fontSize: 16, color: C.textLight, flexShrink: 0 }} />
                        {venueName || 'Venue'}
                        {venueCity ? `, ${venueCity}` : ''}
                    </Typography>
                ) : (
                    <Typography
                        variant="body2"
                        sx={{
                            color: C.textLight,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            mb: 0.75,
                            fontStyle: 'italic',
                        }}
                    >
                        <LocationIcon sx={{ fontSize: 16 }} />
                        No venue assigned
                    </Typography>
                )}

                <Divider sx={{ my: 1.5 }} />

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
                    <Typography variant="caption" sx={{ color: C.textSecondary, display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
                        🎫 {tierCount} tier{tierCount === 1 ? '' : 's'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: C.textSecondary, display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
                        ⏱️ {sessionCount} session{sessionCount === 1 ? '' : 's'}
                    </Typography>
                    {totalCapacity > 0 && (
                        <Typography variant="caption" sx={{ color: C.textLight, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            👥 {totalCapacity} seats
                        </Typography>
                    )}
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" sx={{ color: C.textSecondary }}>Tickets Sold</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: C.textPrimary }}>
                        {event.total_tickets_sold || 0}
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: C.textSecondary }}>Revenue</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: C.textPrimary }}>
                        ₹{event.total_revenue?.toLocaleString() || 0}
                    </Typography>
                </Box>

                {isActive && (
                    <Typography variant="caption" sx={{ color: C.success, mt: 1, display: 'block' }}>
                        🟢 Live
                    </Typography>
                )}
            </CardContent>
        </Card>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================
const Dashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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
            toast.error('Failed to load dashboard stats');
        }
        setLoading(false);
    };

    useEffect(() => {
        loadDashboard();
    }, []);

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: C.primary }} />
            </LoadingWrapper>
        );
    }

    const recentBookings = stats.recent_bookings || [];

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle variant="h4">Dashboard</PageTitle>
                    <Typography
                        variant="body2"
                        sx={{
                            color: C.textSecondary,
                            ml: isMobile ? 0 : 2,
                            display: 'block',
                            width: isMobile ? '100%' : 'auto',
                        }}
                    >
                        Welcome back, {user?.name || 'Admin'}!
                    </Typography>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton variant="outlined" startIcon={<RefreshIcon />} onClick={loadDashboard}>
                        Refresh
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            <Grid container spacing={isMobile ? 1.5 : 2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title="Total Events"
                        value={stats.total_events || 0}
                        icon={<EventIcon sx={{ color: C.primary, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.primary}
                        subtitle={`${stats.active_events || 0} active`}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title="Total Bookings"
                        value={stats.total_bookings || 0}
                        icon={<PeopleIcon sx={{ color: C.success, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.success}
                        subtitle={`${stats.pending_bookings || 0} pending`}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title="Tickets"
                        value={stats.total_tickets || 0}
                        icon={<TicketIcon sx={{ color: C.secondary, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.secondary}
                        subtitle={`${stats.used_tickets || 0} used`}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title="Revenue"
                        value={`₹${stats.total_revenue?.toLocaleString() || 0}`}
                        icon={<MoneyIcon sx={{ color: C.warning, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.warning}
                        subtitle={`Today: ₹${stats.today_revenue?.toLocaleString() || 0}`}
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
                    Recent Bookings
                </Typography>

                {isMobile ? (
                    recentBookings.length > 0 ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            {recentBookings.map((booking) => (
                                <MobileBookingCard
                                    key={booking.id}
                                    booking={booking}
                                    onClick={() => navigate(`/bookings/${booking.id}`)}
                                />
                            ))}
                        </Box>
                    ) : (
                        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
                            <Typography sx={{ color: C.textLight }}>No recent bookings</Typography>
                        </Paper>
                    )
                ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>Reference</TableCell>
                                    <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>Customer</TableCell>
                                    <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>Event</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600, color: C.textSecondary }}>Amount</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 600, color: C.textSecondary }}>Status</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 600, color: C.textSecondary }}>Date</TableCell>
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
                                                onClick={() => navigate(`/bookings/${booking.id}`)}
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
                                                            ✅ All tickets used
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
                                            No recent bookings
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Box>

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
                    Popular Events
                </Typography>
                <Grid container spacing={isMobile ? 1.5 : 2}>
                    {stats.popular_events && stats.popular_events.length > 0 ? (
                        stats.popular_events.map((event) => (
                            <Grid item xs={12} sm={6} md={4} key={event.id}>
                                <PopularEventCard
                                    event={event}
                                    onClick={() => navigate(`/events/${event.id}`)}
                                    isMobile={isMobile}
                                />
                            </Grid>
                        ))
                    ) : (
                        <Grid item xs={12}>
                            <Box sx={{ textAlign: 'center', py: 4, color: C.textLight }}>
                                No events found
                            </Box>
                        </Grid>
                    )}
                </Grid>
            </Box>
        </PageContainer>
    );
};

export default Dashboard;