// frontend/src/features/events/useEventSubmit.js
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { buildEventPayload } from './eventPayload';

export const useEventSubmit = ({
    id,
    formData,
    sessions,
    tiers,
    // Called right before navigating after a successful save. Used by
    // CreateEvent to clear the sessionStorage draft so the next visit to
    // /app/events/create starts clean.
    onSuccess,
}) => {
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const submit = useCallback(
        async (e, payloadOverride) => {
            if (e && typeof e.preventDefault === 'function') {
                e.preventDefault();
            }
            setSubmitting(true);
            setError('');

            try {
                // An explicit payload override can be supplied by the
                // caller (e.g. seat-map flow) to bypass formData — it is
                // still run through buildEventPayload so all validation /
                // normalisation stays in one place.
                const payload = payloadOverride
                    ? buildEventPayload(payloadOverride, sessions, tiers)
                    : buildEventPayload(formData, sessions, tiers);

                if (id) {
                    await api.put(`/events/${id}/`, payload);
                    toast.success('Event updated successfully!');
                    onSuccess?.();
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
                        // Only clear the draft if the server actually
                        // persisted something — otherwise the user should
                        // be able to retry without re-entering everything.
                        if (persistedId) {
                            onSuccess?.();
                            navigate(`/app/events/${persistedId}/edit`);
                        }
                        return;
                    }

                    toast.success('Event created successfully!');
                    // ✅ Clear the draft now that the create succeeded, so a
                    // subsequent "Create Event" starts from a blank form.
                    onSuccess?.();
                    navigate(`/app/events/${response.data.id}/edit`);
                }
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Submit error:', err);

                const data = err.response?.data;
                let msg = 'Failed to save event';

                // Surface the 409 from the tier/session reconciliation
                // as a readable message.
                if (err.response?.status === 409 && data?.error) {
                    msg = data.error;
                } else if (typeof data === 'string') {
                    msg = data;
                } else if (data && typeof data === 'object') {
                    if (data.error) msg = data.error;
                    else if (data.detail) msg = data.detail;
                    else if (data.message) msg = data.message;
                    else {
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
                setSubmitting(false);
            }
        },
        [id, formData, sessions, tiers, navigate, onSuccess]
    );

    return { submit, submitting, error };
};