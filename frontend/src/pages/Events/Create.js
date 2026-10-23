// frontend/src/pages/Events/Create.js
import React from 'react';
import { Alert, CircularProgress, Grid, Box, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';

import {
    PageContainer, PageHeader, PageTitle, PageHeaderLeft, LoadingWrapper,
} from '../../components/Common';

import { useEventForm } from '../../features/events/useEventForm';
import { useEventSubmit } from '../../features/events/useEventSubmit';
import { useVenues } from '../../features/events/useVenues';
import { useCancellationPolicies } from '../../features/events/useCancellationPolicies';
import { useEventTemplates } from '../../features/events/useEventTemplates';

import { StyledPaper } from './components/styled';
import { EventBasicInfo } from './components/EventBasicInfo';
import { EventSchedule } from './components/EventSchedule';
import { EventCancellationPolicy } from './components/EventCancellationPolicy';
import { EventTicketSettings } from './components/EventTicketSettings';
import { SessionsEditor } from './components/SessionsEditor';
import { TiersEditor } from './components/TiersEditor';
import { TemplatesGrid } from './components/TemplatesGrid';
import { TemplateUploadDialog } from './components/TemplateUploadDialog';
import { EventFormActions } from './components/EventFormActions';

import { theme } from '../../theme/tokens';

const C = theme.colors;

const CreateEvent = () => {
    const navigate = useNavigate();
    const { id } = useParams();

    const venues = useVenues();
    const policies = useCancellationPolicies();

    const {
        loading,
        formData,
        handleChange,
        sessions,
        addSession,
        removeSession,
        updateSession,
        tiers,
        addTier,
        removeTier,
        updateTier,
    } = useEventForm(id);

    const templates = useEventTemplates(id);
    const { submit, submitting, error } = useEventSubmit({ id, formData, sessions, tiers });

    const isFreeRegistration = formData.event_flow === 'free_registration';
    const isRegistrationOnly = ['free_registration', 'paid_registration']
        .includes(formData.event_flow);

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: C.primary }} />
            </LoadingWrapper>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>{id ? 'Edit Event' : 'Create New Event'}</PageTitle>
                </PageHeaderLeft>
            </PageHeader>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <StyledPaper>
                <form onSubmit={submit}>
                    <Grid container spacing={3}>
                        <EventBasicInfo
                            formData={formData}
                            onChange={handleChange}
                            venues={venues}
                        />

                        <EventSchedule formData={formData} onChange={handleChange} />

                        <EventCancellationPolicy
                            formData={formData}
                            onChange={handleChange}
                            policies={policies}
                        />

                        {/* ✅ FIX: Render Ticket Settings for ALL event flows so Free Registration can select PDF/PNG */}
                        <EventTicketSettings
                            formData={formData}
                            onChange={handleChange}
                            isFreeRegistration={isFreeRegistration}
                        />

                        <SessionsEditor
                            sessions={sessions}
                            onAdd={addSession}
                            onRemove={removeSession}
                            onUpdate={updateSession}
                        />

                        {!isFreeRegistration && (
                            <TiersEditor
                                tiers={tiers}
                                onAdd={addTier}
                                onRemove={removeTier}
                                onUpdate={updateTier}
                                label={isRegistrationOnly ? 'Registration Fees' : 'Ticket Tiers'}
                            />
                        )}

                        {isFreeRegistration && (
                            <Grid item xs={12}>
                                <Box sx={{ p: 2, bgcolor: C.bgPrimary, borderRadius: 2 }}>
                                    <Typography variant="body2" sx={{ color: C.textSecondary }}>
                                        ✅ <strong>Free registration</strong> — a single
                                        "General Registration" tier will be created automatically.
                                        All bookings will be confirmed instantly with no payment.
                                    </Typography>
                                </Box>
                            </Grid>
                        )}

                        <TemplatesGrid
                            eventId={id}
                            templates={templates.templates}
                            templateTypes={templates.templateTypes}
                            onOpenUpload={templates.openUpload}
                        />

                        <EventFormActions
                            isEdit={!!id}
                            submitting={submitting}
                            onCancel={() => navigate('/app/events')}
                        />
                    </Grid>
                </form>
            </StyledPaper>

            <TemplateUploadDialog
                open={templates.uploadDialogOpen}
                eventId={id}
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