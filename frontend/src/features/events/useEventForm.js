// frontend/src/features/events/useEventForm.js
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { EVENT_TYPE, EVENT_CATEGORY, EVENT_STATUS } from '../../constants';
import { formatDateForInput } from '../../utils/datetime';
import { resolveTimezoneDefault } from '../../utils/localeDefaults';

// ✅ No hardcoded timezone. Resolution order:
//    1. explicit `defaultTimezone` argument
//    2. device locale
//    3. env override
//    4. product fallback
//
// ✅ NEW: `defaultOrganizationId` seeds the tenant FK from the
// current OrgContext selection so admins who own exactly one org
// don't have to pick it on every create.
const makeDefaultForm = (defaultTimezone, defaultOrganizationId) => ({
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
    organizer_id: '',
    // ✅ NEW: tenant FK — sent to the backend as `organization_id`.
    organization_id: defaultOrganizationId || '',
});

export const useEventForm = (
    id,
    { defaultTimezone, defaultOrganizationId } = {},
) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState(
        () => makeDefaultForm(defaultTimezone, defaultOrganizationId),
    );
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
                    organizer_id: data.organizer || '',
                    // ✅ NEW: preserve the event's current org on edit.
                    // Falls back to the caller's default org if the
                    // backend response omits it (older fixtures).
                    organization_id:
                        data.organization ||
                        defaultOrganizationId ||
                        '',
                });

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
    }, [id, defaultTimezone, defaultOrganizationId]);

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