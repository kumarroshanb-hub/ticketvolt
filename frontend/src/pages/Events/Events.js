// frontend/src/pages/Events/Events.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Grid, Card, CardContent, Typography, Button,
    Chip, CircularProgress, Alert, IconButton, Tooltip,
    Paper, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Dialog, DialogTitle, DialogContent,
    DialogActions, Select, MenuItem, FormControl, InputLabel,
    Checkbox, Divider, Stack,
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
import { useNavigate as useRouterNavigate } from 'react-router-dom';
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
    StatusChip,
    StyledTableContainer,
    LoadingWrapper,
} from '../../components/Common';
import { ROLES, EVENT_STATUS, EVENT_STATUS_LABELS, EVENT_STATUS_COLORS } from '../../constants';

const Events = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { role } = useRole();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Determine permissions
    const isSuperAdmin = role === ROLES.SUPER_ADMIN;
    const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
    const isOrganizer = role === ROLES.ORGANIZER;
    const canManageEvents = isAdmin || isOrganizer;
    const canCreateEvents = isAdmin || isOrganizer;
    const isRegularUser = role === ROLES.USER;

    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
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
    }, []);

    const handleCreateEvent = () => {
        console.log('📅 Creating new event...');
        navigate('/events/create');
    };

    const handleEditEvent = (eventId) => {
        navigate(`/events/${eventId}/edit`);
    };

    const handleViewEvent = (eventId) => {
        navigate(`/events/${eventId}/`);
    };

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
            const response = await api.post(`/events/${eventId}/publish/`);
            toast.success('Event published successfully');
            loadEvents();
        } catch (err) {
            console.error('Publish error:', err);
            toast.error(err.response?.data?.error || 'Failed to publish event');
        } finally {
            setActionLoading(false);
        }
    };

    const getStatusColor = (status) => {
        const colors = {
            'draft': 'default',
            'published': 'info',
            'active': 'success',
            'cancelled': 'error',
            'completed': 'secondary',
            'sold_out': 'warning',
            'postponed': 'warning',
        };
        return colors[status] || 'default';
    };

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: '#4f46e5' }} />
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
                                color: 'rgba(255,255,255,0.6)',
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
                        <PrimaryButton
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={handleCreateEvent}
                        >
                            New Event
                        </PrimaryButton>
                    )}
                </PageHeaderRight>
            </PageHeader>

            {/* Error Alert */}
            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                    <Button size="small" onClick={loadEvents} sx={{ ml: 2 }}>
                        Retry
                    </Button>
                </Alert>
            )}

            {/* Events Grid */}
            <Grid container spacing={isMobile ? 2 : 3}>
                {events.length === 0 ? (
                    <Grid item xs={12}>
                        <Paper sx={{ p: 4, textAlign: 'center' }}>
                            <Typography variant="h6" sx={{ color: '#64748b' }}>
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
                        const isActive = event.status === 'active' || event.status === 'published';
                        const isDraft = event.status === 'draft';
                        const isPast = event.end_date && new Date(event.end_date) < new Date();

                        // ✅ Resolve counts with fallbacks so this works
                        //    even before the backend is redeployed.
                        const tierCount = event.tier_count ?? event.tiers?.length ?? 0;
                        const sessionCount = event.session_count ?? event.sessions?.length ?? 0;
                        const totalCapacity = event.total_capacity ?? 0;

                        // ✅ Resolve venue: backend now returns a nested object.
                        //    Fall back gracefully if it's not present.
                        const venueName = event.venue?.name || null;
                        const venueCity = event.venue?.city || null;

                        return (
                            <Grid item xs={12} sm={6} md={4} key={event.id}>
                                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 2 }}>
                                    <CardContent sx={{ flexGrow: 1 }}>
                                        <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
                                            <Typography
                                                variant="h6"
                                                sx={{
                                                    color: '#0f172a',
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
                                                label={EVENT_STATUS_LABELS[event.status] || event.status}
                                                color={getStatusColor(event.status)}
                                                size="small"
                                            />
                                        </Box>

                                        {event.short_description && (
                                            <Typography variant="body2" sx={{ color: '#64748b', mt: 1 }}>
                                                {event.short_description}
                                            </Typography>
                                        )}

                                        <Box mt={2} display="flex" flexDirection="column" gap={1}>
                                            {/* Date */}
                                            <Typography variant="body2" sx={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <CalendarIcon fontSize="small" />
                                                {new Date(event.start_date).toLocaleDateString('en-IN', {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    year: 'numeric',
                                                })}
                                            </Typography>

                                            {/* ✅ FIX: Venue — show name + city, or a clear "No venue" message */}
                                            {venueName || venueCity ? (
                                                <Typography variant="body2" sx={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <LocationIcon fontSize="small" />
                                                    {venueName || 'Venue'}
                                                    {venueCity ? `, ${venueCity}` : ''}
                                                </Typography>
                                            ) : (
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: '#94a3b8',
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

                                            {/* ✅ FIX: Ticket tiers + Sessions counts, side by side */}
                                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                                <Typography variant="body2" sx={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <TicketIcon fontSize="small" />
                                                    {tierCount} ticket tier{tierCount === 1 ? '' : 's'}
                                                </Typography>

                                                <Typography variant="body2" sx={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <ScheduleIcon fontSize="small" />
                                                    {sessionCount} session{sessionCount === 1 ? '' : 's'}
                                                </Typography>
                                            </Box>

                                            {/* Total capacity (only shown when available) */}
                                            {totalCapacity > 0 && (
                                                <Typography variant="caption" sx={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <PeopleIcon sx={{ fontSize: 14 }} />
                                                    {totalCapacity} total capacity
                                                </Typography>
                                            )}
                                        </Box>

                                        {isPast && canManageEvents && (
                                            <Chip
                                                label="PAST EVENT"
                                                size="small"
                                                sx={{ mt: 1, bgcolor: 'rgba(100,116,139,0.1)', color: '#64748b' }}
                                            />
                                        )}
                                    </CardContent>

                                    <Box sx={{ p: 2, pt: 0, borderTop: '1px solid #f1f5f9' }}>
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
                                            {/* View Button - Everyone */}
                                            <Tooltip title="View Details">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleViewEvent(event.id)}
                                                    sx={{ color: '#64748b', minWidth: 40, minHeight: 40 }}
                                                >
                                                    <ViewIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>

                                            {/* Admin/Organizer Actions */}
                                            {canManageEvents && (
                                                <>
                                                    <Tooltip title="Edit">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleEditEvent(event.id)}
                                                            sx={{ color: '#4f46e5', minWidth: 40, minHeight: 40 }}
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
                                                                sx={{ color: '#10b981', minWidth: 40, minHeight: 40 }}
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
                                                                eventTitle: event.title
                                                            })}
                                                            disabled={actionLoading}
                                                            sx={{ color: '#ef4444', minWidth: 40, minHeight: 40 }}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            )}

                                            {/* Regular User - Book Now */}
                                            {isRegularUser && (
                                                <Button
                                                    size="small"
                                                    endIcon={<ArrowForwardIcon />}
                                                    onClick={() => navigate(`/bookings/create?event=${event.id}`)}
                                                    sx={{ color: '#4f46e5', textTransform: 'none', ml: 'auto' }}
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

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteConfirm.open}
                onClose={() => setDeleteConfirm({ open: false, eventId: null, eventTitle: '' })}
            >
                <DialogTitle>Delete Event</DialogTitle>
                <DialogContent>
                    <Typography>
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