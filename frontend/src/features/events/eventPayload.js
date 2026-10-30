// frontend/src/features/events/eventPayload.js
import { inputToIso } from '../../utils/datetime';
import { EVENT_TYPE, EVENT_CATEGORY, EVENT_STATUS } from '../../constants';

export const buildEventPayload = (formData, sessions, tiers) => {
    const flow = formData.event_flow || 'ticketed';
    const isFree = flow === 'free_registration';

    // Free registrations cannot have priced tiers. But if the event
    // already has sold tiers (converting from ticketed), we must NOT
    // send an empty array — that would trigger the 409 guard.
    const hasSoldTiers = (tiers || []).some((t) => (t.quantity_sold || 0) > 0);
    const shouldDropTiers = isFree && !hasSoldTiers;

    const payload = {
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
            ...(s.id ? { id: s.id } : {}),
            start_time: inputToIso(s.start_time),
            end_time: inputToIso(s.end_time),
            capacity: parseInt(s.capacity, 10) || 100,
        })),
        tiers: shouldDropTiers
            ? []
            : (tiers || []).map((t) => ({
                ...(t.id ? { id: t.id } : {}),
                name: t.name || 'General',
                price: parseFloat(t.price) || 0,
                quantity_total: parseInt(t.quantity_total, 10) || 100,
                ticket_type: t.ticket_type || 'ga',
            })),
    };

    // ✅ NEW: multi-tenancy — the event must belong to exactly one
    // organization. Sent explicitly when the picker was used. If
    // omitted, the backend infers it for single-org users and rejects
    // with a clear message when the caller manages >1 org.
    if (formData.organization_id) {
        payload.organization_id = formData.organization_id;
    }

    // Existing: admin-only organizer tagging. Organizers never send
    // this; if they did, the backend would reject any value other
    // than their own ID.
    if (formData.organizer_id) {
        payload.organizer_id = formData.organizer_id;
    }

    return payload;
};