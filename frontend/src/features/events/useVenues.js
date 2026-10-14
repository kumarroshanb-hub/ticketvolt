// frontend/src/features/events/useVenues.js
import { useEffect, useState } from 'react';
import api from '../../services/api';

export const useVenues = () => {
    const [venues, setVenues] = useState([]);
    useEffect(() => {
        (async () => {
            try {
                const res = await api.get('/venues/');
                setVenues(res.data?.results || res.data || []);
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Failed to load venues:', err);
                setVenues([]);
            }
        })();
    }, []);
    return venues;
};