import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Box, Typography, Paper, Stepper, Step, StepLabel, Button,
    CircularProgress, Alert, Grid, Divider, Card, CardContent,
    TextField, IconButton, Chip, useMediaQuery, useTheme, Stack,
    Checkbox, FormControlLabel,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon, ArrowForward as ArrowForwardIcon,
    Check as CheckIcon, Event as EventIcon, ConfirmationNumber as TicketIcon,
    Person as PersonIcon, Add as AddIcon, Remove as RemoveIcon,
    Schedule as ScheduleIcon, CalendarMonth as CalendarIcon,
    LocationOn as LocationIcon, People as PeopleIcon,
    LocalOffer as LocalOfferIcon, ZoomIn, ZoomOut, FitScreen,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { useSettings } from '../../context/SettingsContext';
import api from '../../services/api';
import { PageContainer, PageHeader, PageTitle, PrimaryButton, OutlineButton } from '../../components/Common';
import { ROLES } from '../../constants';
import useBookingDraft from '../../hooks/useBookingDraft';
import EventCard from '../../components/Common/EventCard';

import SeatingCanvas from '../../components/Seating/SeatingCanvas';
import { theme } from '../../theme/tokens';

const C = theme.colors;

// Branding colors
const BRAND_COLORS = {
    charcoal: C.primary,
    red: C.secondary,
    darkGray: C.primaryLight,
    lightGray: C.bgPrimary,
    border: C.borderLight,
    success: C.success,
    warning: C.warning,
    info: C.info,
};

const STEP_KEYS = {
    EVENT: 'event', SLOT: 'slot', ENTRIES: 'entries',
    TICKETS: 'tickets', ATTENDEES: 'attendees', REVIEW: 'review',
};

const STEP_LABELS = {
    [STEP_KEYS.EVENT]: 'booking.wizard.stepSelectEvent',
    [STEP_KEYS.SLOT]: 'booking.wizard.stepChooseSlot',
    [STEP_KEYS.ENTRIES]: 'booking.wizard.stepNumberOfEntries',
    [STEP_KEYS.TICKETS]: 'booking.wizard.stepChooseTickets',
    [STEP_KEYS.ATTENDEES]: 'booking.wizard.stepAttendeeDetails',
    [STEP_KEYS.REVIEW]: 'booking.wizard.stepReviewConfirm',
};

const FREE_ATTENDEES_LABEL = 'booking.wizard.stepRegistrantDetails';

const formatVenueAddress = (venue) => {
    if (!venue) return '';
    const parts = [
        venue.name, venue.address_line1, venue.address_line2,
        venue.city, venue.state, venue.postal_code, venue.country,
    ].filter((p) => p && String(p).trim() !== '');
    return parts.join(', ');
};

const formatPlatformTime = (value, timezone, options = {}) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const baseOptions = { hour: '2-digit', minute: '2-digit', ...options };
    if (timezone) {
        try {
            return new Intl.DateTimeFormat(undefined, { ...baseOptions, timeZone: timezone }).format(date);
        } catch {}
    }
    return date.toLocaleTimeString([], baseOptions);
};

const BOOKING_ERROR_FIELD_KEYS = [
    'customer_email', 'customer_name', 'customer_phone', 'whatsapp_number',
    'session', 'tickets', 'discount_code', 'event', 'metadata', 'entries',
];

const firstFieldMessage = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        for (const item of value) {
            const inner = firstFieldMessage(item);
            if (inner) return inner;
        }
        return null;
    }
    if (typeof value === 'object') {
        for (const key of Object.keys(value)) {
            const inner = firstFieldMessage(value[key]);
            if (inner) return inner;
        }
        return null;
    }
    return String(value);
};

const CreateBooking = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const { user, isAuthenticated } = useAuth();
    const { role } = useRole();
    const { formatMoney, settings } = useSettings();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const isManager = role === ROLES.OWNER || role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
    const canManageEvents = isManager;
    const isRegularUser = role === ROLES.USER || role === ROLES.MEMBER;
    const platformTimezone = settings?.default_timezone;

    const [activeStep, setActiveStep] = useState(STEP_KEYS.EVENT);
    const [loading, setLoading] = useState(false);
    const [events, setEvents] = useState([]);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [eventDetails, setEventDetails] = useState(null);
    const [sessions, setSessions] = useState([]);
    const [selectedSession, setSelectedSession] = useState(null);
    const [slotPreferences, setSlotPreferences] = useState([]);
    const [slotPreferencesInput, setSlotPreferencesInput] = useState('');
    const [tiers, setTiers] = useState([]);
    const [isLoadingEvent, setIsLoadingEvent] = useState(false);
    const [eventLoadError, setEventLoadError] = useState(null);
    const [autoSelectDone, setAutoSelectDone] = useState(false);

    const [discountInput, setDiscountInput] = useState('');
    const [appliedDiscount, setAppliedDiscount] = useState(null);
    const [validatingDiscount, setValidatingDiscount] = useState(false);
    const [submitError, setSubmitError] = useState(null);
    const [donationAmount, setDonationAmount] = useState('');
    const [donorName, setDonorName] = useState('');
    const [courseAnswer, setCourseAnswer] = useState('');
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [marketingOptIn, setMarketingOptIn] = useState(false);

    const hasReservedSeating = selectedEvent?.venue?.has_reserved_seating;
    const [selectedSeats, setSelectedSeats] = useState([]);
    const [reservedAttendees, setReservedAttendees] = useState([]);

    // ✅ Layout captured from SeatingCanvas via onLayoutLoaded — used to compute the legend in the parent
    const [seatingLayout, setSeatingLayout] = useState(null);
    const [seatingLayoutLoading, setSeatingLayoutLoading] = useState(false);

    useEffect(() => {
        if (!hasReservedSeating || !selectedEvent?.id) {
            setSeatingLayout(null);
            return;
        }
        let cancelled = false;
        const load = async () => {
            setSeatingLayoutLoading(true);
            try {
                const res = await api.get(`/events/${selectedEvent.id}/seat-map/`, {
                    params: selectedSession?.id ? { session: selectedSession.id } : {},
                });
                if (!cancelled) setSeatingLayout(res.data);
            } catch (e) {
                console.error(e);
                if (!cancelled) setSeatingLayout(null);
            } finally {
                if (!cancelled) setSeatingLayoutLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [selectedEvent?.id, selectedSession?.id, hasReservedSeating]);

    // ✅ Legend derived from layout — available on first render after fetch resolves
    const seatingLegendStats = useMemo(() => {
        if (!seatingLayout?.seats) return [];
        const stats = {};
        seatingLayout.seats.forEach(seat => {
            let groupName = 'General';
            let groupColor = C.textLight;
            let labelKey = 'bookings.general';
            if (seat.status === 'sold' || seat.status === 'booked') {
                groupName = 'Sold / Unavailable';
                groupColor = C.borderLight;
                labelKey = 'bookings.soldUnavailable';
            } else if (seat.status === 'held') {
                groupName = 'Held';
                groupColor = BRAND_COLORS.warning;
                labelKey = 'bookings.held';
            } else if (seat.category_name) {
                groupName = seat.category_name;
                groupColor = seat.category_color || C.textLight;
                labelKey = null;
            }
            if (!stats[groupName]) stats[groupName] = { name: groupName, color: groupColor, count: 0, labelKey };
            stats[groupName].count++;
        });
        return Object.values(stats).sort((a, b) => {
            const isSpecialA = a.name.includes('Sold') || a.name.includes('Held');
            const isSpecialB = b.name.includes('Sold') || b.name.includes('Held');
            if (isSpecialA && !isSpecialB) return 1;
            if (!isSpecialA && isSpecialB) return -1;
            return a.name.localeCompare(b.name);
        });
    }, [seatingLayout]);

    const isFreeRegistrationFlow =
        (eventDetails && eventDetails.event_flow === 'free_registration') ||
        (selectedEvent && selectedEvent.event_flow === 'free_registration');

    const draft = useBookingDraft({
        tiers, selectedEvent, selectedSession, slotPreferences,
        bookingSource: isRegularUser ? 'user_portal' : 'admin_portal',
        isFreeRegistration: isFreeRegistrationFlow,
        maxEntriesPerOrder: eventDetails?.max_tickets_per_order || 10,
    });

    const {
        quantities, customer, attendees, errors, ticketList,
        totalTickets, totalAmount, updateQuantity, updateAttendee,
        handleCustomerChange, fillEmptyNamesWithCustomer, resetDraft,
        validate, buildPayload, freeEntries, freeAttendees,
        updateFreeEntries, updateFreeAttendee,
    } = draft;

    // Ref to control the canvas externally
    const canvasRef = React.useRef(null);

    useEffect(() => {
        if (hasReservedSeating) {
            setReservedAttendees(prev => {
                const newLength = selectedSeats.length;
                if (prev.length === newLength) return prev;
                const next = [...prev];
                while (next.length < newLength) next.push({ name: '', email: '', phone: '' });
                return next.slice(0, newLength);
            });
        }
    }, [selectedSeats.length, hasReservedSeating]);

    const updateReservedAttendee = (index, field, value) => {
        setReservedAttendees(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    useEffect(() => {
        if (!isAuthenticated || !user || role !== ROLES.USER) return;
        const isPristine = !customer.name?.trim() && !customer.email?.trim() && !customer.phone?.trim() && !customer.whatsapp?.trim() && !customer.notes?.trim();
        if (!isPristine) return;

        const fullName = (user.name && String(user.name).trim()) || [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username || '';
        const phone = (user.phone && String(user.phone).trim()) || (user.profile?.phone && String(user.profile.phone).trim()) || '';
        const whatsapp = (user.whatsapp_number && String(user.whatsapp_number).trim()) || (user.profile?.whatsapp_number && String(user.profile.whatsapp_number).trim()) || '';

        if (fullName) handleCustomerChange('name', fullName);
        if (user.email) handleCustomerChange('email', user.email);
        if (phone) handleCustomerChange('phone', phone);
        const wa = whatsapp || phone;
        if (wa) handleCustomerChange('whatsapp', wa);
    }, [isAuthenticated, user, role, customer, handleCustomerChange]);

    useEffect(() => {
        if (isFreeRegistrationFlow && freeAttendees.length > 0) {
            const first = freeAttendees[0] || {};
            const patch = {};
            if (!first.name?.trim() && customer.name?.trim()) patch.name = customer.name;
            if (!first.email?.trim() && customer.email?.trim()) patch.email = customer.email;
            if (!first.phone?.trim() && customer.phone?.trim()) patch.phone = customer.phone;
            if (Object.keys(patch).length > 0) Object.entries(patch).forEach(([field, value]) => updateFreeAttendee(0, field, value));
        }
        if (!isFreeRegistrationFlow && attendees.length > 0) {
            const first = attendees[0] || {};
            const patch = {};
            if (!first.name?.trim() && customer.name?.trim()) patch.name = customer.name;
            if (!first.email?.trim() && customer.email?.trim()) patch.email = customer.email;
            if (!first.phone?.trim() && customer.phone?.trim()) patch.phone = customer.phone;
            if (Object.keys(patch).length > 0) Object.entries(patch).forEach(([field, value]) => updateAttendee(0, field, value));
        }
    }, [isFreeRegistrationFlow, freeAttendees, attendees, customer.name, customer.email, customer.phone, updateFreeAttendee, updateAttendee]);

    useEffect(() => {
        if (sessions.length === 1 && !selectedSession) setSelectedSession(sessions[0]);
    }, [sessions, selectedSession]);

    const discountAmount = appliedDiscount?.valid ? appliedDiscount.discount_amount : 0;
    const netAmount = Math.max(0, totalAmount - discountAmount);
    const donationValue = Math.max(0, Number(donationAmount) || 0);
    const seatSubtotal = selectedSeats.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
    const grandTotal = (hasReservedSeating ? seatSubtotal : netAmount) + donationValue;

    const handleEmailChange = (value) => {
        handleCustomerChange('email', value);
        if (submitError?.customer_email) {
            setSubmitError((prev) => {
                if (!prev) return prev;
                const { customer_email, ...rest } = prev;
                return Object.keys(rest).length ? rest : null;
            });
        }
    };

    const visibleSteps = useMemo(() => {
        const hasSessions = sessions && sessions.length > 0;
        if (isFreeRegistrationFlow) {
            const steps = [STEP_KEYS.EVENT];
            if (hasSessions) steps.push(STEP_KEYS.SLOT);
            steps.push(STEP_KEYS.ENTRIES, STEP_KEYS.ATTENDEES, STEP_KEYS.REVIEW);
            return steps;
        }
        const steps = [STEP_KEYS.EVENT];
        if (hasSessions) steps.push(STEP_KEYS.SLOT);
        steps.push(STEP_KEYS.TICKETS, STEP_KEYS.ATTENDEES, STEP_KEYS.REVIEW);
        return steps;
    }, [sessions, isFreeRegistrationFlow]);

    const stepLabel = (key) => t(
        isFreeRegistrationFlow && key === STEP_KEYS.ATTENDEES ? FREE_ATTENDEES_LABEL : STEP_LABELS[key]
    );
    const stepIndex = (key) => visibleSteps.indexOf(key);

    const getNextStep = (key) => {
        const idx = visibleSteps.indexOf(key);
        if (idx === -1) return visibleSteps[visibleSteps.length - 1];
        return visibleSteps[idx + 1] || visibleSteps[visibleSteps.length - 1];
    };

    const getPrevStep = (key) => {
        const idx = visibleSteps.indexOf(key);
        if (idx === -1) return visibleSteps[0];
        return visibleSteps[idx - 1] || visibleSteps[0];
    };

    // Fetch once on mount; loadEvents reads auth state but the user
    // identity is stable for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { loadEvents(); }, []);

    useEffect(() => {
        if (events.length > 0 && !autoSelectDone) {
            const params = new URLSearchParams(location.search);
            const eventId = params.get('event');
            if (eventId) {
                const event = events.find((e) => e.id === eventId);
                if (event) {
                    handleSelectEvent(event);
                    setAutoSelectDone(true);
                } else {
                    loadEventDetails(eventId);
                    setSelectedEvent({ id: eventId });
                    setAutoSelectDone(true);
                    setActiveStep(STEP_KEYS.EVENT);
                }
            }
        }
    }, [events, location.search, autoSelectDone]);

    useEffect(() => {
        if (!appliedDiscount?.valid) return;
        if (totalTickets === 0) {
            setAppliedDiscount(null); setDiscountInput(''); return;
        }
        let cancelled = false;
        const revalidate = async () => {
            try {
                const res = await api.post('/bookings/validate_discount/', {
                    code: appliedDiscount.code, event_id: selectedEvent?.id,
                    subtotal: totalAmount, ticket_count: totalTickets,
                }, { skipAuthRedirect: !isAuthenticated });
                if (cancelled) return;
                if (res.data?.valid) setAppliedDiscount(res.data);
                else {
                    setAppliedDiscount(null); setDiscountInput('');
                    toast.info(t('bookings.discountInvalid', {
                        code: appliedDiscount.code,
                        reason: res.data?.reason || t('bookings.discountConditionsChanged'),
                    }));
                }
            } catch {
                if (!cancelled) { setAppliedDiscount(null); setDiscountInput(''); }
            }
        };
        revalidate();
        return () => { cancelled = true; };
    }, [totalAmount, totalTickets, selectedEvent?.id]);

    const loadEvents = async () => {
        setLoading(true);
        setEventLoadError(null);
        try {
            const extract = (payload) => {
                if (Array.isArray(payload)) return payload;
                if (payload && Array.isArray(payload.results)) return payload.results;
                if (payload && typeof payload === 'object') {
                    return Object.values(payload).filter((item) => item?.id && item?.title);
                }
                return [];
            };

            // Public marketplace events, plus the caller's own-org events
            // (which include PRIVATE events for signed-in members).
            const requests = [api.get('/events/public/')];
            if (isAuthenticated) requests.push(api.get('/events/'));

            const responses = await Promise.allSettled(requests);
            const merged = responses
                .filter((r) => r.status === 'fulfilled')
                .flatMap((r) => extract(r.value?.data));

            // De-duplicate by id; the authenticated /events/ record wins
            // so private/member data is not replaced by the public shape.
            const byId = new Map();
            merged.forEach((event) => byId.set(event.id, event));
            let data = Array.from(byId.values());

            if (!canManageEvents) {
                data = data.filter((e) => {
                    const status = e.status || 'draft';
                    return status === 'active' || status === 'published';
                });
            }

            setEvents(data);
            if (data.length === 0) {
                setEventLoadError(
                    canManageEvents
                        ? t('events.noEventsCreateFirst')
                        : t('events.noPublicEvents')
                );
            }
        } catch (error) {
            let errorMsg = t('events.loadEventsFailed');
            if (error.response?.status === 404) errorMsg = t('bookings.eventsEndpointNotFound');
            else if (error.response?.status === 401 || error.response?.status === 403) errorMsg = t('bookings.authRequired');
            else if (error.response?.data?.detail) errorMsg = error.response.data.detail;
            else if (error.response?.data?.error) errorMsg = error.response.data.error;
            else if (error.message) errorMsg = error.message;
            setEventLoadError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const loadEventDetails = async (eventId) => {
        setIsLoadingEvent(true);
        setEventLoadError(null);
        try {
            let data;
            try { const response = await api.get(`/events/public/${eventId}/`); data = response.data; }
            catch (publicError) { const response = await api.get(`/events/${eventId}/`); data = response.data; }

            setEventDetails(data);
            if (selectedEvent) setSelectedEvent(data);
            setSessions(data.sessions || []);

            const availableTiers = (data.tiers || []).filter((t) => {
                const available = (typeof t.available === 'number') ? t.available : Math.max(0, (t.quantity_total || 0) - (t.quantity_sold || 0));
                return available > 0;
            });
            setTiers(availableTiers);

            const isFree = data.event_flow === 'free_registration';
            const isReserved = Boolean(data.venue?.has_reserved_seating);
            // Reserved-seat events price and allocate seats from the venue
            // layout, not from ticket tiers. An empty tier list is expected.
            if (!isFree && !isReserved) {
                if (availableTiers.length === 0 && data.tiers && data.tiers.length > 0) toast.info(t('booking.wizard.allTicketsSoldOutInfo'));
                else if (availableTiers.length === 0) toast.info(t('booking.wizard.noTicketsAvailable'));
            }
        } catch (error) {
            let errorMsg = t('events.loadDetailsFailed');
            if (error.response?.data?.detail) errorMsg = error.response.data.detail;
            else if (error.response?.data?.error) errorMsg = error.response.data.error;
            else if (error.message) errorMsg = error.message;
            setEventLoadError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setIsLoadingEvent(false);
        }
    };

    const handleSelectEvent = (event) => {
        resetDraft(); setSubmitError(null); setSelectedEvent(event); setSelectedSession(null);
        setSlotPreferences([]); setSlotPreferencesInput(''); setTiers([]); setEventDetails(null);
        setDiscountInput(''); setAppliedDiscount(null); setSelectedSeats([]); setReservedAttendees([]);
        setDonationAmount(''); setDonorName(''); setCourseAnswer(''); setPrivacyAccepted(false); setMarketingOptIn(false);
        setSeatingLayout(null);                 // ✅ reset layout
        loadEventDetails(event.id);
        const hasSessionsPreview = (event.session_count ?? event.sessions?.length ?? 0) > 0;
        setActiveStep(hasSessionsPreview ? STEP_KEYS.SLOT : nextNonSlotStep(event));
    };

    const nextNonSlotStep = (event) => event.event_flow === 'free_registration' ? STEP_KEYS.ENTRIES : STEP_KEYS.TICKETS;

    const validateDiscount = async () => {
        if (!discountInput.trim()) return;
        setValidatingDiscount(true);
        try {
            const res = await api.post('/bookings/validate_discount/', {
                code: discountInput.trim(), event_id: selectedEvent?.id,
                subtotal: totalAmount, ticket_count: totalTickets,
            }, { skipAuthRedirect: !isAuthenticated });
            const data = res.data;
            if (data.valid) { setAppliedDiscount(data); toast.success(t('bookings.discountAppliedAmount', { amount: formatMoney(data.discount_amount) })); }
            else { setAppliedDiscount(null); toast.error(data.reason || t('bookings.invalidDiscountCode')); }
        } catch (err) {
            const reason = err.response?.data?.reason || err.response?.data?.error || err.response?.data?.detail || t('bookings.failedValidateCode');
            setAppliedDiscount(null); toast.error(reason);
        } finally { setValidatingDiscount(false); }
    };

    const removeDiscount = () => { setAppliedDiscount(null); setDiscountInput(''); toast.info(t('bookings.discountRemoved')); };

    const handleSelectSlot = (sessionId) => {
        const session = sessions.find((s) => s.id === sessionId);
        setSelectedSession(session);
    };

    const handleSlotPreferences = () => {
        if (!slotPreferencesInput.trim()) { toast.warning(t('bookings.enterSlotPreferences')); return; }
        const preferences = slotPreferencesInput.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0 && n <= sessions.length);
        if (preferences.length === 0) { toast.warning(t('bookings.enterValidSlotNumbers')); return; }
        const uniquePreferences = []; const seen = new Set();
        for (const pref of preferences) if (!seen.has(pref)) { seen.add(pref); uniquePreferences.push(pref); }
        setSlotPreferences(uniquePreferences);
        let allocatedSlot = null; let allocationMessage = '';
        for (const pref of uniquePreferences) {
            const slot = sessions[pref - 1];
            if (slot && slot.capacity - slot.booked > 0) {
                allocatedSlot = slot; allocationMessage = t('bookings.allocatedPreference', { number: uniquePreferences.indexOf(pref) + 1 }); break;
            }
        }
        if (!allocatedSlot) {
            for (let i = 0; i < sessions.length; i++) {
                const slot = sessions[i];
                if (slot.capacity - slot.booked > 0) {
                    allocatedSlot = slot; allocationMessage = t('bookings.allocatedNextAvailable'); break;
                }
            }
        }
        if (!allocatedSlot) { toast.error(t('bookings.noSlotsAvailable')); return; }
        setSelectedSession(allocatedSlot);
        toast.success(t('bookings.slotAllocated', { message: allocationMessage }));
    };

    const handleSubmit = async () => {
        setSubmitError(null);
        if (hasReservedSeating) {
            if (selectedSeats.length === 0) { toast.error(t('bookings.selectSeatAtLeastOne')); return; }
            if (reservedAttendees.some((a) => !a.name?.trim())) { toast.error(t('bookings.enterNameEverySeat')); setActiveStep(STEP_KEYS.ATTENDEES); return; }
        } else if (!isFreeRegistrationFlow) {
            if (!validate()) { toast.error(t('booking.wizard.pleaseFixErrors')); return; }
        } else {
            if (!customer.name?.trim() || !customer.email?.trim() || !customer.phone?.trim()) { toast.error(t('booking.wizard.pleaseFillPrimary')); return; }
            if (eventDetails?.privacy_notice_text && !privacyAccepted) { toast.error(t('booking.privacyRequired', 'Please accept the privacy notice.')); return; }
            if (freeAttendees.some((a) => !a.name?.trim())) { toast.error(t('booking.wizard.pleaseEnterNameEveryEntry')); return; }
        }

        setLoading(true);
        try {
            let payload;
            if (hasReservedSeating) {
                payload = {
                    event: selectedEvent.id, session: selectedSession?.id || null,
                    customer_name: customer.name, customer_email: customer.email,
                    customer_phone: customer.phone, whatsapp_number: customer.whatsapp,
                    notes: customer.notes, booking_source: isRegularUser ? 'user_portal' : 'admin_portal',
                    tickets: selectedSeats.map((seat, index) => ({
                        tier_id: null, seat_id: seat.id, qty: 1,
                        attendee_name: reservedAttendees[index]?.name || customer.name,
                        attendee_email: reservedAttendees[index]?.email || customer.email,
                        attendee_phone: reservedAttendees[index]?.phone || customer.phone,
                        price: Number(seat.price) || 0, category_name: seat.category_name || 'General',
                    })),
                    total_amount: selectedSeats.reduce((sum, s) => sum + (Number(s.price) || 0), 0)
                        + Math.max(0, Number(donationAmount) || 0),
                    donation_amount: Math.max(0, Number(donationAmount) || 0),
                    donor_name: donorName || customer.name,
                    course_answer: courseAnswer,
                    privacy_accepted: privacyAccepted,
                    marketing_opt_in: marketingOptIn,
                    metadata: { slot_preferences: slotPreferences, booking_source: isRegularUser ? 'user_portal' : 'admin_portal' }
                };
                if (appliedDiscount?.valid && appliedDiscount?.code) payload.discount_code = appliedDiscount.code;
            } else {
                payload = buildPayload();
                if (isFreeRegistrationFlow) { payload.tickets = []; payload.total_amount = 0; delete payload.discount_code; }
                else {
                    const donation = Math.max(0, Number(donationAmount) || 0);
                    if (donation > 0) {
                        payload.donation_amount = donation;
                        payload.donor_name = donorName || customer.name;
                        payload.total_amount = (Number(payload.total_amount) || 0) + donation;
                    }
                    payload.course_answer = courseAnswer;
                    payload.privacy_accepted = privacyAccepted;
                    payload.marketing_opt_in = marketingOptIn;
                    if (appliedDiscount?.valid && appliedDiscount?.code) payload.discount_code = appliedDiscount.code;
                }
            }

            const response = await api.post('/bookings/', payload, { skipAuthRedirect: !isAuthenticated });
            const result = response.data;
            toast.success(t('bookings.bookingCreated', { ref: result.booking_reference }));

            if (isAuthenticated) navigate('/app/bookings', { replace: true });
            else navigate('/', { replace: true, state: { bookingReference: result.booking_reference, customerEmail: result.customer_email, justBooked: true } });
        } catch (error) {
            const status = error.response?.status; const data = error.response?.data;
            let fieldErrors = null; let toastMsg = null;
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                const collected = {};
                for (const key of BOOKING_ERROR_FIELD_KEYS) if (data[key] !== undefined) collected[key] = data[key];
                if (Object.keys(collected).length > 0) fieldErrors = collected;
                toastMsg = data.error || data.detail || data.message || null;
            } else if (typeof data === 'string') toastMsg = data;
            else if (error.message) toastMsg = error.message;
            if (fieldErrors) {
                setSubmitError(fieldErrors);
                const emailMessage = firstFieldMessage(fieldErrors.customer_email);
                if (emailMessage) { toast.error(emailMessage); setActiveStep(STEP_KEYS.ATTENDEES); return; }
                const anyFieldMessage = firstFieldMessage(fieldErrors);
                if (anyFieldMessage) { toast.error(anyFieldMessage); return; }
            }
            if (toastMsg) toast.error(toastMsg); else toast.error(t('bookings.createBookingFailed'));
            if (status === 401) toast.error(t('bookings.sessionExpired'));
        } finally { setLoading(false); }
    };

    const handleBack = () => setActiveStep(getPrevStep(activeStep));

    const handleNext = () => {
        if (activeStep === STEP_KEYS.EVENT && !selectedEvent) { toast.warning(t('booking.wizard.pleaseSelectEvent')); return; }
        if (activeStep === STEP_KEYS.SLOT && !selectedSession && sessions.length > 0) { toast.warning(t('booking.wizard.pleaseSelectSlot')); return; }
        if (activeStep === STEP_KEYS.ENTRIES && freeEntries < 1) { toast.warning(t('booking.wizard.pleaseSelectEntry')); return; }
        if (activeStep === STEP_KEYS.TICKETS) {
            if (hasReservedSeating) { if (selectedSeats.length === 0) { toast.warning(t('bookings.selectSeatAtLeastOne')); return; } }
            else { if (totalTickets === 0) { toast.warning(t('booking.wizard.pleaseSelectTicket')); return; } }
        }
        if (activeStep === STEP_KEYS.ATTENDEES) {
            if (hasReservedSeating) { if (reservedAttendees.some((a) => !a.name?.trim())) { toast.warning(t('bookings.enterNameEverySeat')); return; } }
            else if (isFreeRegistrationFlow) {
                if (freeAttendees.some((a) => !a.name?.trim())) { toast.warning(t('booking.wizard.pleaseEnterNameEveryEntry')); return; }
                const badEmail = freeAttendees.some((a) => a.email?.trim() && !/^\S+@\S+\.\S+$/.test(a.email.trim()));
                if (badEmail) { toast.warning(t('booking.wizard.invalidEntryEmail')); return; }
            } else {
                const allFilled = attendees.every((a) => a.name?.trim());
                if (!allFilled) { toast.warning(t('booking.wizard.pleaseEnterAllAttendeeNames')); return; }
            }
        }
        setActiveStep(getNextStep(activeStep));
    };

    const renderEventSelection = () => (
        <Box sx={{ py: 2 }}>
            {eventLoadError || (events.length === 0 && !loading) ? (
                <Alert severity="info" sx={{ mb: 3 }}>
                    {eventLoadError || (canManageEvents ? t('events.noEventsCreateFirst') : t('events.noPublicEvents'))}
                    {eventLoadError && <Button size="small" onClick={loadEvents} sx={{ ml: 2 }}>{t('common.retry')}</Button>}
                </Alert>
            ) : (
                <Grid container spacing={isMobile ? 2 : 3}>
                    {events.map((event) => (
                        <Grid item xs={12} sm={6} md={4} key={event.id}>
                            <EventCard event={event} selected={selectedEvent?.id === event.id} onSelect={handleSelectEvent} />
                        </Grid>
                    ))}
                </Grid>
            )}
        </Box>
    );

    const renderSlotSelection = () => {
        const hasSessions = sessions && sessions.length > 0;
        if (!hasSessions) return <Box sx={{ py: 2 }}><Alert severity="info">{t('booking.wizard.noSlotsHint')}</Alert></Box>;
        return (
            <Box sx={{ py: 2 }}>
                <Alert severity="info" sx={{ mb: 3 }}>
                    <ScheduleIcon sx={{ mr: 1, verticalAlign: 'middle' }} /> {t('booking.wizard.selectPreferredSlot', { event: selectedEvent?.title })}
                </Alert>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    {sessions.map((session, index) => {
                        const remaining = session.capacity - session.booked;
                        const isAvailable = remaining > 0;
                        const isSelected = selectedSession?.id === session.id;
                        return (
                            <Grid item xs={12} sm={6} md={4} key={session.id}>
                                <Card sx={{ cursor: isAvailable ? 'pointer' : 'not-allowed', border: isSelected ? `2px solid ${C.primary}` : `1px solid ${C.borderLight}`, opacity: isAvailable ? 1 : 0.5, '&:hover': isAvailable ? { borderColor: 'primary.main' } : {}, '&:active': isAvailable ? { transform: 'scale(0.99)' } : {}, transition: 'all 0.2s' }} onClick={() => isAvailable && handleSelectSlot(session.id)}>
                                    <CardContent>
                                        <Box display="flex" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="h6" sx={{ color: 'text.primary' }}>{t('booking.wizard.slotHeader', { index: index + 1 })}</Typography>
                                                <Typography variant="body2" sx={{ color: 'text.primary' }}>🕐 {formatPlatformTime(session.start_time, platformTimezone)} - {formatPlatformTime(session.end_time, platformTimezone)}</Typography>
                                                <Typography variant="body2" sx={{ color: isAvailable ? C.successDark : C.error }}>{isAvailable ? `✅ ${remaining} ${t('booking.wizard.slotsAvailable')}` : t('booking.wizard.slotsFull')}</Typography>
                                            </Box>
                                            {isSelected && <Chip label={t('booking.wizard.selected')} size="small" color="primary" />}
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
                <Paper sx={{ p: isMobile ? 2 : 3, bgcolor: 'background.default' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>📋 {t('booking.wizard.slotPreferencesTitle')}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>{t('booking.wizard.slotPreferencesHint')}</Typography>
                    <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
                        <TextField label={t('booking.wizard.slotPreferencesLabel')} placeholder={t('booking.wizard.slotPreferencesPlaceholder')} value={slotPreferencesInput} onChange={(e) => setSlotPreferencesInput(e.target.value)} size="small" sx={{ minWidth: isMobile ? '100%' : 200, flex: isMobile ? 1 : 'unset' }} helperText={t('booking.wizard.slotPreferencesHelper', { max: sessions.length })} />
                        <PrimaryButton variant="contained" onClick={handleSlotPreferences} disabled={!slotPreferencesInput.trim()} sx={isMobile ? { width: '100%' } : undefined}>{t('booking.wizard.autoAllocate')}</PrimaryButton>
                    </Box>
                    {slotPreferences.length > 0 && <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(51, 51, 51, 0.08)', borderRadius: 1 }}><Typography variant="body2" sx={{ color: 'primary.main' }}>✅ {t('booking.wizard.preferences', { list: slotPreferences.join(' → ') })}</Typography></Box>}
                    {selectedSession && <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(16, 185, 129, 0.10)', borderRadius: 1 }}><Typography variant="body2" sx={{ color: 'success.main' }}>✅ {t('booking.wizard.allocatedSlot', { index: sessions.indexOf(selectedSession) + 1 })} ({formatPlatformTime(selectedSession.start_time, platformTimezone)} - {formatPlatformTime(selectedSession.end_time, platformTimezone)})</Typography></Box>}
                </Paper>
            </Box>
        );
    };

    const renderFreeEntries = () => {
        const max = eventDetails?.max_tickets_per_order || 10;
        return (
            <Box sx={{ py: 2 }}>
                <Alert severity="info" sx={{ mb: 3 }}>{t('bookings.howManyRegistering')}</Alert>
                <Paper sx={{ p: isMobile ? 2 : 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                    <Box><Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('bookings.numberOfEntries')}</Typography><Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('booking.wizard.maxPerRegistration', { max })}</Typography></Box>
                    <Box display="flex" alignItems="center" gap={2}>
                        <IconButton onClick={() => updateFreeEntries(-1)} disabled={freeEntries <= 0} sx={{ bgcolor: 'action.hover', minWidth: 44, minHeight: 44 }} aria-label={t('booking.wizard.decreaseEntries')}><RemoveIcon fontSize="small" /></IconButton>
                        <Typography variant="h5" sx={{ minWidth: 44, textAlign: 'center', fontWeight: 700 }}>{freeEntries}</Typography>
                        <IconButton onClick={() => updateFreeEntries(1)} disabled={freeEntries >= max} sx={{ bgcolor: 'action.hover', minWidth: 44, minHeight: 44 }} aria-label={t('booking.wizard.increaseEntries')}><AddIcon fontSize="small" /></IconButton>
                    </Box>
                </Paper>
                <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 2 }}><Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('booking.wizard.registeringCount', { count: freeEntries, people: t(freeEntries === 1 ? 'bookings.person_one' : 'bookings.person_other') })} {t('bookings.registeringPass')}</Typography></Box>
            </Box>
        );
    };

    // =========================================================================
    // Step 3 — Ticket / Seat selection
    // =========================================================================
    const renderTicketSelection = () => {
        if (hasReservedSeating) {
            if (seatingLayoutLoading || !seatingLayout) {
                return (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 320px)', minHeight: '500px' }}>
                        <CircularProgress />
                    </Box>
                );
            }
            return (
                <Box sx={{ 
                    py: 2, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 2,
                    width: '100%',
                    height: 'calc(100vh - 340px)',
                    minHeight: '540px',
                    maxHeight: '780px',
                }}>
                    
                    {/* ✅ Two-column header: Alert on left, Summary on right */}
                    <Box sx={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <Alert 
                            severity="info" 
                            sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}
                        >
                            <LocationIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                            {t('bookings.selectSeatsHint', { event: selectedEvent?.title })}
                            {selectedSession && (
                                <span> • <ScheduleIcon sx={{ fontSize: 16, verticalAlign: 'middle' }} /> {t('booking.wizard.sessionDateLabel', { start: formatPlatformTime(selectedSession.start_time, platformTimezone), end: formatPlatformTime(selectedSession.end_time, platformTimezone) })}</span>
                            )}
                        </Alert>
                        
                        <Paper sx={{ 
                            px: 3, 
                            py: 1, 
                            display: 'flex', 
                            flexDirection: 'column', 
                            justifyContent: 'center',
                            border: `1px solid ${BRAND_COLORS.border}`,
                            borderRadius: 1,
                            minWidth: '200px',
                            bgcolor: C.bgPrimary,
                        }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                🎫 {t('bookings.seatsSelected', { count: selectedSeats.length })}
                            </Typography>
                            <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 700 }}>
                                {formatMoney(selectedSeats.reduce((sum, s) => sum + (Number(s.price) || 0), 0))}
                            </Typography>
                        </Paper>
                    </Box>
                    
                    <Box sx={{ flexGrow: 1, minHeight: 0, width: '100%', position: 'relative' }}>
                        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
                            <SeatingCanvas
                                ref={canvasRef}
                                layoutData={seatingLayout}
                                selectedSeatIds={selectedSeats.map(s => s.id)}
                                onSelectSeats={setSelectedSeats}
                            />
                        </Box>

                        {/* Zoom Controls */}
                        <Stack
                            direction="row"
                            spacing={0.5}
                            alignItems="center"
                            sx={{ 
                                position: 'absolute', 
                                bottom: 16, 
                                right: 16, 
                                bgcolor: 'rgba(255, 255, 255, 0.95)', 
                                backdropFilter: 'blur(4px)',
                                borderRadius: 2, 
                                px: 1, 
                                py: 0.5,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                border: `1px solid ${BRAND_COLORS.border}`,
                                zIndex: 100
                            }}
                        >
                            <IconButton size="small" onClick={() => canvasRef.current?.zoomOut()} sx={{ width: 28, height: 28 }}>
                                <ZoomOut fontSize="small" sx={{ color: BRAND_COLORS.charcoal }} />
                            </IconButton>
                            <IconButton size="small" onClick={() => canvasRef.current?.fitToScreen()} sx={{ width: 28, height: 28 }}>
                                <FitScreen fontSize="small" sx={{ color: BRAND_COLORS.charcoal }} />
                            </IconButton>
                            <Typography variant="caption" sx={{ minWidth: 42, textAlign: 'center', fontWeight: 600, color: BRAND_COLORS.charcoal }}>
                                {canvasRef.current?.zoomPct || 100}%
                            </Typography>
                            <IconButton size="small" onClick={() => canvasRef.current?.zoomIn()} sx={{ width: 28, height: 28 }}>
                                <ZoomIn fontSize="small" sx={{ color: BRAND_COLORS.charcoal }} />
                            </IconButton>
                        </Stack>

                        {/* Legend */}
                        <Box sx={{ 
                            position: 'absolute', 
                            bottom: 16, 
                            left: 16, 
                            bgcolor: 'rgba(255, 255, 255, 0.95)', 
                            backdropFilter: 'blur(4px)',
                            borderRadius: 2, 
                            px: 2, 
                            py: 1,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            border: `1px solid ${BRAND_COLORS.border}`,
                            zIndex: 100,
                            display: 'flex',
                            gap: 1.5,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            maxWidth: 'calc(100% - 160px)' 
                        }}>
                            {seatingLegendStats.map((stat) => (
                                <Box key={stat.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <Box sx={{ width: 12, height: 12, border: `1px solid ${BRAND_COLORS.charcoal}`, borderRadius: 0.5, bgcolor: stat.color }} />
                                    <Typography variant="caption" sx={{ fontWeight: 600, color: BRAND_COLORS.darkGray }}>
                                        {stat.labelKey ? t(stat.labelKey) : stat.name}: {stat.count}
                                    </Typography>
                                </Box>
                            ))}
                            
                            {selectedSeats.length > 0 && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1, pl: 1, borderLeft: `1px solid ${BRAND_COLORS.border}` }}>
                                    <Box sx={{ width: 12, height: 12, border: `1px solid ${C.black}`, borderRadius: 0.5, bgcolor: C.primary }} />
                                    <Typography variant="caption" sx={{ fontWeight: 700, color: C.primary }}>
                                        {t('booking.wizard.selected')}: {selectedSeats.length}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    </Box>
                </Box>
            );
        }

        return (
            <Box sx={{ py: 2 }}>
                <Alert severity="info" sx={{ mb: 3 }}>
                    {t('booking.wizard.selected')}: <strong>{selectedEvent?.title}</strong>
                    {selectedSession && <span> • <ScheduleIcon sx={{ fontSize: 16, verticalAlign: 'middle' }} /> {t('booking.wizard.sessionDateLabel', { start: formatPlatformTime(selectedSession.start_time, platformTimezone), end: formatPlatformTime(selectedSession.end_time, platformTimezone) })}</span>}
                </Alert>
                {tiers.length === 0 ? <Alert severity="warning">{eventDetails?.tiers?.length > 0 ? t('booking.wizard.allTicketsSoldOut') : t('booking.wizard.noTiers')}</Alert> : (
                    <Box>
                        {tiers.map((tier) => {
                            const available = (typeof tier.available === 'number') ? tier.available : Math.max(0, (tier.quantity_total || 0) - (tier.quantity_sold || 0));
                            const maxQty = Math.min(available, tier.max_per_order || 10);
                            const qty = quantities[tier.id] || 0;
                            return (
                                <Paper key={tier.id} sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                                    <Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary' }}>{tier.name}</Typography><Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('booking.wizard.tierPriceLine', { price: formatMoney(tier.price), available })}</Typography></Box>
                                    <Box display="flex" alignItems="center" gap={2}>
                                        <IconButton size="small" onClick={() => updateQuantity(tier.id, -1)} disabled={qty <= 0} sx={{ bgcolor: qty > 0 ? 'action.hover' : 'background.default', minWidth: 40, minHeight: 40 }}><RemoveIcon fontSize="small" /></IconButton>
                                        <Typography variant="h6" sx={{ minWidth: 40, textAlign: 'center', color: 'text.primary' }}>{qty}</Typography>
                                        <IconButton size="small" onClick={() => updateQuantity(tier.id, 1)} disabled={qty >= maxQty} sx={{ bgcolor: qty < maxQty ? 'rgba(51, 51, 51, 0.08)' : 'background.default', minWidth: 40, minHeight: 40 }}><AddIcon fontSize="small" /></IconButton>
                                    </Box>
                                </Paper>
                            );
                        })}
                        {totalTickets > 0 && <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 2 }}><Typography variant="subtitle1" sx={{ color: 'text.primary' }}>🎫 {t('booking.wizard.ticketsSelected', { count: totalTickets })}</Typography><Typography variant="h6" sx={{ color: 'primary.main' }}>{t('booking.wizard.totalAmount', { amount: formatMoney(totalAmount) })}</Typography></Box>}
                        {totalTickets > 0 && (
                            <Paper sx={{ mt: 3, p: isMobile ? 2 : 3, bgcolor: 'background.default' }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}><LocalOfferIcon fontSize="small" /> {t('booking.wizard.discountQuestion')}</Typography>
                                <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
                                    <TextField label={t('booking.wizard.discountCode')} placeholder={t('booking.wizard.discountPlaceholder')} value={discountInput} onChange={(e) => setDiscountInput(e.target.value.toUpperCase())} size="small" disabled={!!appliedDiscount?.valid || validatingDiscount} sx={{ minWidth: isMobile ? '100%' : 220, flex: isMobile ? 1 : 'unset' }} onKeyDown={(e) => { if (e.key === 'Enter' && !appliedDiscount?.valid) { e.preventDefault(); validateDiscount(); } }} />
                                    {appliedDiscount?.valid ? <Button variant="outlined" size="small" onClick={removeDiscount} sx={{ textTransform: 'none', color: 'error.main', borderColor: C.errorLight, '&:hover': { borderColor: C.error } }}>{t('booking.wizard.remove')}</Button> : <PrimaryButton variant="contained" size="small" disabled={validatingDiscount || !discountInput.trim()} onClick={validateDiscount} startIcon={validatingDiscount ? <CircularProgress size={16} color="inherit" /> : null} sx={isMobile ? { width: '100%' } : undefined}>{validatingDiscount ? t('booking.wizard.checking') : t('booking.wizard.apply')}</PrimaryButton>}
                                </Box>
                                {appliedDiscount?.valid && <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(16, 185, 129, 0.10)', borderRadius: 1 }}><Typography variant="body2" sx={{ color: 'success.dark', fontWeight: 600 }}>✅ {t('booking.wizard.discountApplied', { code: appliedDiscount.code, amount: formatMoney(appliedDiscount.discount_amount) })}</Typography></Box>}
                                {appliedDiscount?.valid && <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('booking.wizard.newTotal')}</Typography><Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 700 }}>{formatMoney(netAmount)}</Typography></Box>}
                            </Paper>
                        )}
                    </Box>
                )}
            </Box>
        );
    };

    const renderAttendeeDetails = () => {
        return (
            <Box sx={{ py: 2 }}>
                <Alert severity="info" sx={{ mb: 3 }}>
                    {hasReservedSeating ? t('bookings.enterDetailsAttendees', { count: selectedSeats.length }) : isFreeRegistrationFlow ? t('bookings.enterDetailsPeople', { count: freeEntries, people: t(freeEntries === 1 ? 'bookings.person_one' : 'bookings.person_other') }) : t('bookings.enterDetailsAttendees', { count: totalTickets })}
                </Alert>
                <Paper sx={{ p: isMobile ? 2 : 3, mb: 3 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}><PersonIcon sx={{ mr: 1, verticalAlign: 'middle' }} />{isFreeRegistrationFlow ? t('booking.wizard.primaryContact') : t('booking.wizard.customerDetails')}</Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={4}><TextField fullWidth label={t('booking.wizard.fullName')} value={customer.name} onChange={(e) => handleCustomerChange('name', e.target.value)} error={!!errors.name} helperText={errors.name} size="small" /></Grid>
                        <Grid item xs={12} md={4}><TextField fullWidth label={t('booking.wizard.email')} type="email" value={customer.email} onChange={(e) => handleEmailChange(e.target.value)} error={!!errors.email} helperText={errors.email} size="small" /></Grid>
                        <Grid item xs={12} md={4}><TextField fullWidth label={t('booking.wizard.phone')} value={customer.phone} onChange={(e) => handleCustomerChange('phone', e.target.value)} error={!!errors.phone} helperText={errors.phone} size="small" /></Grid>
                        <Grid item xs={12} md={6}><TextField fullWidth label={t('booking.wizard.whatsapp')} value={customer.whatsapp} onChange={(e) => handleCustomerChange('whatsapp', e.target.value)} size="small" /></Grid>
                        <Grid item xs={12} md={6}><TextField fullWidth label={t('booking.wizard.notes')} value={customer.notes} onChange={(e) => handleCustomerChange('notes', e.target.value)} size="small" multiline rows={1} /></Grid>
                    </Grid>
                </Paper>
                {hasReservedSeating ? (
                    <Paper sx={{ p: isMobile ? 2 : 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}><TicketIcon sx={{ mr: 1, verticalAlign: 'middle' }} />{t('bookings.attendeeSeatsTitle', { count: selectedSeats.length })}</Typography>
                        <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                            {reservedAttendees.map((attendee, index) => (
                                <Paper key={index} sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('bookings.seatLine', { index: index + 1, row: selectedSeats[index]?.row_label, seat: selectedSeats[index]?.seat_number })}</Typography>
                                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                        <Grid item xs={12} md={6}><TextField fullWidth placeholder={t('booking.wizard.fullName')} value={attendee.name} onChange={(e) => updateReservedAttendee(index, 'name', e.target.value)} size="small" error={!attendee.name?.trim() && activeStep === STEP_KEYS.ATTENDEES} /></Grid>
                                        <Grid item xs={12} md={3}><TextField fullWidth placeholder={t('bookings.labelEmail')} value={attendee.email} onChange={(e) => updateReservedAttendee(index, 'email', e.target.value)} size="small" /></Grid>
                                        <Grid item xs={12} md={3}><TextField fullWidth placeholder={t('bookings.labelPhone')} value={attendee.phone} onChange={(e) => updateReservedAttendee(index, 'phone', e.target.value)} size="small" /></Grid>
                                    </Grid>
                                </Paper>
                            ))}
                        </Box>
                    </Paper>
                ) : isFreeRegistrationFlow ? (
                    <Paper sx={{ p: isMobile ? 2 : 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 1 }}><TicketIcon sx={{ mr: 1, verticalAlign: 'middle' }} /> {t('booking.wizard.entryDetails', { count: freeEntries })}</Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>{t('bookings.eachEntryPass')}</Typography>
                        {errors.freeAttendees && <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mb: 1 }}>{errors.freeAttendees}</Typography>}
                        <Box sx={{ maxHeight: 480, overflowY: 'auto' }}>
                            {freeAttendees.map((att, index) => (
                                <Paper key={index} sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('booking.wizard.entryLabel', { index: index + 1 })}{index === 0 ? ` — ${t('booking.wizard.primaryContactHint')}` : ''}</Typography>
                                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                        <Grid item xs={12} md={4}><TextField fullWidth placeholder={t('booking.wizard.fullName')} value={att.name} onChange={(e) => updateFreeAttendee(index, 'name', e.target.value)} size="small" error={!att.name?.trim() && activeStep === STEP_KEYS.ATTENDEES} /></Grid>
                                        <Grid item xs={12} md={4}><TextField fullWidth placeholder={index === 0 ? t('booking.wizard.emailDefaultsToPrimary') : t('booking.wizard.emailOptional')} value={att.email} onChange={(e) => updateFreeAttendee(index, 'email', e.target.value)} size="small" type="email" /></Grid>
                                        <Grid item xs={12} md={4}><TextField fullWidth placeholder={index === 0 ? t('booking.wizard.phoneDefaultsToPrimary') : t('booking.wizard.phoneOptional')} value={att.phone} onChange={(e) => updateFreeAttendee(index, 'phone', e.target.value)} size="small" /></Grid>
                                    </Grid>
                                </Paper>
                            ))}
                        </Box>
                        <Button variant="text" size="small" onClick={() => { if (!customer.name?.trim()) { toast.warning(t('bookings.enterPrimaryNameFirst')); return; } freeAttendees.forEach((att, i) => { if (i > 0 && !att.name?.trim()) updateFreeAttendee(i, 'name', customer.name); }); }} sx={{ mt: 1 }}>{t('booking.wizard.fillEmptyNamesWithPrimary')}</Button>
                    </Paper>
                ) : (
                    <Paper sx={{ p: isMobile ? 2 : 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}><TicketIcon sx={{ mr: 1, verticalAlign: 'middle' }} /> {t('booking.wizard.stepAttendeeDetails')}{errors.attendees && <Typography variant="caption" sx={{ color: 'error.main', ml: 2 }}>{errors.attendees}</Typography>}</Typography>
                        <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                            {attendees.map((attendee, index) => (
                                <Paper key={index} sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>#{index + 1} • {attendee.tier_name}</Typography>
                                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                        <Grid item xs={12} md={6}><TextField fullWidth placeholder={t('booking.wizard.fullName')} value={attendee.name} onChange={(e) => updateAttendee(index, 'name', e.target.value)} size="small" error={!attendee.name?.trim() && activeStep === STEP_KEYS.ATTENDEES} /></Grid>
                                        <Grid item xs={12} md={3}><TextField fullWidth placeholder={t('bookings.labelEmail')} value={attendee.email} onChange={(e) => updateAttendee(index, 'email', e.target.value)} size="small" /></Grid>
                                        <Grid item xs={12} md={3}><TextField fullWidth placeholder={t('bookings.labelPhone')} value={attendee.phone} onChange={(e) => updateAttendee(index, 'phone', e.target.value)} size="small" /></Grid>
                                    </Grid>
                                </Paper>
                            ))}
                        </Box>
                        <Button variant="text" size="small" onClick={fillEmptyNamesWithCustomer} sx={{ mt: 1 }}>{t('booking.wizard.fillEmptyNamesWithCustomer')}</Button>
                    </Paper>
                )}
            </Box>
        );
    };

    const renderReview = () => (
        <Box sx={{ py: 2 }}>
            <Alert severity="success" sx={{ mb: 3 }}>{t('booking.wizard.reviewHint')}</Alert>
            <Grid container spacing={isMobile ? 2 : 3}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: isMobile ? 2 : 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}><EventIcon sx={{ mr: 1, verticalAlign: 'middle' }} /> {t('booking.wizard.eventDetails')}</Typography>
                        <Box>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}><strong>{t('booking.event')}:</strong> {selectedEvent?.title}</Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}><strong>{t('events.venueLabel')}:</strong> {formatVenueAddress(selectedEvent?.venue) || t('common.tbd')}</Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}><strong>{t('booking.date')}:</strong> {selectedEvent?.start_date ? new Date(selectedEvent.start_date).toLocaleDateString() : t('common.tbd')}</Typography>
                            {selectedSession && <Typography variant="body2" sx={{ color: 'text.secondary' }}><strong>{t('bookings.reviewSlotLabel')}:</strong> {formatPlatformTime(selectedSession.start_time, platformTimezone)} - {formatPlatformTime(selectedSession.end_time, platformTimezone)}</Typography>}
                            {slotPreferences.length > 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}><strong>{t('booking.wizard.slotPreferencesLabel')}</strong> {slotPreferences.map((n, i) => `#${i + 1}: Slot ${n}`).join(' · ')}</Typography>}
                        </Box>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: isMobile ? 2 : 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}><PersonIcon sx={{ mr: 1, verticalAlign: 'middle' }} /> {t('booking.wizard.customerDetails')}</Typography>
                        <Box>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}><strong>{t('bookings.labelName')}:</strong> {customer.name}</Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}><strong>{t('bookings.labelEmail')}:</strong> {customer.email}</Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}><strong>{t('bookings.labelPhone')}:</strong> {customer.phone}</Typography>
                            {customer.whatsapp && <Typography variant="body2" sx={{ color: 'text.secondary' }}><strong>{t('bookings.labelWhatsApp')}:</strong> {customer.whatsapp}</Typography>}
                            {customer.notes && <Typography variant="body2" sx={{ color: 'text.secondary' }}><strong>{t('booking.notes')}:</strong> {customer.notes}</Typography>}
                            {eventDetails?.privacy_notice_text && (
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="caption" sx={{ color: C.textSecondary, display: 'block' }}>
                                        {eventDetails.privacy_notice_text}
                                    </Typography>
                                    <FormControlLabel
                                        control={<Checkbox checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} />}
                                        label={<Typography variant="caption">{t('booking.privacyAccept', 'I accept the privacy notice.')}</Typography>}
                                    />
                                </Box>
                            )}
                            {eventDetails?.marketing_opt_in_enabled && (
                                <FormControlLabel
                                    control={<Checkbox checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} />}
                                    label={<Typography variant="caption">{t('booking.marketingOptIn', 'I would like to receive future updates.')}</Typography>}
                                />
                            )}
                        </Box>
                    </Paper>
                </Grid>
                <Grid item xs={12}>
                    <Paper sx={{ p: isMobile ? 2 : 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}><TicketIcon sx={{ mr: 1, verticalAlign: 'middle' }} />{hasReservedSeating ? t('bookings.reservedSeatsTitle', { count: selectedSeats.length }) : isFreeRegistrationFlow ? t('booking.wizard.registrationLabel') : t('bookings.ticketsTitle', { count: totalTickets })}</Typography>
                        <Box>
                            {hasReservedSeating ? (
                                <Box>
                                    {selectedSeats.map((seat, i) => (
                                        <Box key={seat.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: `1px solid ${C.bgCardHover}`, gap: 1 }}>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>#{i + 1} {seat.category_name || t('bookings.general')} - {t('bookings.rowSeat', { row: seat.row_label, seat: seat.seat_number })}</Typography>
                                                {reservedAttendees[i]?.name && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{reservedAttendees[i].name}</Typography>}
                                            </Box>
                                            <Typography variant="body2" sx={{ color: 'text.primary', flexShrink: 0 }}>{formatMoney(Number(seat.price) || 0)}</Typography>
                                        </Box>
                                    ))}
                                </Box>
                            ) : isFreeRegistrationFlow ? (
                                <Box>
                                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>{t('booking.wizard.freeRegistrationInfo', { count: freeEntries, passes: t(freeEntries === 1 ? 'booking.wizard.freeRegistrationPassCount_one' : 'booking.wizard.freeRegistrationPassCount_other') })}</Typography>
                                    {freeAttendees.map((att, i) => (
                                        <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: `1px solid ${C.bgCardHover}`, gap: 1 }}>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>#{i + 1} {att.name || t('bookings.nameMissing')}</Typography>
                                                {att.email && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{att.email}</Typography>}
                                            </Box>
                                            <Chip size="small" label={t('booking.wizard.entryShortLabel')} variant="outlined" sx={{ alignSelf: 'center', fontSize: '10px', height: '20px' }} />
                                        </Box>
                                    ))}
                                </Box>
                            ) : (
                                <>
                                    {ticketList.map((ticket, index) => (
                                        <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: `1px solid ${C.bgCardHover}`, gap: 1 }}>
                                            <Typography variant="body2" sx={{ color: 'text.primary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>#{index + 1} {ticket.tier_name}{attendees[index]?.name && ` - ${attendees[index].name}`}</Typography>
                                            <Typography variant="body2" sx={{ color: 'text.primary', flexShrink: 0 }}>{formatMoney(ticket.price)}</Typography>
                                        </Box>
                                    ))}
                                </>
                            )}
                            {eventDetails?.donations_enabled && !isFreeRegistrationFlow && (
                                <Box sx={{ mt: 2, p: 2, bgcolor: C.bgPrimary, borderRadius: 2 }}>
                                    <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 700, mb: 0.5 }}>
                                        {t('booking.donationTitle')}
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1.5 }}>
                                        {t('booking.donationHelper', { currency: eventDetails?.currency_code || 'HKD' })}
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                                        {(eventDetails?.donation_presets || []).map((amount) => (
                                            <Button key={amount} size="small" variant={Number(donationAmount) === Number(amount) ? 'contained' : 'outlined'} onClick={() => setDonationAmount(String(amount))}>
                                                {formatMoney(amount)}
                                            </Button>
                                        ))}
                                    </Box>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        type="number"
                                        label={t('booking.donationAmountLabel')}
                                        value={donationAmount}
                                        onChange={(e) => setDonationAmount(e.target.value)}
                                        inputProps={{ min: 0, step: '0.01' }}
                                        helperText={t('booking.donationTaxHint')}
                                    />
                                    {donationValue > 0 && (
                                        <TextField
                                            fullWidth size="small" sx={{ mt: 1.5 }}
                                            label={t('booking.donorNameLabel', 'Donor name for receipt')}
                                            value={donorName || customer.name}
                                            onChange={(e) => setDonorName(e.target.value)}
                                        />
                                    )}
                                </Box>
                            )}
                            <Divider sx={{ my: 2 }} />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{hasReservedSeating ? t('bookings.subtotalSeats', { count: selectedSeats.length }) : t('bookings.subtotalTickets', { count: totalTickets })}</Typography>
                                <Typography variant="body2" sx={{ color: 'text.primary' }}>{formatMoney(hasReservedSeating ? selectedSeats.reduce((sum, s) => sum + (Number(s.price) || 0), 0) : totalAmount)}</Typography>
                            </Box>
                            {appliedDiscount?.valid && <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}><Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>{t('booking.discount')} ({appliedDiscount.code})</Typography><Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>−{formatMoney(appliedDiscount.discount_amount)}</Typography></Box>}
                            {donationValue > 0 && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                    <Typography variant="body2" sx={{ color: 'secondary.main', fontWeight: 600 }}>{t('booking.donationLine')}</Typography>
                                    <Typography variant="body2" sx={{ color: 'secondary.main', fontWeight: 600 }}>{formatMoney(donationValue)}</Typography>
                                </Box>
                            )}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1.5, mt: 1, borderTop: `2px solid ${C.borderLight}` }}>
                                <Typography variant="subtitle1" sx={{ color: 'text.primary', fontWeight: 700 }}>{t('booking.wizard.totalLabel')}</Typography>
                                <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 700 }}>{formatMoney(grandTotal)}</Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );

    const getStepContent = (key) => {
        switch (key) {
            case STEP_KEYS.EVENT: return renderEventSelection();
            case STEP_KEYS.SLOT: return renderSlotSelection();
            case STEP_KEYS.ENTRIES: return renderFreeEntries();
            case STEP_KEYS.TICKETS: return renderTicketSelection();
            case STEP_KEYS.ATTENDEES: return renderAttendeeDetails();
            case STEP_KEYS.REVIEW: return renderReview();
            default: return null;
        }
    };

    const safeActiveStep = visibleSteps.includes(activeStep) ? activeStep : visibleSteps[0];

    return (
        <PageContainer>
            <PageHeader>
                <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                    {isAuthenticated && <IconButton onClick={() => navigate('/app/bookings')}><ArrowBackIcon /></IconButton>}
                    <PageTitle variant="h4">{isAuthenticated ? (isRegularUser ? t('booking.wizard.title') : t('booking.wizard.titleAdmin')) : t('booking.wizard.titleGuest')}</PageTitle>
                </Box>
                <Box display="flex" gap={1}>
                    <OutlineButton onClick={() => { if (isAuthenticated) navigate('/app/bookings'); else navigate('/', { replace: true }); }}>{isAuthenticated ? t('booking.wizard.cancel') : t('booking.wizard.backToHome')}</OutlineButton>
                </Box>
            </PageHeader>
            <Paper sx={{ p: isMobile ? 2 : 4, mt: 2 }}>
                <Stepper activeStep={stepIndex(safeActiveStep)} orientation={isMobile ? 'vertical' : 'horizontal'} sx={{ mb: 4, ...(isMobile && { '& .MuiStepLabel-label': { fontSize: '0.85rem' } }) }}>
                    {visibleSteps.map((key) => <Step key={key}><StepLabel>{stepLabel(key)}</StepLabel></Step>)}
                </Stepper>
                {loading || isLoadingEvent ? <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box> : <Box>{getStepContent(safeActiveStep)}</Box>}
                <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', justifyContent: 'space-between', gap: isMobile ? 1.5 : 0, mt: 4, pt: 2, borderTop: '1px solid rgba(226, 232, 240, 1)' }}>
                    <Button variant="outlined" onClick={handleBack} disabled={stepIndex(safeActiveStep) === 0} startIcon={<ArrowBackIcon />} sx={isMobile ? { width: '100%' } : undefined}>{t('booking.wizard.back')}</Button>
                    <Box sx={isMobile ? { width: '100%' } : undefined}>
                        {safeActiveStep === STEP_KEYS.REVIEW ? (
                            <PrimaryButton variant="contained" onClick={handleSubmit} disabled={loading} startIcon={loading ? <CircularProgress size={20} /> : <CheckIcon />} sx={isMobile ? { width: '100%' } : undefined}>{loading ? t('booking.wizard.creating') : t('booking.wizard.confirmBooking')}</PrimaryButton>
                        ) : (
                            <PrimaryButton variant="contained" onClick={handleNext} endIcon={<ArrowForwardIcon />} disabled={safeActiveStep === STEP_KEYS.ENTRIES && freeEntries === 0} sx={isMobile ? { width: '100%' } : undefined}>{t('booking.wizard.next')}</PrimaryButton>
                        )}
                    </Box>
                </Box>
            </Paper>
        </PageContainer>
    );
};

export default CreateBooking;