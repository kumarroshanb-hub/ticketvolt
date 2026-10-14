// frontend/src/features/events/useEventSubmit.js
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { buildEventPayload } from './eventPayload';

export const useEventSubmit = ({ id, formData, sessions, tiers }) => {
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const submit = useCallback(
        async (e) => {
            e.preventDefault();
            setSubmitting(true);
            setError('');

            try {
                if (!formData.title) {
                    setError('Title is required');
                    return;
                }
                if (!formData.start_date) {
                    setError('Start date is required');
                    return;
                }
                if (!formData.end_date) {
                    setError('End date is required');
                    return;
                }

                const payload = buildEventPayload(formData, sessions, tiers);

                if (id) {
                    await api.put(`/events/${id}/`, payload);
                    toast.success('Event updated successfully!');
                    navigate('/events');
                } else {
                    const response = await api.post('/events/', payload);
                    toast.success('Event created successfully!');
                    navigate(`/events/${response.data.id}/edit`);
                }
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Submit error:', err);
                const msg =
                    err.response?.data?.message ||
                    err.response?.data?.error ||
                    err.message ||
                    'Failed to save event';
                setError(msg);
                toast.error(msg);
            } finally {
                setSubmitting(false);
            }
        },
        [id, formData, sessions, tiers, navigate]
    );

    return { submit, submitting, error };
};