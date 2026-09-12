// frontend/src/pages/Tickets/TicketView.js
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Alert, Button, useMediaQuery, useTheme } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import Ticket from '../../components/Ticket/E-Ticket';
import api from '../../services/api';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageHeaderLeft,
    PageHeaderRight,
    OutlineButton,
    LoadingWrapper,
} from '../../components/Common';

const TicketView = () => {
    const { ticketId, bookingId } = useParams();
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [ticketData, setTicketData] = useState(null);
    const [bookingData, setBookingData] = useState(null);
    const [eventData, setEventData] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                if (ticketId) {
                    const ticketRes = await api.get(`/tickets/${ticketId}/`);
                    setTicketData(ticketRes.data);

                    const bookingIdFromTicket = ticketRes.data.booking_id || ticketRes.data.booking;
                    if (bookingIdFromTicket) {
                        const bookingRes = await api.get(`/bookings/${bookingIdFromTicket}/`);
                        setBookingData(bookingRes.data);

                        if (bookingRes.data.event_id) {
                            const eventRes = await api.get(`/events/${bookingRes.data.event_id}/`);
                            setEventData(eventRes.data);
                        }
                    }
                }

                if (bookingId && !bookingData) {
                    const bookingRes = await api.get(`/bookings/${bookingId}/`);
                    setBookingData(bookingRes.data);

                    if (bookingRes.data.event_id) {
                        const eventRes = await api.get(`/events/${bookingRes.data.event_id}/`);
                        setEventData(eventRes.data);
                    }

                    if (!ticketData) {
                        const ticketsRes = await api.get(`/bookings/${bookingId}/tickets/`);
                        if (ticketsRes.data.tickets && ticketsRes.data.tickets.length > 0) {
                            setTicketData(ticketsRes.data.tickets[0]);
                        }
                    }
                }

            } catch (error) {
                console.error('Error loading ticket data:', error);
                setError(error.response?.data?.detail || 'Failed to load ticket');
                toast.error('Failed to load ticket');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [ticketId, bookingId]);

    const handleDownload = async (ticket, booking) => {
        try {
            toast.success('Download started!');
            window.print();
        } catch (error) {
            console.error('Download error:', error);
            toast.error('Failed to download ticket');
        }
    };

    const handleEmail = async (ticket, booking) => {
        try {
            await api.post(`/tickets/${ticket.id}/send_email/`, {
                email: booking.customer_email,
            });
            toast.success(`Ticket sent to ${booking.customer_email}`);
        } catch (error) {
            console.error('Email error:', error);
            toast.error('Failed to send ticket');
        }
    };

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: '#4f46e5' }} />
            </LoadingWrapper>
        );
    }

    if (error) {
        return (
            <PageContainer>
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
                <Button
                    variant="contained"
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/bookings')}
                    sx={isMobile ? { width: '100%' } : undefined}
                >
                    Back to Bookings
                </Button>
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>E-Ticket</PageTitle>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton
                        variant="outlined"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => navigate('/bookings')}
                        sx={isMobile ? { width: '100%' } : undefined}
                    >
                        Back
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: isMobile ? 'auto' : 'calc(100vh - 200px)',
                    py: isMobile ? 2 : 4,
                    px: isMobile ? 0 : 2,
                }}
            >
                <Ticket
                    ticket={ticketData}
                    booking={bookingData}
                    event={eventData}
                    showActions={true}
                    onDownload={handleDownload}
                    onEmail={handleEmail}
                    onPrint={() => window.print()}
                />
            </Box>
        </PageContainer>
    );
};

export default TicketView;