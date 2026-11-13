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
    Person as PersonIcon,
    RateReview as FeedbackIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

const formatDateTime = (dateString, fallback = 'TBD') => {
    if (!dateString) return fallback;
    try {
        return new Date(dateString).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    } catch {
        return fallback;
    }
};

const formatTime = (dateString, fallback = 'TBD') => {
    if (!dateString) return fallback;
    try {
        return new Date(dateString).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return fallback;
    }
};

const EventDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [event, setEvent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sendingFeedback, setSendingFeedback] = useState(false);

    const loadEvent = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/events/${id}/`);
            setEvent(response.data);
        } catch (error) {
            console.error('Event detail error:', error);
            toast.error(t('events.detailLoadingError'));
            navigate('/app/events');
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

    const handleEdit = () => navigate(`/app/events/${id}/edit`);

    const handleSendFeedback = async () => {
        setSendingFeedback(true);
        try {
            const res = await api.post(`/events/${id}/feedback-send/`);
            toast.success(t('events.feedbackSent', 'Feedback emails sent: {{sent}}', { sent: res.data.sent || 0 }));
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setSendingFeedback(false);
        }
    };

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
                <Typography sx={{ color: C.textLight }}>{t('events.detailNotFound')}</Typography>
                <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/app/events')}>
                    {t('events.detailBackToEvents')}
                </Button>
            </Box>
        );
    }

    const sessions = event.sessions || [];
    const tiers = event.tiers || [];
    const sessionCount = sessions.length;
    const tierCount = tiers.length;

    // ✅ NEW: organize the summary rows so the organizer row can be
    // rendered consistently with the rest.
    const summaryRows = [
        [t('events.detailTicketsSold'), event.total_tickets_sold || 0],
        [t('events.detailTotalRevenue'), `₹${(event.total_revenue || 0).toLocaleString()}`],
    ];
    const detailRows = [
        [t('events.detailBookings'), event.total_bookings || 0],
        [t('events.detailSessionsCount'), sessionCount],
        [t('events.detailTiersCount'), tierCount],
    ];

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <IconButton onClick={() => navigate('/app/events')} sx={{ color: C.textSecondary }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Box sx={{ minWidth: 0 }}>
                        <PageTitle variant="h5" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {event.title}
                        </PageTitle>
                        <Typography variant="body2" sx={{ color: C.textSecondary }}>
                            {t(`eventType.${event.event_type}`, { defaultValue: event.event_type })} • {t(`category.${event.category}`, { defaultValue: event.category })}
                        </Typography>
                    </Box>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <Chip
                        label={t(`status.event.${event.status}`, { defaultValue: EVENT_STATUS_LABELS[event.status] || event.status })}
                        color={getEventStatusColor(event.status)}
                        sx={{ fontWeight: 600 }}
                    />
                    <OutlineButton
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadEvent}
                        sx={isMobile ? { width: '100%' } : undefined}
                    >
                        {t('events.detailRefresh')}
                    </OutlineButton>
                    {event.feedback_enabled && (
                        <OutlineButton
                            variant="outlined"
                            startIcon={<FeedbackIcon />}
                            onClick={handleSendFeedback}
                            disabled={sendingFeedback}
                        >
                            {sendingFeedback ? t('common.loading') : t('events.sendFeedback', 'Email feedback')}
                        </OutlineButton>
                    )}
                    <PrimaryButton
                        variant="contained"
                        startIcon={<EditIcon />}
                        onClick={handleEdit}
                        sx={isMobile ? { width: '100%' } : undefined}
                    >
                        {t('events.detailEdit')}
                    </PrimaryButton>
                </PageHeaderRight>
            </PageHeader>

            <Grid container spacing={isMobile ? 2 : 3}>
                <Grid item xs={12} md={8}>
                    <Card sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}`, mb: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 2 }}>
                                {t('events.detailTitle')}
                            </Typography>
                            <Typography variant="body2" sx={{ color: C.textPrimary, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {event.description || t('events.detailNoDescription')}
                            </Typography>
                        </CardContent>
                    </Card>

                    {sessionCount > 0 && (
                        <Card sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}`, mb: 3 }}>
                            <CardContent>
                                <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 2 }}>
                                    {t('events.detailSessions', { count: sessionCount })}
                                </Typography>
                                <Stack spacing={1.5}>
                                    {sessions.map((session, index) => {
                                        const reserved = Boolean(event.venue?.has_reserved_seating);
                                        const capacity = reserved
                                            ? (event.seat_count || event.total_capacity || 0)
                                            : (session.capacity || 0);
                                        const remaining = reserved
                                            ? (typeof event.available_seats === 'number'
                                                ? event.available_seats
                                                : Math.max(0, capacity - (event.total_tickets_sold || 0)))
                                            : Math.max(0, capacity - (session.booked || 0));
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
                                                            {t('events.detailSlotLabel', {
                                                                index: index + 1,
                                                                start: formatTime(session.start_time, t('common.tbd')),
                                                                end: formatTime(session.end_time, t('common.tbd')),
                                                            })}
                                                        </Typography>
                                                    </Box>
                                                    <Chip
                                                        size="small"
                                                        label={isFull ? t('events.detailFull') : t('eventWizard.availableOf', { available: remaining, capacity })}
                                                        color={isFull ? 'error' : 'success'}
                                                        variant="outlined"
                                                        sx={{ fontWeight: 600 }}
                                                    />
                                                </Box>
                                                <Typography variant="caption" sx={{ color: C.textSecondary, display: 'block', mt: 0.5 }}>
                                                    {formatDateTime(session.start_time, t('common.tbd'))}
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
                                    {t('events.detailTiers', { count: tierCount })}
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
                                                        {t('events.detailSold', { sold: tier.quantity_sold || 0, total: tier.quantity_total || 0 })}
                                                    </Typography>
                                                    <Chip
                                                        size="small"
                                                        label={isSoldOut ? t('events.detailSoldOut') : t('events.detailAvailable', { count: available })}
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
                                    {t('events.detailNoConfig')}
                                </Typography>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<EditIcon />}
                                    onClick={handleEdit}
                                    sx={{ mt: 1 }}
                                >
                                    {t('events.detailConfigureNow')}
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}`, mb: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 2 }}>
                                {t('events.detailSummary')}
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {summaryRows.map(([label, value]) => (
                                    <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" sx={{ color: C.textSecondary }}>{label}</Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: C.textPrimary }}>{value}</Typography>
                                    </Box>
                                ))}

                                {/* ✅ NEW: organizer row */}
                                {(event.organizer_username || event.organizer_email) && (
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                                        <Typography variant="body2" sx={{ color: C.textSecondary }}>
                                            {t('events.detailOrganizer')}
                                        </Typography>
                                        <Box sx={{ textAlign: 'right', minWidth: 0 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: C.textPrimary, display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                                                <PersonIcon sx={{ fontSize: 14, color: C.textSecondary }} />
                                                {event.organizer_username || '—'}
                                            </Typography>
                                            {event.organizer_email && (
                                                <Typography variant="caption" sx={{ color: C.textLight, wordBreak: 'break-all' }}>
                                                    {event.organizer_email}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>
                                )}

                                <Divider />
                                {detailRows.map(([label, value]) => (
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
                                {t('events.detailSchedule')}
                            </Typography>
                            {[
                                [t('events.detailStarts'), formatDateTime(event.start_date, t('common.tbd'))],
                                [t('events.detailEnds'), formatDateTime(event.end_date, t('common.tbd'))],
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
                                    {t('events.detailTimezoneLabel', { tz: event.timezone })}
                                </Typography>
                            )}
                        </CardContent>
                    </Card>

                    <Card sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 2 }}>
                                {t('events.detailLocation')}
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
                                    {t('events.detailNoVenue')}
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