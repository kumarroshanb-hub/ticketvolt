// frontend/src/pages/Bookings/CreateBooking.js
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Box,
    Typography,
    Paper,
    Stepper,
    Step,
    StepLabel,
    Button,
    CircularProgress,
    Alert,
    Grid,
    Divider,
    Card,
    CardContent,
    TextField,
    IconButton,
    Chip,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    ArrowForward as ArrowForwardIcon,
    Check as CheckIcon,
    Event as EventIcon,
    ConfirmationNumber as TicketIcon,
    Person as PersonIcon,
    Add as AddIcon,
    Remove as RemoveIcon,
    Schedule as ScheduleIcon,
    CalendarMonth as CalendarIcon,
    LocationOn as LocationIcon,
    People as PeopleIcon,
    LocalOffer as LocalOfferIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { useSettings } from '../../context/SettingsContext';
import api from '../../services/api';
import { PageContainer, PageHeader, PageTitle, PrimaryButton, OutlineButton } from '../../components/Common';
import { ROLES } from '../../constants';
import useBookingDraft from '../../hooks/useBookingDraft';
import EventCard from '../../components/Common/EventCard'; // ✅ IMPORTED

// =============================================================================
// STEP DEFINITIONS
// =============================================================================

const STEP_KEYS = {
    EVENT: 'event',
    SLOT: 'slot',
    ENTRIES: 'entries',   // free-registration only
    TICKETS: 'tickets',
    ATTENDEES: 'attendees',
    REVIEW: 'review',
};

const STEP_LABELS = {
    [STEP_KEYS.EVENT]: 'Select Event',
    [STEP_KEYS.SLOT]: 'Choose Slot',
    [STEP_KEYS.ENTRIES]: 'Number of Entries',
    [STEP_KEYS.TICKETS]: 'Choose Tickets',
    [STEP_KEYS.ATTENDEES]: 'Attendee Details',
    [STEP_KEYS.REVIEW]: 'Review & Confirm',
};

const FREE_ATTENDEES_LABEL = 'Registrant Details';

const formatVenueAddress = (venue) => {
    if (!venue) return '';
    const parts = [
        venue.name,
        venue.address_line1,
        venue.address_line2,
        venue.city,
        venue.state,
        venue.postal_code,
        venue.country,
    ].filter((p) => p && String(p).trim() !== '');
    return parts.join(', ');
};

// ✅ NEW: render a date/time in the platform timezone (settings.default_timezone).
// Falls back to the browser's locale rendering if the timezone is missing or
// invalid, so a misconfigured setting can never crash the wizard.
const formatPlatformTime = (value, timezone, options = {}) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const baseOptions = {
        hour: '2-digit',
        minute: '2-digit',
        ...options,
    };

    if (timezone) {
        try {
            return new Intl.DateTimeFormat(undefined, {
                ...baseOptions,
                timeZone: timezone,
            }).format(date);
        } catch {
            // Invalid timezone — fall through to locale rendering.
        }
    }
    return date.toLocaleTimeString([], baseOptions);
};

const BOOKING_ERROR_FIELD_KEYS = [
    'customer_email',
    'customer_name',
    'customer_phone',
    'whatsapp_number',
    'session',
    'tickets',
    'discount_code',
    'event',
    'metadata',
    'entries',
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
    const { user, isAuthenticated } = useAuth();
    const { role } = useRole();
    const { formatMoney, settings } = useSettings();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
    const isOrganizer = role === ROLES.ORGANIZER;
    const canManageEvents = isAdmin || isOrganizer;
    const isRegularUser = role === ROLES.USER;

    // ✅ Platform timezone used for every slot time in the wizard.
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

    const isFreeRegistrationFlow =
        (eventDetails && eventDetails.event_flow === 'free_registration') ||
        (selectedEvent && selectedEvent.event_flow === 'free_registration');

    const draft = useBookingDraft({
        tiers,
        selectedEvent,
        selectedSession,
        slotPreferences,
        bookingSource: isRegularUser ? 'user_portal' : 'admin_portal',
        isFreeRegistration: isFreeRegistrationFlow,
        maxEntriesPerOrder: eventDetails?.max_tickets_per_order || 10,
    });

    const {
        quantities,
        customer,
        attendees,
        errors,
        ticketList,
        totalTickets,
        totalAmount,
        updateQuantity,
        updateAttendee,
        handleCustomerChange,
        fillEmptyNamesWithCustomer,
        resetDraft,
        validate,
        buildPayload,
        freeEntries,
        freeAttendees,
        updateFreeEntries,
        updateFreeAttendee,
    } = draft;

    // =========================================================================
    // ✅ FIX: prefill the "primary contact" from the logged-in user
    // ------------------------------------------------------------
    // Rules:
    //   • Only for authenticated Regular Users. Admins/organizers book
    //     on behalf of customers, so we never overwrite their form with
    //     the admin's own info.
    //   • Only runs when the draft is **pristine** — i.e. every customer
    //     field is blank. That is true:
    //         – on first mount, and
    //         – immediately after `resetDraft()` (e.g. when the user
    //           picks a different event, or the auto-select effect fires
    //           because of a `?event=…` query param).
    //     It is false the moment the user types anything, so we never
    //     clobber user input, and deliberately clearing a single field
    //     is preserved.
    //   • This replaces the previous one-shot `useRef` gate, which
    //     refused to re-seed after `resetDraft()` wiped the fields —
    //     that was the actual "not prefilled" bug.
    //   • The seeded values are fully editable.
    // =========================================================================
    useEffect(() => {
        if (!isAuthenticated || !user || role !== ROLES.USER) return;

        // Only seed when the form is completely untouched.
        const isPristine =
            !customer.name?.trim() &&
            !customer.email?.trim() &&
            !customer.phone?.trim() &&
            !customer.whatsapp?.trim() &&
            !customer.notes?.trim();
        if (!isPristine) return;

        // Compute display name, preferring "First Last" over username.
        const fullName =
            (user.name && String(user.name).trim()) ||
            [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
            user.username ||
            '';

        // Derive phone from either flat field or nested profile.
        const phone =
            (user.phone && String(user.phone).trim()) ||
            (user.profile?.phone && String(user.profile.phone).trim()) ||
            '';

        const whatsapp =
            (user.whatsapp_number && String(user.whatsapp_number).trim()) ||
            (user.profile?.whatsapp_number && String(user.profile.whatsapp_number).trim()) ||
            '';

        if (fullName) handleCustomerChange('name', fullName);
        if (user.email) handleCustomerChange('email', user.email);
        if (phone) handleCustomerChange('phone', phone);
        const wa = whatsapp || phone;
        if (wa) handleCustomerChange('whatsapp', wa);
    }, [isAuthenticated, user, role, customer, handleCustomerChange]);

    // =========================================================================
    // ✅ Mirror the primary contact into entry #0 of the entry list.
    // ------------------------------------------------------------
    // `freeAttendees` (free registration) and `attendees` (ticketed) are
    // created BLANK by useBookingDraft. The primary-contact prefill above
    // only touches `customer`, so entry #0 was rendering empty even though
    // the customer block above it was filled in.
    //
    // This effect runs on every render, but only writes fields that are
    // still blank. That means:
    //   • It fills entry #0 as soon as the entry list appears.
    //   • It never overwrites a name/email/phone the user has typed.
    //   • It is idempotent: once the fields are filled, the patch object
    //     is empty and no state update happens.
    // =========================================================================
    useEffect(() => {
        // FREE REGISTRATION: seed freeAttendees[0]
        if (isFreeRegistrationFlow && freeAttendees.length > 0) {
            const first = freeAttendees[0] || {};
            const patch = {};
            if (!first.name?.trim() && customer.name?.trim()) patch.name = customer.name;
            if (!first.email?.trim() && customer.email?.trim()) patch.email = customer.email;
            if (!first.phone?.trim() && customer.phone?.trim()) patch.phone = customer.phone;
            if (Object.keys(patch).length > 0) {
                Object.entries(patch).forEach(([field, value]) =>
                    updateFreeAttendee(0, field, value)
                );
            }
        }

        // TICKETED: seed attendees[0]
        if (!isFreeRegistrationFlow && attendees.length > 0) {
            const first = attendees[0] || {};
            const patch = {};
            if (!first.name?.trim() && customer.name?.trim()) patch.name = customer.name;
            if (!first.email?.trim() && customer.email?.trim()) patch.email = customer.email;
            if (!first.phone?.trim() && customer.phone?.trim()) patch.phone = customer.phone;
            if (Object.keys(patch).length > 0) {
                Object.entries(patch).forEach(([field, value]) =>
                    updateAttendee(0, field, value)
                );
            }
        }
    }, [
        isFreeRegistrationFlow,
        freeAttendees,
        attendees,
        customer.name,
        customer.email,
        customer.phone,
        updateFreeAttendee,
        updateAttendee,
    ]);

    // =========================================================================
    // ✅ FIX: Auto-select the slot if there is only one available.
    // ------------------------------------------------------------
    // When an event has exactly one time slot, forcing the user to
    // click "Next" just to select that single option is poor UX. This
    // effect automatically sets `selectedSession` to the only session
    // if none has been chosen yet, so they can proceed immediately.
    // =========================================================================
    useEffect(() => {
        if (sessions.length === 1 && !selectedSession) {
            setSelectedSession(sessions[0]);
        }
    }, [sessions, selectedSession]);

    const discountAmount = appliedDiscount?.valid ? appliedDiscount.discount_amount : 0;
    const netAmount = Math.max(0, totalAmount - discountAmount);

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

    // =========================================================================
    // STEP SEQUENCE
    // =========================================================================
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

    const stepLabel = (key) =>
        isFreeRegistrationFlow && key === STEP_KEYS.ATTENDEES
            ? FREE_ATTENDEES_LABEL
            : STEP_LABELS[key];

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

    // =========================================================================
    // Data loading
    // =========================================================================

    useEffect(() => {
        loadEvents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, location.search, autoSelectDone]);

    useEffect(() => {
        if (!appliedDiscount?.valid) return;

        if (totalTickets === 0) {
            setAppliedDiscount(null);
            setDiscountInput('');
            return;
        }

        let cancelled = false;
        const revalidate = async () => {
            try {
                const res = await api.post('/bookings/validate_discount/', {
                    code: appliedDiscount.code,
                    event_id: selectedEvent?.id,
                    subtotal: totalAmount,
                    ticket_count: totalTickets,
                },
                    // ✅ FIX [GUEST-FLOW]: same opt-out as validateDiscount.
                    { skipAuthRedirect: !isAuthenticated }
            );
                if (cancelled) return;

                if (res.data?.valid) {
                    setAppliedDiscount(res.data);
                } else {
                    setAppliedDiscount(null);
                    setDiscountInput('');
                    toast.info(
                        `Discount "${appliedDiscount.code}" is no longer valid: ${
                            res.data?.reason || 'conditions changed'
                        }`
                    );
                }
            } catch {
                if (!cancelled) {
                    setAppliedDiscount(null);
                    setDiscountInput('');
                }
            }
        };

        revalidate();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [totalAmount, totalTickets, selectedEvent?.id]);

    const loadEvents = async () => {
        setLoading(true);
        setEventLoadError(null);
        try {
            let data = [];

            if (canManageEvents) {
                try {
                    const response = await api.get('/events/');
                    if (Array.isArray(response.data)) {
                        data = response.data;
                    } else if (response.data && response.data.results) {
                        data = response.data.results;
                    } else if (response.data && typeof response.data === 'object') {
                        data = Object.values(response.data).filter((item) => item.id && item.title);
                    }
                } catch (adminError) {
                    console.log('📅 Admin endpoint failed:', adminError.message);
                }
            } else {
                try {
                    const response = await api.get('/events/public/');
                    if (response.data && response.data.results) {
                        data = response.data.results;
                    } else if (Array.isArray(response.data)) {
                        data = response.data;
                    }
                } catch (publicError) {
                    console.log('📅 Public endpoint failed:', publicError.message);
                }
            }

            if (isRegularUser && data.length > 0) {
                data = data.filter((e) => {
                    const status = e.status || 'draft';
                    return status === 'active' || status === 'published';
                });
            }

            setEvents(data);

            if (data.length === 0) {
                setEventLoadError(
                    canManageEvents
                        ? 'No events found. Please create an event first!'
                        : 'No active events available for booking. Check back later!'
                );
            }
        } catch (error) {
            let errorMsg = 'Failed to load events';
            if (error.response?.status === 404) {
                errorMsg = 'Events endpoint not found. Please check the backend.';
            } else if (error.response?.status === 401 || error.response?.status === 403) {
                errorMsg = 'Authentication required. Please log in again.';
            } else if (error.response?.data?.detail) {
                errorMsg = error.response.data.detail;
            } else if (error.response?.data?.error) {
                errorMsg = error.response.data.error;
            } else if (error.message) {
                errorMsg = error.message;
            }
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
            try {
                const response = await api.get(`/events/public/${eventId}/`);
                data = response.data;
            } catch (publicError) {
                const response = await api.get(`/events/${eventId}/`);
                data = response.data;
            }

            setEventDetails(data);
            if (selectedEvent) setSelectedEvent(data);

            setSessions(data.sessions || []);

            const availableTiers = (data.tiers || []).filter((t) => {
                const available = (typeof t.available === 'number')
                    ? t.available
                    : Math.max(0, (t.quantity_total || 0) - (t.quantity_sold || 0));
                return available > 0;
            });
            setTiers(availableTiers);

            const isFree = data.event_flow === 'free_registration';
            if (!isFree) {
                if (availableTiers.length === 0 && data.tiers && data.tiers.length > 0) {
                    toast.info('All tickets for this event are sold out');
                } else if (availableTiers.length === 0) {
                    toast.info('No tickets available for this event');
                }
            }
        } catch (error) {
            let errorMsg = 'Failed to load event details';
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
        resetDraft();
        setSubmitError(null);   // clear any stale error from a previous event
        setSelectedEvent(event);
        setSelectedSession(null);
        setSlotPreferences([]);
        setSlotPreferencesInput('');
        setTiers([]);
        setEventDetails(null);
        setDiscountInput('');
        setAppliedDiscount(null);

        loadEventDetails(event.id);

        const hasSessionsPreview =
            (event.session_count ?? event.sessions?.length ?? 0) > 0;
        setActiveStep(hasSessionsPreview ? STEP_KEYS.SLOT : nextNonSlotStep(event));
    };

    const nextNonSlotStep = (event) => {
        const isFree = event.event_flow === 'free_registration';
        return isFree ? STEP_KEYS.ENTRIES : STEP_KEYS.TICKETS;
    };

    // =========================================================================
    // Discount validation
    // =========================================================================

    const validateDiscount = async () => {
        if (!discountInput.trim()) return;

        setValidatingDiscount(true);
        try {
            const res = await api.post('/bookings/validate_discount/', {
                code: discountInput.trim(),
                event_id: selectedEvent?.id,
                subtotal: totalAmount,
                ticket_count: totalTickets,
            },
            // ✅ FIX [GUEST-FLOW]: allow guests to attempt this
            // without a hard redirect to /login. The endpoint may
            // be AllowAny on the backend (discount codes are
            // commonly public); if it's not, the guest sees a
            // toast and can proceed without a discount instead of
            // being kicked out of the wizard.
            { skipAuthRedirect: !isAuthenticated }
        );

            const data = res.data;
            if (data.valid) {
                setAppliedDiscount(data);
                toast.success(`Discount applied: −${formatMoney(data.discount_amount)}`);
            } else {
                setAppliedDiscount(null);
                toast.error(data.reason || 'Invalid discount code');
            }
        } catch (err) {
            const reason =
                err.response?.data?.reason ||
                err.response?.data?.error ||
                err.response?.data?.detail ||
                'Failed to validate code';
            setAppliedDiscount(null);
            toast.error(reason);
        } finally {
            setValidatingDiscount(false);
        }
    };

    const removeDiscount = () => {
        setAppliedDiscount(null);
        setDiscountInput('');
        toast.info('Discount removed');
    };

    // =========================================================================
    // Slot selection
    // =========================================================================

    const handleSelectSlot = (sessionId) => {
        const session = sessions.find((s) => s.id === sessionId);
        setSelectedSession(session);
    };

    const handleSlotPreferences = () => {
        if (!slotPreferencesInput.trim()) {
            toast.warning('Please enter your slot preferences');
            return;
        }

        const preferences = slotPreferencesInput
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n) && n > 0 && n <= sessions.length);

        if (preferences.length === 0) {
            toast.warning('Please enter valid slot numbers (e.g., 1,2,3)');
            return;
        }

        const uniquePreferences = [];
        const seen = new Set();
        for (const pref of preferences) {
            if (!seen.has(pref)) {
                seen.add(pref);
                uniquePreferences.push(pref);
            }
        }

        setSlotPreferences(uniquePreferences);

        let allocatedSlot = null;
        let allocationMessage = '';

        for (const pref of uniquePreferences) {
            const slot = sessions[pref - 1];
            if (slot && slot.capacity - slot.booked > 0) {
                allocatedSlot = slot;
                allocationMessage = `Allocated based on your Preference #${uniquePreferences.indexOf(pref) + 1}`;
                break;
            }
        }

        if (!allocatedSlot) {
            for (let i = 0; i < sessions.length; i++) {
                const slot = sessions[i];
                if (slot.capacity - slot.booked > 0) {
                    allocatedSlot = slot;
                    allocationMessage = 'Allocated to next available slot (your preferred slots were full)';
                    break;
                }
            }
        }

        if (!allocatedSlot) {
            toast.error('No slots available for this event');
            return;
        }

        setSelectedSession(allocatedSlot);
        toast.success(`✅ Slot allocated: ${allocationMessage}`);
    };

    // =========================================================================
    // Submission
    // =========================================================================

    const handleSubmit = async () => {
        // Clear any stale submit error so a retry starts clean.
        setSubmitError(null);

        if (!isFreeRegistrationFlow) {
            if (!validate()) {
                toast.error('Please fix all errors before submitting');
                return;
            }
        } else {
            // Free registration: customer fields + per-entry names.
            if (!customer.name?.trim() || !customer.email?.trim() || !customer.phone?.trim()) {
                toast.error('Please fill in name, email, and phone');
                return;
            }
            if (freeAttendees.some((a) => !a.name?.trim())) {
                toast.error('Please enter a name for every entry');
                return;
            }
        }

        setLoading(true);
        try {
            const payload = buildPayload();

            if (isFreeRegistrationFlow) {
                payload.tickets = [];
                payload.total_amount = 0;
                delete payload.discount_code;
            } else if (appliedDiscount?.valid && appliedDiscount?.code) {
                payload.discount_code = appliedDiscount.code;
            }

            console.log('📝 Full booking data:', JSON.stringify(payload, null, 2));

            const response = await api.post('/bookings/', payload, {
                skipAuthRedirect: !isAuthenticated,
            });
            const result = response.data;

            toast.success(`✅ Booking created! Ref: ${result.booking_reference}`);

            if (isAuthenticated) {
                navigate('/app/bookings', { replace: true });
            } else {
                navigate('/', {
                    replace: true,
                    state: {
                        bookingReference: result.booking_reference,
                        customerEmail: result.customer_email,
                        justBooked: true,
                    },
                });
            }
        } catch (error) {
            const status = error.response?.status;
            const data = error.response?.data;

            let fieldErrors = null;
            let toastMsg = null;

            if (data && typeof data === 'object' && !Array.isArray(data)) {
                const collected = {};
                for (const key of BOOKING_ERROR_FIELD_KEYS) {
                    if (data[key] !== undefined) {
                        collected[key] = data[key];
                    }
                }
                if (Object.keys(collected).length > 0) {
                    fieldErrors = collected;
                }
                toastMsg = data.error || data.detail || data.message || null;
            } else if (typeof data === 'string') {
                toastMsg = data;
            } else if (error.message) {
                toastMsg = error.message;
            }

            if (fieldErrors) {
                setSubmitError(fieldErrors);

                const emailMessage = firstFieldMessage(fieldErrors.customer_email);
                if (emailMessage) {
                    toast.error(emailMessage);
                    setActiveStep(STEP_KEYS.ATTENDEES);
                    return;
                }

                const anyFieldMessage = firstFieldMessage(fieldErrors);
                if (anyFieldMessage) {
                    toast.error(anyFieldMessage);
                    return;
                }
            }

            if (toastMsg) {
                toast.error(toastMsg);
            } else {
                toast.error('Failed to create booking');
            }

            if (status === 401) {
                toast.error(
                    'Your session expired. Please refresh the page and try again.'
                );
            }
        } finally {
            setLoading(false);
        }
    };

    // =========================================================================
    // Step navigation
    // =========================================================================

    const handleBack = () => {
        const prev = getPrevStep(activeStep);
        setActiveStep(prev);
    };

    const handleNext = () => {
        if (activeStep === STEP_KEYS.EVENT) {
            if (!selectedEvent) {
                toast.warning('Please select an event');
                return;
            }
        }

        if (activeStep === STEP_KEYS.SLOT) {
            if (!selectedSession && sessions.length > 0) {
                toast.warning('Please select a slot or use Auto-Allocate');
                return;
            }
        }

        if (activeStep === STEP_KEYS.ENTRIES) {
            if (freeEntries < 1) {
                toast.warning('Please select at least one entry');
                return;
            }
        }

        if (activeStep === STEP_KEYS.TICKETS) {
            if (totalTickets === 0) {
                toast.warning('Please select at least one ticket');
                return;
            }
        }

        if (activeStep === STEP_KEYS.ATTENDEES) {
            if (isFreeRegistrationFlow) {
                if (freeAttendees.some((a) => !a.name?.trim())) {
                    toast.warning('Please enter a name for every entry');
                    return;
                }
                const badEmail = freeAttendees.some(
                    (a) => a.email?.trim() && !/^\S+@\S+\.\S+$/.test(a.email.trim())
                );
                if (badEmail) {
                    toast.warning('One or more entries have an invalid email');
                    return;
                }
            } else {
                const allFilled = attendees.every((a) => a.name?.trim());
                if (!allFilled) {
                    toast.warning('Please enter names for all attendees');
                    return;
                }
            }
        }

        const next = getNextStep(activeStep);
        setActiveStep(next);
    };

    // =========================================================================
    // Step 1 — Event selection
    // =========================================================================

    const renderEventSelection = () => (
        <Box sx={{ py: 2 }}>
            {eventLoadError || (events.length === 0 && !loading) ? (
                <Alert severity="info" sx={{ mb: 3 }}>
                    {eventLoadError ||
                        (canManageEvents
                            ? 'No events available. Create an event first!'
                            : 'No active events available for booking. Check back later!')}
                    {eventLoadError && (
                        <Button size="small" onClick={loadEvents} sx={{ ml: 2 }}>
                            Retry
                        </Button>
                    )}
                </Alert>
            ) : (
                <Grid container spacing={isMobile ? 2 : 3}>
                    {events.map((event) => (
                        <Grid item xs={12} sm={6} md={4} key={event.id}>
                            {/* ✅ FIX: Used the reusable EventCard for consistency */}
                            <EventCard
                                event={event}
                                selected={selectedEvent?.id === event.id}
                                onSelect={handleSelectEvent}
                            />
                        </Grid>
                    ))}
                </Grid>
            )}
        </Box>
    );

    // =========================================================================
    // Step 2 — Slot selection
    // =========================================================================

    const renderSlotSelection = () => {
        const hasSessions = sessions && sessions.length > 0;

        if (!hasSessions) {
            return (
                <Box sx={{ py: 2 }}>
                    <Alert severity="info">
                        This event does not have time slots. Click Next to continue.
                    </Alert>
                </Box>
            );
        }

        return (
            <Box sx={{ py: 2 }}>
                <Alert severity="info" sx={{ mb: 3 }}>
                    <ScheduleIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Select your preferred time slot for <strong>{selectedEvent?.title}</strong>
                </Alert>

                <Grid container spacing={2} sx={{ mb: 3 }}>
                    {sessions.map((session, index) => {
                        const remaining = session.capacity - session.booked;
                        const isAvailable = remaining > 0;
                        const isSelected = selectedSession?.id === session.id;

                        return (
                            <Grid item xs={12} sm={6} md={4} key={session.id}>
                                <Card
                                    sx={{
                                        cursor: isAvailable ? 'pointer' : 'not-allowed',
                                        border: isSelected
                                            ? '2px solid rgba(51, 51, 51, 1)'
                                            : '1px solid #e2e8f0',
                                        opacity: isAvailable ? 1 : 0.5,
                                        '&:hover': isAvailable
                                            ? { borderColor: 'primary.main' }
                                            : {},
                                        '&:active': isAvailable
                                            ? { transform: 'scale(0.99)' }
                                            : {},
                                        transition: 'all 0.2s',
                                    }}
                                    onClick={() => isAvailable && handleSelectSlot(session.id)}
                                >
                                    <CardContent>
                                        <Box display="flex" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="h6" sx={{ color: 'text.primary' }}>
                                                    Slot #{index + 1}
                                                </Typography>
                                                <Typography variant="body2" sx={{ color: 'text.primary' }}>
                                                    🕐{' '}
                                                    {/* ✅ FIX: render in platform timezone */}
                                                    {formatPlatformTime(session.start_time, platformTimezone)}{' '}
                                                    -{' '}
                                                    {formatPlatformTime(session.end_time, platformTimezone)}
                                                </Typography>
                                                <Typography variant="body2" sx={{ color: isAvailable ? '#16a34a' : '#ef4444' }}>
                                                    {isAvailable
                                                        ? `✅ ${remaining} seats available`
                                                        : '❌ Fully booked'}
                                                </Typography>
                                            </Box>
                                            {isSelected && (
                                                <Chip label="Selected" size="small" color="primary" />
                                            )}
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>

                <Paper sx={{ p: isMobile ? 2 : 3, bgcolor: 'background.default' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
                        📋 Slot Preferences (Optional)
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                        Enter your slot preferences in order (e.g., 1,3,2 means Slot 1 is your first preference)
                    </Typography>

                    <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
                        <TextField
                            label="Slot Preferences"
                            placeholder="1,3,2"
                            value={slotPreferencesInput}
                            onChange={(e) => setSlotPreferencesInput(e.target.value)}
                            size="small"
                            sx={{
                                minWidth: isMobile ? '100%' : 200,
                                flex: isMobile ? 1 : 'unset',
                            }}
                            helperText={`Enter numbers 1-${sessions.length}`}
                        />
                        <PrimaryButton
                            variant="contained"
                            onClick={handleSlotPreferences}
                            disabled={!slotPreferencesInput.trim()}
                            sx={isMobile ? { width: '100%' } : undefined}
                        >
                            Auto-Allocate
                        </PrimaryButton>
                    </Box>

                    {slotPreferences.length > 0 && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(51, 51, 51, 0.08)', borderRadius: 1 }}>
                            <Typography variant="body2" sx={{ color: 'primary.main' }}>
                                ✅ Preferences: {slotPreferences.join(' → ')}
                            </Typography>
                        </Box>
                    )}

                    {selectedSession && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(16, 185, 129, 0.10)', borderRadius: 1 }}>
                            <Typography variant="body2" sx={{ color: 'success.main' }}>
                                ✅ Allocated Slot: Slot #{sessions.indexOf(selectedSession) + 1} (
                                {/* ✅ FIX: render in platform timezone */}
                                {formatPlatformTime(selectedSession.start_time, platformTimezone)}{' '}
                                -{' '}
                                {formatPlatformTime(selectedSession.end_time, platformTimezone)})
                            </Typography>
                        </Box>
                    )}
                </Paper>
            </Box>
        );
    };

    // =========================================================================
    // Step 2b — Number of entries (free registration only)
    // =========================================================================

    const renderFreeEntries = () => {
        const max = eventDetails?.max_tickets_per_order || 10;

        return (
            <Box sx={{ py: 2 }}>
                <Alert severity="info" sx={{ mb: 3 }}>
                    How many people are you registering? You'll enter each
                    person's name and email on the next step.
                </Alert>

                <Paper
                    sx={{
                        p: isMobile ? 2 : 3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 2,
                    }}
                >
                    <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            Number of entries
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            Max {max} per registration
                        </Typography>
                    </Box>

                    <Box display="flex" alignItems="center" gap={2}>
                        <IconButton
                            onClick={() => updateFreeEntries(-1)}
                            // ✅ FIX: Disable at 0
                            disabled={freeEntries <= 0}
                            sx={{ bgcolor: 'action.hover', minWidth: 44, minHeight: 44 }}
                            aria-label="Decrease entries"
                        >
                            <RemoveIcon fontSize="small" />
                        </IconButton>
                        <Typography
                            variant="h5"
                            sx={{ minWidth: 44, textAlign: 'center', fontWeight: 700 }}
                        >
                            {freeEntries}
                        </Typography>
                        <IconButton
                            onClick={() => updateFreeEntries(1)}
                            disabled={freeEntries >= max}
                            sx={{ bgcolor: 'action.hover', minWidth: 44, minHeight: 44 }}
                            aria-label="Increase entries"
                        >
                            <AddIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </Paper>

                <Box
                    sx={{
                        mt: 3,
                        p: 2,
                        bgcolor: 'background.default',
                        borderRadius: 2,
                    }}
                >
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        You are registering <strong>{freeEntries}</strong>{' '}
                        {freeEntries === 1 ? 'person' : 'people'}. Each person
                        will receive their own registration pass.
                    </Typography>
                </Box>
            </Box>
        );
    };

    // =========================================================================
    // Step 3 — Ticket selection (ticketed only)
    // =========================================================================

    const renderTicketSelection = () => (
        <Box sx={{ py: 2 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
                Selected: <strong>{selectedEvent?.title}</strong>
                {selectedSession && (
                    <span>
                        {' • '}
                        <ScheduleIcon sx={{ fontSize: 16, verticalAlign: 'middle' }} />
                        Slot:{' '}
                        {/* ✅ FIX: render in platform timezone */}
                        {formatPlatformTime(selectedSession.start_time, platformTimezone)}{' '}
                        -{' '}
                        {formatPlatformTime(selectedSession.end_time, platformTimezone)}
                    </span>
                )}
            </Alert>

            {tiers.length === 0 ? (
                <Alert severity="warning">
                    {eventDetails?.tiers?.length > 0
                        ? 'All tickets are sold out!'
                        : 'No ticket tiers available for this event'}
                </Alert>
            ) : (
                <Box>
                    {tiers.map((tier) => {
                        const available = (typeof tier.available === 'number')
                            ? tier.available
                            : Math.max(0, (tier.quantity_total || 0) - (tier.quantity_sold || 0));
                        const maxQty = Math.min(available, tier.max_per_order || 10);
                        const qty = quantities[tier.id] || 0;

                        return (
                            <Paper
                                key={tier.id}
                                sx={{
                                    p: 2,
                                    mb: 2,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: 2,
                                }}
                            >
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                                        {tier.name}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                        {formatMoney(tier.price)} each • {available} available
                                    </Typography>
                                </Box>
                                <Box display="flex" alignItems="center" gap={2}>
                                    <IconButton
                                        size="small"
                                        onClick={() => updateQuantity(tier.id, -1)}
                                        disabled={qty <= 0}
                                        sx={{
                                            bgcolor: qty > 0 ? 'action.hover' : 'background.default',
                                            minWidth: 40,
                                            minHeight: 40,
                                        }}
                                    >
                                        <RemoveIcon fontSize="small" />
                                    </IconButton>
                                    <Typography variant="h6" sx={{ minWidth: 40, textAlign: 'center', color: 'text.primary' }}>
                                        {qty}
                                    </Typography>
                                    <IconButton
                                        size="small"
                                        onClick={() => updateQuantity(tier.id, 1)}
                                        disabled={qty >= maxQty}
                                        sx={{
                                            bgcolor: qty < maxQty ? 'rgba(51, 51, 51, 0.08)' : 'background.default',
                                            minWidth: 40,
                                            minHeight: 40,
                                        }}
                                    >
                                        <AddIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            </Paper>
                        );
                    })}

                    {totalTickets > 0 && (
                        <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                            <Typography variant="subtitle1" sx={{ color: 'text.primary' }}>
                                🎫 {totalTickets} ticket(s) selected
                            </Typography>
                            <Typography variant="h6" sx={{ color: 'primary.main' }}>
                                Total: {formatMoney(totalAmount)}
                            </Typography>
                        </Box>
                    )}

                    {totalTickets > 0 && (
                        <Paper sx={{ mt: 3, p: isMobile ? 2 : 3, bgcolor: 'background.default' }}>
                            <Typography
                                variant="subtitle2"
                                sx={{
                                    fontWeight: 700,
                                    color: 'text.primary',
                                    mb: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                }}
                            >
                                <LocalOfferIcon fontSize="small" />
                                Have a discount code?
                            </Typography>

                            <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
                                <TextField
                                    label="Discount Code"
                                    placeholder="SAVE20"
                                    value={discountInput}
                                    onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
                                    size="small"
                                    disabled={!!appliedDiscount?.valid || validatingDiscount}
                                    sx={{
                                        minWidth: isMobile ? '100%' : 220,
                                        flex: isMobile ? 1 : 'unset',
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !appliedDiscount?.valid) {
                                            e.preventDefault();
                                            validateDiscount();
                                        }
                                    }}
                                />
                                {appliedDiscount?.valid ? (
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={removeDiscount}
                                        sx={{
                                            textTransform: 'none',
                                            color: 'error.main',
                                            borderColor: '#fecaca',
                                            '&:hover': { borderColor: '#ef4444' },
                                        }}
                                    >
                                        Remove
                                    </Button>
                                ) : (
                                    <PrimaryButton
                                        variant="contained"
                                        size="small"
                                        disabled={validatingDiscount || !discountInput.trim()}
                                        onClick={validateDiscount}
                                        startIcon={
                                            validatingDiscount ? <CircularProgress size={16} color="inherit" /> : null
                                        }
                                        sx={isMobile ? { width: '100%' } : undefined}
                                    >
                                        {validatingDiscount ? 'Checking…' : 'Apply'}
                                    </PrimaryButton>
                                )}
                            </Box>

                            {appliedDiscount?.valid && (
                                <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(16, 185, 129, 0.10)', borderRadius: 1 }}>
                                    <Typography variant="body2" sx={{ color: 'success.dark', fontWeight: 600 }}>
                                        ✅ {appliedDiscount.code} applied — you save{' '}
                                        {formatMoney(appliedDiscount.discount_amount)}
                                    </Typography>
                                </Box>
                            )}

                            {appliedDiscount?.valid && (
                                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                        New total
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 700 }}>
                                        {formatMoney(netAmount)}
                                    </Typography>
                                </Box>
                            )}
                        </Paper>
                    )}
                </Box>
            )}
        </Box>
    );

    // =========================================================================
    // Step 4 — Attendee / Registrant details
    // =========================================================================

    const renderAttendeeDetails = () => {
        return (
            <Box sx={{ py: 2 }}>
                <Alert severity="info" sx={{ mb: 3 }}>
                    {isFreeRegistrationFlow
                        ? `Enter the details for ${freeEntries} ${freeEntries === 1 ? 'person' : 'people'}`
                        : `Enter details for ${totalTickets} attendee(s)`}
                </Alert>

                {/* -------- Customer (lead) block -------- */}
                <Paper sx={{ p: isMobile ? 2 : 3, mb: 3 }}>
                    <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}
                    >
                        <PersonIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        {isFreeRegistrationFlow ? 'Primary Contact' : 'Customer Details'}
                    </Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Full Name *"
                                value={customer.name}
                                onChange={(e) => handleCustomerChange('name', e.target.value)}
                                error={!!errors.name}
                                helperText={errors.name}
                                size="small"
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Email *"
                                type="email"
                                value={customer.email}
                                onChange={(e) => handleEmailChange(e.target.value)}
                                error={!!errors.email}
                                helperText={errors.email}
                                size="small"
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Phone *"
                                value={customer.phone}
                                onChange={(e) => handleCustomerChange('phone', e.target.value)}
                                error={!!errors.phone}
                                helperText={errors.phone}
                                size="small"
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="WhatsApp Number (if different)"
                                value={customer.whatsapp}
                                onChange={(e) => handleCustomerChange('whatsapp', e.target.value)}
                                size="small"
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Notes / Special Requests"
                                value={customer.notes}
                                onChange={(e) => handleCustomerChange('notes', e.target.value)}
                                size="small"
                                multiline
                                rows={1}
                            />
                        </Grid>
                    </Grid>
                </Paper>

                {/* -------- FREE REGISTRATION: per-entry attendee list -------- */}
                {isFreeRegistrationFlow ? (
                    <Paper sx={{ p: isMobile ? 2 : 3 }}>
                        <Typography
                            variant="subtitle1"
                            sx={{ fontWeight: 600, color: 'text.primary', mb: 1 }}
                        >
                            <TicketIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                            Entry Details ({freeEntries})
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                            Each entry receives its own registration pass. Blank
                            email/phone will fall back to the primary contact's.
                        </Typography>
                        {errors.freeAttendees && (
                            <Typography
                                variant="caption"
                                sx={{ color: 'error.main', display: 'block', mb: 1 }}
                            >
                                {errors.freeAttendees}
                            </Typography>
                        )}

                        <Box sx={{ maxHeight: 480, overflowY: 'auto' }}>
                            {freeAttendees.map((att, index) => (
                                <Paper
                                    key={index}
                                    sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}
                                >
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        Entry #{index + 1}
                                        {index === 0 ? ' — primary contact' : ''}
                                    </Typography>
                                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                        <Grid item xs={12} md={4}>
                                            <TextField
                                                fullWidth
                                                placeholder="Full Name *"
                                                value={att.name}
                                                onChange={(e) =>
                                                    updateFreeAttendee(index, 'name', e.target.value)
                                                }
                                                size="small"
                                                error={!att.name?.trim() && activeStep === STEP_KEYS.ATTENDEES}
                                            />
                                        </Grid>
                                        <Grid item xs={12} md={4}>
                                            <TextField
                                                fullWidth
                                                placeholder={
                                                    index === 0
                                                        ? 'Email (defaults to primary)'
                                                        : 'Email (optional)'
                                                }
                                                value={att.email}
                                                onChange={(e) =>
                                                    updateFreeAttendee(index, 'email', e.target.value)
                                                }
                                                size="small"
                                                type="email"
                                            />
                                        </Grid>
                                        <Grid item xs={12} md={4}>
                                            <TextField
                                                fullWidth
                                                placeholder={
                                                    index === 0
                                                        ? 'Phone (defaults to primary)'
                                                        : 'Phone (optional)'
                                                }
                                                value={att.phone}
                                                onChange={(e) =>
                                                    updateFreeAttendee(index, 'phone', e.target.value)
                                                }
                                                size="small"
                                            />
                                        </Grid>
                                    </Grid>
                                </Paper>
                            ))}
                        </Box>

                        <Button
                            variant="text"
                            size="small"
                            onClick={() => {
                                if (!customer.name?.trim()) {
                                    toast.warning('Enter the primary contact name first');
                                    return;
                                }
                                freeAttendees.forEach((att, i) => {
                                    if (i > 0 && !att.name?.trim()) {
                                        updateFreeAttendee(i, 'name', customer.name);
                                    }
                                });
                            }}
                            sx={{ mt: 1 }}
                        >
                            Fill empty names with primary contact
                        </Button>
                    </Paper>
                ) : (
                    /* -------- TICKETED: per-ticket attendee list -------- */
                    <Paper sx={{ p: isMobile ? 2 : 3 }}>
                        <Typography
                            variant="subtitle1"
                            sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}
                        >
                            <TicketIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                            Attendee Details
                            {errors.attendees && (
                                <Typography variant="caption" sx={{ color: 'error.main', ml: 2 }}>
                                    {errors.attendees}
                                </Typography>
                            )}
                        </Typography>

                        <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                            {attendees.map((attendee, index) => (
                                <Paper key={index} sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        #{index + 1} • {attendee.tier_name}
                                    </Typography>
                                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                        <Grid item xs={12} md={6}>
                                            <TextField
                                                fullWidth
                                                placeholder="Full Name *"
                                                value={attendee.name}
                                                onChange={(e) => updateAttendee(index, 'name', e.target.value)}
                                                size="small"
                                                error={!attendee.name?.trim() && activeStep === STEP_KEYS.ATTENDEES}
                                            />
                                        </Grid>
                                        <Grid item xs={12} md={3}>
                                            <TextField
                                                fullWidth
                                                placeholder="Email"
                                                value={attendee.email}
                                                onChange={(e) => updateAttendee(index, 'email', e.target.value)}
                                                size="small"
                                            />
                                        </Grid>
                                        <Grid item xs={12} md={3}>
                                            <TextField
                                                fullWidth
                                                placeholder="Phone"
                                                value={attendee.phone}
                                                onChange={(e) => updateAttendee(index, 'phone', e.target.value)}
                                                size="small"
                                            />
                                        </Grid>
                                    </Grid>
                                </Paper>
                            ))}
                        </Box>

                        <Button
                            variant="text"
                            size="small"
                            onClick={fillEmptyNamesWithCustomer}
                            sx={{ mt: 1 }}
                        >
                            Fill empty names with customer name
                        </Button>
                    </Paper>
                )}
            </Box>
        );
    };

    // =========================================================================
    // Step 5 — Review
    // =========================================================================

    const renderReview = () => (
        <Box sx={{ py: 2 }}>
            <Alert severity="success" sx={{ mb: 3 }}>
                Review your booking details before confirming
            </Alert>

            <Grid container spacing={isMobile ? 2 : 3}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: isMobile ? 2 : 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
                            <EventIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                            Event Details
                        </Typography>
                        <Box>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                <strong>Event:</strong> {selectedEvent?.title}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                <strong>Venue:</strong>{' '}
                                {formatVenueAddress(selectedEvent?.venue) || 'TBD'}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                <strong>Date:</strong>{' '}
                                {selectedEvent?.start_date
                                    ? new Date(selectedEvent.start_date).toLocaleDateString()
                                    : 'TBD'}
                            </Typography>
                            {selectedSession && (
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    <strong>Slot:</strong>{' '}
                                    {/* ✅ FIX: render in platform timezone */}
                                    {formatPlatformTime(selectedSession.start_time, platformTimezone)}{' '}
                                    -{' '}
                                    {formatPlatformTime(selectedSession.end_time, platformTimezone)}
                                </Typography>
                            )}
                            {slotPreferences.length > 0 && (
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    <strong>Slot Preferences:</strong>{' '}
                                    {slotPreferences
                                        .map((n, i) => `#${i + 1}: Slot ${n}`)
                                        .join(' · ')}
                                </Typography>
                            )}
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: isMobile ? 2 : 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
                            <PersonIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                            Customer Details
                        </Typography>
                        <Box>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                <strong>Name:</strong> {customer.name}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                <strong>Email:</strong> {customer.email}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                <strong>Phone:</strong> {customer.phone}
                            </Typography>
                            {customer.whatsapp && (
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    <strong>WhatsApp:</strong> {customer.whatsapp}
                                </Typography>
                            )}
                            {customer.notes && (
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    <strong>Notes:</strong> {customer.notes}
                                </Typography>
                            )}
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12}>
                    <Paper sx={{ p: isMobile ? 2 : 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
                            <TicketIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                            {isFreeRegistrationFlow ? 'Registration' : `Tickets (${totalTickets})`}
                        </Typography>
                        <Box>
                            {isFreeRegistrationFlow ? (
                                <Box>
                                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                                        Free registration — <strong>{freeEntries}</strong>{' '}
                                        {freeEntries === 1 ? 'pass' : 'passes'} will be issued, one per entry.
                                    </Typography>
                                    {freeAttendees.map((att, i) => (
                                        <Box
                                            key={i}
                                            sx={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                py: 0.75,
                                                borderBottom: '1px solid #f1f5f9',
                                                gap: 1,
                                            }}
                                        >
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
                                                    #{i + 1} {att.name || '(name missing)'}
                                                </Typography>
                                                {att.email && (
                                                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                                        {att.email}
                                                    </Typography>
                                                )}
                                            </Box>
                                            <Chip
                                                size="small"
                                                label="REG"
                                                variant="outlined"
                                                sx={{ alignSelf: 'center', fontSize: '10px', height: '20px' }}
                                            />
                                        </Box>
                                    ))}
                                </Box>
                            ) : (
                                <>
                                    {ticketList.map((ticket, index) => (
                                        <Box
                                            key={index}
                                            sx={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                py: 0.5,
                                                borderBottom: '1px solid #f1f5f9',
                                                gap: 1,
                                            }}
                                        >
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    color: 'text.primary',
                                                    minWidth: 0,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}
                                            >
                                                #{index + 1} {ticket.tier_name}
                                                {attendees[index]?.name && ` - ${attendees[index].name}`}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'text.primary', flexShrink: 0 }}>
                                                {formatMoney(ticket.price)}
                                            </Typography>
                                        </Box>
                                    ))}

                                    <Divider sx={{ my: 2 }} />

                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                            Subtotal ({totalTickets} ticket{totalTickets === 1 ? '' : 's'})
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: 'text.primary' }}>
                                            {formatMoney(totalAmount)}
                                        </Typography>
                                    </Box>

                                    {appliedDiscount?.valid && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                            <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
                                                Discount ({appliedDiscount.code})
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
                                                −{formatMoney(appliedDiscount.discount_amount)}
                                            </Typography>
                                        </Box>
                                    )}

                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            pt: 1.5,
                                            mt: 1,
                                            borderTop: '2px solid #e2e8f0',
                                        }}
                                    >
                                        <Typography variant="subtitle1" sx={{ color: 'text.primary', fontWeight: 700 }}>
                                            Total
                                        </Typography>
                                        <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 700 }}>
                                            {formatMoney(netAmount)}
                                        </Typography>
                                    </Box>
                                </>
                            )}
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );

    // =========================================================================
    // Render dispatch
    // =========================================================================

    const getStepContent = (key) => {
        switch (key) {
            case STEP_KEYS.EVENT:
                return renderEventSelection();
            case STEP_KEYS.SLOT:
                return renderSlotSelection();
            case STEP_KEYS.ENTRIES:
                return renderFreeEntries();
            case STEP_KEYS.TICKETS:
                return renderTicketSelection();
            case STEP_KEYS.ATTENDEES:
                return renderAttendeeDetails();
            case STEP_KEYS.REVIEW:
                return renderReview();
            default:
                return null;
        }
    };

    const safeActiveStep = visibleSteps.includes(activeStep)
        ? activeStep
        : visibleSteps[0];

    return (
        <PageContainer>
            <PageHeader>
                <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                    {/* ✅ FIX: Hide back arrow for guests */}
                    {isAuthenticated && (
                        <IconButton onClick={() => navigate('/app/bookings')}>
                            <ArrowBackIcon />
                        </IconButton>
                    )}
                    <PageTitle variant="h4">
                        {/* ✅ FIX: Change title for guests */}
                        {isAuthenticated
                            ? (isRegularUser ? 'Book Tickets' : 'New Booking')
                            : 'Register for Event'}
                    </PageTitle>
                </Box>
                <Box display="flex" gap={1}>
                    {/* ✅ FIX: Change button text and behavior for guests */}
                    <OutlineButton
                        onClick={() => {
                            if (isAuthenticated) {
                                navigate('/app/bookings');
                            } else {
                                // Clear history by replacing the current entry
                                navigate('/', { replace: true });
                            }
                        }}
                    >
                        {isAuthenticated ? 'Cancel' : 'Back to Home'}
                    </OutlineButton>
                </Box>
            </PageHeader>

            <Paper sx={{ p: isMobile ? 2 : 4, mt: 2 }}>
                <Stepper
                    activeStep={stepIndex(safeActiveStep)}
                    orientation={isMobile ? 'vertical' : 'horizontal'}
                    sx={{
                        mb: 4,
                        ...(isMobile && {
                            '& .MuiStepLabel-label': { fontSize: '0.85rem' },
                        }),
                    }}
                >
                    {visibleSteps.map((key) => (
                        <Step key={key}>
                            <StepLabel>{stepLabel(key)}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                {loading || isLoadingEvent ? (
                    <Box display="flex" justifyContent="center" py={4}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box>{getStepContent(safeActiveStep)}</Box>
                )}

                <Box                    sx={{
                        display: 'flex',
                        flexDirection: isMobile ? 'column-reverse' : 'row',
                        justifyContent: 'space-between',
                        gap: isMobile ? 1.5 : 0,
                        mt: 4,
                        pt: 2,
                        borderTop: '1px solid rgba(226, 232, 240, 1)',
                    }}
                >
                    <Button
                        variant="outlined"
                        onClick={handleBack}
                        disabled={stepIndex(safeActiveStep) === 0}
                        startIcon={<ArrowBackIcon />}
                        sx={isMobile ? { width: '100%' } : undefined}
                    >
                        Back
                    </Button>
                    <Box sx={isMobile ? { width: '100%' } : undefined}>
                        {safeActiveStep === STEP_KEYS.REVIEW ? (
                            <PrimaryButton
                                variant="contained"
                                onClick={handleSubmit}
                                disabled={loading}
                                startIcon={loading ? <CircularProgress size={20} /> : <CheckIcon />}
                                sx={isMobile ? { width: '100%' } : undefined}
                            >
                                {loading ? 'Creating...' : 'Confirm Booking'}
                            </PrimaryButton>
                        ) : (
                            <PrimaryButton
                                variant="contained"
                                onClick={handleNext}
                                endIcon={<ArrowForwardIcon />}
                                // ✅ FIX: Disable Next if on Entries step and 0 selected
                                disabled={safeActiveStep === STEP_KEYS.ENTRIES && freeEntries === 0}
                                sx={isMobile ? { width: '100%' } : undefined}
                            >
                                Next
                            </PrimaryButton>
                        )}
                    </Box>
                </Box>
            </Paper>
        </PageContainer>
    );
};

export default CreateBooking;