// frontend/src/pages/Events/EventDetail.js
import React, { useState, useEffect } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Chip, IconButton,
    Button, Divider, CircularProgress, Paper, Stack,
    useMediaQuery, useTheme,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    Edit as EditIcon,
    Refresh as RefreshIcon,
    LocationOn as LocationIcon,
    CalendarToday as CalendarIcon,
    ConfirmationNumber as TicketIcon,
    AccessTime as AccessTimeIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageHeaderLeft,
    PageHeaderRight,
    PrimaryButton,
    OutlineButton,
    LoadingWrapper,
} from '../../components/Common';
import { EVENT_STATUS, EVENT_STATUS_LABELS } from '../../constants';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const formatDateTime = (dateString) => {
    if (!dateString) return 'TBD';
    try {
        return new Date(dateString).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    } catch {
        return 'TBD';
    }
};

const formatTime = (dateString) => {
    if (!dateString) return 'TBD';
    try {
        return new Date(dateString).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return 'TBD';
    }
};

const EventDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [event, setEvent] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadEvent = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/events/${id}/`);
            setEvent(response.data);
        } catch (error) {
            console.error('Event detail error:', error);
            toast.error('Failed to load event details');
            navigate('/events');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) loadEvent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const getEventStatusColor = (status) => {
        switch (status) {
            case EVENT_STATUS.DRAFT: return 'default';
            case EVENT_STATUS.PUBLISHED: return 'info';
            case EVENT_STATUS.ACTIVE: return 'success';
            case EVENT_STATUS.CANCELLED: return 'error';
            case EVENT_STATUS.COMPLETED: return 'secondary';
            default: return 'default';
        }
    };

    const handleEdit = () => navigate(`/events/${id}/edit`);

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: C.primary }} />
            </LoadingWrapper>
        );
    }

    if (!event) {
        return (
            <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography sx={{ color: C.textLight }}>Event not found</Typography>
                <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/events')}>
                    Back to Events
                </Button>
            </Box>
        );
    }

    const sessions = event.sessions || [];
    const tiers = event.tiers || [];
    const sessionCount = sessions.length;
    const tierCount = tiers.length;

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <IconButton onClick={() => navigate('/events')} sx={{ color: C.textSecondary }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Box sx={{ minWidth: 0 }}>
                        <PageTitle variant="h5" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {event.title}
                        </PageTitle>
                        <Typography variant="body2" sx={{ color: C.textSecondary }}>
                            {event.event_type} • {event.category}
                        </Typography>
                    </Box>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <Chip
                        label={EVENT_STATUS_LABELS[event.status] || event.status}
                        color={getEventStatusColor(event.status)}
                        sx={{ fontWeight: 600 }}
                    />
                    <OutlineButton
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadEvent}
                        sx={isMobile ? { width: '100%' } : undefined}
                    >
                        Refresh
                    </OutlineButton>
                    <PrimaryButton
                        variant="contained"
                        startIcon={<EditIcon />}
                        onClick={handleEdit}
                        sx={isMobile ? { width: '100%' } : undefined}
                    >
                        Edit
                    </PrimaryButton>
                </PageHeaderRight>
            </PageHeader>

            <Grid container spacing={isMobile ? 2 : 3}>
                <Grid item xs={12} md={8}>
                    <Card sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}`, mb: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 2 }}>
                                Event Details
                            </Typography>
                            <Typography variant="body2" sx={{ color: C.textPrimary, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {event.description || 'No description provided'}
                            </Typography>
                        </CardContent>
                    </Card>

                    {sessionCount > 0 && (
                        <Card sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}`, mb: 3 }}>
                            <CardContent>
                                <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 2 }}>
                                    Sessions ({sessionCount})
                                </Typography>
                                <Stack spacing={1.5}>
                                    {sessions.map((session, index) => {
                                        const remaining = Math.max(0, (session.capacity || 0) - (session.booked || 0));
                                        const isFull = remaining === 0;

                                        return (
                                            <Paper
                                                key={session.id || index}
                                                variant="outlined"
                                                onClick={handleEdit}
                                                sx={{
                                                    p: 1.5,
                                                    cursor: 'pointer',
                                                    borderColor: C.borderLight,
                                                    transition: 'all 0.15s ease',
                                                    '&:hover': {
                                                        borderColor: C.primary,
                                                        backgroundColor: C.bgPrimary,
                                                    },
                                                }}
                                            >
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                                                        <AccessTimeIcon sx={{ fontSize: 18, color: C.primary, flexShrink: 0 }} />
                                                        <Typography variant="body2" sx={{ fontWeight: 600, color: C.textPrimary }}>
                                                            Slot #{index + 1} — {formatTime(session.start_time)} to {formatTime(session.end_time)}
                                                        </Typography>
                                                    </Box>
                                                    <Chip
                                                        size="small"
                                                        label={isFull ? 'Full' : `${remaining} / ${session.capacity} available`}
                                                        color={isFull ? 'error' : 'success'}
                                                        variant="outlined"
                                                        sx={{ fontWeight: 600 }}
                                                    />
                                                </Box>
                                                <Typography variant="caption" sx={{ color: C.textSecondary, display: 'block', mt: 0.5 }}>
                                                    {formatDateTime(session.start_time)}
                                                </Typography>
                                            </Paper>
                                        );
                                    })}
                                </Stack>
                            </CardContent>
                        </Card>
                    )}

                    {tierCount > 0 && (
                        <Card sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}`, mb: 3 }}>
                            <CardContent>
                                <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 2 }}>
                                    Ticket Tiers ({tierCount})
                                </Typography>
                                <Stack spacing={1.5}>
                                    {tiers.map((tier, index) => {
                                        const available = Math.max(0, (tier.quantity_total || 0) - (tier.quantity_sold || 0));
                                        const isSoldOut = available === 0;

                                        return (
                                            <Paper
                                                key={tier.id || index}
                                                variant="outlined"
                                                onClick={handleEdit}
                                                sx={{
                                                    p: 1.5,
                                                    cursor: 'pointer',
                                                    borderColor: C.borderLight,
                                                    transition: 'all 0.15s ease',
                                                    '&:hover': {
                                                        borderColor: C.primary,
                                                        backgroundColor: C.bgPrimary,
                                                    },
                                                }}
                                            >
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                                                        <TicketIcon sx={{ fontSize: 18, color: C.primary, flexShrink: 0 }} />
                                                        <Typography variant="body2" sx={{ fontWeight: 600, color: C.textPrimary }}>
                                                            {tier.name}
                                                        </Typography>
                                                    </Box>
                                                    <Typography variant="body2" sx={{ fontWeight: 700, color: C.primary, flexShrink: 0 }}>
                                                        ₹{parseFloat(tier.price || 0).toFixed(2)}
                                                    </Typography>
                                                </Box>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5, gap: 1 }}>
                                                    <Typography variant="caption" sx={{ color: C.textSecondary }}>
                                                        Sold: {tier.quantity_sold || 0} / {tier.quantity_total || 0}
                                                    </Typography>
                                                    <Chip
                                                        size="small"
                                                        label={isSoldOut ? 'Sold Out' : `${available} available`}
                                                        color={isSoldOut ? 'error' : 'success'}
                                                        variant="outlined"
                                                        sx={{ fontWeight: 600 }}
                                                    />
                                                </Box>
                                            </Paper>
                                        );
                                    })}
                                </Stack>
                            </CardContent>
                        </Card>
                    )}

                    {sessionCount === 0 && tierCount === 0 && (
                        <Card sx={{ borderRadius: 2, border: `1px dashed ${C.borderLight}`, mb: 3 }}>
                            <CardContent sx={{ textAlign: 'center', py: 4 }}>
                                <Typography variant="body2" sx={{ color: C.textLight }}>
                                    No sessions or ticket tiers configured yet.
                                </Typography>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<EditIcon />}
                                    onClick={handleEdit}
                                    sx={{ mt: 1 }}
                                >
                                    Configure Now
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}`, mb: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 2 }}>
                                Summary
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {[
                                    ['Tickets Sold', event.total_tickets_sold || 0],
                                    ['Total Revenue', `₹${(event.total_revenue || 0).toLocaleString()}`],
                                ].map(([label, value]) => (
                                    <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" sx={{ color: C.textSecondary }}>{label}</Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: C.textPrimary }}>{value}</Typography>
                                    </Box>
                                ))}
                                <Divider />
                                {[
                                    ['Bookings', event.total_bookings || 0],
                                    ['Sessions', sessionCount],
                                    ['Ticket Tiers', tierCount],
                                ].map(([label, value]) => (
                                    <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" sx={{ color: C.textSecondary }}>{label}</Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: C.textPrimary }}>{value}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        </CardContent>
                    </Card>

                    <Card sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}`, mb: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 2 }}>
                                Schedule
                            </Typography>
                            {[
                                ['Starts', formatDateTime(event.start_date)],
                                ['Ends', formatDateTime(event.end_date)],
                            ].map(([label, value], i) => (
                                <Box key={label} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: i === 0 ? 1 : 0 }}>
                                    <CalendarIcon sx={{ fontSize: 16, color: C.textSecondary, mt: 0.3, flexShrink: 0 }} />
                                    <Box>
                                        <Typography variant="caption" sx={{ color: C.textLight, display: 'block' }}>
                                            {label}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                            {value}
                                        </Typography>
                                    </Box>
                                </Box>
                            ))}
                            {event.timezone && (
                                <Typography variant="caption" sx={{ color: C.textLight, display: 'block', mt: 1.5 }}>
                                    Timezone: {event.timezone}
                                </Typography>
                            )}
                        </CardContent>
                    </Card>

                    <Card sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 2 }}>
                                Location
                            </Typography>
                            {event.venue ? (
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                    <LocationIcon sx={{ fontSize: 18, color: C.textSecondary, mt: 0.2, flexShrink: 0 }} />
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: C.textPrimary }}>
                                            {event.venue.name}
                                        </Typography>
                                        {(event.venue.city || event.venue.state) && (
                                            <Typography variant="body2" sx={{ color: C.textSecondary }}>
                                                {[event.venue.city, event.venue.state].filter(Boolean).join(', ')}
                                            </Typography>
                                        )}
                                    </Box>
                                </Box>
                            ) : (
                                <Typography variant="body2" sx={{ color: C.textLight }}>
                                    No venue specified
                                </Typography>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </PageContainer>
    );
};

export default EventDetail;