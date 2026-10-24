// frontend/src/hooks/useBookingDraft.js
//
// Encapsulates the multi-step booking wizard's draft state:
//   - tier quantities (ticketed flow)
//   - derived ticket list (ticketed flow)
//   - attendee entries (kept in sync with ticket list WITHOUT
//     destroying user-entered names when quantities change)
//   - free-registration entry count + per-entry attendee list
//   - customer fields
//   - validation
//   - the final payload builder

import { useCallback, useEffect, useMemo, useState } from 'react';

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

const EMPTY_ATTENDEE = { name: '', email: '', phone: '' };

export default function useBookingDraft({
    tiers = [],
    selectedEvent = null,
    selectedSession = null,
    slotPreferences = [],
    bookingSource = 'user_portal',
    maxEntriesPerOrder = 10,
    isFreeRegistration = false,
} = {}) {
    // ---- Ticketed: tier quantities ----
    const [quantities, setQuantities] = useState({});

    // ---- Free registration: entry count + per-entry attendees ----
    // ✅ FIX: Default to 0 entries.
    const [freeEntries, setFreeEntries] = useState(0);
    const [freeAttendees, setFreeAttendees] = useState([]);

    // ---- Customer ----
    const [customer, setCustomer] = useState(EMPTY_CUSTOMER);

    // ---- Ticketed: attendees (kept in sync with ticketList) ----
    const [attendees, setAttendees] = useState([]);

    // ---- Validation errors ----
    const [errors, setErrors] = useState({});

    // -----------------------------------------------------------------------
    // Reset quantities whenever the tier set changes
    // -----------------------------------------------------------------------
    useEffect(() => {
        const next = {};
        tiers.forEach((t) => {
            next[t.id] = 0;
        });
        setQuantities(next);
    }, [tiers]);

    // -----------------------------------------------------------------------
    // Derived ticket list (ticketed flow only)
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
    // Merge ticketList into attendees WITHOUT destroying user data
    // -----------------------------------------------------------------------
    useEffect(() => {
        setAttendees((prev) => {
            const prevByTier = new Map();
            for (const a of prev) {
                const tid = a.tier_id;
                if (!prevByTier.has(tid)) prevByTier.set(tid, []);
                prevByTier.get(tid).push(a);
            }

            const consumed = new Map();

            return ticketList.map((ticket, newIndex) => {
                const tid = ticket.tier_id;
                const ordinal = consumed.get(tid) ?? 0;
                consumed.set(tid, ordinal + 1);

                const pool = prevByTier.get(tid) || [];
                const prevEntry = pool[ordinal];

                if (prevEntry) {
                    return {
                        ...prevEntry,
                        index: newIndex,
                        tier_id: tid,
                        tier_name: ticket.tier_name,
                    };
                }

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
    // Keep freeAttendees length in sync with freeEntries
    // -----------------------------------------------------------------------
    useEffect(() => {
        setFreeAttendees((prev) => {
            if (prev.length === freeEntries) return prev;
            if (prev.length > freeEntries) return prev.slice(0, freeEntries);
            const extra = Array.from(
                { length: freeEntries - prev.length },
                () => ({ ...EMPTY_ATTENDEE })
            );
            return [...prev, ...extra];
        });
    }, [freeEntries]);

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

    const updateFreeEntries = useCallback(
        (delta) => {
            setFreeEntries((prev) => {
                const next = prev + delta;
                // ✅ FIX: Allow 0 minimum
                if (next < 0) return 0;
                if (next > maxEntriesPerOrder) return maxEntriesPerOrder;
                return next;
            });
        },
        [maxEntriesPerOrder]
    );

    const setFreeEntriesDirect = useCallback(
        (value) => {
            const n = parseInt(value, 10);
            if (Number.isNaN(n)) return;
            // ✅ FIX: Allow 0 minimum
            const clamped = Math.max(0, Math.min(n, maxEntriesPerOrder));
            setFreeEntries(clamped);
        },
        [maxEntriesPerOrder]
    );

    const updateFreeAttendee = useCallback((index, field, value) => {
        setFreeAttendees((prev) => {
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
        setFreeEntries(0);
        setFreeAttendees([]);
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

        if (isFreeRegistration) {
            // ✅ FIX: Require at least 1 entry
            if (freeEntries < 1) {
                next.entries = 'Please select at least one entry';
            }
            // ✅ FIX: Removed the hard requirement that every entry must have a name. 
            // The primary contact automatically acts as a fallback.
            const badEmails = freeAttendees.some(
                (a) => a.email?.trim() && !isValidEmail(a.email)
            );
            if (badEmails) {
                next.freeAttendees = 'One or more entries have an invalid email';
            }
        } else {
            // ✅ FIX: Removed the hard requirement that every attendee must have a name.
            // The primary contact automatically acts as a fallback.
        }

        setErrors(next);
        return Object.keys(next).length === 0;
    }, [customer, isFreeRegistration, freeEntries, freeAttendees]);

    // -----------------------------------------------------------------------
    // Payload builder
    // -----------------------------------------------------------------------
    const buildPayload = useCallback(() => {
        if (isFreeRegistration) {
            const attendeesPayload = freeAttendees.map((a) => {
                // ✅ FIX: If the user leaves the entry blank, fall back to the primary contact.
                const name = (a.name || '').trim() || customer.name;
                const email = (a.email || '').trim() || customer.email;
                const phone = (a.phone || '').trim() || customer.phone;
                return { name, email, phone };
            });

            return {
                event: selectedEvent?.id,
                customer_name: customer.name,
                customer_email: customer.email,
                customer_phone: customer.phone,
                whatsapp_number: customer.whatsapp || customer.phone,
                total_amount: 0,
                tickets: [],
                metadata: {
                    booking_source: bookingSource,
                    notes: customer.notes,
                    slot_id: selectedSession?.id || null,
                    slot_preferences: slotPreferences,
                    slot_allocation_message: selectedSession ? 'Slot allocated' : '',
                    slot_start_time: selectedSession?.start_time || null,
                    slot_end_time: selectedSession?.end_time || null,
                    entries: freeEntries,
                    attendees: attendeesPayload,
                    total_tickets: freeEntries,
                },
            };
        }

        const ticketsWithAttendees = ticketList.map((ticket, index) => ({
            tier_id: ticket.tier_id,
            // ✅ FIX: If the attendee leaves a field blank, fall back to the primary contact.
            attendee_name: (attendees[index]?.name || '').trim() || customer.name,
            attendee_email: (attendees[index]?.email || '').trim() || customer.email,
            attendee_phone: (attendees[index]?.phone || '').trim() || customer.phone,
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
        isFreeRegistration,
        freeAttendees,
        freeEntries,
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
        // shared
        customer,
        errors,

        // ticketed
        quantities,
        attendees,
        ticketList,
        totalTickets,
        totalAmount,
        updateQuantity,
        updateAttendee,
        fillEmptyNamesWithCustomer,

        // free-registration
        freeEntries,
        freeAttendees,
        updateFreeEntries,
        setFreeEntries: setFreeEntriesDirect,
        updateFreeAttendee,

        // customer + flow
        handleCustomerChange,
        resetDraft,
        validate,
        buildPayload,
    };
}