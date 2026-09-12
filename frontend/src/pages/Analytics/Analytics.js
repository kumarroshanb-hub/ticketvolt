// frontend/src/pages/Analytics/Analytics.js
import React, { useState, useEffect } from 'react';
import {
    Grid, CardContent, Box, Typography, CircularProgress,
    Paper, Divider, Chip, Button, Stack,
    useMediaQuery, useTheme,
} from '@mui/material';
import {
    TrendingUp,
    TrendingDown,
    BarChart as BarChartIcon,
    PieChart as PieChartIcon,
    ShowChart as ShowChartIcon,
    Refresh as RefreshIcon,
    Download as DownloadIcon,
    CalendarToday as CalendarIcon,
    People as PeopleIcon,
    AttachMoney as MoneyIcon,
    Event as EventIcon,
} from '@mui/icons-material';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
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
    StatsCard,
    PrimaryButton,
    OutlineButton,
    LoadingWrapper,
    StatsGrid,
    StatItem,
    StatValue,
    StatLabel,
    StatIcon,
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

    @media (max-width: 900px) {
        padding: 16px;
    }

    @media (max-width: 600px) {
        padding: 12px;
    }

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

    @media (max-width: 900px) {
        height: 240px;
    }

    @media (max-width: 600px) {
        height: 200px;
    }

    @media (max-width: 400px) {
        height: 180px;
    }
`;

const COLORS = ['#4f46e5', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

const Analytics = () => {
    const { user } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState('week');
    const [analytics, setAnalytics] = useState({
        overview: {
            total_events: 0,
            total_bookings: 0,
            total_revenue: 0,
            total_visitors: 0,
            conversion_rate: 0,
            growth: 0,
        },
        revenueData: [],
        bookingData: [],
        deviceData: [],
        eventData: [],
        visitorData: [],
        topEvents: [],
    });

    const loadAnalytics = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/analytics/?timeframe=${timeframe}`);
            setAnalytics(response.data);
        } catch (error) {
            console.error('Analytics error:', error);
            toast.error('Failed to load analytics');
        }
        setLoading(false);
    };

    useEffect(() => {
        loadAnalytics();
    }, [timeframe]);

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: '#4f46e5' }} />
            </LoadingWrapper>
        );
    }

    const overviewStats = [
        {
            title: 'Total Events',
            value: analytics.overview?.total_events || 0,
            icon: <EventIcon />,
            color: '#4f46e5',
            bg: 'rgba(79, 70, 229, 0.08)',
            change: '+12%'
        },
        {
            title: 'Total Bookings',
            value: analytics.overview?.total_bookings || 0,
            icon: <PeopleIcon />,
            color: '#7c3aed',
            bg: 'rgba(124, 58, 237, 0.08)',
            change: '+8%'
        },
        {
            title: 'Revenue',
            value: `₹${analytics.overview?.total_revenue?.toLocaleString() || 0}`,
            icon: <MoneyIcon />,
            color: '#10b981',
            bg: 'rgba(16, 185, 129, 0.08)',
            change: '+15%'
        },
        {
            title: 'Conversion Rate',
            value: `${analytics.overview?.conversion_rate || 0}%`,
            icon: <TrendingUp />,
            color: '#f59e0b',
            bg: 'rgba(245, 158, 11, 0.08)',
            change: analytics.overview?.growth > 0 ? `+${analytics.overview?.growth}%` : `${analytics.overview?.growth}%`
        },
    ];

    const revenueData = analytics.revenueData || [
        { month: 'Jan', revenue: 12000, bookings: 45 },
        { month: 'Feb', revenue: 15000, bookings: 52 },
        { month: 'Mar', revenue: 18000, bookings: 58 },
        { month: 'Apr', revenue: 14000, bookings: 42 },
        { month: 'May', revenue: 20000, bookings: 65 },
        { month: 'Jun', revenue: 22000, bookings: 70 },
    ];

    const deviceData = analytics.deviceData || [
        { name: 'Android', value: 45 },
        { name: 'iOS', value: 30 },
        { name: 'Web', value: 25 },
    ];

    const eventData = analytics.eventData || [
        { name: 'Concerts', value: 30 },
        { name: 'Theater', value: 25 },
        { name: 'Sports', value: 20 },
        { name: 'Conferences', value: 15 },
        { name: 'Others', value: 10 },
    ];

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>Analytics</PageTitle>
                    {!isMobile && <PageSubtitle>Track performance and insights</PageSubtitle>}
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
                        <Button
                            variant={timeframe === 'week' ? 'contained' : 'outlined'}
                            size="small"
                            onClick={() => setTimeframe('week')}
                            sx={{
                                textTransform: 'none',
                                ...(timeframe === 'week' && {
                                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                    color: 'white',
                                }),
                                ...(timeframe !== 'week' && {
                                    borderColor: '#e2e8f0',
                                    color: '#64748b',
                                }),
                            }}
                        >
                            Week
                        </Button>
                        <Button
                            variant={timeframe === 'month' ? 'contained' : 'outlined'}
                            size="small"
                            onClick={() => setTimeframe('month')}
                            sx={{
                                textTransform: 'none',
                                ...(timeframe === 'month' && {
                                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                    color: 'white',
                                }),
                                ...(timeframe !== 'month' && {
                                    borderColor: '#e2e8f0',
                                    color: '#64748b',
                                }),
                            }}
                        >
                            Month
                        </Button>
                        <Button
                            variant={timeframe === 'year' ? 'contained' : 'outlined'}
                            size="small"
                            onClick={() => setTimeframe('year')}
                            sx={{
                                textTransform: 'none',
                                ...(timeframe === 'year' && {
                                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                    color: 'white',
                                }),
                                ...(timeframe !== 'year' && {
                                    borderColor: '#e2e8f0',
                                    color: '#64748b',
                                }),
                            }}
                        >
                            Year
                        </Button>
                        <OutlineButton variant="outlined" startIcon={<RefreshIcon />} onClick={loadAnalytics}>
                            Refresh
                        </OutlineButton>
                        <OutlineButton variant="outlined" startIcon={<DownloadIcon />}>
                            Export
                        </OutlineButton>
                    </Stack>
                </PageHeaderRight>
            </PageHeader>

            {/* Stats Cards — 2 per row on phone */}
            <Grid container spacing={isMobile ? 1.5 : 2} sx={{ mb: 3 }}>
                {overviewStats.map((stat, index) => (
                    <Grid item xs={6} sm={6} md={3} key={index}>
                        <StatsCard>
                            <CardContent sx={{ p: isSmall ? 1.5 : 2, '&:last-child': { pb: isSmall ? 1.5 : 2 } }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                                    <StatItem>
                                        <StatLabel>{stat.title}</StatLabel>
                                        <StatValue
                                            variant="h4"
                                            sx={{ fontSize: isSmall ? '1.25rem' : '2rem' }}
                                        >
                                            {stat.value}
                                        </StatValue>
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: '#10b981',
                                                mt: 1,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 0.5,
                                                fontSize: isSmall ? '10px' : '12px',
                                            }}
                                        >
                                            {stat.change || ''}
                                        </Typography>
                                    </StatItem>
                                    <StatIcon color={stat.color} bg={stat.bg}>
                                        {stat.icon}
                                    </StatIcon>
                                </Box>
                            </CardContent>
                        </StatsCard>
                    </Grid>
                ))}
            </Grid>

            {/* Charts Grid */}
            <Grid container spacing={isMobile ? 2 : 3}>
                {/* Revenue Chart */}
                <Grid item xs={12} lg={8}>
                    <ChartCard>
                        <ChartHeader>
                            <ChartTitle>Revenue & Bookings Overview</ChartTitle>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Chip label="Revenue" size="small" sx={{ backgroundColor: '#4f46e5', color: 'white' }} />
                                <Chip label="Bookings" size="small" sx={{ backgroundColor: '#7c3aed', color: 'white' }} />
                            </Box>
                        </ChartHeader>
                        <ChartWrapper>
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
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="revenue"
                                        stroke="#4f46e5"
                                        fill="url(#colorRevenue)"
                                        strokeWidth={2.5}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="bookings"
                                        stroke="#7c3aed"
                                        fill="url(#colorBookings)"
                                        strokeWidth={2.5}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </ChartWrapper>
                    </ChartCard>
                </Grid>

                {/* Device Distribution */}
                <Grid item xs={12} lg={4}>
                    <ChartCard>
                        <ChartHeader>
                            <ChartTitle>Device Distribution</ChartTitle>
                        </ChartHeader>
                        <ChartWrapper>
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
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartWrapper>
                    </ChartCard>
                </Grid>

                {/* Event Categories */}
                <Grid item xs={12} lg={6}>
                    <ChartCard>
                        <ChartHeader>
                            <ChartTitle>Event Categories</ChartTitle>
                        </ChartHeader>
                        <ChartWrapper>
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
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                                        }}
                                    />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {eventData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartWrapper>
                    </ChartCard>
                </Grid>

                {/* Top Events */}
                <Grid item xs={12} lg={6}>
                    <ChartCard>
                        <ChartHeader>
                            <ChartTitle>Top Performing Events</ChartTitle>
                        </ChartHeader>
                        <Box>
                            {analytics.topEvents?.length === 0 ? (
                                <Typography sx={{ color: '#94a3b8', textAlign: 'center', py: 4 }}>
                                    No event data available
                                </Typography>
                            ) : (
                                analytics.topEvents?.slice(0, 5).map((event, index) => (
                                    <Box key={index} sx={{ mb: 2, p: isMobile ? 1.25 : 2, borderRadius: 1, bgcolor: '#f8fafc' }}>
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
                                                    {event.name || `Event ${index + 1}`}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: '#64748b' }}>
                                                    {event.bookings || 0} bookings • ₹{event.revenue || 0}
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
                                            <Box sx={{
                                                width: `${event.percentage || 0}%`,
                                                height: '100%',
                                                bgcolor: COLORS[index % COLORS.length],
                                                borderRadius: 2,
                                                transition: 'width 0.6s ease'
                                            }} />
                                        </Box>
                                    </Box>
                                ))
                            )}
                        </Box>
                    </ChartCard>
                </Grid>
            </Grid>
        </PageContainer>
    );
};

export default Analytics;