// frontend/src/features/events/useEventForm.js
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { EVENT_TYPE, EVENT_CATEGORY, EVENT_STATUS } from '../../constants';
import { formatDateForInput } from '../../utils/datetime';
import { resolveTimezoneDefault } from '../../utils/localeDefaults';

// ---------------------------------------------------------------------------
// Draft persistence
// ---------------------------------------------------------------------------
const DRAFT_KEY_PREFIX = 'event_draft:';
const draftKey = (id) => `${DRAFT_KEY_PREFIX}${id || 'new'}`;

const readDraft = (id) => {
    try {
        const raw = sessionStorage.getItem(draftKey(id));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
};

const writeDraft = (id, payload) => {
    try {
        sessionStorage.setItem(draftKey(id), JSON.stringify(payload));
    } catch {
        // Quota / private-mode failures are non-fatal.
    }
};

const clearDraftFor = (id) => {
    try {
        sessionStorage.removeItem(draftKey(id));
    } catch {
        // ignore
    }
};

// Derive single-day from a pair of ISO / 'YYYY-MM-DDTHH:mm' strings.
const deriveSingleDay = (start, end) => {
    if (!start || !end) return false;
    return String(start).slice(0, 10) === String(end).slice(0, 10);
};

// ✅ `is_single_day` added to the default form so:
//    - Create mode starts with an explicit boolean.
//    - Draft restore merges cleanly without the field being `undefined`.
//    - Edit mode loader (below) overwrites it from the API.
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
    is_single_day: false,
    timezone: defaultTimezone || resolveTimezoneDefault(),
    status: EVENT_STATUS.DRAFT,
    is_public: true,
    donations_enabled: false,
    ask_course_question: false,
    privacy_notice_text: '',
    marketing_opt_in_enabled: false,
    public_page_enabled: true,
    duration_minutes: 120,
    checkin_opens_minutes_before: 30,
    map_url: '',
    faqs: [],
    title_zh: '',
    short_description_zh: '',
    description_zh: '',
    faqs_zh: [],
    donation_presets: [],
    donation_contact_text: '',
    show_bilingual_content: false,
    feedback_enabled: false,
    feedback_title: 'Share your feedback',
    feedback_intro: '',
    feedback_questions: [],
    highlights: [],
    age_info: '',
    door_time: '',
    parking_info: '',
    refund_policy: '',
    accessibility_info: '',
    ticket_format: 'pdf',
    combine_tickets: false,
    tickets_per_page: 4,
    cancellation_policy_id: '',
    cancellation_policy_text: '',
    cancellation_reason: '',
    organizer_id: '',
    organization_id: defaultOrganizationId || '',
});

export const useEventForm = (
    id,
    { defaultTimezone, defaultOrganizationId, resumeDraft = true } = {},
) => {
    const [loading, setLoading] = useState(false);

    // Read the draft ONCE at mount — only in create mode AND only when the
    // caller opts in. This lets the "Create a new venue → return here"
    // round-trip resume the draft, while a normal visit to
    // /app/events/create starts blank.
    const [initialDraft] = useState(() => {
        if (id) return null;
        if (!resumeDraft) return null;
        return readDraft(null);
    });

    const [formData, setFormData] = useState(() => {
        const base = makeDefaultForm(defaultTimezone, defaultOrganizationId);
        if (id) return base;
        return initialDraft?.formData
            ? { ...base, ...initialDraft.formData }
            : base;
    });

    const [sessions, setSessions] = useState(() => {
        if (id) return [];
        return Array.isArray(initialDraft?.sessions) ? initialDraft.sessions : [];
    });

    const [tiers, setTiers] = useState(() => {
        if (id) return [];
        return Array.isArray(initialDraft?.tiers) ? initialDraft.tiers : [];
    });

    const handleChange = useCallback((e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    }, []);

    const addSession = useCallback(
        () => setSessions((prev) => [
            ...prev,
            { start_time: '', end_time: '', capacity: 100 },
        ]),
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

    // Persist draft only in create mode.
    useEffect(() => {
        if (id) return;
        writeDraft(null, { formData, sessions, tiers });
    }, [id, formData, sessions, tiers]);

    const clearDraft = useCallback(() => {
        clearDraftFor(id || null);
    }, [id]);

    // Reset the form to defaults. Useful after a successful create, or when
    // the user explicitly starts fresh. Also wipes the persisted draft.
    const resetForm = useCallback(() => {
        setFormData(makeDefaultForm(defaultTimezone, defaultOrganizationId));
        setSessions([]);
        setTiers([]);
        clearDraftFor(id || null);
    }, [defaultTimezone, defaultOrganizationId, id]);

    // Edit-mode loader.
    useEffect(() => {
        if (!id) return;
        (async () => {
            setLoading(true);
            try {
                const { data } = await api.get(`/events/${id}/`);

                const startForInput = formatDateForInput(data.start_date);
                const endForInput = formatDateForInput(data.end_date);

                // Prefer explicit API field; fall back to date derivation
                // so legacy rows without `is_single_day` still behave.
                const singleDayFromApi =
                    typeof data.is_single_day === 'boolean'
                        ? data.is_single_day
                        : deriveSingleDay(startForInput, endForInput);

                setFormData({
                    title: data.title || '',
                    description: data.description || '',
                    short_description: data.short_description || '',
                    event_type: data.event_type || EVENT_TYPE.SINGLE,
                    category: data.category || EVENT_CATEGORY.OTHER,
                    event_flow: data.event_flow || 'ticketed',
                    venue_id: data.venue?.id || '',
                    start_date: startForInput,
                    end_date: endForInput,
                    is_single_day: singleDayFromApi,
                    timezone:
                        data.timezone ||
                        defaultTimezone ||
                        resolveTimezoneDefault(),
                    status: data.status || EVENT_STATUS.DRAFT,
                    is_public: data.is_public !== undefined ? data.is_public : true,
                    donations_enabled: data.donations_enabled !== undefined ? data.donations_enabled : false,
                    ask_course_question: data.ask_course_question !== undefined ? data.ask_course_question : false,
                    privacy_notice_text: data.privacy_notice_text || '',
                    marketing_opt_in_enabled: data.marketing_opt_in_enabled !== undefined ? data.marketing_opt_in_enabled : false,
                    public_page_enabled: data.public_page_enabled !== undefined ? data.public_page_enabled : true,
                    duration_minutes: data.duration_minutes || 120,
                    checkin_opens_minutes_before: data.checkin_opens_minutes_before ?? 30,
                    map_url: data.map_url || '',
                    faqs: data.faqs || [],
                    title_zh: data.title_zh || '',
                    short_description_zh: data.short_description_zh || '',
                    description_zh: data.description_zh || '',
                    faqs_zh: data.faqs_zh || [],
                    donation_presets: data.donation_presets || [],
                    donation_contact_text: data.donation_contact_text || '',
                    show_bilingual_content: data.show_bilingual_content === true,
                    feedback_enabled: data.feedback_enabled === true,
                    feedback_title: data.feedback_title || 'Share your feedback',
                    feedback_intro: data.feedback_intro || '',
                    feedback_questions: data.feedback_questions || [],
                    highlights: data.highlights || [],
                    age_info: data.age_info || '',
                    door_time: data.door_time || '',
                    parking_info: data.parking_info || '',
                    refund_policy: data.refund_policy || '',
                    accessibility_info: data.accessibility_info || '',
                    ticket_format: data.ticket_format || 'pdf',
                    combine_tickets: data.combine_tickets || false,
                    tickets_per_page: data.tickets_per_page || 4,
                    cancellation_policy_id: data.cancellation_policy?.id || '',
                    cancellation_policy_text: data.cancellation_policy_text || '',
                    cancellation_reason: data.cancellation_reason || '',
                    organizer_id: data.organizer || '',
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
        clearDraft,
        resetForm,
    };
};