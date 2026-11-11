// frontend/src/pages/Events/Events.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Box, Grid, Typography, Button, CircularProgress, Alert,
    IconButton, Tooltip, Paper, Stack, Dialog, DialogTitle,
    DialogContent, DialogActions, useMediaQuery, useTheme,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Visibility as ViewIcon,
    Refresh as RefreshIcon,
    PublishedWithChanges as PublishIcon,
} from '@mui/icons-material';
import { useRole } from '../../context/RoleContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageHeaderLeft,
    PageHeaderRight,
    PrimaryButton,
    OutlineButton,
    LoadingWrapper,
} from '../../components/Common';
import EventCard from '../../components/Common/EventCard';
import { MEMBERSHIP_ROLES } from '../../constants';
import { theme } from '../../theme/tokens';

// ✅ Platform Filter Imports
import usePlatformFilter from '../../hooks/usePlatformFilter';
import { OrgFilterSelect } from '../../components/Common';

const C = theme.colors;

// ---------------------------------------------------------------------------
// HOVER ACTIONS OVERLAY
// ---------------------------------------------------------------------------
const EventCardWithAdminActions = ({
    event,
    isMobile,
    canManageEvents,
    isDraft,
    actionLoading,
    onView,
    onEdit,
    onPublish,
    onDelete,
}) => {
    const { t } = useTranslation();
    const [hovered, setHovered] = useState(false);

    const ownerLabel = event.organizer_username || event.organizer || null;

    return (
        <Box
            sx={{ position: 'relative', height: '100%' }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <EventCard event={event} onSelect={onView} context="management" />

            {canManageEvents && ownerLabel && (
                <Box
                    sx={{
                        position: 'absolute',
                        bottom: 12,
                        left: 12,
                        zIndex: 2,
                        backgroundColor: 'rgba(255, 255, 255, 0.92)',
                        backdropFilter: 'blur(6px)',
                        borderRadius: 1,
                        px: 1,
                        py: 0.25,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    }}
                >
                    <Typography
                        variant="caption"
                        sx={{ color: C.textSecondary, fontWeight: 600 }}
                    >
                        👤 {ownerLabel}
                    </Typography>
                </Box>
            )}

            {canManageEvents && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        display: 'flex',
                        gap: 0.5,
                        opacity: isMobile || hovered ? 1 : 0,
                        transition: 'opacity 0.2s ease',
                        pointerEvents: isMobile || hovered ? 'auto' : 'none',
                        zIndex: 2,
                        backgroundColor: 'rgba(255, 255, 255, 0.92)',
                        backdropFilter: 'blur(6px)',
                        borderRadius: 2,
                        p: 0.5,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    }}
                >
                    <Tooltip title={t('eventCard.viewDetails')}>
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                onView(event);
                            }}
                            sx={{ color: C.textSecondary }}
                        >
                            <ViewIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={t('common.edit')}>
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(event);
                            }}
                            sx={{ color: C.primary }}
                        >
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    {isDraft && (
                        <Tooltip title={t('events.publish')}>
                            <IconButton
                                size="small"
                                disabled={actionLoading}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPublish(event);
                                }}
                                sx={{ color: C.success }}
                            >
                                <PublishIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    <Tooltip title={t('common.delete')}>
                        <IconButton
                            size="small"
                            disabled={actionLoading}
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(event);
                            }}
                            sx={{ color: C.error }}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            )}
        </Box>
    );
};

const Events = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { hasOrgRole, isSuperAdmin } = useRole();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // ✅ 1. Initialize Platform Filter Hook
    const { 
        params: orgParams, 
        isPlatformAdmin, 
        orgFilter, 
        setOrgFilter, 
        organizations 
    } = usePlatformFilter();

    // "Manager" = owner/admin of the CURRENT org (super admins bypass).
    const isManager = hasOrgRole(MEMBERSHIP_ROLES.ADMIN);
    const canManageEvents = isManager;
    const canCreateEvents = isManager;
    // A user who lacks org-manage rights sees this as a browse page.
    const isRegularUser = !isManager && !isSuperAdmin;

    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState({
        open: false,
        eventId: null,
        eventTitle: '',
    });
    const [actionLoading, setActionLoading] = useState(false);

    const loadEvents = async () => {
        setLoading(true);
        setError(null);
        try {
            // ✅ 2. Merge orgParams (Super Admin sees all if empty, or filtered if selected)
            const response = await api.get('/events/', { params: orgParams });
            let eventsData = [];

            if (Array.isArray(response.data)) {
                eventsData = response.data;
            } else if (response.data && response.data.results) {
                eventsData = response.data.results;
            }

            setEvents(eventsData);
        } catch (err) {
            console.error('Events error:', err);
            setError(err.response?.data?.detail || t('events.loadEventsFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEvents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgParams]); // ✅ 3. Added orgParams to dependency array

    const handleCreateEvent = () => navigate('/app/events/create');
    const handleEditEvent = (event) => navigate(`/app/events/${event.id}/edit`);
    const handleViewEvent = (event) => navigate(`/app/events/${event.id}/`);

    const handleDeleteEvent = async () => {
        if (!deleteConfirm.eventId) return;

        setActionLoading(true);
        try {
            await api.delete(`/events/${deleteConfirm.eventId}/`);
            toast.success(t('events.deletedSuccess'));
            setDeleteConfirm({ open: false, eventId: null, eventTitle: '' });
            loadEvents();
        } catch (err) {
            console.error('Delete error:', err);
            toast.error(err.response?.data?.error || t('events.deleteFailed'));
        } finally {
            setActionLoading(false);
        }
    };

    const handlePublishEvent = async (event) => {
        setActionLoading(true);
        try {
            await api.post(`/events/${event.id}/publish/`);
            toast.success(t('events.publishSuccess'));
            loadEvents();
        } catch (err) {
            console.error('Publish error:', err);
            toast.error(err.response?.data?.error || t('events.publishFailed'));
        } finally {
            setActionLoading(false);
        }
    };

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
                    <PageTitle variant="h4">
                        {isRegularUser ? t('events.browseTitle') : t('events.managementTitle')}
                    </PageTitle>
                    {isRegularUser && (
                        <Typography
                            variant="body2"
                            sx={{
                                color: C.textSecondary,
                                ml: isMobile ? 0 : 2,
                                display: 'block',
                                width: isMobile ? '100%' : 'auto',
                            }}
                        >
                            {t('events.browseSubtitle')}
                        </Typography>
                    )}
                </PageHeaderLeft>
                <PageHeaderRight>
                    {/* ✅ 4. Render the Organization Filter Dropdown */}
                    <OrgFilterSelect
                        isPlatformAdmin={isPlatformAdmin}
                        organizations={organizations}
                        orgFilter={orgFilter}
                        setOrgFilter={setOrgFilter}
                    />
                    <OutlineButton variant="outlined" startIcon={<RefreshIcon />} onClick={loadEvents}>
                        {t('common.refresh')}
                    </OutlineButton>
                    {canCreateEvents && (
                        <PrimaryButton variant="contained" startIcon={<AddIcon />} onClick={handleCreateEvent}>
                            {t('events.newEvent')}
                        </PrimaryButton>
                    )}
                </PageHeaderRight>
            </PageHeader>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                    <Button size="small" onClick={loadEvents} sx={{ ml: 2 }}>
                        {t('common.retry')}
                    </Button>
                </Alert>
            )}

            <Grid container spacing={isMobile ? 2 : 3}>
                {events.length === 0 ? (
                    <Grid item xs={12}>
                        <Paper
                            sx={{
                                p: 4,
                                textAlign: 'center',
                                border: `1px solid ${C.borderLight}`,
                            }}
                        >
                            <Typography variant="h6" sx={{ color: C.textSecondary }}>
                                {isRegularUser ? t('events.noEventsAvailable') : t('events.noEventsFound')}
                            </Typography>
                            {canCreateEvents && (
                                <Button
                                    variant="contained"
                                    startIcon={<AddIcon />}
                                    onClick={handleCreateEvent}
                                    sx={{ mt: 2 }}
                                >
                                    {t('events.createFirst')}
                                </Button>
                            )}
                        </Paper>
                    </Grid>
                ) : (
                    events.map((event) => (
                        <Grid item xs={12} sm={6} md={4} key={event.id}>
                            <EventCardWithAdminActions
                                event={event}
                                isMobile={isMobile}
                                canManageEvents={canManageEvents}
                                isDraft={event.status === 'draft'}
                                actionLoading={actionLoading}
                                onView={handleViewEvent}
                                onEdit={handleEditEvent}
                                onPublish={handlePublishEvent}
                                onDelete={(evt) =>
                                    setDeleteConfirm({
                                        open: true,
                                        eventId: evt.id,
                                        eventTitle: evt.title,
                                    })
                                }
                            />
                        </Grid>
                    ))
                )}
            </Grid>

            <Dialog
                open={deleteConfirm.open}
                onClose={() =>
                    setDeleteConfirm({ open: false, eventId: null, eventTitle: '' })
                }
                PaperProps={{
                    sx: {
                        background: C.bgCard,
                        border: `1px solid ${C.borderLight}`,
                        borderRadius: '16px',
                    },
                }}
            >
                <DialogTitle sx={{ color: C.textPrimary }}>{t('events.deleteTitle')}</DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: C.textSecondary }}>
                        {t('events.deleteConfirm', { title: deleteConfirm.eventTitle })}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() =>
                            setDeleteConfirm({ open: false, eventId: null, eventTitle: '' })
                        }
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        onClick={handleDeleteEvent}
                        color="error"
                        variant="contained"
                        disabled={actionLoading}
                    >
                        {actionLoading ? <CircularProgress size={20} /> : t('common.delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default Events;