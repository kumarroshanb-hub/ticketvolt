// frontend/src/features/events/useEventForm.js
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { EVENT_TYPE, EVENT_CATEGORY, EVENT_STATUS } from '../../constants';
import { formatDateForInput } from '../../utils/datetime';
import { resolveTimezoneDefault } from '../../utils/localeDefaults';

// ✅ No hardcoded timezone. Resolution order:
//    1. explicit `defaultTimezone` argument (platform setting from
//       useSettings().settings.default_timezone)
//    2. device locale
//    3. env override
//    4. product fallback
const makeDefaultForm = (defaultTimezone) => ({
    title: '',
    description: '',
    short_description: '',
    event_type: EVENT_TYPE.SINGLE,
    category: EVENT_CATEGORY.OTHER,
    event_flow: 'ticketed',
    venue_id: '',
    start_date: '',
    end_date: '',
    timezone: defaultTimezone || resolveTimezoneDefault(),
    status: EVENT_STATUS.DRAFT,
    is_public: true,
    ticket_format: 'pdf',
    combine_tickets: false,
    tickets_per_page: 4,
    cancellation_policy_id: '',
    cancellation_policy_text: '',
    // ✅ NEW: organizer assignment (admin-only; organizers leave blank)
    organizer_id: '',
});

export const useEventForm = (id, { defaultTimezone } = {}) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState(() => makeDefaultForm(defaultTimezone));
    const [sessions, setSessions] = useState([]);
    const [tiers, setTiers] = useState([]);

    const handleChange = useCallback((e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    }, []);

    const addSession = useCallback(
        () => setSessions((prev) => [...prev, { start_time: '', end_time: '', capacity: 100 }]),
        []
    );

    const removeSession = useCallback(
        (index) => setSessions((prev) => prev.filter((_, i) => i !== index)),
        []
    );

    const updateSession = useCallback((index, field, value) => {
        setSessions((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    }, []);

    const addTier = useCallback(
        () =>
            setTiers((prev) => [
                ...prev,
                { name: '', price: 0, quantity_total: 100, ticket_type: 'ga' },
            ]),
        []
    );

    const removeTier = useCallback(
        (index) => setTiers((prev) => prev.filter((_, i) => i !== index)),
        []
    );

    const updateTier = useCallback((index, field, value) => {
        setTiers((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    }, []);

    useEffect(() => {
        if (!id) return;
        (async () => {
            setLoading(true);
            try {
                const { data } = await api.get(`/events/${id}/`);
                setFormData({
                    title: data.title || '',
                    description: data.description || '',
                    short_description: data.short_description || '',
                    event_type: data.event_type || EVENT_TYPE.SINGLE,
                    category: data.category || EVENT_CATEGORY.OTHER,
                    event_flow: data.event_flow || 'ticketed',
                    venue_id: data.venue?.id || '',
                    start_date: formatDateForInput(data.start_date),
                    end_date: formatDateForInput(data.end_date),
                    // ✅ If the API returns a timezone, honor it. If not,
                    // resolve the platform default (settings → device → env
                    // → fallback) instead of forcing a hardcoded one.
                    timezone:
                        data.timezone ||
                        defaultTimezone ||
                        resolveTimezoneDefault(),
                    status: data.status || EVENT_STATUS.DRAFT,
                    is_public: data.is_public !== undefined ? data.is_public : true,
                    ticket_format: data.ticket_format || 'pdf',
                    combine_tickets: data.combine_tickets || false,
                    tickets_per_page: data.tickets_per_page || 4,
                    cancellation_policy_id: data.cancellation_policy?.id || '',
                    cancellation_policy_text: data.cancellation_policy_text || '',
                    // ✅ NEW: seed the current owner so the admin picker
                    // shows who currently owns the event.
                    organizer_id: data.organizer || '',
                });

                // ✅ FIX: Explicitly preserve the session ID to prevent the backend
                // from assuming it was deleted and attempting a deletion.
                setSessions(
                    (data.sessions || []).map((s) => ({
                        id: s.id,
                        start_time: formatDateForInput(s.start_time),
                        end_time: formatDateForInput(s.end_time),
                        capacity: s.capacity,
                        is_active: s.is_active !== false,
                    }))
                );

                setTiers(data.tiers || []);
            } catch (err) {
                toast.error('Failed to load event');
                console.error('Load error:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, [id, defaultTimezone]);

    return {
        loading,
        formData,
        setFormData,
        handleChange,
        sessions,
        addSession,
        removeSession,
        updateSession,
        tiers,
        addTier,
        removeTier,
        updateTier,
    };
};