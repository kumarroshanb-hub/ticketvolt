// frontend/src/components/Common/EventCard.js
import React from 'react';
import {
    Card, CardContent, CardActions, Button, Chip, Box, Typography,
} from '@mui/material';
import {
    Event as EventIcon,
    LocationOn,
    CalendarToday,
    ShoppingCart,
    AccessTime as TimeIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { theme as appTheme } from '../../theme/tokens';

const C = appTheme.colors;

const formatDateTime = (dateString) => {
    if (!dateString) return { date: 'TBD', time: 'TBD' };
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return { date: 'TBD', time: 'TBD' };
    return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
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

const EventCard = ({ event }) => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();

    const startDateTime = formatDateTime(event.start_date);
    const ticketsAvailable = hasAvailableTickets(event);
    const isBookable = event.status === 'active' && ticketsAvailable;

    const handleBookNow = () => {
        if (!isAuthenticated) {
            toast.info('Please log in to book tickets.');
            navigate('/login', { state: { from: `/bookings/create?event=${event.id}` } });
        } else {
            navigate(`/app/bookings/create?event=${event.id}`);
        }
    };

    return (
        <Card
            sx={{
                background: C.bgCard,
                border: `1px solid ${C.borderLight}`,
                borderRadius: 3,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.3s ease',
                '&:hover': {
                    transform: 'translateY(-4px)',
                    borderColor: C.primary,
                    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
                },
            }}
        >
            <CardContent sx={{ flex: 1, p: 2.5 }}>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
                    <Typography
                        variant="h6"
                        sx={{
                            color: C.textPrimary,
                            fontWeight: 600,
                            mb: 1,
                            minWidth: 0,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        {event.title}
                    </Typography>
                    <Chip
                        label={event.status.toUpperCase()}
                        size="small"
                        color={event.status === 'active' ? 'success' : 'default'}
                        sx={{ fontWeight: 600 }}
                    />
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CalendarToday sx={{ fontSize: 16, color: C.textSecondary }} />
                        <Typography variant="body2" sx={{ color: C.textSecondary }}>
                            {startDateTime.date}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <TimeIcon sx={{ fontSize: 16, color: C.textSecondary }} />
                        <Typography variant="body2" sx={{ color: C.textSecondary }}>
                            {startDateTime.time}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <LocationOn sx={{ fontSize: 16, color: C.textSecondary }} />
                        <Typography variant="body2" sx={{ color: C.textSecondary }} noWrap>
                            {event.venue?.name || 'Online Event'}
                        </Typography>
                    </Box>
                </Box>
            </CardContent>
            <CardActions sx={{ p: 2.5, pt: 0 }}>
                <Button
                    fullWidth
                    variant="contained"
                    onClick={handleBookNow}
                    disabled={!isBookable}
                    startIcon={<ShoppingCart />}
                    sx={{
                        minHeight: 44,
                        background: C.primaryGradient,
                        '&:hover': {
                            background: `linear-gradient(135deg, ${C.primaryDark} 0%, ${C.primaryLight} 100%)`,
                        },
                        textTransform: 'none',
                        fontWeight: 600,
                        color: C.textInverse,
                        '&.Mui-disabled': {
                            background: C.bgInput,
                            color: C.textMuted,
                        }
                    }}
                >
                    {isBookable ? 'Book Tickets' : 'Not Available'}
                </Button>
            </CardActions>
        </Card>
    );
};

export default EventCard;