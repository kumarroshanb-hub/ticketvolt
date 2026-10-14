// frontend/src/features/bookings/useBookings.js
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';

const normalizeBookings = (data) => {
    if (Array.isArray(data)) return data;
    if (data?.results) return data.results;
    if (data && typeof data === 'object') {
        return Object.values(data).filter((item) => item?.id && item?.booking_reference);
    }
    return [];
};

export const useBookings = () => {
    const { user } = useAuth();
    const { role } = useRole();

    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadBookings = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get('/bookings/');
            const data = normalizeBookings(response.data);
            setBookings(data);
        } catch (err) {
            const msg =
                err.response?.data?.detail ||
                err.response?.data?.error ||
                err.message ||
                'Failed to load bookings';
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadBookings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { bookings, loading, error, loadBookings, user, role };
};