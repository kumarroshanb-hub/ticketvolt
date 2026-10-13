// frontend/src/pages/Events/Events.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Grid, Card, CardContent, Typography, Button,
    Chip, CircularProgress, Alert, IconButton, Tooltip,
    Paper, Stack, Dialog, DialogTitle, DialogContent, DialogActions,
    useMediaQuery, useTheme,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Visibility as ViewIcon,
    Refresh as RefreshIcon,
    CalendarMonth as CalendarIcon,
    LocationOn as LocationIcon,
    ConfirmationNumber as TicketIcon,
    ArrowForward as ArrowForwardIcon,
    PublishedWithChanges as PublishIcon,
    Schedule as ScheduleIcon,
    People as PeopleIcon,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
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
import { ROLES, EVENT_STATUS_LABELS } from '../../constants';
import { theme } from '../../theme/tokens';

const C = theme.colors;

// ---------------------------------------------------------------------------
// Central status → color map. Keys must match the values the backend can
// send in `event.status` (see Event.get_effective_status on the backend).
// ---------------------------------------------------------------------------
const STATUS_COLORS = {
    draft: 'default',
    published: 'info',
    active: 'success',
    cancelled: 'error',
    completed: 'secondary',
    sold_out: 'warning',
    postponed: 'warning',
};

const getStatusColor = (status) => STATUS_COLORS[status] || 'default';

const getStatusLabel = (status) =>
    EVENT_STATUS_LABELS[status] || status || 'Unknown';

const Events = () => {
    const navigate = useNavigate();
    const { role } = useRole();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
    const isOrganizer = role === ROLES.ORGANIZER;
    const canManageEvents = isAdmin || isOrganizer;
    const canCreateEvents = isAdmin || isOrganizer;
    const isRegularUser = role === ROLES.USER;

    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState({ open: false, eventId: null, eventTitle: '' });
    const [actionLoading, setActionLoading] = useState(false);

    const loadEvents = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get('/events/');
            let eventsData = [];

            if (Array.isArray(response.data)) {
                eventsData = response.data;
            } else if (response.data && response.data.results) {
                eventsData = response.data.results;
            }

            setEvents(eventsData);
        } catch (err) {
            console.error('Events error:', err);
            setError(err.response?.data?.detail || 'Failed to load events');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEvents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCreateEvent = () => navigate('/events/create');
    const handleEditEvent = (eventId) => navigate(`/events/${eventId}/edit`);
    const handleViewEvent = (eventId) => navigate(`/events/${eventId}/`);

    const handleDeleteEvent = async () => {
        if (!deleteConfirm.eventId) return;

        setActionLoading(true);
        try {
            await api.delete(`/events/${deleteConfirm.eventId}/`);
            toast.success('Event deleted successfully');
            setDeleteConfirm({ open: false, eventId: null, eventTitle: '' });
            loadEvents();
        } catch (err) {
            console.error('Delete error:', err);
            toast.error(err.response?.data?.error || 'Failed to delete event');
        } finally {
            setActionLoading(false);
        }
    };

    const handlePublishEvent = async (eventId) => {
        setActionLoading(true);
        try {
            await api.post(`/events/${eventId}/publish/`);
            toast.success('Event published successfully');
            loadEvents();
        } catch (err) {
            console.error('Publish error:', err);
            toast.error(err.response?.data?.error || 'Failed to publish event');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: C.primary }} />
            </LoadingWrapper>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle variant="h4">
                        {isRegularUser ? 'Browse Events' : 'Events Management'}
                    </PageTitle>
                    {isRegularUser && (
                        <Typography
                            variant="body2"
                            sx={{
                                color: C.textSecondary,
                                ml: isMobile ? 0 : 2,
                                display: 'block',
                                width: isMobile ? '100%' : 'auto',
                            }}
                        >
                            Find and book events
                        </Typography>
                    )}
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton variant="outlined" startIcon={<RefreshIcon />} onClick={loadEvents}>
                        Refresh
                    </OutlineButton>
                    {canCreateEvents && (
                        <PrimaryButton variant="contained" startIcon={<AddIcon />} onClick={handleCreateEvent}>
                            New Event
                        </PrimaryButton>
                    )}
                </PageHeaderRight>
            </PageHeader>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                    <Button size="small" onClick={loadEvents} sx={{ ml: 2 }}>
                        Retry
                    </Button>
                </Alert>
            )}

            <Grid container spacing={isMobile ? 2 : 3}>
                {events.length === 0 ? (
                    <Grid item xs={12}>
                        <Paper sx={{ p: 4, textAlign: 'center', border: `1px solid ${C.borderLight}` }}>
                            <Typography variant="h6" sx={{ color: C.textSecondary }}>
                                {isRegularUser ? 'No events available' : 'No events found'}
                            </Typography>
                            {canCreateEvents && (
                                <Button
                                    variant="contained"
                                    startIcon={<AddIcon />}
                                    onClick={handleCreateEvent}
                                    sx={{ mt: 2 }}
                                >
                                    Create your first event
                                </Button>
                            )}
                        </Paper>
                    </Grid>
                ) : (
                    events.map((event) => {
                        // -----------------------------------------------------
                        // ✅ Status drives ALL UI decisions now.
                        //    The backend sends the effective status, so
                        //    `completed` really means "past / ended".
                        //    We do NOT compute isPast from end_date here —
                        //    doing so is exactly what caused the mismatch.
                        // -----------------------------------------------------
                        const status = event.status || 'draft';
                        const isDraft = status === 'draft';
                        const isCompleted = status === 'completed';

                        const tierCount = event.tier_count ?? event.tiers?.length ?? 0;
                        const sessionCount = event.session_count ?? event.sessions?.length ?? 0;
                        const totalCapacity = event.total_capacity ?? 0;

                        const venueName = event.venue?.name || null;
                        const venueCity = event.venue?.city || null;

                        return (
                            <Grid item xs={12} sm={6} md={4} key={event.id}>
                                <Card
                                    sx={{
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        borderRadius: 2,
                                        border: `1px solid ${C.borderLight}`,
                                    }}
                                >
                                    <CardContent sx={{ flexGrow: 1 }}>
                                        <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
                                            <Typography
                                                variant="h6"
                                                sx={{
                                                    color: C.textPrimary,
                                                    fontWeight: 600,
                                                    flex: 1,
                                                    minWidth: 0,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}
                                            >
                                                {event.title}
                                            </Typography>
                                            <Chip
                                                label={getStatusLabel(status)}
                                                color={getStatusColor(status)}
                                                size="small"
                                            />
                                        </Box>

                                        {event.short_description && (
                                            <Typography variant="body2" sx={{ color: C.textSecondary, mt: 1 }}>
                                                {event.short_description}
                                            </Typography>
                                        )}

                                        <Box mt={2} display="flex" flexDirection="column" gap={1}>
                                            <Typography variant="body2" sx={{ color: C.textSecondary, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <CalendarIcon fontSize="small" />
                                                {new Date(event.start_date).toLocaleDateString('en-IN', {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    year: 'numeric',
                                                })}
                                            </Typography>

                                            {venueName || venueCity ? (
                                                <Typography variant="body2" sx={{ color: C.textSecondary, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <LocationIcon fontSize="small" />
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
                                                        fontStyle: 'italic',
                                                    }}
                                                >
                                                    <LocationIcon fontSize="small" />
                                                    No venue assigned
                                                </Typography>
                                            )}

                                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                                <Typography variant="body2" sx={{ color: C.textSecondary, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <TicketIcon fontSize="small" />
                                                    {tierCount} ticket tier{tierCount === 1 ? '' : 's'}
                                                </Typography>

                                                <Typography variant="body2" sx={{ color: C.textSecondary, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <ScheduleIcon fontSize="small" />
                                                    {sessionCount} session{sessionCount === 1 ? '' : 's'}
                                                </Typography>
                                            </Box>

                                            {totalCapacity > 0 && (
                                                <Typography variant="caption" sx={{ color: C.textLight, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <PeopleIcon sx={{ fontSize: 14 }} />
                                                    {totalCapacity} total capacity
                                                </Typography>
                                            )}
                                        </Box>

                                        {/*
                                          ✅ The PAST EVENT badge is now gated on
                                             the STATUS, not on a fresh end_date
                                             comparison. It therefore cannot
                                             disagree with the status chip above.
                                        */}
                                        {isCompleted && canManageEvents && (
                                            <Chip
                                                label="PAST EVENT"
                                                size="small"
                                                sx={{
                                                    mt: 1,
                                                    bgcolor: C.bgInput,
                                                    color: C.textSecondary,
                                                }}
                                            />
                                        )}
                                    </CardContent>

                                    <Box sx={{ p: 2, pt: 0, borderTop: `1px solid ${C.bgInput}` }}>
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            sx={{
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                flexWrap: 'wrap',
                                                gap: 1,
                                                mt: 1.5,
                                            }}
                                        >
                                            <Tooltip title="View Details">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleViewEvent(event.id)}
                                                    sx={{ color: C.textSecondary, minWidth: 40, minHeight: 40 }}
                                                >
                                                    <ViewIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>

                                            {canManageEvents && (
                                                <>
                                                    <Tooltip title="Edit">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleEditEvent(event.id)}
                                                            sx={{ color: C.primary, minWidth: 40, minHeight: 40 }}
                                                        >
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>

                                                    {isDraft && (
                                                        <Tooltip title="Publish">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handlePublishEvent(event.id)}
                                                                disabled={actionLoading}
                                                                sx={{ color: C.success, minWidth: 40, minHeight: 40 }}
                                                            >
                                                                <PublishIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}

                                                    <Tooltip title="Delete">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => setDeleteConfirm({
                                                                open: true,
                                                                eventId: event.id,
                                                                eventTitle: event.title,
                                                            })}
                                                            disabled={actionLoading}
                                                            sx={{ color: C.error, minWidth: 40, minHeight: 40 }}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            )}

                                            {isRegularUser && (
                                                <Button
                                                    size="small"
                                                    endIcon={<ArrowForwardIcon />}
                                                    onClick={() => navigate(`/bookings/create?event=${event.id}`)}
                                                    sx={{ color: C.primary, textTransform: 'none', ml: 'auto' }}
                                                >
                                                    Book Now
                                                </Button>
                                            )}
                                        </Stack>
                                    </Box>
                                </Card>
                            </Grid>
                        );
                    })
                )}
            </Grid>

            <Dialog
                open={deleteConfirm.open}
                onClose={() => setDeleteConfirm({ open: false, eventId: null, eventTitle: '' })}
                PaperProps={{
                    sx: {
                        background: C.bgCard,
                        border: `1px solid ${C.borderLight}`,
                        borderRadius: '16px',
                    },
                }}
            >
                <DialogTitle sx={{ color: C.textPrimary }}>Delete Event</DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: C.textSecondary }}>
                        Are you sure you want to delete <strong>{deleteConfirm.eventTitle}</strong>?
                        This action cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirm({ open: false, eventId: null, eventTitle: '' })}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDeleteEvent}
                        color="error"
                        variant="contained"
                        disabled={actionLoading}
                    >
                        {actionLoading ? <CircularProgress size={20} /> : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default Events;