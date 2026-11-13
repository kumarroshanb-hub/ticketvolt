// frontend/src/pages/Events/Create.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert, CircularProgress, Grid, Box, Typography, TextField,
    MenuItem, Button, Divider, Paper,
    Chip, FormControl, InputLabel, Select, IconButton, Stack,
} from '@mui/material';
import {
    Add as AddIcon, Chair as SeatIcon,
    Check as CheckIcon, ArrowBack as ArrowBackIcon, ArrowForward as ArrowForwardIcon,
    Visibility as PreviewIcon, LocationOn as LocationIcon,
    CalendarMonth as CalendarIcon,
    PhoneIphone as PhoneIcon, TabletMac as TabletIcon,
    LaptopMac as LaptopIcon,
} from '@mui/icons-material';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import {
    PageContainer, PageHeader, PageTitle, PageHeaderLeft,
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
import { useSettings } from '../../context/SettingsContext';
import {
    EVENT_CATEGORY,
    EVENT_CATEGORY_LABELS,
} from '../../constants';

import { StyledPaper, SectionTitle, StyledTextField } from './components/styled';
import { OrganizerSelector } from './components/OrganizerSelector';
import { EventSchedule } from './components/EventSchedule';
import { EventCancellationPolicy } from './components/EventCancellationPolicy';
import { EventTicketSettings } from './components/EventTicketSettings';
import { EventPublicDetails } from './components/EventPublicDetails';
import { SessionsEditor } from './components/SessionsEditor';
import { TiersEditor } from './components/TiersEditor';
import { TemplatesGrid } from './components/TemplatesGrid';
import { TemplateUploadDialog } from './components/TemplateUploadDialog';

import { VenueMasterPicker } from './components/VenueMasterPicker';
import { EventVenuePlanEditor } from './components/EventVenuePlanEditor';

import { theme } from '../../theme/tokens';
import api from '../../services/api';
import venueMasterService from '../../services/venueMasterService';
import eventVenuePlanService from '../../services/eventVenuePlanService';

import { validateDateRange } from '../../utils/dateValidation';

const C = theme.colors;
const F = theme.fonts;

const BuilderPage = styled.div`
    width: min(1540px, calc(100% - 32px));
    margin: 0 auto;
    padding: 20px 0 40px;
    background: ${C.bgPrimary};
    min-height: 100vh;

    @media (max-width: 900px) {
        width: calc(100% - 24px);
        padding: 12px 0 92px;
    }
`;

const BuilderTopbar = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 18px;
`;

const BuilderTitle = styled.h1`
    font-family: ${F.family};
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    color: ${C.textPrimary};
    margin: 0;
`;

const BuilderGrid = styled.div`
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr) 330px;
    gap: 20px;
    align-items: start;

    @media (max-width: 1240px) {
        grid-template-columns: 190px minmax(0, 1fr);
    }

    @media (max-width: 900px) {
        grid-template-columns: 1fr;
        gap: 14px;
    }
`;

const StepRail = styled.aside`
    position: sticky;
    top: 94px;
    background: ${C.bgCard};
    border: 1px solid ${C.borderLight};
    border-radius: 18px;
    padding: 10px;
    box-shadow: ${theme.shadows.card};

    @media (max-width: 900px) {
        position: static;
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding: 8px;
        border-radius: 14px;
        scrollbar-width: none;
        &::-webkit-scrollbar { display: none; }
    }
`;

const RailStep = styled.button`
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 10px;
    border: 0;
    border-radius: 12px;
    background: ${(p) => (p.$active ? C.bgPrimary : 'transparent')};
    text-align: left;
    color: ${(p) => (p.$active ? C.textPrimary : C.textSecondary)};
    font-family: ${F.family};
    cursor: pointer;
    transition: 0.18s ease;

    &:hover { background: ${C.bgPrimary}; }

    .num {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        font-size: 11px;
        font-weight: 800;
        color: ${(p) => (p.$done || p.$active ? C.textInverse : C.textMuted)};
        background: ${(p) => (p.$done ? C.secondary : p.$active ? C.primary : C.bgInput)};
    }
    .copy { min-width: 0; }
    .copy b { display: block; font-size: 12px; line-height: 1.3; }
    .copy small { display: block; margin-top: 3px; font-size: 10px; line-height: 1.35; color: ${C.textMuted}; font-weight: 400; }

    @media (max-width: 900px) {
        min-width: 155px;
        width: auto;
        padding: 9px;
        .copy small { display: none; }
    }
`;

const BuilderCenter = styled.div`
    min-width: 0;
`;

const ContentHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 4px 12px;
`;

const ContentTitle = styled.h2`
    font-family: ${F.family};
    font-size: 15px;
    font-weight: 800;
    color: ${C.textPrimary};
    margin: 0;
    letter-spacing: -0.01em;
`;

const PreviewCard = styled.aside`
    position: sticky;
    top: 94px;
    background: ${C.bgCard};
    border: 1px solid ${C.borderLight};
    border-radius: 18px;
    overflow: hidden;
    box-shadow: ${theme.shadows.card};

    @media (max-width: 1240px) {
        position: static;
        grid-column: 1 / -1;
    }
`;

const PreviewLabel = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 7px;
    padding: 10px 12px;
    border-bottom: 1px solid ${C.borderLight};
    color: ${C.textSecondary};
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
`;

const PreviewDevices = styled.div`
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: ${C.bgPrimary};
`;

const DeviceButton = styled.button`
    width: 28px;
    height: 26px;
    border: 0;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: ${(p) => (p.$active ? C.bgCard : 'transparent')};
    color: ${(p) => (p.$active ? C.secondary : C.textMuted)};
    box-shadow: ${(p) => (p.$active ? '0 1px 4px rgba(0,0,0,.08)' : 'none')};
    cursor: pointer;

    svg { font-size: 15px; }
`;

const PreviewStage = styled.div`
    padding: 12px;
    background: ${C.bgPrimary};
`;

const PreviewViewport = styled.div`
    width: ${(p) => (p.$device === 'mobile' ? '228px' : p.$device === 'tablet' ? '288px' : '100%')};
    max-width: 100%;
    margin: 0 auto;
    background: ${C.bgCard};
    border: ${(p) => (p.$device === 'mobile' ? `6px solid ${C.primary}` : p.$device === 'tablet' ? `5px solid ${C.primary}` : `1px solid ${C.borderLight}`)};
    border-radius: ${(p) => (p.$device === 'mobile' ? '24px' : p.$device === 'tablet' ? '18px' : '12px')};
    overflow: hidden;
    transition: width .22s ease;
`;

const PreviewArt = styled.div`
    height: 160px;
    background: ${(p) => p.$image
        ? `url(${p.$image}) center/cover no-repeat`
        : `linear-gradient(135deg, ${C.primaryDark} 0%, ${C.primary} 58%, ${C.secondary} 100%)`};
    position: relative;
    display: flex;
    align-items: flex-end;
    padding: 14px;

    &::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(to top, rgba(0,0,0,.35), transparent 60%);
        pointer-events: none;
    }

    span {
        position: relative;
        z-index: 1;
        color: #fff;
        font-family: ${F.family};
        font-size: 18px;
        line-height: 1.2;
        font-weight: 800;
        letter-spacing: -0.02em;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
`;

const PreviewBody = styled.div`
    padding: 14px 16px 16px;
`;

const PreviewMeta = styled.div`
    color: ${C.textSecondary};
    font-size: 12px;
    line-height: 1.55;
    display: grid;
    gap: 7px;
    margin-top: 8px;

    div { display: flex; gap: 6px; align-items: flex-start; }
    svg { flex: 0 0 auto; color: ${C.textMuted}; margin-top: 1px; }
`;

const PreviewDivider = styled.div`
    border-top: 1px dashed ${C.borderHover};
    margin: 14px 0;
`;

const PreviewPrice = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    small { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: ${C.textMuted}; font-weight: 800; }
    b { font-family: ${F.family}; font-size: 20px; color: ${C.textPrimary}; }
`;

const PreviewCta = styled.div`
    min-height: 40px;
    border-radius: 9px;
    background: ${C.secondary};
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 800;
    padding: 0 14px;
`;

const STEP = {
    BASICS: 0,
    VENUE: 1,
    SEATS: 2,
    TICKETING: 3,
    DETAILS: 4,
};

const ROUTE = {
    EVENTS_LIST: '/app/events',
    EVENT_CREATE: '/app/events/create',
    VENUE_CREATE: '/app/venues/new',
    ORGANIZATIONS: '/app/organizations',
};

const CreateEvent = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const location = useLocation();
    const { id: editEventId } = useParams();
    const isEdit = Boolean(editEventId);
    const { formatMoney } = useSettings();

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
    const [uploadingCover, setUploadingCover] = useState(false);
    const [previewDevice, setPreviewDevice] = useState('laptop');
    const [masterLoading, setMasterLoading] = useState(false);

    // Returning from the venue round-trip must land the user back on the
    // Venue step, not reset them to Basics.
    useEffect(() => {
        if (!isEdit && hasVenueHandoff) {
            setActiveStep(STEP.VENUE);
        }
    }, [isEdit, hasVenueHandoff]);

    const lastFetchedMasterIdRef = useRef(null);

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
            { key: STEP.BASICS, label: t('eventWizard.stepBasics') },
            { key: STEP.VENUE, label: t('eventWizard.stepVenue') },
        ];
        if (seatStepRequired) {
            steps.push({ key: STEP.SEATS, label: t('eventWizard.stepSeats') });
        }
        steps.push({ key: STEP.TICKETING, label: t('eventWizard.stepTicketing', 'Tickets & templates') });
        steps.push({ key: STEP.DETAILS, label: t('eventWizard.stepPublish', 'Publish Event') });
        return steps;
    }, [seatStepRequired, t]);

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
        const timer = setTimeout(() => setActiveStep(STEP.VENUE), 0);
        return () => clearTimeout(timer);
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
        if (!formData.title?.trim()) return t('eventWizard.titleRequired');
        if (!formData.event_type) return t('eventWizard.typeRequired');
        if (!formData.category) return t('eventWizard.categoryRequired');
        if (!formData.event_flow) return t('eventWizard.registrationRequired');
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

    const handleFinalSubmit = async (e, options = {}) => {
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

        if (hasReservedSeating) {
            submitPayload.tiers = [];
            submitPayload.has_reserved_seating = true;
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

        await submit(e, submitPayload, options);
    };

    const handlePublish = () => handleFinalSubmit(
        null,
        isEdit && formData.status === 'published' ? {} : { publish: true },
    );

    // Atomically set multiple fields at once
    const patchForm = (patch) => {
        setFormData((prev) => ({ ...prev, ...patch }));
    };

    const handleCancel = () => {
        if (!isEdit) clearDraft();
        navigate(ROUTE.EVENTS_LIST);
    };

    const handleCoverUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const body = new FormData();
        body.append('image', file);
        body.append('organization_id', formData.organization_id || currentOrgId || '');
        setUploadingCover(true);
        try {
            const res = await api.post('/uploads/event-image/', body);
            patchForm({ cover_image: res.data.url });
            toast.success(t('events.imageUploaded', 'Image uploaded.'));
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setUploadingCover(false);
            event.target.value = '';
        }
    };

    const renderBasics = () => (
        <Grid container spacing={3}>
            <Grid item xs={12}>
                <SectionTitle variant="h6">{t('eventWizard.basicSection')}</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
                <Typography variant="body2" sx={{ color: C.textSecondary, mt: 1 }}>
                    {t('eventWizard.basicHint')}
                </Typography>
            </Grid>

            {(isPlatformAdmin || organizations.length > 1) && !isEdit && (
                <Grid item xs={12} sm={6}>
                    <TextField
                        select
                        fullWidth
                        label={t('events.organizationLabel')}
                        name="organization_id"
                        value={formData.organization_id || ''}
                        onChange={(e) => {
                            const val = e.target.value;
                            handleChange({ target: { name: 'organization_id', value: val } });
                            setCurrentOrgId(val);
                        }}
                        helperText={t('events.organizationHelper')}
                    >
                        {organizations.map((org) => (
                            <MenuItem key={org.id} value={org.id}>{org.name}</MenuItem>
                        ))}
                    </TextField>
                </Grid>
            )}

            <Grid item xs={12}>
                <TextField
                    fullWidth
                    label={t('events.titleLabel')}
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    required
                />
            </Grid>

            <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                    <InputLabel id="category-label">{t('events.categoryLabel')}</InputLabel>
                    <Select
                        labelId="category-label"
                        name="category"
                        value={formData.category || ''}
                        onChange={handleChange}
                        label={t('events.categoryLabel')}
                    >
                        {Object.values(EVENT_CATEGORY).map((cat) => (
                            <MenuItem key={cat} value={cat}>
                                {t(`category.${cat}`, { defaultValue: EVENT_CATEGORY_LABELS[cat] || cat })}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                    <InputLabel id="event-flow-label">{t('eventWizard.registrationType')}</InputLabel>
                    <Select
                        labelId="event-flow-label"
                        name="event_flow"
                        value={formData.event_flow || 'ticketed'}
                        onChange={handleChange}
                        label={t('eventWizard.registrationType')}
                    >
                        <MenuItem value="ticketed">{t('eventWizard.flowTicketed')}</MenuItem>
                        <MenuItem value="paid_registration">{t('events.flowPaid')}</MenuItem>
                        <MenuItem value="free_registration">{t('events.flowFree')}</MenuItem>
                    </Select>
                </FormControl>
            </Grid>

            <EventSchedule formData={formData} onChange={handleChange} />

            <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ color: C.textPrimary, fontWeight: 700, mb: 1 }}>
                    {t('events.coverImageLabel', 'Event image')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    {formData.cover_image && (
                        <Box
                            component="img"
                            src={formData.cover_image}
                            alt={t('events.coverPreview', 'Event cover preview')}
                            sx={{ width: 150, height: 90, objectFit: 'cover', borderRadius: 2, border: `1px solid ${C.borderLight}` }}
                        />
                    )}
                    <Button variant="outlined" component="label" disabled={uploadingCover}>
                        {uploadingCover ? t('common.loading') : t('events.uploadImage', 'Upload image')}
                        <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={handleCoverUpload} />
                    </Button>
                    <StyledTextField
                        size="small"
                        sx={{ minWidth: 240, flex: 1 }}
                        label={t('events.coverImageUrl', 'Or image URL')}
                        name="cover_image"
                        value={formData.cover_image || ''}
                        onChange={handleChange}
                    />
                </Box>
                <Typography variant="caption" sx={{ color: C.textMuted, display: 'block', mt: 1 }}>
                    {t('events.coverImageHelper', 'Recommended 1600 × 900 px (16:9), PNG/JPEG/WebP, up to 10MB. Used on the event page and cards.')}
                </Typography>
            </Grid>

            <Grid item xs={12}>
                <StyledTextField
                    fullWidth
                    label={t('events.overviewLabel', 'Overview')}
                    name="description"
                    value={formData.description || ''}
                    onChange={handleChange}
                    multiline
                    minRows={5}
                    placeholder={t('events.overviewPlaceholder', 'Tell attendees what the event is about, what to expect, and anything they should know.')}
                />
            </Grid>

            {canAssignOrganizer && (
                <OrganizerSelector
                    value={formData.organizer_id}
                    onChange={(val) => handleChange({ target: { name: 'organizer_id', value: val } })}
                    organizers={organizers}
                    loading={loadingOrganizers}
                    currentUserName={user?.name || user?.username}
                />
            )}

            <EventCancellationPolicy formData={formData} onChange={handleChange} policies={policies} />
            <EventPublicDetails formData={formData} onChange={handleChange} setFormData={setFormData} />
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
                toast.error(t('eventWizard.seatLayoutLoadFailed'));
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
                <SectionTitle variant="h6">{t('eventWizard.stepVenue')}</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
                <Typography variant="body2" sx={{ color: C.textSecondary, mt: 1 }}>
                    {t('eventWizard.venueStepHint')}
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
                        {t('eventWizard.or')}
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
                        {t('eventWizard.createNewVenue')}
                    </Button>
                </Box>
            </Grid>

            {masterLoading && (
                <Grid item xs={12}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={16} />
                        <Typography variant="caption" sx={{ color: C.textSecondary }}>
                            {t('eventWizard.loadingVenueMaster')}
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
                            {t('eventWizard.selectedVenue', { name: chosenVenue.name })}
                        </Typography>
                        {hasReservedSeating ? (
                            <Chip
                                size="small"
                                icon={<SeatIcon />}
                                color="primary"
                                label={t('eventWizard.reservedSeating')}
                            />
                        ) : (
                            <Chip
                                size="small"
                                variant="outlined"
                                label={t('eventWizard.generalAdmission')}
                            />
                        )}
                        {hasReservedSeating && layoutState.status === 'missing' && (
                            <Chip
                                size="small"
                                color="warning"
                                label={t('eventWizard.noSeatLayoutYet')}
                            />
                        )}
                        {hasReservedSeating && layoutState.status === 'present' && (
                            <Chip
                                size="small"
                                color="success"
                                label={t('eventWizard.seatLayoutReady', { count: layoutState.seatCount })}
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
                    {t('eventWizard.noReservedSeating')}
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
                        {t('eventWizard.missingLayoutTitle')}
                    </Typography>
                    <Typography variant="body2">
                        {t('eventWizard.missingLayoutBody', { name: chosenVenue?.name })}
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

    const renderTicketing = () => (
        <Grid container spacing={3}>
            <Grid item xs={12}>
                <SectionTitle variant="h6">{t('eventWizard.ticketingSection', 'Ticketing & ticket templates')}</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
            </Grid>

            <EventTicketSettings formData={formData} onChange={handleChange} />

            {requirements.sessionsApplicable ? (
                <>
                    {requirements.sessionsRequired && (
                        <Grid item xs={12}><Alert severity="info">{t('eventWizard.sessionsRequired')}</Alert></Grid>
                    )}
                    <SessionsEditor sessions={sessions} onAdd={addSession} onRemove={removeSession} onUpdate={updateSession} />
                </>
            ) : (
                <Grid item xs={12}><Alert severity="info">{t('eventWizard.sessionsTicketedOnly')}</Alert></Grid>
            )}

            {requirements.tiersApplicable ? (
                <>
                    {requirements.tiersRequired && (
                        <Grid item xs={12}><Alert severity="info">{t('eventWizard.tiersRequired')}</Alert></Grid>
                    )}
                    <TiersEditor
                        tiers={tiers} onAdd={addTier} onRemove={removeTier} onUpdate={updateTier}
                        isRegistrationFees={formData.event_flow === 'paid_registration'}
                        label={formData.event_flow === 'paid_registration' ? t('events.tiersTitleFees') : t('events.tiersTitle')}
                    />
                </>
            ) : hasReservedSeating ? (
                <Grid item xs={12}><Alert severity="info">{t('eventWizard.reservedNoTiers')}</Alert></Grid>
            ) : formData.event_flow === 'free_registration' ? (
                <Grid item xs={12}><Box sx={{ p: 2, bgcolor: C.bgPrimary, borderRadius: 2 }}><Typography variant="body2" sx={{ color: C.textSecondary }}>{t('events.freeRegistrationBanner')}</Typography></Box></Grid>
            ) : null}

            <TemplatesGrid
                eventId={editEventId}
                templates={templates.templates}
                templateTypes={templates.templateTypes}
                onOpenUpload={templates.openUpload}
                onDeleteTemplate={templates.deleteTemplate}
            />
        </Grid>
    );

    const renderPublish = () => {
        const checklist = [
            [Boolean(formData.title?.trim()), t('eventWizard.checkTitle', 'Event title')],
            [Boolean(formData.description?.trim()), t('eventWizard.checkOverview', 'Overview')],
            [Boolean(chosenVenue), t('eventWizard.checkVenue', 'Venue')],
            [Boolean(formData.start_date && formData.end_date), t('eventWizard.checkDates', 'Date and time')],
            [(tiers.length > 0) || formData.event_flow === 'free_registration' || hasReservedSeating, t('eventWizard.checkTickets', 'Tickets or seat pricing')],
        ];

        return (
            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <SectionTitle variant="h6">{t('eventWizard.publishHeading', 'Ready to publish?')}</SectionTitle>
                    <Divider sx={{ borderColor: C.borderLight }} />
                    <Typography variant="body2" sx={{ color: C.textSecondary, mt: 1 }}>
                        {t('eventWizard.publishHint', 'Review the snapshot below. Publishing makes the event visible and freezes its venue plan.')}
                    </Typography>
                </Grid>

                <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', p: 2, bgcolor: C.bgPrimary, borderRadius: 2 }}>
                        {formData.cover_image && (
                            <Box component="img" src={formData.cover_image} alt="" sx={{ width: 96, height: 64, objectFit: 'cover', borderRadius: 1.5 }} />
                        )}
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="h6" sx={{ fontWeight: 800, color: C.textPrimary }}>
                                {formData.title || t('eventWizard.eventTitlePlaceholder', 'Event title')}
                            </Typography>
                            <Typography variant="body2" sx={{ color: C.textSecondary }}>
                                {previewDate} · {previewVenue}
                            </Typography>
                            <Chip size="small" label={formData.status === 'published' ? t('events.published', 'Published') : t('events.draft', 'Draft')} sx={{ mt: 1 }} />
                        </Box>
                    </Box>
                </Grid>

                <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
                        {t('eventWizard.readiness', 'Readiness check')}
                    </Typography>
                    <Stack spacing={1}>
                        {checklist.map(([ok, label]) => (
                            <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {ok ? <CheckIcon sx={{ color: C.success, fontSize: 18 }} /> : <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${C.textMuted}` }} />}
                                <Typography variant="body2" sx={{ color: ok ? C.textPrimary : C.textMuted }}>{label}</Typography>
                            </Box>
                        ))}
                    </Stack>
                </Grid>

                <Grid item xs={12}>
                    <Alert severity="info">
                        {t('eventWizard.publishDraftNotice', 'This event is saved as a draft until you publish it. After publishing, status changes such as completed or sold out are handled automatically.')}
                    </Alert>
                </Grid>

                <Grid item xs={12}>
                    <PrimaryButton
                        onClick={handlePublish}
                        disabled={submitting}
                        startIcon={submitting ? <CircularProgress size={18} /> : <CheckIcon />}
                    >
                        {isEdit && formData.status === 'published'
                            ? t('eventWizard.saveChanges')
                            : t('eventWizard.publishEvent', 'Publish event')}
                    </PrimaryButton>
                </Grid>
            </Grid>
        );
    };

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
                        <PageTitle>{t('events.createTitle')}</PageTitle>
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
                            {t('eventWizard.createOrganization')}
                        </Button>
                    }
                >
                    {t('eventWizard.needsOrganizationBody')}
                </Alert>
            </PageContainer>
        );
    }

    const stepContent = {
        [STEP.BASICS]: renderBasics,
        [STEP.VENUE]: renderVenueStep,
        [STEP.SEATS]: renderSeatsStep,
        [STEP.TICKETING]: renderTicketing,
        [STEP.DETAILS]: renderPublish,
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

        if (activeStep === STEP.TICKETING) {
            const err = canLeaveDetails();
            if (err) {
                window.alert(err);
                return;
            }
        }

        if (activeStep === STEP.VENUE) {
            if (!chosenVenue) {
                window.alert(t('eventWizard.venueRequired'));
                return;
            }
            if (hasReservedSeating && layoutState.status === 'unknown') {
                window.alert(t('eventWizard.layoutLoadingWait'));
                return;
            }
            if (hasReservedSeating && layoutState.status === 'missing') {
                window.alert(t('eventWizard.layoutMissingAlert'));
                return;
            }
        }

        nextStep();
    };

    const previewDate = formData.start_date
        ? new Date(formData.start_date).toLocaleString('en-HK', {
            weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit',
        })
        : t('common.tbd');
    const previewVenue = chosenVenue?.name || formData.venue_name || t('eventWizard.venueRequired');
    const previewTierPrices = tiers
        .map((tier) => Number(tier.price) || 0)
        .filter((price) => price > 0);
    const previewSeatPrices = (
        selectedMaster?._categoryOverrides
        || existingPlan?.categories
        || selectedMaster?.snapshot?.category_palette
        || []
    )
        .map((category) => Number(category.price ?? category.default_price) || 0)
        .filter((price) => price > 0);
    const previewPrice = previewTierPrices.length
        ? Math.min(...previewTierPrices)
        : (previewSeatPrices.length ? Math.min(...previewSeatPrices) : null);
    const previewHasPrice = previewPrice !== null && previewPrice > 0;
    const stepDescriptions = {
        [STEP.BASICS]: t('eventWizard.basicsRailHint', 'Set the essentials and when it happens'),
        [STEP.VENUE]: t('eventWizard.venueRailHint', 'Choose where the event takes place'),
        [STEP.SEATS]: t('eventWizard.seatsRailHint', 'Assign seats and categories'),
        [STEP.TICKETING]: t('eventWizard.ticketingRailHint', 'Set ticket types and templates'),
        [STEP.DETAILS]: t('eventWizard.publishRailHint', 'Review and publish your event'),
    };

    return (
        <BuilderPage>
            <BuilderTopbar>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                    <IconButton
                        onClick={() => navigate(ROUTE.EVENTS_LIST)}
                        aria-label={t('common.back')}
                        sx={{ bgcolor: C.bgCard, border: `1px solid ${C.borderLight}`, flex: '0 0 auto' }}
                    >
                        <ArrowBackIcon />
                    </IconButton>
                    <div style={{ minWidth: 0 }}>
                        <BuilderTitle>
                            {isEdit ? t('events.editTitle') : t('eventWizard.builderTitle', 'Create your event')}
                        </BuilderTitle>
                        <Typography variant="caption" sx={{ color: C.textMuted }}>
                            {t('eventWizard.builderSubtitle', 'Build the page, add tickets, then publish when ready.')}
                        </Typography>
                    </div>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                        size="small"
                        label={formData.status === 'published' ? t('events.published', 'Published') : t('events.draft', 'Draft')}
                        sx={{ bgcolor: C.bgInput, color: C.textSecondary, fontWeight: 700 }}
                    />
                    <OutlineButton onClick={handleCancel}>{t('common.cancel')}</OutlineButton>
                </Box>
            </BuilderTopbar>

            <BuilderGrid>
                <StepRail aria-label={t('eventWizard.steps', 'Event creation steps')}>
                    {visibleSteps.map((s, idx) => (
                        <RailStep
                            key={s.key}
                            type="button"
                            $active={activeStep === s.key}
                            $done={idx < currentIndex}
                            onClick={() => {
                                if (idx <= currentIndex) setActiveStep(s.key);
                            }}
                        >
                            <span className="num">
                                {idx < currentIndex ? <CheckIcon sx={{ fontSize: 15 }} /> : idx + 1}
                            </span>
                            <span className="copy">
                                <b>{s.label}</b>
                                <small>{stepDescriptions[s.key]}</small>
                            </span>
                        </RailStep>
                    ))}
                </StepRail>

                <BuilderCenter>
                    <ContentHeader>
                        <ContentTitle>{visibleSteps[currentIndex]?.label}</ContentTitle>
                        <Typography variant="caption" sx={{ color: C.textMuted }}>
                            {currentIndex + 1} / {visibleSteps.length}
                        </Typography>
                    </ContentHeader>

                    {submitError && <Alert severity="error" sx={{ mb: 2 }}>{submitError}</Alert>}

                    <StyledPaper sx={{ p: { xs: 2, md: 3.5 } }}>
                        {isLast ? (
                            <form onSubmit={(e) => { e.preventDefault(); handlePublish(); }}>
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
                            mt: 2.5,
                            gap: 2,
                            flexWrap: 'wrap',
                        }}
                    >
                        <OutlineButton
                            onClick={prevStep}
                            disabled={isFirst}
                            startIcon={<ArrowBackIcon />}
                        >
                            {t('common.back')}
                        </OutlineButton>

                        {!isLast && (
                            <PrimaryButton
                                onClick={handleNextClick}
                                endIcon={<ArrowForwardIcon />}
                            >
                                {t('eventWizard.saveAndContinue', 'Save and continue')}
                            </PrimaryButton>
                        )}

                    </Box>
                </BuilderCenter>

                <PreviewCard aria-label={t('eventWizard.livePreview', 'Live event preview')}>
                    <PreviewLabel>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <PreviewIcon fontSize="small" />
                            {t('eventWizard.preview', 'Preview')}
                        </span>
                        <PreviewDevices>
                            {[
                                ['mobile', PhoneIcon, 'Mobile'],
                                ['tablet', TabletIcon, 'Tablet'],
                                ['laptop', LaptopIcon, 'Laptop'],
                            ].map(([device, Icon, label]) => (
                                <DeviceButton
                                    key={device}
                                    type="button"
                                    $active={previewDevice === device}
                                    onClick={() => setPreviewDevice(device)}
                                    aria-label={label}
                                    title={label}
                                >
                                    <Icon />
                                </DeviceButton>
                            ))}
                        </PreviewDevices>
                    </PreviewLabel>
                    <PreviewStage>
                        <PreviewViewport $device={previewDevice}>
                            <PreviewArt $image={formData.cover_image || undefined}>
                                <span>{formData.title || t('eventWizard.eventTitlePlaceholder', 'Event title')}</span>
                            </PreviewArt>
                            <PreviewBody>
                                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: C.textPrimary, lineHeight: 1.3 }}>
                                    {formData.title || t('eventWizard.eventTitlePlaceholder', 'Event title')}
                                </Typography>
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: C.textMuted, display: '-webkit-box', mt: 0.5,
                                        overflow: 'hidden', WebkitLineClamp: previewDevice === 'mobile' ? 2 : 3,
                                        WebkitBoxOrient: 'vertical',
                                    }}
                                >
                                    {formData.description || t('eventWizard.shortDescriptionPlaceholder', 'Tell attendees what the event is about.')}
                                </Typography>
                                <PreviewMeta>
                                    <div><CalendarIcon sx={{ fontSize: 15 }} />{previewDate}</div>
                                    <div><LocationIcon sx={{ fontSize: 15 }} />{previewVenue}</div>
                                    {chosenVenue?.address && <div>{chosenVenue.address}</div>}
                                </PreviewMeta>
                                <PreviewDivider />
                                <PreviewPrice>
                                    <div>
                                        {previewHasPrice && (
                                            <small>{t('eventWizard.startingFrom', 'From')}</small>
                                        )}
                                        <b>{previewHasPrice ? formatMoney(previewPrice) : t('eventWizard.priceTbd', 'Price TBD')}</b>
                                    </div>
                                    <PreviewCta>{t('eventWizard.getTickets', 'Get tickets')}</PreviewCta>
                                </PreviewPrice>
                            </PreviewBody>
                        </PreviewViewport>
                    </PreviewStage>
                </PreviewCard>
            </BuilderGrid>

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
        </BuilderPage>
    );
};

export default CreateEvent;