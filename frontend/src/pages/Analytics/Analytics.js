// frontend/src/pages/Analytics/Analytics.js
import React, { useState, useEffect, useCallback } from 'react';
import {
    Grid, CardContent, Box, Typography, CircularProgress,
    Paper, Chip, Button, Stack,
    useMediaQuery, useTheme,
} from '@mui/material';
import {
    TrendingUp,
    Refresh as RefreshIcon,
    Download as DownloadIcon,
    People as PeopleIcon,
    AttachMoney as MoneyIcon,
    Event as EventIcon,
    ConfirmationNumber as TicketIcon,
    CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageSubtitle,
    PageHeaderLeft,
    PageHeaderRight,
    LoadingWrapper,
} from '../../components/Common';
import styled from 'styled-components';

const ChartCard = styled(Paper)`
    background: ${props => props.theme.colors.bgCard};
    border: 1px solid ${props => props.theme.colors.borderLight};
    border-radius: ${props => props.theme.borderRadius.lg};
    padding: 24px;
    box-shadow: ${props => props.theme.shadows.card};
    height: 100%;
    transition: all 0.3s ease;

    @media (max-width: 900px) { padding: 16px; }
    @media (max-width: 600px) { padding: 12px; }

    &:hover {
        border-color: ${props => props.theme.colors.borderHover};
        box-shadow: ${props => props.theme.shadows.cardHover};
    }
`;

const ChartHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 20px;
`;

const ChartTitle = styled(Typography)`
    font-weight: 600;
    color: ${props => props.theme.colors.textPrimary};
    font-size: 16px;
`;

const ChartWrapper = styled.div`
    height: 280px;
    width: 100%;

    @media (max-width: 900px) { height: 240px; }
    @media (max-width: 600px) { height: 200px; }
    @media (max-width: 400px) { height: 180px; }
`;

const StatCard = styled(Paper)`
    background: ${props => props.theme.colors.bgCard};
    border: 1px solid ${props => props.theme.colors.borderLight};
    border-radius: ${props => props.theme.borderRadius.lg};
    padding: 20px;
    box-shadow: ${props => props.theme.shadows.card};
    height: 100%;

    @media (max-width: 600px) { padding: 14px; }
`;

const StatIcon = styled(Box)`
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const COLORS = ['#4f46e5', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

const EMPTY_ANALYTICS = {
    overview: {
        total_events: 0,
        total_bookings: 0,
        total_revenue: 0,
        total_tickets: 0,
        total_checkins: 0,
        conversion_rate: 0,
    },
    revenueData: [],
    deviceData: [],
    eventData: [],
    topEvents: [],
    statusBreakdown: [],
};

const Analytics = () => {
    useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState('week');
    const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);

    // ✅ Memoized so the effect dep list is stable.
    const loadAnalytics = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/analytics/', {
                params: { timeframe },
            });
            // Defensive: fall back to EMPTY_ANALYTICS for any missing keys
            setAnalytics({
                ...EMPTY_ANALYTICS,
                ...response.data,
                overview: {
                    ...EMPTY_ANALYTICS.overview,
                    ...(response.data?.overview || {}),
                },
            });
        } catch (error) {
            console.error('Analytics error:', error);
            toast.error('Failed to load analytics');
            setAnalytics(EMPTY_ANALYTICS);
        } finally {
            setLoading(false);
        }
    }, [timeframe]);

    useEffect(() => {
        loadAnalytics();
    }, [loadAnalytics]);

    const handleExport = () => {
        try {
            const payload = {
                generated_at: new Date().toISOString(),
                timeframe,
                ...analytics,
            };
            const blob = new Blob(
                [JSON.stringify(payload, null, 2)],
                { type: 'application/json' }
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `analytics_${timeframe}_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Analytics exported');
        } catch (err) {
            console.error('Export error:', err);
            toast.error('Failed to export analytics');
        }
    };

    if (loading && analytics.revenueData.length === 0) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: '#4f46e5' }} />
            </LoadingWrapper>
        );
    }

    const overview = analytics.overview || EMPTY_ANALYTICS.overview;

    const overviewStats = [
        {
            title: 'Total Events',
            value: overview.total_events || 0,
            icon: <EventIcon />,
            color: '#4f46e5',
            bg: 'rgba(79, 70, 229, 0.08)',
        },
        {
            title: 'Total Bookings',
            value: overview.total_bookings || 0,
            icon: <PeopleIcon />,
            color: '#7c3aed',
            bg: 'rgba(124, 58, 237, 0.08)',
        },
        {
            title: 'Revenue',
            value: `₹${(overview.total_revenue || 0).toLocaleString()}`,
            icon: <MoneyIcon />,
            color: '#10b981',
            bg: 'rgba(16, 185, 129, 0.08)',
        },
        {
            title: 'Tickets Issued',
            value: overview.total_tickets || 0,
            icon: <TicketIcon />,
            color: '#f59e0b',
            bg: 'rgba(245, 158, 11, 0.08)',
        },
    ];

    const revenueData = analytics.revenueData || [];
    const deviceData = analytics.deviceData || [];
    const eventData = analytics.eventData || [];
    const topEvents = analytics.topEvents || [];
    const statusBreakdown = analytics.statusBreakdown || [];

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>Analytics</PageTitle>
                    {!isMobile && (
                        <PageSubtitle>Track performance and insights</PageSubtitle>
                    )}
                </PageHeaderLeft>
                <PageHeaderRight>
                    <Stack
                        direction="row"
                        spacing={1}
                        flexWrap="wrap"
                        useFlexGap
                        sx={{
                            justifyContent: 'flex-end',
                            width: isMobile ? '100%' : 'auto',
                        }}
                    >
                        {['week', 'month', 'year'].map((tf) => (
                            <Button
                                key={tf}
                                variant={timeframe === tf ? 'contained' : 'outlined'}
                                size="small"
                                onClick={() => setTimeframe(tf)}
                                sx={{
                                    textTransform: 'capitalize',
                                    ...(timeframe === tf && {
                                        background:
                                            'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                        color: 'white',
                                    }),
                                    ...(timeframe !== tf && {
                                        borderColor: '#e2e8f0',
                                        color: '#64748b',
                                    }),
                                }}
                            >
                                {tf}
                            </Button>
                        ))}
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<RefreshIcon />}
                            onClick={loadAnalytics}
                            sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#64748b' }}
                        >
                            Refresh
                        </Button>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<DownloadIcon />}
                            onClick={handleExport}
                            sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#64748b' }}
                        >
                            Export
                        </Button>
                    </Stack>
                </PageHeaderRight>
            </PageHeader>

            {/* Headline stats */}
            <Grid container spacing={isMobile ? 1.5 : 2} sx={{ mb: 3 }}>
                {overviewStats.map((stat, index) => (
                    <Grid item xs={6} sm={6} md={3} key={index}>
                        <StatCard>
                            <Box
                                sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 1,
                                }}
                            >
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            color: '#64748b',
                                            fontWeight: 600,
                                            letterSpacing: 0.5,
                                            fontSize: isSmall ? '10px' : '12px',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        {stat.title}
                                    </Typography>
                                    <Typography
                                        variant="h4"
                                        sx={{
                                            fontWeight: 700,
                                            color: '#0f172a',
                                            mt: 1,
                                            fontSize: isSmall ? '1.25rem' : '1.75rem',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {stat.value}
                                    </Typography>
                                </Box>
                                <StatIcon sx={{ backgroundColor: stat.bg, color: stat.color }}>
                                    {stat.icon}
                                </StatIcon>
                            </Box>
                        </StatCard>
                    </Grid>
                ))}
            </Grid>

            {/* Conversion + check-in summary strip */}
            <Grid container spacing={isMobile ? 1.5 : 2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6}>
                    <StatCard>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <StatIcon sx={{ backgroundColor: 'rgba(16, 185, 129, 0.08)', color: '#10b981' }}>
                                <TrendingUp />
                            </StatIcon>
                            <Box>
                                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                                    Conversion Rate
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a' }}>
                                    {overview.conversion_rate || 0}%
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                    check-ins / tickets issued
                                </Typography>
                            </Box>
                        </Box>
                    </StatCard>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <StatCard>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <StatIcon sx={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6' }}>
                                <CheckCircleIcon />
                            </StatIcon>
                            <Box>
                                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                                    Total Check-ins
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a' }}>
                                    {overview.total_checkins || 0}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                    tickets scanned
                                </Typography>
                            </Box>
                        </Box>
                    </StatCard>
                </Grid>
            </Grid>

            {/* Charts */}
            <Grid container spacing={isMobile ? 2 : 3}>
                {/* Revenue + Bookings */}
                <Grid item xs={12} lg={8}>
                    <ChartCard>
                        <ChartHeader>
                            <ChartTitle>Revenue &amp; Bookings Overview</ChartTitle>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Chip label="Revenue" size="small" sx={{ backgroundColor: '#4f46e5', color: 'white' }} />
                                <Chip label="Bookings" size="small" sx={{ backgroundColor: '#7c3aed', color: 'white' }} />
                            </Box>
                        </ChartHeader>
                        <ChartWrapper>
                            {revenueData.length === 0 ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                    <Typography sx={{ color: '#94a3b8' }}>No data for this timeframe</Typography>
                                </Box>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={revenueData}>
                                        <defs>
                                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                                                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                            </linearGradient>
                                            <linearGradient id="colorBookings" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2}/>
                                                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                        <XAxis dataKey="month" stroke="#94a3b8" axisLine={false} tickLine={false} />
                                        <YAxis stroke="#94a3b8" axisLine={false} tickLine={false} />
                                        <Tooltip
                                            contentStyle={{
                                                background: '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                            }}
                                        />
                                        <Area type="monotone" dataKey="revenue" stroke="#4f46e5" fill="url(#colorRevenue)" strokeWidth={2.5} />
                                        <Area type="monotone" dataKey="bookings" stroke="#7c3aed" fill="url(#colorBookings)" strokeWidth={2.5} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </ChartWrapper>
                    </ChartCard>
                </Grid>

                {/* Booking source / device */}
                <Grid item xs={12} lg={4}>
                    <ChartCard>
                        <ChartHeader>
                            <ChartTitle>Booking Source</ChartTitle>
                        </ChartHeader>
                        <ChartWrapper>
                            {deviceData.length === 0 || deviceData.every(d => d.value === 0) ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                    <Typography sx={{ color: '#94a3b8' }}>No data yet</Typography>
                                </Box>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={deviceData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={isMobile ? 45 : 60}
                                            outerRadius={isMobile ? 65 : 85}
                                            paddingAngle={3}
                                            dataKey="value"
                                            label={isMobile ? false : ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            labelLine={false}
                                        >
                                            {deviceData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{
                                                background: '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </ChartWrapper>
                    </ChartCard>
                </Grid>

                {/* Category breakdown */}
                <Grid item xs={12} lg={6}>
                    <ChartCard>
                        <ChartHeader>
                            <ChartTitle>Revenue by Event Category</ChartTitle>
                        </ChartHeader>
                        <ChartWrapper>
                            {eventData.length === 0 || eventData.every(d => d.value === 0) ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                    <Typography sx={{ color: '#94a3b8' }}>No revenue yet</Typography>
                                </Box>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={eventData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                        <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} />
                                        <YAxis stroke="#94a3b8" axisLine={false} tickLine={false} />
                                        <Tooltip
                                            contentStyle={{
                                                background: '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                            }}
                                            formatter={(value) => [`₹${Number(value).toLocaleString()}`, 'Revenue']}
                                        />
                                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                            {eventData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartWrapper>
                    </ChartCard>
                </Grid>

                {/* Top events */}
                <Grid item xs={12} lg={6}>
                    <ChartCard>
                        <ChartHeader>
                            <ChartTitle>Top Performing Events</ChartTitle>
                        </ChartHeader>
                        <Box>
                            {topEvents.length === 0 ? (
                                <Typography sx={{ color: '#94a3b8', textAlign: 'center', py: 4 }}>
                                    No event data available
                                </Typography>
                            ) : (
                                topEvents.slice(0, 5).map((event, index) => (
                                    <Box
                                        key={event.id || index}
                                        sx={{
                                            mb: 2,
                                            p: isMobile ? 1.25 : 2,
                                            borderRadius: 1,
                                            bgcolor: '#f8fafc',
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                                <Typography
                                                    variant="body2"
                                                    fontWeight="500"
                                                    sx={{
                                                        color: '#0f172a',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {event.name}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: '#64748b' }}>
                                                    {event.bookings || 0} bookings • ₹{(event.revenue || 0).toLocaleString()}
                                                </Typography>
                                            </Box>
                                            <Chip
                                                label={`${event.percentage || 0}%`}
                                                size="small"
                                                sx={{
                                                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                                    color: '#10b981',
                                                    fontWeight: 600,
                                                    flexShrink: 0,
                                                }}
                                            />
                                        </Box>
                                        <Box sx={{ mt: 1, height: 4, bgcolor: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                                            <Box
                                                sx={{
                                                    width: `${event.percentage || 0}%`,
                                                    height: '100%',
                                                    bgcolor: COLORS[index % COLORS.length],
                                                    borderRadius: 2,
                                                    transition: 'width 0.6s ease',
                                                }}
                                            />
                                        </Box>
                                    </Box>
                                ))
                            )}
                        </Box>
                    </ChartCard>
                </Grid>

                {/* Status breakdown table */}
                <Grid item xs={12}>
                    <ChartCard>
                        <ChartHeader>
                            <ChartTitle>Bookings by Status</ChartTitle>
                        </ChartHeader>
                        {statusBreakdown.length === 0 ? (
                            <Typography sx={{ color: '#94a3b8', textAlign: 'center', py: 2 }}>
                                No bookings yet
                            </Typography>
                        ) : (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                {statusBreakdown.map((row) => (
                                    <Chip
                                        key={row.status}
                                        label={`${row.status}: ${row.count}`}
                                        size="small"
                                        sx={{
                                            backgroundColor: '#f1f5f9',
                                            color: '#334155',
                                            fontWeight: 600,
                                            textTransform: 'capitalize',
                                        }}
                                    />
                                ))}
                            </Box>
                        )}
                    </ChartCard>
                </Grid>
            </Grid>
        </PageContainer>
    );
};

export default Analytics;