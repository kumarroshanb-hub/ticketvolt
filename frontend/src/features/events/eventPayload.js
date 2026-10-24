// frontend/src/features/events/eventPayload.js
import { inputToIso } from '../../utils/datetime';
import { EVENT_TYPE, EVENT_CATEGORY, EVENT_STATUS } from '../../constants';

export const buildEventPayload = (formData, sessions, tiers) => {
    const flow = formData.event_flow || 'ticketed';
    const isFree = flow === 'free_registration';

    // ✅ FIX: Check if any tiers have sold tickets.
    // If they do, we CANNOT send an empty array to the backend, or it will
    // attempt to delete the tier and hit the 409 Conflict safety check.
    const hasSoldTiers = (tiers || []).some((t) => (t.quantity_sold || 0) > 0);
    const shouldDropTiers = isFree && !hasSoldTiers;

    return {
        title: formData.title,
        description: formData.description || '',
        short_description: formData.short_description || '',
        event_type: formData.event_type || EVENT_TYPE.SINGLE,
        category: formData.category || EVENT_CATEGORY.OTHER,
        event_flow: flow,
        venue_id: formData.venue_id || null,
        start_date: inputToIso(formData.start_date),
        end_date: inputToIso(formData.end_date),
        timezone: formData.timezone || 'Asia/Kolkata',
        status: formData.status || EVENT_STATUS.DRAFT,
        is_public: formData.is_public !== undefined ? formData.is_public : true,
        ticket_format: formData.ticket_format || 'pdf',
        combine_tickets: formData.combine_tickets || false,
        tickets_per_page: formData.tickets_per_page || 4,
        cancellation_policy_id: formData.cancellation_policy_id || null,
        cancellation_policy_text: formData.cancellation_policy_text || '',
        sessions: (sessions || []).map((s) => ({
            // ✅ Pass the ID if it exists so the backend knows this is an update.
            ...(s.id ? { id: s.id } : {}),
            start_time: inputToIso(s.start_time),
            end_time: inputToIso(s.end_time),
            capacity: parseInt(s.capacity, 10) || 100,
        })),
        // For free registrations, only drop tiers if none are sold.
        tiers: shouldDropTiers
            ? []
            : (tiers || []).map((t) => ({
                // ✅ Pass the ID if it exists for tiers as well.
                ...(t.id ? { id: t.id } : {}),
                name: t.name || 'General',
                price: parseFloat(t.price) || 0,
                quantity_total: parseInt(t.quantity_total, 10) || 100,
                ticket_type: t.ticket_type || 'ga',
            })),
    };
};