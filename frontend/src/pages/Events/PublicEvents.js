// frontend/src/pages/Events/PublicEvents.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Container,
    Typography,
    Grid,
    Card,
    CardContent,
    CardActions,
    Button,
    Chip,
    CircularProgress,
    Alert,
    Paper,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import {
    Event as EventIcon,
    LocationOn,
    CalendarToday,
    ShoppingCart,
    Refresh as RefreshIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { PageContainer, PageTitle, OutlineButton, LoadingWrapper } from '../../components/Common';
import { useRole } from '../../context/RoleContext';
import { ROLES } from '../../constants';

const PublicEvents = () => {
    const navigate = useNavigate();
    const { role } = useRole();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
    const isOrganizer = role === ROLES.ORGANIZER;
    const canManageEvents = isAdmin || isOrganizer;
    const isRegularUser = role === ROLES.USER;

    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadEvents();
    }, []);

    const loadEvents = async () => {
        setLoading(true);
        setError(null);
        try {
            let data = [];

            console.log('📅 Loading events for PublicEvents, role:', role);

            if (canManageEvents) {
                console.log('📅 Admin/Organizer: Loading ALL events from /events/');
                const response = await api.get('/events/');

                if (Array.isArray(response.data)) {
                    data = response.data;
                } else if (response.data && response.data.results) {
                    data = response.data.results;
                } else if (response.data && typeof response.data === 'object') {
                    data = Object.values(response.data).filter(item => item.id && item.title);
                }

                console.log(`📅 Found ${data.length} events (including drafts)`);
            } else {
                console.log('📅 Regular user: Loading events from /events/public/');
                const response = await api.get('/events/public/');
                console.log('📅 Public response:', response.data);

                if (response.data && response.data.results) {
                    data = response.data.results;
                } else if (Array.isArray(response.data)) {
                    data = response.data;
                } else if (response.data && typeof response.data === 'object') {
                    data = Object.values(response.data).filter(item => item.id && item.title);
                }

                data = data.filter((e) => {
                    const status = e.status || 'draft';
                    return status === 'active' || status === 'published';
                });

                console.log(`📅 Found ${data.length} active events`);

                if (data.length === 0) {
                    console.log('📅 No events from public, trying admin endpoint as fallback...');
                    try {
                        const fallbackResponse = await api.get('/events/');

                        if (Array.isArray(fallbackResponse.data)) {
                            data = fallbackResponse.data;
                        } else if (fallbackResponse.data && fallbackResponse.data.results) {
                            data = fallbackResponse.data.results;
                        }

                        data = data.filter((e) => {
                            const status = e.status || 'draft';
                            return status === 'active' || status === 'published';
                        });

                        console.log(`📅 Fallback found ${data.length} active events`);
                    } catch (fallbackError) {
                        console.log('📅 Fallback failed:', fallbackError.message);
                    }
                }
            }

            setEvents(data);

            if (data.length === 0) {
                setError(
                    canManageEvents
                        ? 'No events found. Create an event first!'
                        : 'No active events available for booking. Check back later!'
                );
            }

        } catch (error) {
            console.error('❌ Error loading events:', error);

            let errorMsg = 'Failed to load events. Please try again.';
            if (error.response?.status === 404) {
                errorMsg = 'Events endpoint not found. Please check the backend.';
            } else if (error.response?.status === 401 || error.response?.status === 403) {
                errorMsg = 'Authentication required. Please log in again.';
            } else if (error.message) {
                errorMsg = error.message;
            }

            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleBookNow = (eventId) => {
        navigate(`/bookings/create?event=${eventId}`);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'TBD';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            });
        } catch {
            return 'TBD';
        }
    };

    const formatTime = (dateString) => {
        if (!dateString) return 'TBD';
        try {
            const date = new Date(dateString);
            return date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return 'TBD';
        }
    };

    const hasAvailableTickets = (event) => {
        if (!event.tiers || !Array.isArray(event.tiers) || event.tiers.length === 0) {
            return false;
        }

        return event.tiers.some(tier => {
            const total = tier.quantity_total || 0;
            const sold = tier.quantity_sold || 0;
            return (total - sold) > 0;
        });
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
            <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 3 } }}>
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                        justifyContent: 'space-between',
                        alignItems: isMobile ? 'stretch' : 'center',
                        mb: 4,
                        gap: 2,
                    }}
                >
                    <Box sx={{ minWidth: 0 }}>
                        <PageTitle variant="h4" sx={{ fontSize: isMobile ? '1.5rem' : '2rem' }}>
                            {canManageEvents ? 'All Events' : '🎫 Book Tickets'}
                        </PageTitle>
                        <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: isMobile ? '0.85rem' : '0.875rem' }}>
                            {canManageEvents
                                ? 'Manage and book tickets for all events'
                                : 'Browse and book tickets for upcoming events'}
                        </Typography>
                    </Box>
                    <OutlineButton
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadEvents}
                        sx={isMobile ? { width: '100%' } : undefined}
                    >
                        Refresh
                    </OutlineButton>
                </Box>

                {error && (
                    <Alert
                        severity="info"
                        sx={{
                            mb: 3,
                            bgcolor: 'rgba(59,130,246,0.1)',
                            color: '#60a5fa',
                            border: '1px solid rgba(59,130,246,0.2)',
                        }}
                    >
                        {error}
                        <Button
                            size="small"
                            onClick={loadEvents}
                            sx={{ ml: 2, color: '#60a5fa' }}
                        >
                            Retry
                        </Button>
                    </Alert>
                )}

                {events.length === 0 && !error ? (
                    <Paper sx={{
                        p: 4,
                        textAlign: 'center',
                        bgcolor: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 3,
                    }}>
                        <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                            No events available
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1 }}>
                            {canManageEvents
                                ? 'Create an event first to get started!'
                                : 'Check back later for upcoming events'}
                        </Typography>
                    </Paper>
                ) : (
                    <Grid container spacing={isMobile ? 2 : 3}>
                        {events.map((event) => {
                            const isActive = event.status === 'active' || event.status === 'published';
                            const isDraft = event.status === 'draft';
                            const ticketsAvailable = hasAvailableTickets(event);
                            const isBookable = canManageEvents || (isActive && ticketsAvailable);

                            return (
                                <Grid item xs={12} sm={6} md={4} key={event.id}>
                                    <Card sx={{
                                        bgcolor: 'rgba(255,255,255,0.02)',
                                        border: isDraft ? '1px dashed rgba(255,200,0,0.3)' : '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: 3,
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        transition: 'all 0.3s ease',
                                        opacity: isDraft && !canManageEvents ? 0.5 : 1,
                                        '&:hover': {
                                            transform: isBookable ? 'translateY(-4px)' : 'none',
                                            borderColor: isBookable ? 'rgba(91,95,239,0.3)' : 'rgba(255,255,255,0.06)',
                                            boxShadow: isBookable ? '0 0 40px rgba(91, 95, 239, 0.1)' : 'none',
                                        }
                                    }}>
                                        <CardContent sx={{ flex: 1, p: isMobile ? 1.5 : 2, '&:last-child': { pb: isMobile ? 1.5 : 2 } }}>
                                            <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
                                                <Typography
                                                    variant="h6"
                                                    sx={{
                                                        color: 'white',
                                                        fontWeight: 600,
                                                        mb: 1,
                                                        minWidth: 0,
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical',
                                                        overflow: 'hidden',
                                                        fontSize: isMobile ? '1rem' : '1.25rem',
                                                    }}
                                                >
                                                    {event.title}
                                                </Typography>
                                                <Chip
                                                    label={isDraft ? 'DRAFT' : (event.status?.toUpperCase() || 'ACTIVE')}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: isDraft ? 'rgba(255,200,0,0.15)' :
                                                            event.status === 'active' ? 'rgba(34,197,94,0.15)' :
                                                                'rgba(59,130,246,0.15)',
                                                        color: isDraft ? '#fbbf24' :
                                                            event.status === 'active' ? '#22c55e' :
                                                                '#60a5fa',
                                                        border: '1px solid rgba(255,255,255,0.06)',
                                                        fontSize: '10px',
                                                        height: '20px',
                                                        flexShrink: 0,
                                                    }}
                                                />
                                            </Box>

                                            {event.short_description && (
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: 'rgba(255,255,255,0.6)',
                                                        mb: 2,
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 3,
                                                        WebkitBoxOrient: 'vertical',
                                                        overflow: 'hidden',
                                                        fontSize: isMobile ? '0.8rem' : '0.875rem',
                                                    }}
                                                >
                                                    {event.short_description}
                                                </Typography>
                                            )}

                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <CalendarToday sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                                        {formatDate(event.start_date)}
                                                    </Typography>
                                                </Box>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <EventIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                                        {formatTime(event.start_date)}
                                                    </Typography>
                                                </Box>
                                                {event.venue && (
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <LocationOn sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {event.venue.name || event.venue.city || 'TBD'}
                                                        </Typography>
                                                    </Box>
                                                )}
                                            </Box>

                                            <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
                                                <Chip
                                                    label={`${event.total_tickets_sold || 0} sold`}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: 'rgba(255,255,255,0.05)',
                                                        color: 'rgba(255,255,255,0.6)',
                                                        border: '1px solid rgba(255,255,255,0.06)',
                                                    }}
                                                />
                                                {event.tiers && event.tiers.length > 0 && (
                                                    <Chip
                                                        label={`${event.tiers.length} tiers`}
                                                        size="small"
                                                        sx={{
                                                            bgcolor: 'rgba(91,95,239,0.15)',
                                                            color: '#8B5CF6',
                                                            border: '1px solid rgba(255,255,255,0.06)',
                                                        }}
                                                    />
                                                )}
                                                {!ticketsAvailable && isActive && (
                                                    <Chip
                                                        label="Sold Out"
                                                        size="small"
                                                        sx={{
                                                            bgcolor: 'rgba(239,68,68,0.15)',
                                                            color: '#ef4444',
                                                            border: '1px solid rgba(255,255,255,0.06)',
                                                        }}
                                                    />
                                                )}
                                            </Box>
                                        </CardContent>

                                        <CardActions sx={{ p: isMobile ? 1.5 : 2, pt: 0, mt: 'auto' }}>
                                            <Button
                                                fullWidth
                                                variant="contained"
                                                onClick={() => handleBookNow(event.id)}
                                                disabled={!isBookable}
                                                startIcon={<ShoppingCart />}
                                                sx={{
                                                    minHeight: 44,
                                                    background: isBookable
                                                        ? 'linear-gradient(135deg, #5B5FEF 0%, #8B5CF6 100%)'
                                                        : 'rgba(255,255,255,0.05)',
                                                    '&:hover': {
                                                        background: isBookable
                                                            ? 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)'
                                                            : 'rgba(255,255,255,0.05)',
                                                        transform: isBookable ? 'translateY(-2px)' : 'none',
                                                    },
                                                    textTransform: 'none',
                                                    fontWeight: 600,
                                                    borderRadius: 2,
                                                    color: isBookable ? 'white' : 'rgba(255,255,255,0.3)',
                                                }}
                                            >
                                                {isBookable ? 'Book Tickets' : 'Not Available'}
                                            </Button>
                                        </CardActions>
                                    </Card>
                                </Grid>
                            );
                        })}
                    </Grid>
                )}
            </Container>
        </PageContainer>
    );
};

export default PublicEvents;