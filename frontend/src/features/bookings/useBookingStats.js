// frontend/src/features/bookings/useBookingStats.js
import { useMemo } from 'react';
import { BOOKING_STATUS } from '../../constants';

export const useBookingStats = (bookings) =>
    useMemo(() => {
        const count = (status) => bookings.filter((b) => b.status === status).length;
        return {
            total: bookings.length,
            pending: count(BOOKING_STATUS.PENDING),
            confirmed: count(BOOKING_STATUS.CONFIRMED),
            completed: count(BOOKING_STATUS.COMPLETED),
            cancelled: count(BOOKING_STATUS.CANCELLED),
            refunded: count(BOOKING_STATUS.REFUNDED),
        };
    }, [bookings]);