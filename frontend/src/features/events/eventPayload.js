// frontend/src/features/events/eventPayload.js
import { inputToIso } from '../../utils/datetime';
import { EVENT_TYPE, EVENT_CATEGORY, EVENT_STATUS } from '../../constants';

export const buildEventPayload = (formData, sessions, tiers) => ({
    title: formData.title,
    description: formData.description || '',
    short_description: formData.short_description || '',
    event_type: formData.event_type || EVENT_TYPE.SINGLE,
    category: formData.category || EVENT_CATEGORY.OTHER,
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
        start_time: inputToIso(s.start_time),
        end_time: inputToIso(s.end_time),
        capacity: parseInt(s.capacity, 10) || 100,
    })),
    tiers: (tiers || []).map((t) => ({
        name: t.name || 'General',
        price: parseFloat(t.price) || 0,
        quantity_total: parseInt(t.quantity_total, 10) || 100,
        ticket_type: t.ticket_type || 'ga',
    })),
});