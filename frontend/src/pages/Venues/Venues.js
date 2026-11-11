import React, { useState, useEffect, useCallback } from 'react'; // ✅ Added useCallback
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
    Button,
    CircularProgress,
    Chip,
    IconButton,
    Tooltip,
    Alert,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import {
    Add as AddIcon,
    Refresh as RefreshIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Visibility as VisibilityIcon,
    LocationOn as LocationIcon,
    People as PeopleIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageSubtitle,
    PageHeaderLeft,
    PageHeaderRight,
    PrimaryButton,
    OutlineButton,
    LoadingWrapper,
} from '../../components/Common';

// ✅ Platform Filter Imports
import usePlatformFilter from '../../hooks/usePlatformFilter';
import { OrgFilterSelect } from '../../components/Common';

// ❌ Removed unused EVENT_STATUS import (was dead code)

const Venues = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
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

    const [venues, setVenues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadVenues = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // ✅ 2. Merge orgParams (Super Admin sees all if empty, or filtered if selected)
            const response = await api.get('/venues/', { params: orgParams });
            setVenues(response.data?.results || response.data || []);
        } catch (error) {
            console.error('❌ Failed to load venues:', error);
            setError(error.message || t('venues.loadFailed'));
            toast.error(t('venues.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [orgParams, t]); // ✅ 3. Added orgParams to dependency array

    useEffect(() => {
        loadVenues();
    }, [loadVenues]); // ✅ Updated dependencies

    const handleDelete = async (id, name) => {
        if (!window.confirm(t('venues.deleteConfirm', { name }))) return;
        try {
            await api.delete(`/venues/${id}/`);
            toast.success(t('venues.deletedSuccess'));
            loadVenues();
        } catch (error) {
            console.error('Delete error:', error);
            toast.error(t('venues.deleteFailed'));
        }
    };

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: 'primary.main' }} />
            </LoadingWrapper>
        );
    }

    if (error) {
        return (
            <PageContainer
                sx={{
                    pt: 'max(16px, env(safe-area-inset-top))',
                    pb: 'max(16px, env(safe-area-inset-bottom))',
                    pl: 'max(16px, env(safe-area-inset-left))',
                    pr: 'max(16px, env(safe-area-inset-right))',
                }}
            >
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
                <Button variant="contained" onClick={loadVenues}>
                    {t('common.retry')}
                </Button>
            </PageContainer>
        );
    }

    return (
        <PageContainer
            sx={{
                pt: 'max(16px, env(safe-area-inset-top))',
                pb: 'max(16px, env(safe-area-inset-bottom))',
                pl: 'max(16px, env(safe-area-inset-left))',
                pr: 'max(16px, env(safe-area-inset-right))',
            }}
        >
            <PageHeader
                sx={{
                    flexWrap: 'wrap',
                    gap: 2,
                    rowGap: 1.5,
                }}
            >
                <PageHeaderLeft sx={{ minWidth: 0 }}>
                    <PageTitle>{t('venues.title')}</PageTitle>
                    {!isMobile && <PageSubtitle>{t('venues.subtitle')}</PageSubtitle>}
                </PageHeaderLeft>
                <PageHeaderRight
                    sx={{
                        flexWrap: 'wrap',
                        gap: 1,
                        rowGap: 1,
                        width: isMobile ? '100%' : 'auto',
                    }}
                >
                    {/* ✅ 4. Render the Organization Filter Dropdown */}
                    <OrgFilterSelect
                        isPlatformAdmin={isPlatformAdmin}
                        organizations={organizations}
                        orgFilter={orgFilter}
                        setOrgFilter={setOrgFilter}
                    />
                    <OutlineButton
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadVenues}
                        sx={isMobile ? { flex: 1, minWidth: 140 } : undefined}
                    >
                        {t('common.refresh')}
                    </OutlineButton>
                    <PrimaryButton
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => navigate('/app/venues/create')}
                        sx={isMobile ? { flex: 1, minWidth: 140 } : undefined}
                    >
                        {t('venues.addVenue')}
                    </PrimaryButton>
                </PageHeaderRight>
            </PageHeader>

            {venues.length === 0 ? (
                <Box
                    sx={{
                        textAlign: 'center',
                        py: { xs: 6, sm: 8 },
                        color: 'text.disabled',
                        px: 2,
                    }}
                >
                    <LocationIcon sx={{ fontSize: 48, opacity: 0.3, mb: 2 }} />
                    <Typography variant="h6" sx={{ color: 'text.secondary' }}>
                        {t('venues.noVenues')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                        {t('venues.createFirst')}
                    </Typography>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => navigate('/app/venues/create')}
                        sx={{ mt: 2 }}
                    >
                        {t('venues.addVenue')}
                    </Button>
                </Box>
            ) : (
                <Grid container spacing={isMobile ? 2 : 3}>
                    {venues.map((venue) => (
                        <Grid item xs={12} sm={6} md={4} lg={4} xl={3} key={venue.id}>
                            <Card
                                sx={{
                                    borderRadius: 2,
                                    border: '1px solid rgba(226, 232, 240, 1)',
                                    height: '100%',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                        transform: 'translateY(-2px)',
                                    },
                                    '&:active': {
                                        transform: 'scale(0.99)',
                                    },
                                }}
                            >
                                <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                                    <Typography
                                        variant="h6"
                                        title={venue.name}
                                        sx={{
                                            fontWeight: 600,
                                            color: 'text.primary',
                                            mb: 1,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            fontSize: { xs: '1.05rem', sm: '1.15rem' },
                                        }}
                                    >
                                        {venue.name}
                                    </Typography>

                                    <Box
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            mb: 1,
                                            minWidth: 0, // enables ellipsis on flex child
                                        }}
                                    >
                                        <LocationIcon
                                            sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }}
                                        />
                                        <Typography
                                            variant="body2"
                                            noWrap
                                            sx={{
                                                color: 'text.secondary',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                minWidth: 0,
                                            }}
                                        >
                                            {venue.city}, {venue.state || venue.country || t('common.nA')}
                                        </Typography>
                                    </Box>

                                    <Box
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            mb: 2,
                                        }}
                                    >
                                        <PeopleIcon
                                            sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }}
                                        />
                                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                            {t('venues.capacityLine', { capacity: venue.capacity || t('common.nA') })}
                                        </Typography>
                                    </Box>

                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: 1,
                                            rowGap: 1,
                                        }}
                                    >
                                        <Chip
                                            label={venue.is_active ? t('venues.activeLabel') : t('venues.inactive')}
                                            size="small"
                                            color={venue.is_active ? 'success' : 'default'}
                                        />
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <Tooltip title={t('eventCard.viewDetails')}>
                                                <IconButton
                                                    size="small"
                                                    sx={{
                                                        color: 'text.secondary',
                                                        minWidth: { xs: 44, md: 40 },
                                                        minHeight: { xs: 44, md: 40 },
                                                    }}
                                                    onClick={() => navigate(`/app/venues/${venue.id}`)}
                                                    aria-label={t('venues.viewAria', { name: venue.name })}
                                                >
                                                    <VisibilityIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title={t('venues.editLabel')}>
                                                <IconButton
                                                    size="small"
                                                    sx={{
                                                        color: 'primary.main',
                                                        minWidth: { xs: 44, md: 40 },
                                                        minHeight: { xs: 44, md: 40 },
                                                    }}
                                                    onClick={() => navigate(`/app/venues/edit/${venue.id}`)}
                                                    aria-label={t('venues.editAria', { name: venue.name })}
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title={t('venues.deleteLabel')}>
                                                <IconButton
                                                    size="small"
                                                    sx={{
                                                        color: 'error.main',
                                                        minWidth: { xs: 44, md: 40 },
                                                        minHeight: { xs: 44, md: 40 },
                                                    }}
                                                    onClick={() => handleDelete(venue.id, venue.name)}
                                                    aria-label={t('venues.deleteAria', { name: venue.name })}
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}
        </PageContainer>
    );
};

export default Venues;