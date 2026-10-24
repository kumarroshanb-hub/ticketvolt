// frontend/src/pages/Events/Events.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Grid, Typography, Button, CircularProgress, Alert,
    IconButton, Tooltip, Paper, Stack, Dialog, DialogTitle,
    DialogContent, DialogActions, useMediaQuery, useTheme,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Visibility as ViewIcon,
    Refresh as RefreshIcon,
    PublishedWithChanges as PublishIcon,
} from '@mui/icons-material';
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
import EventCard from '../../components/Common/EventCard';
import { ROLES } from '../../constants';
import { theme } from '../../theme/tokens';

const C = theme.colors;

// ---------------------------------------------------------------------------
// HOVER ACTIONS OVERLAY
// ---------------------------------------------------------------------------
// The EventCard is a self-contained public-facing component. We don't
// want to pollute it with admin-only actions, so we wrap it in a
// relative container and float the admin action buttons on top-right
// on hover (desktop) / always-visible (mobile).
// ---------------------------------------------------------------------------
const EventCardWithAdminActions = ({
    event,
    isMobile,
    canManageEvents,
    isDraft,
    actionLoading,
    onView,
    onEdit,
    onPublish,
    onDelete,
}) => {
    const [hovered, setHovered] = useState(false);

    return (
        <Box
            sx={{ position: 'relative', height: '100%' }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <EventCard event={event} onSelect={onView} />

            {canManageEvents && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        display: 'flex',
                        gap: 0.5,
                        opacity: isMobile || hovered ? 1 : 0,
                        transition: 'opacity 0.2s ease',
                        pointerEvents: isMobile || hovered ? 'auto' : 'none',
                        zIndex: 2,
                        backgroundColor: 'rgba(255, 255, 255, 0.92)',
                        backdropFilter: 'blur(6px)',
                        borderRadius: 2,
                        p: 0.5,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    }}
                >
                    <Tooltip title="View Details">
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                onView(event);
                            }}
                            sx={{ color: C.textSecondary }}
                        >
                            <ViewIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(event);
                            }}
                            sx={{ color: C.primary }}
                        >
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    {isDraft && (
                        <Tooltip title="Publish">
                            <IconButton
                                size="small"
                                disabled={actionLoading}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPublish(event);
                                }}
                                sx={{ color: C.success }}
                            >
                                <PublishIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    <Tooltip title="Delete">
                        <IconButton
                            size="small"
                            disabled={actionLoading}
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(event);
                            }}
                            sx={{ color: C.error }}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            )}
        </Box>
    );
};

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
    const [deleteConfirm, setDeleteConfirm] = useState({
        open: false,
        eventId: null,
        eventTitle: '',
    });
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

    const handleCreateEvent = () => navigate('/app/events/create');
    const handleEditEvent = (event) => navigate(`/app/events/${event.id}/edit`);
    const handleViewEvent = (event) => navigate(`/app/events/${event.id}/`);

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

    const handlePublishEvent = async (event) => {
        setActionLoading(true);
        try {
            await api.post(`/events/${event.id}/publish/`);
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
                        <Paper
                            sx={{
                                p: 4,
                                textAlign: 'center',
                                border: `1px solid ${C.borderLight}`,
                            }}
                        >
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
                    events.map((event) => (
                        <Grid item xs={12} sm={6} md={4} key={event.id}>
                            <EventCardWithAdminActions
                                event={event}
                                isMobile={isMobile}
                                canManageEvents={canManageEvents}
                                isDraft={event.status === 'draft'}
                                actionLoading={actionLoading}
                                onView={handleViewEvent}
                                onEdit={handleEditEvent}
                                onPublish={handlePublishEvent}
                                onDelete={(evt) =>
                                    setDeleteConfirm({
                                        open: true,
                                        eventId: evt.id,
                                        eventTitle: evt.title,
                                    })
                                }
                            />
                        </Grid>
                    ))
                )}
            </Grid>

            <Dialog
                open={deleteConfirm.open}
                onClose={() =>
                    setDeleteConfirm({ open: false, eventId: null, eventTitle: '' })
                }
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
                        Are you sure you want to delete{' '}
                        <strong>{deleteConfirm.eventTitle}</strong>? This action cannot
                        be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() =>
                            setDeleteConfirm({ open: false, eventId: null, eventTitle: '' })
                        }
                    >
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