// frontend/src/pages/Dashboard/Dashboard.js
import React, { useState, useEffect } from 'react';
import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    useMediaQuery,
    useTheme,
    Divider,
} from '@mui/material';
import {
    Event as EventIcon,
    People as PeopleIcon,
    ConfirmationNumber as TicketIcon,
    AttachMoney as MoneyIcon,
    Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';

// ✅ Import from Common
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageHeaderLeft,
    PageHeaderRight,
    OutlineButton,
    StatusChip,
    LoadingWrapper,
} from '../../components/Common';

// ✅ Import shared constants
import {
    BOOKING_STATUS,
    BookingStatusUtils,
    EventStatusUtils,
} from '../../constants';

// ============================================
// STAT CARD — Phase 4 polish
// ============================================
const StatCard = ({ title, value, icon, color, subtitle }) => {
    const theme = useTheme();
    const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

    return (
        <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <CardContent sx={{ p: isSmall ? 1.5 : 2, '&:last-child': { pb: isSmall ? 1.5 : 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                            variant="caption"
                            sx={{
                                color: '#64748b',
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
                                color: '#0f172a',
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
                                    color: '#64748b',
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
// MOBILE BOOKING CARD — Phase 3 (unchanged)
// ============================================
const MobileBookingCard = ({ booking, onClick }) => {
    const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;

    return (
        <Card
            onClick={onClick}
            sx={{
                borderRadius: 2,
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
                opacity: isCompleted ? 0.75 : 1,
                transition: 'all 0.2s ease',
                '&:active': {
                    transform: 'scale(0.99)',
                    backgroundColor: '#f8fafc',
                },
            }}
        >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5, gap: 1 }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                            variant="subtitle1"
                            sx={{
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                color: '#0f172a',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {booking.booking_reference}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                            {booking.formatted_date || new Date(booking.created_at).toLocaleDateString()}
                        </Typography>
                    </Box>
                    <StatusChip
                        status={booking.status}
                        type="booking"
                        size="small"
                        showIcon={true}
                        variant="filled"
                    />
                </Box>

                <Divider sx={{ mb: 1.5 }} />

                <Box sx={{ mb: 1 }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600, letterSpacing: 0.5 }}>
                        Customer
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#334155', fontWeight: 500 }}>
                        {booking.customer_name || 'N/A'}
                    </Typography>
                </Box>

                <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600, letterSpacing: 0.5 }}>
                        Event
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{
                            color: '#334155',
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {booking.event_title || 'N/A'}
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 1.5, borderTop: '1px dashed #e2e8f0' }}>
                    <Typography variant="h6" sx={{ color: '#4f46e5', fontWeight: 700 }}>
                        ₹{booking.total_amount}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                        {booking.ticket_count || 0} ticket{(booking.ticket_count || 0) !== 1 ? 's' : ''}
                    </Typography>
                </Box>

                {isCompleted && (
                    <Typography variant="caption" sx={{ color: '#10b981', display: 'block', mt: 1, fontWeight: 600 }}>
                        ✅ All tickets used
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
                <CircularProgress sx={{ color: '#4f46e5' }} />
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
                            color: '#64748b',
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

            {/* Stats Cards — 2 per row on phone */}
            <Grid container spacing={isMobile ? 1.5 : 2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title="Total Events"
                        value={stats.total_events || 0}
                        icon={<EventIcon sx={{ color: '#4f46e5', fontSize: isMobile ? 20 : 24 }} />}
                        color="#4f46e5"
                        subtitle={`${stats.active_events || 0} active`}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title="Total Bookings"
                        value={stats.total_bookings || 0}
                        icon={<PeopleIcon sx={{ color: '#10b981', fontSize: isMobile ? 20 : 24 }} />}
                        color="#10b981"
                        subtitle={`${stats.pending_bookings || 0} pending`}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title="Tickets"
                        value={stats.total_tickets || 0}
                        icon={<TicketIcon sx={{ color: '#8b5cf6', fontSize: isMobile ? 20 : 24 }} />}
                        color="#8b5cf6"
                        subtitle={`${stats.used_tickets || 0} used`}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title="Revenue"
                        value={`₹${stats.total_revenue?.toLocaleString() || 0}`}
                        icon={<MoneyIcon sx={{ color: '#f59e0b', fontSize: isMobile ? 20 : 24 }} />}
                        color="#f59e0b"
                        subtitle={`Today: ₹${stats.today_revenue?.toLocaleString() || 0}`}
                    />
                </Grid>
            </Grid>

            {/* Recent Bookings */}
            <Box sx={{ mb: 4 }}>
                <Typography
                    variant="h6"
                    sx={{
                        color: '#0f172a',
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
                        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                            <Typography sx={{ color: '#94a3b8' }}>No recent bookings</Typography>
                        </Paper>
                    )
                ) : (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Reference</TableCell>
                                    <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Customer</TableCell>
                                    <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Event</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600, color: '#475569' }}>Amount</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 600, color: '#475569' }}>Status</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 600, color: '#475569' }}>Date</TableCell>
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
                                                    '&:hover': { backgroundColor: '#f8fafc' },
                                                }}
                                            >
                                                <TableCell sx={{ fontFamily: 'monospace', color: '#0f172a' }}>
                                                    {booking.booking_reference}
                                                    {isCompleted && (
                                                        <Typography variant="caption" sx={{ color: '#10b981', display: 'block' }}>
                                                            ✅ All tickets used
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell sx={{ color: '#334155' }}>{booking.customer_name}</TableCell>
                                                <TableCell sx={{ color: '#334155' }}>{booking.event_title}</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                                    ₹{booking.total_amount}
                                                </TableCell>
                                                <TableCell align="center">
                                                    <StatusChip
                                                        status={booking.status}
                                                        type="booking"
                                                        size="small"
                                                        showIcon={true}
                                                        variant="filled"
                                                    />
                                                </TableCell>
                                                <TableCell align="center" sx={{ color: '#64748b' }}>
                                                    {booking.formatted_date || new Date(booking.created_at).toLocaleDateString()}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#94a3b8' }}>
                                            No recent bookings
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Box>

            {/* Popular Events */}
            <Box>
                <Typography
                    variant="h6"
                    sx={{
                        color: '#0f172a',
                        fontWeight: 600,
                        mb: 2,
                        fontSize: isMobile ? '1rem' : '1.25rem',
                    }}
                >
                    Popular Events
                </Typography>
                <Grid container spacing={isMobile ? 1.5 : 2}>
                    {stats.popular_events && stats.popular_events.length > 0 ? (
                        stats.popular_events.map((event) => {
                            const isActive = EventStatusUtils.isActive(event.status);
                            const isTerminal = EventStatusUtils.isTerminal(event.status);

                            return (
                                <Grid item xs={12} sm={6} md={4} key={event.id}>
                                    <Card
                                        sx={{
                                            borderRadius: 2,
                                            border: '1px solid #e2e8f0',
                                            cursor: 'pointer',
                                            opacity: isTerminal ? 0.7 : 1,
                                            height: '100%',
                                            transition: 'all 0.2s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                                transform: 'translateY(-2px)',
                                            },
                                            '&:active': {
                                                transform: 'scale(0.99)',
                                            },
                                        }}
                                        onClick={() => navigate(`/events/${event.id}`)}
                                    >
                                        <CardContent sx={{ p: isMobile ? 1.5 : 2, '&:last-child': { pb: isMobile ? 1.5 : 2 } }}>
                                            <Typography
                                                variant="h6"
                                                sx={{
                                                    color: '#0f172a',
                                                    fontWeight: 600,
                                                    mb: 1,
                                                    fontSize: isMobile ? '1rem' : '1.25rem',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {event.title}
                                            </Typography>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                                    Tickets Sold
                                                </Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                                    {event.total_tickets_sold || 0}
                                                </Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                                    Revenue
                                                </Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                                    ₹{event.total_revenue?.toLocaleString() || 0}
                                                </Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                                    Status
                                                </Typography>
                                                <StatusChip
                                                    status={event.status}
                                                    type="event"
                                                    size="small"
                                                    showIcon={true}
                                                    variant="filled"
                                                />
                                            </Box>
                                            {isActive && (
                                                <Box sx={{ mt: 1 }}>
                                                    <Typography variant="caption" sx={{ color: '#10b981' }}>
                                                        🟢 Live
                                                    </Typography>
                                                </Box>
                                            )}
                                        </CardContent>
                                    </Card>
                                </Grid>
                            );
                        })
                    ) : (
                        <Grid item xs={12}>
                            <Box sx={{ textAlign: 'center', py: 4, color: '#94a3b8' }}>
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