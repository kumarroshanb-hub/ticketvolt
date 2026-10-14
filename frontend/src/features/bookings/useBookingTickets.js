// frontend/src/features/bookings/useBookingTickets.js
import { useCallback, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';

export const useBookingTickets = () => {
    const [eticketOpen, setEticketOpen] = useState(false);
    const [eticketData, setEticketData] = useState({
        tickets: [],
        booking: null,
        event: null,
    });

    const fetchTickets = useCallback(async (booking) => {
        try {
            const response = await api.get(`/bookings/${booking.id}/tickets/`);
            return response.data.tickets || [];
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Error fetching tickets:', err);
            return [];
        }
    }, []);

    const handleViewETicket = useCallback(
        async (booking) => {
            try {
                const tickets = await fetchTickets(booking);
                if (tickets.length === 0) {
                    toast.warning('No tickets found for this booking');
                    return;
                }

                const eventId = booking.event_id || booking.event?.id;
                if (!eventId) {
                    toast.error('Event not found for this booking');
                    return;
                }

                const eventRes = await api.get(`/events/${eventId}/`);
                setEticketData({ tickets, booking, event: eventRes.data });
                setEticketOpen(true);
            } catch (err) {
                toast.error(err.response?.data?.error || 'Failed to load e-ticket');
            }
        },
        [fetchTickets]
    );

    const handleSendEmail = useCallback(async (booking) => {
        try {
            const response = await api.post(`/bookings/${booking.id}/resend_tickets/`);
            const formatInfo = response.data?.formats ? ` (${response.data.formats})` : '';
            const attachInfo = response.data?.attachments
                ? ` — ${response.data.attachments} attachment(s)`
                : '';
            toast.success(
                `Tickets sent to ${booking.customer_email}${formatInfo}${attachInfo}`
            );
        } catch (err) {
            toast.error(
                err.response?.data?.error ||
                    err.response?.data?.detail ||
                    err.message ||
                    'Failed to send ticket email'
            );
        }
    }, []);

    const closeETicket = useCallback(() => setEticketOpen(false), []);

    return {
        eticketOpen,
        eticketData,
        handleViewETicket,
        handleSendEmail,
        closeETicket,
    };
};