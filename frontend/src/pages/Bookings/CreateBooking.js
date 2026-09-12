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
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import api from '../../services/api';
import { PageContainer, PageHeader, PageTitle, PrimaryButton, OutlineButton } from '../../components/Common';
import { ROLES } from '../../constants';

const steps = ['Select Event', 'Choose Slot', 'Choose Tickets', 'Attendee Details', 'Review & Confirm'];

const CreateBooking = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { role } = useRole();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Check user role
    const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
    const isOrganizer = role === ROLES.ORGANIZER;
    const canManageEvents = isAdmin || isOrganizer;
    const isRegularUser = role === ROLES.USER;

    // State
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
    const [quantities, setQuantities] = useState({});
    const [ticketList, setTicketList] = useState([]);
    const [totalTickets, setTotalTickets] = useState(0);
    const [totalAmount, setTotalAmount] = useState(0);
    const [attendees, setAttendees] = useState([]);
    const [customer, setCustomer] = useState({
        name: '',
        email: '',
        phone: '',
        whatsapp: '',
        notes: '',
    });
    const [errors, setErrors] = useState({});
    const [isLoadingEvent, setIsLoadingEvent] = useState(false);
    const [eventLoadError, setEventLoadError] = useState(null);
    const [autoSelectDone, setAutoSelectDone] = useState(false);

    useEffect(() => {
        loadEvents();
    }, []);

    useEffect(() => {
        if (events.length > 0 && !autoSelectDone) {
            const params = new URLSearchParams(location.search);
            const eventId = params.get('event');
            if (eventId) {
                const event = events.find(e => e.id === eventId);
                if (event) {
                    console.log(`📅 Auto-selecting event from URL: ${event.title}`);
                    handleSelectEvent(event);
                    setAutoSelectDone(true);
                } else {
                    console.log(`📅 Event ${eventId} not in list, loading directly...`);
                    loadEventDetails(eventId);
                    const minimalEvent = { id: eventId };
                    setSelectedEvent(minimalEvent);
                    setAutoSelectDone(true);
                    setActiveStep(1);
                }
            }
        }
    }, [events, location.search, autoSelectDone]);

    useEffect(() => {
        updateTicketList();
    }, [quantities, tiers]);

    const loadEvents = async () => {
        setLoading(true);
        setEventLoadError(null);
        try {
            let data = [];

            console.log('📅 Loading events for role:', role);

            try {
                console.log('📅 Trying /events/public/ endpoint...');
                const response = await api.get('/events/public/');
                console.log('📅 Public response:', response.data);

                if (response.data && response.data.results) {
                    data = response.data.results;
                } else if (Array.isArray(response.data)) {
                    data = response.data;
                } else if (response.data && typeof response.data === 'object') {
                    data = Object.values(response.data).filter(item => item.id && item.title);
                }
                console.log(`📅 Public endpoint found ${data.length} events`);
            } catch (publicError) {
                console.log('📅 Public endpoint failed:', publicError.message);
            }

            if (data.length === 0 && canManageEvents) {
                console.log('📅 No events from public, trying /events/ endpoint...');
                try {
                    const response = await api.get('/events/');
                    console.log('📅 Admin response:', response.data);

                    if (Array.isArray(response.data)) {
                        data = response.data;
                    } else if (response.data && response.data.results) {
                        data = response.data.results;
                    } else if (response.data && typeof response.data === 'object') {
                        data = Object.values(response.data).filter(item => item.id && item.title);
                    }
                    console.log(`📅 Admin endpoint found ${data.length} events`);
                } catch (adminError) {
                    console.log('📅 Admin endpoint failed:', adminError.message);
                }
            }

            if (isRegularUser && data.length > 0) {
                const filtered = data.filter((e) => {
                    const status = e.status || 'draft';
                    return status === 'active' || status === 'published';
                });
                console.log(`📅 Filtered to ${filtered.length} active events for regular user`);
                data = filtered;
            }

            setEvents(data);

            if (data.length === 0) {
                const message = canManageEvents
                    ? 'No events found. Please create an event first!'
                    : 'No active events available for booking. Check back later!';
                setEventLoadError(message);
            }

        } catch (error) {
            console.error('❌ Failed to load events:', error);

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
            let response;
            let data;

            try {
                console.log(`📅 Trying /events/public/${eventId}/`);
                response = await api.get(`/events/public/${eventId}/`);
                data = response.data;
                console.log('📅 Public detail found');
            } catch (publicError) {
                console.log('📅 Public detail failed, trying admin endpoint...');
                try {
                    response = await api.get(`/events/${eventId}/`);
                    data = response.data;
                    console.log('📅 Admin detail found');
                } catch (adminError) {
                    throw new Error('Event not found');
                }
            }

            setEventDetails(data);

            if (selectedEvent) {
                setSelectedEvent(data);
            }

            const eventSessions = data.sessions || [];
            setSessions(eventSessions);

            const availableTiers = (data.tiers || []).filter((t) =>
                (t.quantity_total - t.quantity_sold) > 0
            );

            console.log(`📅 Found ${availableTiers.length} available tiers`);
            setTiers(availableTiers);

            const initialQuantities = {};
            availableTiers.forEach((t) => { initialQuantities[t.id] = 0; });
            setQuantities(initialQuantities);

            if (availableTiers.length === 0 && data.tiers && data.tiers.length > 0) {
                toast.info('All tickets for this event are sold out');
            } else if (availableTiers.length === 0) {
                toast.info('No tickets available for this event');
            }

        } catch (error) {
            console.error('❌ Failed to load event details:', error);

            let errorMsg = 'Failed to load event details';
            if (error.response?.data?.detail) {
                errorMsg = error.response.data.detail;
            } else if (error.response?.data?.error) {
                errorMsg = error.response.data.error;
            } else if (error.message) {
                errorMsg = error.message;
            }

            setEventLoadError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setIsLoadingEvent(false);
        }
    };

    const handleSelectEvent = (event) => {
        setSelectedEvent(event);
        setSelectedSession(null);
        setSlotPreferences([]);
        setSlotPreferencesInput('');
        setTiers([]);
        setQuantities({});
        setTicketList([]);
        setTotalTickets(0);
        setTotalAmount(0);
        setAttendees([]);
        setEventDetails(null);

        loadEventDetails(event.id);
        setActiveStep(1);
    };

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
            .map((s) => parseInt(s.trim()))
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
        let allocatedSlotIndex = null;
        let allocationMessage = '';

        for (const pref of uniquePreferences) {
            const slotIndex = pref - 1;
            const slot = sessions[slotIndex];
            if (slot && (slot.capacity - slot.booked) > 0) {
                allocatedSlot = slot;
                allocatedSlotIndex = slotIndex;
                allocationMessage = `Allocated based on your Preference #${uniquePreferences.indexOf(pref) + 1}`;
                break;
            }
        }

        if (!allocatedSlot) {
            for (let i = 0; i < sessions.length; i++) {
                const slot = sessions[i];
                if ((slot.capacity - slot.booked) > 0) {
                    allocatedSlot = slot;
                    allocatedSlotIndex = i;
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

    const updateTicketList = () => {
        const list = [];
        let total = 0;
        let amount = 0;

        Object.keys(quantities).forEach((tierId) => {
            const qty = quantities[tierId] || 0;
            if (qty > 0) {
                const tier = tiers.find((t) => t.id === tierId);
                if (tier) {
                    for (let i = 0; i < qty; i++) {
                        list.push({
                            tier_id: tierId,
                            tier_name: tier.name,
                            price: parseFloat(tier.price),
                            attendee_name: '',
                            attendee_email: '',
                            attendee_phone: '',
                        });
                    }
                    total += qty;
                    amount += qty * parseFloat(tier.price);
                }
            }
        });

        setTicketList(list);
        setTotalTickets(total);
        setTotalAmount(amount);

        const initialAttendees = list.map((ticket, index) => ({
            index,
            tier_id: ticket.tier_id,
            tier_name: ticket.tier_name,
            name: '',
            email: '',
            phone: '',
        }));
        setAttendees(initialAttendees);
    };

    const updateQuantity = (tierId, change) => {
        const tier = tiers.find((t) => t.id === tierId);
        if (!tier) return;

        const available = tier.quantity_total - tier.quantity_sold;
        const maxPerOrder = tier.max_per_order || 10;
        const maxQty = Math.min(available, maxPerOrder);
        const current = quantities[tierId] || 0;
        const newQty = Math.max(0, Math.min(current + change, maxQty));

        setQuantities((prev) => ({ ...prev, [tierId]: newQty }));
    };

    const updateAttendee = (index, field, value) => {
        const updated = [...attendees];
        updated[index] = { ...updated[index], [field]: value };
        setAttendees(updated);
    };

    const handleCustomerChange = (field, value) => {
        setCustomer((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: null }));
        }
    };

    const validateStep = () => {
        const newErrors = {};

        if (activeStep === 4) {
            if (!customer.name?.trim()) {
                newErrors.name = 'Customer name is required';
            }
            if (!customer.email?.trim()) {
                newErrors.email = 'Email is required';
            } else if (!/\S+@\S+\.\S+/.test(customer.email)) {
                newErrors.email = 'Invalid email format';
            }
            if (!customer.phone?.trim()) {
                newErrors.phone = 'Phone number is required';
            } else if (customer.phone.replace(/\D/g, '').length < 10) {
                newErrors.phone = 'Phone number must be at least 10 digits';
            }

            const missingAttendee = attendees.some((a) => !a.name?.trim());
            if (missingAttendee) {
                newErrors.attendees = 'All attendees must have names';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateStep()) {
            toast.error('Please fix all errors before submitting');
            return;
        }

        setLoading(true);
        try {
            const ticketsWithAttendees = ticketList.map((ticket, index) => ({
                tier_id: ticket.tier_id,
                attendee_name: attendees[index]?.name || customer.name,
                attendee_email: attendees[index]?.email || customer.email,
                attendee_phone: attendees[index]?.phone || customer.phone,
                tier_name: ticket.tier_name || 'Unknown',
                price: ticket.price || 0,
            }));

            console.log('📝 Tickets being sent:', ticketsWithAttendees);
            console.log('📝 Total tickets:', ticketsWithAttendees.length);

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

            const bookingData = {
                event: selectedEvent.id,
                customer_name: customer.name,
                customer_email: customer.email,
                customer_phone: customer.phone,
                whatsapp_number: customer.whatsapp || customer.phone,
                total_amount: totalAmount,
                tickets: ticketsWithAttendees,
                metadata: {
                    booking_source: isRegularUser ? 'user_portal' : 'admin_portal',
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

            console.log('📝 Full booking data:', JSON.stringify(bookingData, null, 2));

            const response = await api.post('/bookings/', bookingData);
            const result = response.data;

            console.log('✅ Booking response:', result);

            toast.success(`✅ Booking created! Ref: ${result.booking_reference}`);
            navigate('/bookings');

        } catch (error) {
            console.error('❌ Booking error:', error);
            console.error('Response:', error.response?.data);

            let errorMsg = 'Failed to create booking';
            if (error.response?.data?.detail) {
                errorMsg = error.response.data.detail;
            } else if (error.response?.data?.error) {
                errorMsg = error.response.data.error;
            } else if (error.response?.data?.message) {
                errorMsg = error.response.data.message;
            } else if (error.message) {
                errorMsg = error.message;
            }

            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        if (activeStep > 0) setActiveStep(activeStep - 1);
    };

    const handleNext = () => {
        if (activeStep === 0) {
            if (!selectedEvent) {
                toast.warning('Please select an event');
                return;
            }
            if (sessions && sessions.length > 0) {
                setActiveStep(1);
            } else {
                setActiveStep(2);
            }
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

    const renderEventSelection = () => (
        <Box sx={{ py: 2 }}>
            {eventLoadError || (events.length === 0 && !loading) ? (
                <Alert severity="info" sx={{ mb: 3 }}>
                    {eventLoadError || (canManageEvents
                        ? 'No events available. Create an event first!'
                        : 'No active events available for booking. Check back later!')}
                    {eventLoadError && (
                        <Button size="small" onClick={loadEvents} sx={{ ml: 2 }}>
                            Retry
                        </Button>
                    )}
                </Alert>
            ) : (
                <Grid container spacing={2}>
                    {events.map((event) => {
                        const isActive = event.status === 'active' || event.status === 'published';
                        const isDraft = event.status === 'draft';

                        let ticketsAvailable = false;
                        if (event.tiers && Array.isArray(event.tiers) && event.tiers.length > 0) {
                            ticketsAvailable = event.tiers.some(t => {
                                const total = t.quantity_total || 0;
                                const sold = t.quantity_sold || 0;
                                return (total - sold) > 0;
                            });
                        }

                        const canSelect = canManageEvents ? true : isActive;
                        const isSoldOut = isActive && !ticketsAvailable;

                        return (
                            <Grid item xs={12} sm={6} md={4} key={event.id}>
                                <Card
                                    sx={{
                                        cursor: canSelect ? 'pointer' : 'not-allowed',
                                        border: selectedEvent?.id === event.id ? '2px solid #4f46e5' :
                                            isDraft ? '1px dashed rgba(255,200,0,0.5)' : '1px solid #e2e8f0',
                                        bgcolor: isDraft ? 'rgba(255,200,0,0.03)' : 'white',
                                        opacity: canSelect ? 1 : 0.5,
                                        height: '100%',
                                        '&:hover': {
                                            borderColor: canSelect ? '#4f46e5' : '#e2e8f0',
                                            transform: canSelect ? 'translateY(-2px)' : 'none',
                                        },
                                        '&:active': {
                                            transform: canSelect ? 'scale(0.99)' : 'none',
                                        },
                                        transition: 'all 0.2s',
                                    }}
                                    onClick={() => {
                                        if (canSelect) {
                                            handleSelectEvent(event);
                                        } else {
                                            toast.warning('This event is not available for booking');
                                        }
                                    }}
                                >
                                    <CardContent>
                                        <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
                                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                                <Typography variant="h6" sx={{ color: isDraft ? '#b45309' : '#0f172a' }}>
                                                    {event.title}
                                                    {isDraft && canManageEvents && (
                                                        <Chip
                                                            label="DRAFT"
                                                            size="small"
                                                            sx={{
                                                                ml: 1,
                                                                bgcolor: 'rgba(255,200,0,0.15)',
                                                                color: '#b45309',
                                                                fontSize: '10px',
                                                                height: '20px',
                                                            }}
                                                        />
                                                    )}
                                                    {isSoldOut && (
                                                        <Chip
                                                            label="SOLD OUT"
                                                            size="small"
                                                            sx={{
                                                                ml: 1,
                                                                bgcolor: 'rgba(239,68,68,0.15)',
                                                                color: '#dc2626',
                                                                fontSize: '10px',
                                                                height: '20px',
                                                            }}
                                                        />
                                                    )}
                                                </Typography>
                                                {event.short_description && (
                                                    <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                                                        {event.short_description}
                                                    </Typography>
                                                )}
                                                {event.venue && (
                                                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                                                        📍 {event.venue.name}{event.venue.city ? `, ${event.venue.city}` : ''}
                                                    </Typography>
                                                )}
                                                <Box display="flex" gap={2} mt={1} flexWrap="wrap">
                                                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                                        📅 {new Date(event.start_date).toLocaleDateString()}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                                        ⏰ {new Date(event.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </Typography>
                                                    {event.tiers && event.tiers.length > 0 && (
                                                        <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                                            🎫 {event.tiers.length} tiers
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Box>
                                            <Chip
                                                label={event.status?.toUpperCase() || 'DRAFT'}
                                                size="small"
                                                color={event.status === 'active' ? 'success' : event.status === 'published' ? 'info' : 'default'}
                                            />
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
            )}
        </Box>
    );

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
                                        border: isSelected ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                                        opacity: isAvailable ? 1 : 0.5,
                                        '&:hover': isAvailable ? { borderColor: '#4f46e5' } : {},
                                        '&:active': isAvailable ? { transform: 'scale(0.99)' } : {},
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
                                                    🕐 {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </Typography>
                                                <Typography variant="body2" sx={{ color: isAvailable ? '#16a34a' : '#ef4444' }}>
                                                    {isAvailable ? `✅ ${remaining} seats available` : '❌ Fully booked'}
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
                            sx={{ minWidth: isMobile ? '100%' : 200, flex: isMobile ? 1 : 'unset' }}
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
                                ✅ Allocated Slot: Slot #{sessions.indexOf(selectedSession) + 1}
                                ({new Date(selectedSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedSession.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                            </Typography>
                        </Box>
                    )}
                </Paper>
            </Box>
        );
    };

    const renderTicketSelection = () => (
        <Box sx={{ py: 2 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
                Selected: <strong>{selectedEvent?.title}</strong>
                {selectedSession && (
                    <span>
                        {' • '}
                        <ScheduleIcon sx={{ fontSize: 16, verticalAlign: 'middle' }} />
                        Slot: {new Date(selectedSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedSession.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                )}
            </Alert>

            {tiers.length === 0 ? (
                <Alert severity="warning">
                    {eventDetails?.tiers?.length > 0 ? 'All tickets are sold out!' : 'No ticket tiers available for this event'}
                </Alert>
            ) : (
                <Box>
                    {tiers.map((tier) => {
                        const available = tier.quantity_total - tier.quantity_sold;
                        const maxQty = Math.min(available, tier.max_per_order || 10);
                        const qty = quantities[tier.id] || 0;

                        return (
                            <Paper key={tier.id} sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
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
                                        sx={{ bgcolor: qty > 0 ? '#f1f5f9' : '#f8fafc', minWidth: 40, minHeight: 40 }}
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
                                        sx={{ bgcolor: qty < maxQty ? '#eef2ff' : '#f8fafc', minWidth: 40, minHeight: 40 }}
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
                </Box>
            )}
        </Box>
    );

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
                    onClick={() => {
                        const filledName = customer.name || 'Guest';
                        const updated = attendees.map((a) => ({
                            ...a,
                            name: a.name || filledName,
                        }));
                        setAttendees(updated);
                    }}
                    sx={{ mt: 1 }}
                >
                    Fill empty names with customer name
                </Button>
            </Paper>
        </Box>
    );

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
                                <strong>Date:</strong> {new Date(selectedEvent?.start_date).toLocaleDateString()}
                            </Typography>
                            {selectedSession && (
                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                    <strong>Slot:</strong> {new Date(selectedSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedSession.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Typography>
                            )}
                            {slotPreferences.length > 0 && (
                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                    <strong>Preferences:</strong> {slotPreferences.join(' → ')}
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
                                <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid #f1f5f9', gap: 1 }}>
                                    <Typography variant="body2" sx={{ color: '#334155', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        #{index + 1} {ticket.tier_name}
                                        {attendees[index]?.name && ` - ${attendees[index].name}`}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#0f172a', flexShrink: 0 }}>
                                        ₹{ticket.price.toFixed(2)}
                                    </Typography>
                                </Box>
                            ))}
                            <Divider sx={{ my: 2 }} />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="subtitle1" sx={{ color: '#0f172a' }}>
                                    Total ({totalTickets} tickets)
                                </Typography>
                                <Typography variant="h6" sx={{ color: '#4f46e5' }}>
                                    ₹{totalAmount.toFixed(2)}
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );

    const getStepContent = (step) => {
        switch (step) {
            case 0: return renderEventSelection();
            case 1: return renderSlotSelection();
            case 2: return renderTicketSelection();
            case 3: return renderAttendeeDetails();
            case 4: return renderReview();
            default: return null;
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
                    <OutlineButton onClick={() => navigate('/bookings')}>
                        Cancel
                    </OutlineButton>
                </Box>
            </PageHeader>

            <Paper sx={{ p: isMobile ? 2 : 4, mt: 2 }}>
                <Stepper
                    activeStep={activeStep}
                    orientation={isMobile ? 'vertical' : 'horizontal'}
                    sx={{
                        mb: 4,
                        ...(isMobile && {
                            '& .MuiStepLabel-label': {
                                fontSize: '0.85rem',
                            },
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
                    <Box>
                        {getStepContent(activeStep)}
                    </Box>
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