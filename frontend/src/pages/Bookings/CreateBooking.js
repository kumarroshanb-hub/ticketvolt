// frontend/src/pages/Bookings/CreateBooking.js
import React, { useState, useEffect } from 'react';
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
import api from '../../services/api';
import { PageContainer, PageHeader, PageTitle, PrimaryButton, OutlineButton } from '../../components/Common';
import { ROLES } from '../../constants';
import useBookingDraft from '../../hooks/useBookingDraft';

const steps = ['Select Event', 'Choose Slot', 'Choose Tickets', 'Attendee Details', 'Review & Confirm'];

const CreateBooking = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { role } = useRole();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Role flags
    const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
    const isOrganizer = role === ROLES.ORGANIZER;
    const canManageEvents = isAdmin || isOrganizer;
    const isRegularUser = role === ROLES.USER;

    // Wizard state
    const [activeStep, setActiveStep] = useState(0);
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

    // ---- Discount state ----
    const [discountInput, setDiscountInput] = useState('');
    const [appliedDiscount, setAppliedDiscount] = useState(null);
    const [validatingDiscount, setValidatingDiscount] = useState(false);

    // ✅ All draft state lives in the hook now.
    const draft = useBookingDraft({
        tiers,
        selectedEvent,
        selectedSession,
        slotPreferences,
        bookingSource: isRegularUser ? 'user_portal' : 'admin_portal',
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
    } = draft;

    // Derived: net total after discount (only when discount is valid).
    const discountAmount = appliedDiscount?.valid ? appliedDiscount.discount_amount : 0;
    const netAmount = Math.max(0, totalAmount - discountAmount);

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
                    setActiveStep(1);
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, location.search, autoSelectDone]);

    // =========================================================================
    // ✅ Re-validate the discount whenever the ticket composition changes.
    // -------------------------------------------------------------------------
    // A code that was valid for 4 tickets may not be valid for 1 ticket
    // (e.g., min_ticket_count, min_order_amount rules). This effect re-runs
    // the server-side validation silently, so the UI always reflects the
    // current subtotal and ticket count.
    //
    // We deliberately depend ONLY on totalAmount / totalTickets / event id,
    // NOT on appliedDiscount itself — otherwise this would loop forever.
    // =========================================================================
    useEffect(() => {
        // If no discount applied yet, nothing to do.
        if (!appliedDiscount?.valid) return;

        // If there are no tickets left, drop the discount.
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
                });
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

            try {
                const response = await api.get('/events/public/');
                if (response.data && response.data.results) {
                    data = response.data.results;
                } else if (Array.isArray(response.data)) {
                    data = response.data;
                } else if (response.data && typeof response.data === 'object') {
                    data = Object.values(response.data).filter((item) => item.id && item.title);
                }
            } catch (publicError) {
                console.log('📅 Public endpoint failed:', publicError.message);
            }

            if (data.length === 0 && canManageEvents) {
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

            const availableTiers = (data.tiers || []).filter(
                (t) => t.quantity_total - t.quantity_sold > 0
            );
            setTiers(availableTiers);

            if (availableTiers.length === 0 && data.tiers && data.tiers.length > 0) {
                toast.info('All tickets for this event are sold out');
            } else if (availableTiers.length === 0) {
                toast.info('No tickets available for this event');
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
        setSelectedEvent(event);
        setSelectedSession(null);
        setSlotPreferences([]);
        setSlotPreferencesInput('');
        setTiers([]);
        setEventDetails(null);
        // Reset discount — it was scoped to the previous event.
        setDiscountInput('');
        setAppliedDiscount(null);

        loadEventDetails(event.id);
        setActiveStep(1);
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
            });

            const data = res.data;
            if (data.valid) {
                setAppliedDiscount(data);
                toast.success(`Discount applied: −₹${Number(data.discount_amount).toFixed(2)}`);
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
        if (!validate()) {
            toast.error('Please fix all errors before submitting');
            return;
        }

        setLoading(true);
        try {
            const payload = buildPayload();

            // ✅ Attach the discount code if a valid one is applied.
            //    The backend RECOMPUTES the discount amount server-side —
            //    we only send the code, never the amount. This is critical
            //    for security: a malicious client cannot spoof a discount.
            if (appliedDiscount?.valid && appliedDiscount?.code) {
                payload.discount_code = appliedDiscount.code;
            }

            console.log('📝 Full booking data:', JSON.stringify(payload, null, 2));

            const response = await api.post('/bookings/', payload);
            const result = response.data;

            toast.success(`✅ Booking created! Ref: ${result.booking_reference}`);
            navigate('/bookings');
        } catch (error) {
            let errorMsg = 'Failed to create booking';
            const data = error.response?.data;
            if (data?.discount_code) {
                errorMsg = Array.isArray(data.discount_code)
                    ? data.discount_code[0]
                    : data.discount_code;
            } else if (data?.detail) errorMsg = data.detail;
            else if (data?.error) errorMsg = data.error;
            else if (data?.message) errorMsg = data.message;
            else if (error.message) errorMsg = error.message;
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    // =========================================================================
    // Step navigation
    // =========================================================================

    const handleBack = () => {
        if (activeStep > 0) setActiveStep(activeStep - 1);
    };

    const handleNext = () => {
        if (activeStep === 0) {
            if (!selectedEvent) {
                toast.warning('Please select an event');
                return;
            }
            setActiveStep(sessions && sessions.length > 0 ? 1 : 2);
            return;
        }

        if (activeStep === 1) {
            if (!selectedSession) {
                toast.warning('Please select a slot or use Auto-Allocate');
                return;
            }
            setActiveStep(2);
            return;
        }

        if (activeStep === 2) {
            if (totalTickets === 0) {
                toast.warning('Please select at least one ticket');
                return;
            }
            setActiveStep(3);
            return;
        }

        if (activeStep === 3) {
            const allFilled = attendees.every((a) => a.name?.trim());
            if (!allFilled) {
                toast.warning('Please enter names for all attendees');
                return;
            }
            setActiveStep(4);
            return;
        }
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
                    {events.map((event) => {
                        const isActive =
                            event.status === 'active' || event.status === 'published';
                        const isDraft = event.status === 'draft';
                        const isPast =
                            event.end_date && new Date(event.end_date) < new Date();

                        const tierCount = event.tier_count ?? event.tiers?.length ?? 0;
                        const sessionCount = event.session_count ?? event.sessions?.length ?? 0;
                        const totalCapacity = event.total_capacity ?? 0;
                        const totalSold = event.total_tickets_sold ?? 0;

                        const isSoldOut =
                            isActive && (totalCapacity === 0 || totalSold >= totalCapacity);

                        const canSelect = canManageEvents ? true : isActive && !isSoldOut;

                        const venueName = event.venue?.name || null;
                        const venueCity = event.venue?.city || null;

                        const formattedDate = event.start_date
                            ? new Date(event.start_date).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                              })
                            : 'TBD';

                        return (
                            <Grid item xs={12} sm={6} md={4} key={event.id}>
                                <Card
                                    sx={{
                                        cursor: canSelect ? 'pointer' : 'not-allowed',
                                        border:
                                            selectedEvent?.id === event.id
                                                ? '2px solid #4f46e5'
                                                : isDraft
                                                ? '1px dashed rgba(255,200,0,0.5)'
                                                : '1px solid #e2e8f0',
                                        bgcolor: isDraft ? 'rgba(255,200,0,0.03)' : 'white',
                                        opacity: canSelect ? 1 : 0.7,
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        borderRadius: 2,
                                        transition: 'all 0.2s ease',
                                        '&:hover': canSelect
                                            ? {
                                                  borderColor: '#4f46e5',
                                                  transform: 'translateY(-2px)',
                                                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                              }
                                            : {},
                                        '&:active': canSelect
                                            ? { transform: 'scale(0.99)' }
                                            : {},
                                    }}
                                    onClick={() => {
                                        if (canSelect) handleSelectEvent(event);
                                        else if (isSoldOut)
                                            toast.warning('This event is sold out');
                                        else
                                            toast.warning(
                                                'This event is not available for booking'
                                            );
                                    }}
                                >
                                    <CardContent
                                        sx={{
                                            flexGrow: 1,
                                            p: isMobile ? 1.5 : 2,
                                            '&:last-child': { pb: isMobile ? 1.5 : 2 },
                                        }}
                                    >
                                        <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
                                            <Typography
                                                variant="h6"
                                                sx={{
                                                    color: isDraft ? '#b45309' : '#0f172a',
                                                    fontWeight: 600,
                                                    flex: 1,
                                                    minWidth: 0,
                                                    fontSize: isMobile ? '1rem' : '1.1rem',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {event.title}
                                            </Typography>
                                            <Chip
                                                label={
                                                    isSoldOut
                                                        ? 'SOLD OUT'
                                                        : isDraft
                                                        ? 'DRAFT'
                                                        : event.status?.toUpperCase() || 'ACTIVE'
                                                }
                                                size="small"
                                                color={
                                                    isSoldOut
                                                        ? 'error'
                                                        : isDraft
                                                        ? 'default'
                                                        : isActive
                                                        ? 'success'
                                                        : 'default'
                                                }
                                                sx={{ fontSize: '10px', height: '22px', flexShrink: 0 }}
                                            />
                                        </Box>

                                        {event.short_description && (
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    color: '#64748b',
                                                    mt: 1,
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {event.short_description}
                                            </Typography>
                                        )}

                                        <Box mt={2} display="flex" flexDirection="column" gap={0.75}>
                                            <Typography variant="body2" sx={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <CalendarIcon fontSize="small" />
                                                {formattedDate}
                                            </Typography>

                                            {venueName || venueCity ? (
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: '#475569',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 1,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    <LocationIcon fontSize="small" />
                                                    {venueName || 'Venue'}
                                                    {venueCity ? `, ${venueCity}` : ''}
                                                </Typography>
                                            ) : (
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: '#94a3b8',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 1,
                                                        fontStyle: 'italic',
                                                    }}
                                                >
                                                    <LocationIcon fontSize="small" />
                                                    No venue assigned
                                                </Typography>
                                            )}

                                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                                <Typography variant="body2" sx={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <TicketIcon fontSize="small" />
                                                    {tierCount} tier{tierCount === 1 ? '' : 's'}
                                                </Typography>
                                                <Typography variant="body2" sx={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <ScheduleIcon fontSize="small" />
                                                    {sessionCount} session{sessionCount === 1 ? '' : 's'}
                                                </Typography>
                                            </Box>

                                            {totalCapacity > 0 && (
                                                <Typography variant="caption" sx={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <PeopleIcon sx={{ fontSize: 14 }} />
                                                    {totalCapacity} total capacity
                                                    {totalSold > 0 && ` • ${totalSold} sold`}
                                                </Typography>
                                            )}
                                        </Box>

                                        {isPast && canManageEvents && (
                                            <Chip
                                                label="PAST EVENT"
                                                size="small"
                                                sx={{
                                                    mt: 1,
                                                    bgcolor: 'rgba(100,116,139,0.1)',
                                                    color: '#64748b',
                                                }}
                                            />
                                        )}
                                    </CardContent>
                                </Card>
                            </Grid>
                        );
                    })}
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
                        This event does not have time slots. Click Next to proceed to ticket selection.
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
                        const startTime = new Date(session.start_time);
                        const endTime = new Date(session.end_time);

                        return (
                            <Grid item xs={12} sm={6} md={4} key={session.id}>
                                <Card
                                    sx={{
                                        cursor: isAvailable ? 'pointer' : 'not-allowed',
                                        border: isSelected
                                            ? '2px solid #4f46e5'
                                            : '1px solid #e2e8f0',
                                        opacity: isAvailable ? 1 : 0.5,
                                        '&:hover': isAvailable
                                            ? { borderColor: '#4f46e5' }
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
                                                <Typography variant="h6" sx={{ color: '#0f172a' }}>
                                                    Slot #{index + 1}
                                                </Typography>
                                                <Typography variant="body2" sx={{ color: '#334155' }}>
                                                    🕐{' '}
                                                    {startTime.toLocaleTimeString([], {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}{' '}
                                                    -{' '}
                                                    {endTime.toLocaleTimeString([], {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
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

                <Paper sx={{ p: isMobile ? 2 : 3, bgcolor: '#f8fafc' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}>
                        📋 Slot Preferences (Optional)
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
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
                        <Box sx={{ mt: 2, p: 2, bgcolor: '#eef2ff', borderRadius: 1 }}>
                            <Typography variant="body2" sx={{ color: '#4f46e5' }}>
                                ✅ Preferences: {slotPreferences.join(' → ')}
                            </Typography>
                        </Box>
                    )}

                    {selectedSession && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: '#dcfce7', borderRadius: 1 }}>
                            <Typography variant="body2" sx={{ color: '#16a34a' }}>
                                ✅ Allocated Slot: Slot #{sessions.indexOf(selectedSession) + 1} (
                                {new Date(selectedSession.start_time).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}{' '}
                                -{' '}
                                {new Date(selectedSession.end_time).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })})
                            </Typography>
                        </Box>
                    )}
                </Paper>
            </Box>
        );
    };

    // =========================================================================
    // Step 3 — Ticket selection (with discount box)
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
                        {new Date(selectedSession.start_time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        })}{' '}
                        -{' '}
                        {new Date(selectedSession.end_time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
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
                        const available = tier.quantity_total - tier.quantity_sold;
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
                                    <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                        {tier.name}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                                        ₹{parseFloat(tier.price).toFixed(2)} each • {available} available
                                    </Typography>
                                </Box>
                                <Box display="flex" alignItems="center" gap={2}>
                                    <IconButton
                                        size="small"
                                        onClick={() => updateQuantity(tier.id, -1)}
                                        disabled={qty <= 0}
                                        sx={{
                                            bgcolor: qty > 0 ? '#f1f5f9' : '#f8fafc',
                                            minWidth: 40,
                                            minHeight: 40,
                                        }}
                                    >
                                        <RemoveIcon fontSize="small" />
                                    </IconButton>
                                    <Typography variant="h6" sx={{ minWidth: 40, textAlign: 'center', color: '#0f172a' }}>
                                        {qty}
                                    </Typography>
                                    <IconButton
                                        size="small"
                                        onClick={() => updateQuantity(tier.id, 1)}
                                        disabled={qty >= maxQty}
                                        sx={{
                                            bgcolor: qty < maxQty ? '#eef2ff' : '#f8fafc',
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
                        <Box sx={{ mt: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                            <Typography variant="subtitle1" sx={{ color: '#0f172a' }}>
                                🎫 {totalTickets} ticket(s) selected
                            </Typography>
                            <Typography variant="h6" sx={{ color: '#4f46e5' }}>
                                Total: ₹{totalAmount.toFixed(2)}
                            </Typography>
                        </Box>
                    )}

                    {/* ---- Discount input (visible only when tickets are selected) ---- */}
                    {totalTickets > 0 && (
                        <Paper sx={{ mt: 3, p: isMobile ? 2 : 3, bgcolor: '#f8fafc' }}>
                            <Typography
                                variant="subtitle2"
                                sx={{
                                    fontWeight: 700,
                                    color: '#0f172a',
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
                                            color: '#ef4444',
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
                                <Box sx={{ mt: 2, p: 1.5, bgcolor: '#dcfce7', borderRadius: 1 }}>
                                    <Typography variant="body2" sx={{ color: '#15803d', fontWeight: 600 }}>
                                        ✅ {appliedDiscount.code} applied — you save ₹
                                        {Number(appliedDiscount.discount_amount).toFixed(2)}
                                    </Typography>
                                </Box>
                            )}

                            {appliedDiscount?.valid && (
                                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                                        New total
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 700 }}>
                                        ₹{netAmount.toFixed(2)}
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
    // Step 4 — Attendee details
    // =========================================================================

    const renderAttendeeDetails = () => (
        <Box sx={{ py: 2 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
                Enter details for {totalTickets} attendee(s)
            </Alert>

            <Paper sx={{ p: isMobile ? 2 : 3, mb: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}>
                    <PersonIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Customer Details
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
                            onChange={(e) => handleCustomerChange('email', e.target.value)}
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

            <Paper sx={{ p: isMobile ? 2 : 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}>
                    <TicketIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Attendee Details
                    {errors.attendees && (
                        <Typography variant="caption" sx={{ color: '#dc2626', ml: 2 }}>
                            {errors.attendees}
                        </Typography>
                    )}
                </Typography>

                <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                    {attendees.map((attendee, index) => (
                        <Paper key={index} sx={{ p: 2, mb: 2, bgcolor: '#f8fafc' }}>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>
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
                                        error={!attendee.name?.trim() && activeStep === 3}
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
        </Box>
    );

    // =========================================================================
    // Step 5 — Review (with discount row)
    // =========================================================================

    const renderReview = () => (
        <Box sx={{ py: 2 }}>
            <Alert severity="success" sx={{ mb: 3 }}>
                Review your booking details before confirming
            </Alert>

            <Grid container spacing={isMobile ? 2 : 3}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: isMobile ? 2 : 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}>
                            <EventIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                            Event Details
                        </Typography>
                        <Box>
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                                <strong>Event:</strong> {selectedEvent?.title}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                                <strong>Venue:</strong> {selectedEvent?.venue?.name || 'TBD'}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                                <strong>Date:</strong>{' '}
                                {selectedEvent?.start_date
                                    ? new Date(selectedEvent.start_date).toLocaleDateString()
                                    : 'TBD'}
                            </Typography>
                            {selectedSession && (
                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                    <strong>Slot:</strong>{' '}
                                    {new Date(selectedSession.start_time).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}{' '}
                                    -{' '}
                                    {new Date(selectedSession.end_time).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </Typography>
                            )}
                            {/*
                              ✅ Slot preferences — rendered as "#1: Slot 2" instead
                              of a bare "2" that was ambiguous to the operator.
                            */}
                            {slotPreferences.length > 0 && (
                                <Typography variant="body2" sx={{ color: '#64748b' }}>
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
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}>
                            <PersonIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                            Customer Details
                        </Typography>
                        <Box>
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                                <strong>Name:</strong> {customer.name}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                                <strong>Email:</strong> {customer.email}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                                <strong>Phone:</strong> {customer.phone}
                            </Typography>
                            {customer.whatsapp && (
                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                    <strong>WhatsApp:</strong> {customer.whatsapp}
                                </Typography>
                            )}
                            {customer.notes && (
                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                    <strong>Notes:</strong> {customer.notes}
                                </Typography>
                            )}
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12}>
                    <Paper sx={{ p: isMobile ? 2 : 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}>
                            <TicketIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                            Tickets ({totalTickets})
                        </Typography>
                        <Box>
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
                                            color: '#334155',
                                            minWidth: 0,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        #{index + 1} {ticket.tier_name}
                                        {attendees[index]?.name && ` - ${attendees[index].name}`}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#0f172a', flexShrink: 0 }}>
                                        ₹{ticket.price.toFixed(2)}
                                    </Typography>
                                </Box>
                            ))}

                            <Divider sx={{ my: 2 }} />

                            {/* Subtotal */}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                    Subtotal ({totalTickets} ticket{totalTickets === 1 ? '' : 's'})
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#334155' }}>
                                    ₹{totalAmount.toFixed(2)}
                                </Typography>
                            </Box>

                            {/* Discount (only if applied) */}
                            {appliedDiscount?.valid && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                    <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 600 }}>
                                        Discount ({appliedDiscount.code})
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 600 }}>
                                        −₹{Number(appliedDiscount.discount_amount).toFixed(2)}
                                    </Typography>
                                </Box>
                            )}

                            {/* Total */}
                            <Box
                                sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    pt: 1.5,
                                    mt: 1,
                                    borderTop: '2px solid #e2e8f0',
                                }}
                            >
                                <Typography variant="subtitle1" sx={{ color: '#0f172a', fontWeight: 700 }}>
                                    Total
                                </Typography>
                                <Typography variant="h6" sx={{ color: '#4f46e5', fontWeight: 700 }}>
                                    ₹{netAmount.toFixed(2)}
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );

    // =========================================================================
    // Render
    // =========================================================================

    const getStepContent = (step) => {
        switch (step) {
            case 0:
                return renderEventSelection();
            case 1:
                return renderSlotSelection();
            case 2:
                return renderTicketSelection();
            case 3:
                return renderAttendeeDetails();
            case 4:
                return renderReview();
            default:
                return null;
        }
    };

    return (
        <PageContainer>
            <PageHeader>
                <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                    <IconButton onClick={() => navigate('/bookings')}>
                        <ArrowBackIcon />
                    </IconButton>
                    <PageTitle variant="h4">
                        {isRegularUser ? 'Book Tickets' : 'New Booking'}
                    </PageTitle>
                </Box>
                <Box display="flex" gap={1}>
                    <OutlineButton onClick={() => navigate('/bookings')}>Cancel</OutlineButton>
                </Box>
            </PageHeader>

            <Paper sx={{ p: isMobile ? 2 : 4, mt: 2 }}>
                <Stepper
                    activeStep={activeStep}
                    orientation={isMobile ? 'vertical' : 'horizontal'}
                    sx={{
                        mb: 4,
                        ...(isMobile && {
                            '& .MuiStepLabel-label': { fontSize: '0.85rem' },
                        }),
                    }}
                >
                    {steps.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                {loading || isLoadingEvent ? (
                    <Box display="flex" justifyContent="center" py={4}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box>{getStepContent(activeStep)}</Box>
                )}

                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: isMobile ? 'column-reverse' : 'row',
                        justifyContent: 'space-between',
                        gap: isMobile ? 1.5 : 0,
                        mt: 4,
                        pt: 2,
                        borderTop: '1px solid #e2e8f0',
                    }}
                >
                    <Button
                        variant="outlined"
                        onClick={handleBack}
                        disabled={activeStep === 0}
                        startIcon={<ArrowBackIcon />}
                        sx={isMobile ? { width: '100%' } : undefined}
                    >
                        Back
                    </Button>
                    <Box sx={isMobile ? { width: '100%' } : undefined}>
                        {activeStep === steps.length - 1 ? (
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