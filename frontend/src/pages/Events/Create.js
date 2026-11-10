// frontend/src/pages/Events/Create.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert, CircularProgress, Grid, Box, Typography, TextField,
    MenuItem, Button, Stepper, Step, StepLabel, Divider, Paper,
    Chip, FormControl, InputLabel, Select,
} from '@mui/material';
import {
    Add as AddIcon, Chair as SeatIcon,
    Check as CheckIcon, ArrowBack as ArrowBackIcon, ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import {
    PageContainer, PageHeader, PageTitle, PageHeaderLeft, PageHeaderRight,
    LoadingWrapper, PrimaryButton, OutlineButton,
} from '../../components/Common';

import { useEventForm } from '../../features/events/useEventForm';
import { useEventSubmit } from '../../features/events/useEventSubmit';
import { useVenues } from '../../features/events/useVenues';
import { useCancellationPolicies } from '../../features/events/useCancellationPolicies';
import { useEventTemplates } from '../../features/events/useEventTemplates';
import { useOrganizers } from '../../features/events/useOrganizers';
import {
    getEventRequirements,
    validateSessions,
    validateTiers,
} from '../../features/events/eventRequirements';

import { useRole } from '../../context/RoleContext';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import {
    EVENT_TYPE,
    EVENT_TYPE_LABELS,
    EVENT_CATEGORY,
    EVENT_CATEGORY_LABELS,
} from '../../constants';

import { StyledPaper, SectionTitle } from './components/styled';
import { EventBasicInfo } from './components/EventBasicInfo';
import { OrganizerSelector } from './components/OrganizerSelector';
import { EventSchedule } from './components/EventSchedule';
import { EventCancellationPolicy } from './components/EventCancellationPolicy';
import { EventTicketSettings } from './components/EventTicketSettings';
import { SessionsEditor } from './components/SessionsEditor';
import { TiersEditor } from './components/TiersEditor';
import { TemplatesGrid } from './components/TemplatesGrid';
import { TemplateUploadDialog } from './components/TemplateUploadDialog';
import { EventFormActions } from './components/EventFormActions';

import { VenueMasterPicker } from './components/VenueMasterPicker';
import { EventVenuePlanEditor } from './components/EventVenuePlanEditor';

import { theme } from '../../theme/tokens';
import venueMasterService from '../../services/venueMasterService';
import eventVenuePlanService from '../../services/eventVenuePlanService';

import { validateDateRange } from '../../utils/dateValidation';

const C = theme.colors;

const STEP = {
    BASICS: 0,
    VENUE: 1,
    SEATS: 2,
    DETAILS: 3,
};

const ROUTE = {
    EVENTS_LIST: '/app/events',
    EVENT_CREATE: '/app/events/create',
    VENUE_CREATE: '/app/venues/new',
    ORGANIZATIONS: '/app/organizations',
};

const CreateEvent = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { id: editEventId } = useParams();
    const isEdit = Boolean(editEventId);

    const { user } = useAuth();
    // Organizer assignment is a TENANT capability (owner/admin of the
    // current org), not a platform-role comparison. `useRole().role`
    // is the platform role and is only ever 'user' or 'super_admin'.
    const { isSuperAdmin } = useRole();
    // Organizer reassignment is a SYSTEM-level capability only; tenant
    // admins manage their own org but cannot reassign to arbitrary users.
    const canAssignOrganizer = isSuperAdmin;

    const {
        organizations,
        currentOrgId,
        setCurrentOrgId,
        isPlatformAdmin,
        needsOrganization,
        loading: orgLoading,
    } = useOrg();

    const venues = useVenues();
    const policies = useCancellationPolicies();
    const { organizers, loading: loadingOrganizers } = useOrganizers(canAssignOrganizer);

    // Resume an existing draft ONLY when we're coming back from the
    // venue-create round-trip. Both params count:
    //   venue_id        → non-reserved path (Venue create returns it)
    //   layout_updated  → reserved path (layout editor returns it)
    const hasVenueHandoff = (() => {
        const params = new URLSearchParams(location.search);
        return params.get('venue_id') != null
            || params.get('layout_updated') === 'true';
    })();

    const {
        loading: formLoading,
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
    } = useEventForm(editEventId, {
        defaultOrganizationId: currentOrgId,
        resumeDraft: hasVenueHandoff,
    });

    const templates = useEventTemplates(editEventId);
    const { submit, submitting, error: submitError } = useEventSubmit({
        id: editEventId,
        formData,
        sessions,
        tiers,
        onSuccess: () => {
            if (!isEdit) clearDraft();
        },
    });

    const [activeStep, setActiveStep] = useState(STEP.BASICS);
    const [selectedMaster, setSelectedMaster] = useState(null);
    const [existingPlan, setExistingPlan] = useState(null);
    const [planLoading, setPlanLoading] = useState(false);
    const [masterLoading, setMasterLoading] = useState(false);

    // Returning from the venue round-trip must land the user back on the
    // Venue step, not reset them to Basics.
    useEffect(() => {
        if (!isEdit && hasVenueHandoff) {
            setActiveStep(STEP.VENUE);
        }
    }, [isEdit, hasVenueHandoff]);

    const lastFetchedMasterIdRef = useRef(null);

    // Determine if it's single day based on the event_type dropdown
    const isSingleDay = formData.event_type === 'single';

    const chosenVenue = useMemo(() => {
        if (!selectedMaster) return null;
        return {
            id: selectedMaster.venue_id,
            name: selectedMaster.name,
            has_reserved_seating: selectedMaster.has_reserved_seating,
            has_layout: selectedMaster.has_layout,
            city: selectedMaster.city,
            country: selectedMaster.country,
        };
    }, [selectedMaster]);

    const hasReservedSeating = Boolean(chosenVenue?.has_reserved_seating);

    // ✅ Centralised rules for Sessions / Tiers.
    const requirements = useMemo(
        () => getEventRequirements({
            eventFlow: formData.event_flow,
            hasReservedSeating,
        }),
        [formData.event_flow, hasReservedSeating],
    );

    // -------------------------------------------------------------------
    // Robust layoutState resolver
    // -------------------------------------------------------------------
    const layoutState = useMemo(() => {
        if (!hasReservedSeating) {
            return { status: 'not_applicable', seatCount: 0, source: null };
        }

        const extractLayout = (source) => {
            if (!source) return null;
            let layout = source.snapshot?.layout || source.snapshot?.layout_data;
            if (!layout) {
                layout = source.layout || source.layout_data;
            }
            if (typeof layout === 'string') {
                try {
                    layout = JSON.parse(layout);
                } catch {
                    return null;
                }
            }
            if (layout && Array.isArray(layout.seats) && layout.seats.length > 0) {
                return layout;
            }
            return null;
        };

        const planLayout = extractLayout(existingPlan?.published_snapshot);
        const masterLayout = extractLayout(selectedMaster);

        const layout = planLayout || masterLayout;

        if (layout) {
            return {
                status: 'present',
                seatCount: layout.seats.length,
                source: planLayout ? 'plan.published_snapshot' : 'venue_master.snapshot',
            };
        }

        if (selectedMaster && selectedMaster.seat_count > 0) {
            // Some list payloads omit the snapshot but still report the
            // seat count. `has_layout` alone is NOT enough — a layout
            // with an empty seat list is unusable.
            return {
                status: 'present',
                seatCount: selectedMaster.seat_count,
                source: 'fallback',
            };
        }

        return {
            status: selectedMaster || existingPlan ? 'missing' : 'unknown',
            seatCount: 0,
            source: null,
        };
    }, [hasReservedSeating, selectedMaster, existingPlan]);

    const seatStepRequired = hasReservedSeating && layoutState.status === 'present';

    const visibleSteps = useMemo(() => {
        const steps = [
            { key: STEP.BASICS, label: 'Basics' },
            { key: STEP.VENUE, label: 'Venue' },
        ];
        if (seatStepRequired) {
            steps.push({ key: STEP.SEATS, label: 'Seat Categories & Pricing' });
        }
        steps.push({ key: STEP.DETAILS, label: 'Details' });
        return steps;
    }, [seatStepRequired]);

    // -------------------------------------------------------------------
    // ?venue_id= auto-select
    // -------------------------------------------------------------------
    const venueIdFromQueryAppliedRef = useRef(false);
    useEffect(() => {
        if (isEdit) return;
        if (venueIdFromQueryAppliedRef.current) return;

        const params = new URLSearchParams(location.search);
        const venueId = params.get('venue_id');
        if (!venueId) return;

        venueIdFromQueryAppliedRef.current = true;
        setSelectedMaster(null);
        lastFetchedMasterIdRef.current = null;

        handleChange({ target: { name: 'venue_id', value: venueId } });

        params.delete('venue_id');
        const qs = params.toString();
        navigate(
            { pathname: location.pathname, search: qs ? `?${qs}` : '' },
            { replace: true },
        );
    }, [isEdit, location.pathname, location.search, navigate, handleChange]);

    // -------------------------------------------------------------------
    // Auto-fetch master for `formData.venue_id`
    // -------------------------------------------------------------------
    const [searchParams, setSearchParams] = useSearchParams();

    useEffect(() => {
        let cancelled = false;

        const setLoadingFlag = (v) => {
            if (!cancelled) setMasterLoading(v);
        };

        const justUpdatedLayout = searchParams.get('layout_updated') === 'true';

        if (justUpdatedLayout) {
            lastFetchedMasterIdRef.current = null;

            searchParams.delete('layout_updated');
            setSearchParams(searchParams, { replace: true });
        }

        if (isEdit) {
            const fromPlan = existingPlan?.venue_master?.id || existingPlan?.venue_master || null;
            const targetMasterId = fromPlan || null;

            if (targetMasterId) {
                if (lastFetchedMasterIdRef.current === targetMasterId) {
                    return () => { cancelled = true; };
                }
                lastFetchedMasterIdRef.current = targetMasterId;
                setLoadingFlag(true);
                venueMasterService.get(targetMasterId)
                    .then((master) => { if (!cancelled) setSelectedMaster(master); })
                    .catch(() => { if (!cancelled) setSelectedMaster(null); })
                    .finally(() => setLoadingFlag(false));
                return () => { cancelled = true; };
            }
        }

        if (!formData.venue_id) {
            setSelectedMaster(null);
            lastFetchedMasterIdRef.current = null;
            return () => { cancelled = true; };
        }

        setLoadingFlag(true);

        let attempt = 0;
        const delays = [250, 500, 1000, 2000];

        const tryFetch = async () => {
            try {
                const masters = await venueMasterService.listForVenue(formData.venue_id);
                if (cancelled) return;

                const current =
                    (masters || []).find((m) => String(m.venue_id) === String(formData.venue_id) && m.is_current)
                    || (masters || []).find((m) => String(m.venue_id) === String(formData.venue_id));

                if (!current) {
                    if (attempt < delays.length) {
                        setTimeout(tryFetch, delays[attempt++]);
                        return;
                    }
                    setSelectedMaster(null);
                    lastFetchedMasterIdRef.current = null;
                    setLoadingFlag(false);
                    return;
                }

                if (lastFetchedMasterIdRef.current === current.id) {
                    setLoadingFlag(false);
                    return;
                }
                lastFetchedMasterIdRef.current = current.id;

                const detail = await venueMasterService.get(current.id);
                if (!cancelled) {
                    setSelectedMaster(detail);
                    setLoadingFlag(false);
                }
            } catch (err) {
                if (attempt < delays.length) {
                    setTimeout(tryFetch, delays[attempt++]);
                    return;
                }
                if (!cancelled) {
                    console.warn('Failed to resolve master for venue:', err);
                    setSelectedMaster(null);
                    lastFetchedMasterIdRef.current = null;
                    setLoadingFlag(false);
                }
            }
        };
        tryFetch();

        return () => { cancelled = true; };
    }, [isEdit, existingPlan?.venue_master, formData.venue_id, searchParams, setSearchParams]);

    useEffect(() => {
        // If the venue/seat state changes such that the current step is
        // no longer in the visible list (e.g. switching to a GA venue
        // while on the Seats step), fall back to the Venue step. Without
        // this, `currentIndex === -1` and the wizard renders an invalid
        // step with broken Back/Continue buttons.
        if (visibleSteps.some((s) => s.key === activeStep)) return;
        const t = setTimeout(() => setActiveStep(STEP.VENUE), 0);
        return () => clearTimeout(t);
    }, [activeStep, visibleSteps]);

    useEffect(() => {
        if (!isEdit) return;
        let cancelled = false;
        setPlanLoading(true);
        eventVenuePlanService.get(editEventId)
            .then((plan) => { if (!cancelled) setExistingPlan(plan); })
            .catch(() => { if (!cancelled) setExistingPlan(null); })
            .finally(() => { if (!cancelled) setPlanLoading(false); });
        return () => { cancelled = true; };
    }, [isEdit, editEventId]);

    const nextStep = () => {
        const idx = visibleSteps.findIndex((s) => s.key === activeStep);
        if (idx >= 0 && idx < visibleSteps.length - 1) {
            setActiveStep(visibleSteps[idx + 1].key);
        }
    };
    const prevStep = () => {
        const idx = visibleSteps.findIndex((s) => s.key === activeStep);
        if (idx > 0) setActiveStep(visibleSteps[idx - 1].key);
    };

    const canLeaveBasics = () => {
        if (!formData.title?.trim()) return 'Please give the event a title.';
        if (!formData.event_type) return 'Please choose an event type.';
        if (!formData.category) return 'Please choose a category.';
        if (!formData.event_flow) return 'Please choose a registration type.';
        return validateDateRange(formData.start_date, formData.end_date, {
            requireBoth: true,
            startLabel: 'Start date',
            endLabel: 'End date',
        });
    };

    // ✅ Validate Sessions + Tiers against the current requirements.
    const canLeaveDetails = () => {
        const sessionsErr = validateSessions(sessions, {
            required: requirements.sessionsRequired,
        });
        if (sessionsErr) return sessionsErr;

        const tiersErr = validateTiers(tiers, {
            required: requirements.tiersRequired,
        });
        if (tiersErr) return tiersErr;

        return null;
    };

    const handleFinalSubmit = async (e) => {
        // Dates are editable on the Details step too, so re-validate the
        // range here. Basics validation alone is not sufficient.
        const dateErr = validateDateRange(formData.start_date, formData.end_date, {
            requireBoth: true,
            startLabel: 'Start date',
            endLabel: 'End date',
        });
        if (dateErr) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            window.alert(dateErr);
            return;
        }

        const detailsErr = canLeaveDetails();
        if (detailsErr) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            window.alert(detailsErr);
            return;
        }

        const submitPayload = { ...formData };

        // Safety net: if single day, force end_date to equal start_date
        if (isSingleDay && submitPayload.start_date) {
            submitPayload.end_date = submitPayload.start_date;
        }

        if (hasReservedSeating) {
            submitPayload.tiers = [];
        }

        if (!isEdit) {
            if (selectedMaster?.id) {
                submitPayload.venue_master_id = selectedMaster.id;
                submitPayload.venue_id = selectedMaster.venue_id;
                submitPayload.seat_assignments = selectedMaster._seatAssignments || {};
                submitPayload.category_overrides = selectedMaster._categoryOverrides || [];
            }
        }

        // Clean up any legacy fields not expected by the backend
        delete submitPayload.is_single_day;

        await submit(e, submitPayload);
    };

    // Atomically set multiple fields at once
    const patchForm = (patch) => {
        setFormData((prev) => ({ ...prev, ...patch }));
    };

    const handleCancel = () => {
        if (!isEdit) clearDraft();
        navigate(ROUTE.EVENTS_LIST);
    };

    const renderBasics = () => (
        <Grid container spacing={3}>
            <Grid item xs={12}>
                <SectionTitle variant="h6">Event Basics</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
                <Typography variant="body2" sx={{ color: C.textSecondary, mt: 1 }}>
                    Give the event a name, set its dates and classification. You'll pick a venue next.
                </Typography>
            </Grid>

            <Grid item xs={12}>
                <TextField
                    fullWidth
                    label="Event Title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    required
                />
            </Grid>

            <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                    <InputLabel id="event-type-label">Event Type</InputLabel>
                    <Select
                        labelId="event-type-label"
                        name="event_type"
                        value={formData.event_type || ''}
                        onChange={handleChange}
                        label="Event Type"
                    >
                        {Object.values(EVENT_TYPE).map((type) => (
                            <MenuItem key={type} value={type}>
                                {EVENT_TYPE_LABELS[type] || type}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                    <InputLabel id="category-label">Category</InputLabel>
                    <Select
                        labelId="category-label"
                        name="category"
                        value={formData.category || ''}
                        onChange={handleChange}
                        label="Category"
                    >
                        {Object.values(EVENT_CATEGORY).map((cat) => (
                            <MenuItem key={cat} value={cat}>
                                {EVENT_CATEGORY_LABELS[cat] || cat}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                    <InputLabel id="event-flow-label">Registration Type</InputLabel>
                    <Select
                        labelId="event-flow-label"
                        name="event_flow"
                        value={formData.event_flow || 'ticketed'}
                        onChange={handleChange}
                        label="Registration Type"
                    >
                        <MenuItem value="ticketed">Ticketed</MenuItem>
                        <MenuItem value="paid_registration">Paid Registration</MenuItem>
                        <MenuItem value="free_registration">Free Registration</MenuItem>
                    </Select>
                </FormControl>
            </Grid>

            <Grid item xs={12} sm={isSingleDay ? 12 : 6}>
                <TextField
                    fullWidth
                    label="Start Date"
                    name="start_date"
                    type="datetime-local"
                    value={formData.start_date}
                    onChange={(e) => {
                        handleChange(e);
                        if (isSingleDay) {
                            patchForm({ end_date: e.target.value });
                        }
                    }}
                    InputLabelProps={{ shrink: true }}
                    required
                />
            </Grid>

            {!isSingleDay && (
                <Grid item xs={12} sm={6}>
                    <TextField
                        fullWidth
                        label="End Date"
                        name="end_date"
                        type="datetime-local"
                        value={formData.end_date}
                        onChange={handleChange}
                        InputLabelProps={{ shrink: true }}
                        required
                    />
                </Grid>
            )}

            <Grid item xs={12}>
                <TextField
                    fullWidth
                    label="Short Description (optional)"
                    name="short_description"
                    value={formData.short_description || ''}
                    onChange={handleChange}
                    multiline
                    rows={2}
                />
            </Grid>

            <Grid item xs={12}>
                <TextField
                    fullWidth
                    label="Long Description (optional)"
                    name="description"
                    value={formData.description || ''}
                    onChange={handleChange}
                    multiline
                    rows={4}
                />
            </Grid>
        </Grid>
    );

    const goCreateVenue = () => {
        const returnTo = encodeURIComponent(ROUTE.EVENT_CREATE);
        navigate(`${ROUTE.VENUE_CREATE}?return=${returnTo}`);
    };

    const handleMasterSelect = async (master) => {
        if (!master) {
            setSelectedMaster(null);
            handleChange({ target: { name: 'venue_id', value: '' } });
            return;
        }

        lastFetchedMasterIdRef.current = master.id;
        handleChange({ target: { name: 'venue_id', value: master.venue_id } });

        if (!master.snapshot || !master.snapshot.layout) {
            setMasterLoading(true);
            try {
                const detail = await venueMasterService.get(master.id);
                setSelectedMaster(detail);
            } catch (err) {
                console.error('Failed to load master detail', err);
                toast.error('Failed to load seat layout details.');
                setSelectedMaster(master);
            } finally {
                setMasterLoading(false);
            }
        } else {
            setSelectedMaster(master);
        }
    };

    const renderVenueStep = () => (
        <Grid container spacing={3}>
            <Grid item xs={12}>
                <SectionTitle variant="h6">Venue</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
                <Typography variant="body2" sx={{ color: C.textSecondary, mt: 1 }}>
                    Pick a venue from the master catalog. If the venue you
                    need isn't listed, create it — it will be published to
                    the master automatically and selected here when you
                    return.
                </Typography>
            </Grid>

            <Grid item xs={12}>
                <VenueMasterPicker
                    value={selectedMaster}
                    onSelect={handleMasterSelect}
                    onCreateVenue={goCreateVenue}
                />
            </Grid>

            <Grid item xs={12}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        mt: 1,
                        flexWrap: 'wrap',
                    }}
                >
                    <Divider sx={{ flex: 1, borderColor: C.borderLight }} />
                    <Typography
                        variant="caption"
                        sx={{
                            color: C.textMuted,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: 0.6,
                        }}
                    >
                        OR
                    </Typography>
                    <Divider sx={{ flex: 1, borderColor: C.borderLight }} />
                </Box>
                <Box sx={{ textAlign: 'center', mt: 2 }}>
                    <Button
                        variant="text"
                        startIcon={<AddIcon />}
                        onClick={goCreateVenue}
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                        Create a new venue (with seat layout)
                    </Button>
                </Box>
            </Grid>

            {masterLoading && (
                <Grid item xs={12}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={16} />
                        <Typography variant="caption" sx={{ color: C.textSecondary }}>
                            Loading venue master…
                        </Typography>
                    </Box>
                </Grid>
            )}

            {chosenVenue && (
                <Grid item xs={12}>
                    <Paper
                        variant="outlined"
                        sx={{
                            p: 2,
                            bgcolor: C.bgPrimary,
                            borderColor: C.borderLight,
                            display: 'flex',
                            gap: 1,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                        }}
                    >
                        <Typography variant="body2" sx={{ fontWeight: 600, mr: 1 }}>
                            Selected: {chosenVenue.name}
                        </Typography>
                        {hasReservedSeating ? (
                            <Chip
                                size="small"
                                icon={<SeatIcon />}
                                color="primary"
                                label="Reserved seating"
                            />
                        ) : (
                            <Chip
                                size="small"
                                variant="outlined"
                                label="General admission"
                            />
                        )}
                        {hasReservedSeating && layoutState.status === 'missing' && (
                            <Chip
                                size="small"
                                color="warning"
                                label="No seat layout yet"
                            />
                        )}
                        {hasReservedSeating && layoutState.status === 'present' && (
                            <Chip
                                size="small"
                                color="success"
                                label={`Seat layout ready (${layoutState.seatCount} seats)`}
                            />
                        )}
                    </Paper>
                </Grid>
            )}
        </Grid>
    );

    const renderSeatsStep = () => {
        if (!hasReservedSeating) {
            return (
                <Alert severity="info">
                    This venue does not use reserved seating, so there are no
                    seat categories to configure.
                </Alert>
            );
        }

        if (layoutState.status === 'unknown') {
            return (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress />
                </Box>
            );
        }

        if (layoutState.status === 'missing') {
            return (
                <Alert severity="warning">
                    <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                        This venue has no seat layout yet.
                    </Typography>
                    <Typography variant="body2">
                        <strong>{chosenVenue?.name}</strong> is marked as
                        reserved-seating, but its current venue master contains
                        no seats. Open{' '}
                        <strong>Venues → {chosenVenue?.name} → Edit</strong>,
                        upload an SVG layout, and return here to configure seat
                        categories.
                    </Typography>
                </Alert>
            );
        }

        return (
            <EventVenuePlanEditor
                eventId={editEventId}
                masterId={selectedMaster?.id || null}
                existingPlan={existingPlan}
                onPlanChange={(plan) => setExistingPlan(plan)}
                onAssignmentsChange={(assignments, categories) => {
                    if (selectedMaster) {
                        setSelectedMaster((prev) => prev && ({
                            ...prev,
                            _seatAssignments: assignments,
                            _categoryOverrides: categories,
                        }));
                    }
                }}
            />
        );
    };

    const renderDetails = () => (
        <Grid container spacing={3}>
            <Grid item xs={12}>
                <SectionTitle variant="h6">Details</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
            </Grid>

            {(isPlatformAdmin || organizations.length > 1) && !isEdit && (
                <>
                    <Grid item xs={12} sm={6}>
                        <TextField
                            select
                            fullWidth
                            label="Organization"
                            name="organization_id"
                            value={formData.organization_id || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                // The venue master catalog is shared across
                                // tenants, so changing the event's org does
                                // NOT invalidate the selected venue.
                                handleChange({ target: { name: 'organization_id', value: val } });
                                setCurrentOrgId(val);
                            }}
                            helperText="The tenant this event belongs to."
                        >
                            {organizations.map((org) => (
                                <MenuItem key={org.id} value={org.id}>{org.name}</MenuItem>
                            ))}
                        </TextField>
                    </Grid>
                    <Grid item xs={12} sm={6} />
                </>
            )}

            <EventBasicInfo
                formData={formData}
                onChange={handleChange}
                venues={venues}
                hideVenueField
                hideIdentityFields
            />

            {canAssignOrganizer && (
                <OrganizerSelector
                    value={formData.organizer_id}
                    onChange={(val) =>
                        handleChange({ target: { name: 'organizer_id', value: val } })
                    }
                    organizers={organizers}
                    loading={loadingOrganizers}
                    currentUserName={user?.name || user?.username}
                />
            )}

            <EventSchedule formData={formData} onChange={handleChange} />
            <EventCancellationPolicy
                formData={formData}
                onChange={handleChange}
                policies={policies}
            />
            <EventTicketSettings
                formData={formData}
                onChange={handleChange}
                isFreeRegistration={formData.event_flow === 'free_registration'}
            />

            {/* Sessions: only rendered when applicable. Required when
                ticketed, optional otherwise. */}
            {requirements.sessionsApplicable ? (
                <>
                    {requirements.sessionsRequired && (
                        <Grid item xs={12}>
                            <Alert severity="info">
                                Ticketed events require at least one session
                                (start and end time).
                            </Alert>
                        </Grid>
                    )}
                    <SessionsEditor
                        sessions={sessions}
                        onAdd={addSession}
                        onRemove={removeSession}
                        onUpdate={updateSession}
                    />
                </>
            ) : (
                <Grid item xs={12}>
                    <Alert severity="info">
                        Sessions are only configured for ticketed events.
                    </Alert>
                </Grid>
            )}

            {/* Tiers: rendered only when applicable. Required for
                paid/ticketed GA events; hidden entirely for reserved
                seating (prices come from the Seats step) and for free
                registration (auto GA tier). */}
            {requirements.tiersApplicable ? (
                <>
                    {requirements.tiersRequired && (
                        <Grid item xs={12}>
                            <Alert severity="info">
                                Add at least one ticket tier (name and price).
                            </Alert>
                        </Grid>
                    )}
                    <TiersEditor
                        tiers={tiers}
                        onAdd={addTier}
                        onRemove={removeTier}
                        onUpdate={updateTier}
                        label={
                            formData.event_flow === 'paid_registration'
                                ? 'Registration Fees'
                                : 'Ticket Tiers'
                        }
                    />
                </>
            ) : hasReservedSeating ? (
                <Grid item xs={12}>
                    <Alert severity="info">
                        This venue uses reserved seating. Seat prices are set on
                        the Seat Categories &amp; Pricing step — this event does
                        not use ticket tiers.
                    </Alert>
                </Grid>
            ) : formData.event_flow === 'free_registration' ? (
                <Grid item xs={12}>
                    <Box sx={{ p: 2, bgcolor: C.bgPrimary, borderRadius: 2 }}>
                        <Typography variant="body2" sx={{ color: C.textSecondary }}>
                            ✅ Free registration — a General Registration tier
                            will be created automatically.
                        </Typography>
                    </Box>
                </Grid>
            ) : null}

            <TemplatesGrid
                eventId={editEventId}
                templates={templates.templates}
                templateTypes={templates.templateTypes}
                onOpenUpload={templates.openUpload}
                onDeleteTemplate={templates.deleteTemplate}
            />

            <EventFormActions
                isEdit={isEdit}
                submitting={submitting}
                onCancel={handleCancel}
            />
        </Grid>
    );

    if (formLoading || orgLoading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: C.primary }} />
            </LoadingWrapper>
        );
    }

    if (!isEdit && needsOrganization) {
        return (
            <PageContainer>
                <PageHeader>
                    <PageHeaderLeft>
                        <PageTitle>Create New Event</PageTitle>
                    </PageHeaderLeft>
                </PageHeader>
                <Alert
                    severity="warning"
                    action={
                        <Button
                            color="inherit"
                            size="small"
                            onClick={() => navigate(ROUTE.ORGANIZATIONS)}
                        >
                            Create Organization
                        </Button>
                    }
                >
                    You need to belong to an organization before creating events.
                </Alert>
            </PageContainer>
        );
    }

    const stepContent = {
        [STEP.BASICS]: renderBasics,
        [STEP.VENUE]: renderVenueStep,
        [STEP.SEATS]: renderSeatsStep,
        [STEP.DETAILS]: renderDetails,
    };

    const currentIndex = visibleSteps.findIndex((s) => s.key === activeStep);
    const isFirst = currentIndex === 0;
    const isLast = currentIndex === visibleSteps.length - 1;

    const handleNextClick = () => {
        if (activeStep === STEP.BASICS) {
            const err = canLeaveBasics();
            if (err) {
                window.alert(err);
                return;
            }
        }

        if (activeStep === STEP.VENUE) {
            if (!chosenVenue) {
                window.alert('Please choose a venue.');
                return;
            }
            if (hasReservedSeating && layoutState.status === 'unknown') {
                window.alert(
                    'Loading venue layout… please wait a moment and try again.'
                );
                return;
            }
            if (hasReservedSeating && layoutState.status === 'missing') {
                window.alert(
                    'This venue is marked as reserved-seating, but it has no '
                    + 'seat layout yet. Edit the venue to upload an SVG layout, '
                    + 'then return here.'
                );
                return;
            }
        }

        nextStep();
    };

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>{isEdit ? 'Edit Event' : 'Create Event'}</PageTitle>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton onClick={handleCancel}>
                        Cancel
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            <Stepper activeStep={currentIndex} sx={{ mb: 3 }}>
                {visibleSteps.map((s) => (
                    <Step key={s.key}>
                        <StepLabel>{s.label}</StepLabel>
                    </Step>
                ))}
            </Stepper>

            {submitError && <Alert severity="error" sx={{ mb: 2 }}>{submitError}</Alert>}

            <StyledPaper>
                {isLast ? (
                    <form onSubmit={handleFinalSubmit}>
                        {stepContent[activeStep]()}
                    </form>
                ) : (
                    stepContent[activeStep]()
                )}
            </StyledPaper>

            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    mt: 3,
                    gap: 2,
                    flexWrap: 'wrap',
                }}
            >
                <OutlineButton
                    onClick={prevStep}
                    disabled={isFirst}
                    startIcon={<ArrowBackIcon />}
                >
                    Back
                </OutlineButton>

                {!isLast && (
                    <PrimaryButton
                        onClick={handleNextClick}
                        endIcon={<ArrowForwardIcon />}
                    >
                        Continue
                    </PrimaryButton>
                )}
                {isLast && (
                    <PrimaryButton
                        type="submit"
                        disabled={submitting}
                        startIcon={submitting ? <CircularProgress size={18} /> : <CheckIcon />}
                    >
                        {isEdit ? 'Save Changes' : 'Create Event'}
                    </PrimaryButton>
                )}
            </Box>

            <TemplateUploadDialog
                open={templates.uploadDialogOpen}
                eventId={editEventId}
                templateTypes={templates.templateTypes}
                form={templates.uploadForm}
                setForm={templates.setUploadForm}
                uploading={templates.uploading}
                onClose={templates.closeUpload}
                onUpload={templates.uploadTemplate}
            />
        </PageContainer>
    );
};

export default CreateEvent;