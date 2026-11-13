// frontend/src/pages/Events/PublicEvents.js
//
// Browse page for signed-in customers who are NOT organisation members
// (and for paid members without an org role). Org members/managers use
// the workspace Events page instead.
//
// Data comes from `/events/public/` plus, for signed-in members/paid
// members, their own organisation's events via eventService.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Alert, Box, CircularProgress, Grid, Typography,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import eventService from '../../services/eventService';
import EventCard from '../../components/Common/EventCard';
import {
    PageContainer,
    PageHeader,
    PageHeaderLeft,
    PageHeaderRight,
    PageTitle,
    PageSubtitle,
    OutlineButton,
    LoadingWrapper,
} from '../../components/Common';

const PublicEvents = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadEvents = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await eventService.getPublicEvents();
            const results = Array.isArray(data)
                ? data
                : (data?.results || []);
            setEvents(
                results.filter(
                    (event) => event.status === 'active' || event.status === 'published'
                )
            );
        } catch (err) {
            const msg =
                err.response?.data?.detail
                || err.response?.data?.error
                || err.message
                || t('events.loadFailed');
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEvents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress />
            </LoadingWrapper>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <Box>
                        <PageTitle variant="h4">
                            {t('events.browseTitle', 'Browse Events')}
                        </PageTitle>
                        <PageSubtitle>
                            {t('events.browseSubtitle', 'Find and book events')}
                        </PageSubtitle>
                    </Box>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton
                        startIcon={<RefreshIcon />}
                        onClick={loadEvents}
                        sx={{ textTransform: 'none' }}
                    >
                        {t('common.refresh')}
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            {error && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            {events.length === 0 ? (
                <Alert severity="info">
                    {t('events.noPublicEvents', 'No active events available for booking. Check back later!')}
                </Alert>
            ) : (
                <Grid container spacing={3}>
                    {events.map((event) => (
                        <Grid item xs={12} sm={6} lg={4} key={event.id}>
                            <EventCard
                                event={event}
                                onSelect={() => navigate(
                                    `/app/bookings/create?event=${event.id}`
                                )}
                            />
                        </Grid>
                    ))}
                </Grid>
            )}

            <Typography variant="caption" sx={{ display: 'block', mt: 3, color: 'text.secondary' }}>
                {t('events.publicBrowseHint', 'Public events are open to everyone. Sign in to your member account to see private events.')}
            </Typography>
        </PageContainer>
    );
};

export default PublicEvents;
