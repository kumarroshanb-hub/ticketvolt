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
            if (e && typeof e.preventDefault === 'function') {
                e.preventDefault();
            }
            setSubmitting(true);
            setError('');

            try {
                if (!formData.title) {
                    setError('Title is required');
                    toast.error('Title is required');
                    return;
                }
                if (!formData.start_date) {
                    setError('Start date is required');
                    toast.error('Start date is required');
                    return;
                }
                if (!formData.end_date) {
                    setError('End date is required');
                    toast.error('End date is required');
                    return;
                }

                const payload = buildEventPayload(formData, sessions, tiers);

                if (id) {
                    await api.put(`/events/${id}/`, payload);
                    toast.success('Event updated successfully!');
                    navigate('/app/events');
                } else {
                    const response = await api.post('/events/', payload);

                    if (!response.data || !response.data.id) {
                        const detail =
                            response.data?.error ||
                            response.data?.detail ||
                            'The server returned an unexpected response.';
                        setError(detail);
                        toast.error(detail);

                        const persistedId =
                            response.data?.event_id ||
                            response.data?.eventId ||
                            null;
                        if (persistedId) {
                            navigate(`/app/events/${persistedId}/edit`);
                        } else {
                            navigate('/app/events');
                        }
                        return;
                    }

                    toast.success('Event created successfully!');
                    navigate(`/app/events/${response.data.id}/edit`);
                }
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Submit error:', err);

                const data = err.response?.data;
                let msg = 'Failed to save event';

                // ✅ FIX [P18]: surface the new 409 from the tier/
                // session reconciliation as a readable message. The
                // backend refuses to delete a sold tier/session; without
                // this branch the operator got a generic "Failed to
                // save event" and had no idea why.
                if (err.response?.status === 409 && data?.error) {
                    msg = data.error;
                } else if (typeof data === 'string') {
                    msg = data;
                } else if (data && typeof data === 'object') {
                    if (data.error) msg = data.error;
                    else if (data.detail) msg = data.detail;
                    else if (data.message) msg = data.message;
                    else {
                        // First key's first message (common for field errors).
                        const firstKey = Object.keys(data)[0];
                        if (firstKey) {
                            const firstVal = data[firstKey];
                            msg = Array.isArray(firstVal)
                                ? `${firstKey}: ${firstVal[0]}`
                                : `${firstKey}: ${String(firstVal)}`;
                        }
                    }
                } else if (err.message) {
                    msg = err.message;
                }

                setError(msg);
                toast.error(msg);
            } finally {
                // ✅ Guaranteed to run, even if navigate() throws.
                setSubmitting(false);
            }
        },
        [id, formData, sessions, tiers, navigate]
    );

    return { submit, submitting, error };
};