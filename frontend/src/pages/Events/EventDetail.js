// frontend/src/pages/Events/EventDetail.js
import React, { useState, useEffect } from 'react';
import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
    Chip,
    IconButton,
    Button,
    Divider,
    CircularProgress,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon,
    LocationOn as LocationIcon,
    CalendarToday as CalendarIcon,
    People as PeopleIcon,
    ConfirmationNumber as TicketIcon,
    AttachMoney as MoneyIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
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

// ✅ Import shared constants
import {
    EVENT_STATUS,
    EVENT_STATUS_LABELS,
    EventStatusUtils,
} from '../../constants';

const EventDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
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
        }
        setLoading(false);
    };

    useEffect(() => {
        if (id) loadEvent();
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

    const handleEdit = () => {
        navigate(`/events/${id}/edit`);
    };

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: '#4f46e5' }} />
            </LoadingWrapper>
        );
    }

    if (!event) {
        return (
            <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography sx={{ color: '#94a3b8' }}>Event not found</Typography>
                <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/events')}>
                    Back to Events
                </Button>
            </Box>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <IconButton onClick={() => navigate('/events')} sx={{ color: '#64748b' }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Box sx={{ minWidth: 0 }}>
                        <PageTitle variant="h5" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {event.title}
                        </PageTitle>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
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
                {/* Event Details */}
                <Grid item xs={12} md={8}>
                    <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0', mb: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: '#4f46e5', fontWeight: 600, mb: 2 }}>
                                Event Details
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {event.description || 'No description provided'}
                            </Typography>
                        </CardContent>
                    </Card>

                    {/* Sessions */}
                    {event.sessions && event.sessions.length > 0 && (
                        <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
                            <CardContent>
                                <Typography variant="subtitle2" sx={{ color: '#4f46e5', fontWeight: 600, mb: 2 }}>
                                    Sessions ({event.sessions.length})
                                </Typography>
                                {/* Session list */}
                            </CardContent>
                        </Card>
                    )}
                </Grid>

                {/* Sidebar */}
                <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0', mb: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: '#4f46e5', fontWeight: 600, mb: 2 }}>
                                Summary
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: '#64748b' }}>Tickets Sold</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                        {event.total_tickets_sold || 0}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: '#64748b' }}>Total Revenue</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                        ₹{event.total_revenue?.toLocaleString() || 0}
                                    </Typography>
                                </Box>
                                <Divider />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: '#64748b' }}>Bookings</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                        {event.total_bookings || 0}
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>

                    <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: '#4f46e5', fontWeight: 600, mb: 2 }}>
                                Location
                            </Typography>
                            {event.venue ? (
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                        {event.venue.name}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                                        {event.venue.city}, {event.venue.state}
                                    </Typography>
                                </Box>
                            ) : (
                                <Typography variant="body2" sx={{ color: '#94a3b8' }}>
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