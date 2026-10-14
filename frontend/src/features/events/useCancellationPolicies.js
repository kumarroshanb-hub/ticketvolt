// frontend/src/features/events/useCancellationPolicies.js
import { useEffect, useState } from 'react';
import api from '../../services/api';

export const useCancellationPolicies = () => {
    const [policies, setPolicies] = useState([]);
    useEffect(() => {
        (async () => {
            try {
                const res = await api.get('/cancellation-policies/');
                setPolicies(res.data?.results || res.data || []);
            } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('Failed to load cancellation policies:', err?.message);
                setPolicies([]);
            }
        })();
    }, []);
    return policies;
};