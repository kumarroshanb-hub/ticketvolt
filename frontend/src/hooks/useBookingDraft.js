// frontend/src/hooks/useBookingDraft.js
//
// Encapsulates the multi-step booking wizard's draft state:
//   - tier quantities
//   - derived ticket list
//   - attendee entries (which must stay in sync with ticket list WITHOUT
//     destroying user-entered names when quantities change)
//   - customer fields
//   - validation
//   - the final payload builder
//
// Extracted from CreateBooking.js so the sync logic is testable and the
// page component focuses on presentation.

import { useCallback, useEffect, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const EMPTY_CUSTOMER = {
    name: '',
    email: '',
    phone: '',
    whatsapp: '',
    notes: '',
};

const isValidEmail = (email) =>
    typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email.trim());

const digitsOnly = (s) => String(s || '').replace(/\D/g, '');

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export default function useBookingDraft({
    tiers = [],
    selectedEvent = null,
    selectedSession = null,
    slotPreferences = [],
    bookingSource = 'user_portal',
} = {}) {
    // ---- Tier quantities ----
    const [quantities, setQuantities] = useState({});

    // ---- Customer ----
    const [customer, setCustomer] = useState(EMPTY_CUSTOMER);

    // ---- Attendees ----
    // Kept in sync with the derived ticket list via the effect below.
    const [attendees, setAttendees] = useState([]);

    // ---- Validation errors ----
    const [errors, setErrors] = useState({});

    // -----------------------------------------------------------------------
    // Reset quantities whenever the tier set changes (e.g. new event selected)
    // -----------------------------------------------------------------------
    useEffect(() => {
        const next = {};
        tiers.forEach((t) => {
            next[t.id] = 0;
        });
        setQuantities(next);
    }, [tiers]);

    // -----------------------------------------------------------------------
    // Derived ticket list — plain data, no side effects
    // -----------------------------------------------------------------------
    const ticketList = useMemo(() => {
        const list = [];
        Object.keys(quantities).forEach((tierId) => {
            const qty = quantities[tierId] || 0;
            if (qty <= 0) return;
            const tier = tiers.find((t) => t.id === tierId);
            if (!tier) return;
            for (let i = 0; i < qty; i++) {
                list.push({
                    tier_id: tierId,
                    tier_name: tier.name,
                    price: parseFloat(tier.price) || 0,
                });
            }
        });
        return list;
    }, [quantities, tiers]);

    const totalTickets = ticketList.length;
    const totalAmount = useMemo(
        () => ticketList.reduce((sum, t) => sum + t.price, 0),
        [ticketList]
    );

    // -----------------------------------------------------------------------
    // ✅ THE FIX: merge ticketList into attendees WITHOUT destroying user data.
    //
    //   For each new ticket slot, we look for an existing attendee entry
    //   for the same tier that hasn't already been claimed by an earlier
    //   slot in this pass. If found, we REUSE it (preserving name/email/phone).
    //   Otherwise, we create a fresh empty entry.
    //
    //   This means:
    //     • Incrementing a tier's quantity keeps all existing names.
    //     • Decrementing a tier's quantity drops the tail-end attendee(s)
    //       for that tier — the earliest entries are kept.
    //     • Reordering tiers in the UI doesn't scramble names.
    // -----------------------------------------------------------------------
    useEffect(() => {
        setAttendees((prev) => {
            // Map (tier_id -> list of previous entries, in their original order)
            const prevByTier = new Map();
            for (const a of prev) {
                const tid = a.tier_id;
                if (!prevByTier.has(tid)) prevByTier.set(tid, []);
                prevByTier.get(tid).push(a);
            }

            // Track how many of each tier we've consumed while walking ticketList
            const consumed = new Map();

            return ticketList.map((ticket, newIndex) => {
                const tid = ticket.tier_id;
                const ordinal = consumed.get(tid) ?? 0;
                consumed.set(tid, ordinal + 1);

                const pool = prevByTier.get(tid) || [];
                const prevEntry = pool[ordinal];

                if (prevEntry) {
                    // Preserve user-entered fields; only refresh position-
                    // dependent fields so the entry stays aligned with its slot.
                    return {
                        ...prevEntry,
                        index: newIndex,
                        tier_id: tid,
                        tier_name: ticket.tier_name,
                    };
                }

                // No reusable entry — make a fresh empty one.
                return {
                    index: newIndex,
                    tier_id: tid,
                    tier_name: ticket.tier_name,
                    name: '',
                    email: '',
                    phone: '',
                };
            });
        });
    }, [ticketList]);

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------
    const updateQuantity = useCallback(
        (tierId, change) => {
            const tier = tiers.find((t) => t.id === tierId);
            if (!tier) return;

            const available = tier.quantity_total - tier.quantity_sold;
            const maxPerOrder = tier.max_per_order || 10;
            const maxQty = Math.min(available, maxPerOrder);

            setQuantities((prev) => {
                const current = prev[tierId] || 0;
                const next = Math.max(0, Math.min(current + change, maxQty));
                return { ...prev, [tierId]: next };
            });
        },
        [tiers]
    );

    const updateAttendee = useCallback((index, field, value) => {
        setAttendees((prev) => {
            const next = [...prev];
            if (!next[index]) return prev;
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    }, []);

    const handleCustomerChange = useCallback((field, value) => {
        setCustomer((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => (prev[field] ? { ...prev, [field]: null } : prev));
    }, []);

    const fillEmptyNamesWithCustomer = useCallback(() => {
        setAttendees((prev) =>
            prev.map((a) => (a.name?.trim() ? a : { ...a, name: customer.name }))
        );
    }, [customer.name]);

    const resetDraft = useCallback(() => {
        setQuantities({});
        setCustomer(EMPTY_CUSTOMER);
        setAttendees([]);
        setErrors({});
    }, []);

    // -----------------------------------------------------------------------
    // Validation
    // -----------------------------------------------------------------------
    const validate = useCallback(() => {
        const next = {};

        if (!customer.name?.trim()) {
            next.name = 'Customer name is required';
        }
        if (!customer.email?.trim()) {
            next.email = 'Email is required';
        } else if (!isValidEmail(customer.email)) {
            next.email = 'Invalid email format';
        }
        if (!customer.phone?.trim()) {
            next.phone = 'Phone number is required';
        } else if (digitsOnly(customer.phone).length < 10) {
            next.phone = 'Phone number must be at least 10 digits';
        }

        if (attendees.some((a) => !a.name?.trim())) {
            next.attendees = 'All attendees must have names';
        }

        setErrors(next);
        return Object.keys(next).length === 0;
    }, [customer, attendees]);

    // -----------------------------------------------------------------------
    // Payload builder
    // -----------------------------------------------------------------------
    const buildPayload = useCallback(() => {
        const ticketsWithAttendees = ticketList.map((ticket, index) => ({
            tier_id: ticket.tier_id,
            attendee_name: attendees[index]?.name || customer.name,
            attendee_email: attendees[index]?.email || customer.email,
            attendee_phone: attendees[index]?.phone || customer.phone,
            tier_name: ticket.tier_name || 'Unknown',
            price: ticket.price || 0,
        }));

        const tierQuantities = {};
        const attendeeNamesByTier = {};
        const tierIds = [];

        ticketsWithAttendees.forEach((ticket) => {
            const tierId = String(ticket.tier_id);
            if (!tierIds.includes(tierId)) {
                tierIds.push(tierId);
            }
            if (!tierQuantities[tierId]) {
                tierQuantities[tierId] = 0;
                attendeeNamesByTier[tierId] = [];
            }
            tierQuantities[tierId] += 1;
            attendeeNamesByTier[tierId].push(ticket.attendee_name);
        });

        const ticketTypes = ticketsWithAttendees.map((t) => ({
            tier_id: t.tier_id,
            attendee_name: t.attendee_name,
            tier_name: t.tier_name || 'Unknown',
        }));

        return {
            event: selectedEvent?.id,
            customer_name: customer.name,
            customer_email: customer.email,
            customer_phone: customer.phone,
            whatsapp_number: customer.whatsapp || customer.phone,
            total_amount: totalAmount,
            tickets: ticketsWithAttendees,
            metadata: {
                booking_source: bookingSource,
                notes: customer.notes,
                attendee_details: attendees,
                slot_id: selectedSession?.id || null,
                slot_preferences: slotPreferences,
                slot_allocation_message: selectedSession ? 'Slot allocated' : '',
                slot_start_time: selectedSession?.start_time || null,
                slot_end_time: selectedSession?.end_time || null,
                tickets: ticketsWithAttendees,
                ticket_types: ticketTypes,
                tier_ids: tierIds,
                tier_quantities: tierQuantities,
                attendee_names: attendeeNamesByTier,
                total_tickets: ticketsWithAttendees.length,
            },
        };
    }, [
        ticketList,
        attendees,
        customer,
        totalAmount,
        selectedEvent,
        selectedSession,
        slotPreferences,
        bookingSource,
    ]);

    return {
        // state
        quantities,
        customer,
        attendees,
        errors,

        // derived
        ticketList,
        totalTickets,
        totalAmount,

        // actions
        updateQuantity,
        updateAttendee,
        handleCustomerChange,
        fillEmptyNamesWithCustomer,
        resetDraft,

        // flow
        validate,
        buildPayload,
    };
}