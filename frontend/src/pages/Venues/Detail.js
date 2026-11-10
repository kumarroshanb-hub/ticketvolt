// frontend/src/pages/Venues/Detail.js
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
    Chip,
    IconButton,
    Button,
    CircularProgress,
    Stack,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon,
    Phone as PhoneIcon,
    Email as EmailIcon,
    Language as LanguageIcon,
    EventSeat as SeatIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../context/SettingsContext';
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

const VenueDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { formatMoney } = useSettings();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [venue, setVenue] = useState(null);
    const [layout, setLayout] = useState(null);
    const [layoutError, setLayoutError] = useState(false);
    const [loading, setLoading] = useState(true);

    const loadVenue = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/venues/${id}/`);
            setVenue(response.data);

            // Fetch the parsed seat layout alongside the venue so the
            // detail page can show rows/categories/canvas, not just the
            // "reserved seating" flag.
            if (
                response.data?.has_reserved_seating
                && response.data?.has_layout !== false
            ) {
                try {
                    const layoutRes = await api.get(`/venues/${id}/layout/`);
                    setLayout(layoutRes.data || null);
                    setLayoutError(false);
                } catch (layoutErr) {
                    setLayout(null);
                    // 404 means "not uploaded yet", not an error.
                    setLayoutError(layoutErr?.response?.status !== 404);
                }
            } else {
                setLayout(null);
                setLayoutError(false);
            }
        } catch (error) {
            console.error('Venue detail error:', error);
            toast.error('Failed to load venue details');
            navigate('/app/venues');
        }
        setLoading(false);
    };

    useEffect(() => {
        if (id) loadVenue();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const seats = useMemo(() => layout?.seats || [], [layout]);
    const seatCount = seats.length;

    const categories = useMemo(() => {
        const map = new Map();
        seats.forEach((seat) => {
            const key = seat.category_id || seat.category_name || 'uncategorized';
            const existing = map.get(key);
            if (existing) {
                existing.count += 1;
            } else {
                map.set(key, {
                    key,
                    name: seat.category_name || 'Uncategorized',
                    color: seat.category_color || '#94a3b8',
                    price: seat.price ?? 0,
                    count: 1,
                });
            }
        });
        return Array.from(map.values()).sort((a, b) => b.count - a.count);
    }, [seats]);

    const rows = useMemo(() => {
        const map = new Map();
        seats.forEach((seat) => {
            const label = seat.row_label || '—';
            map.set(label, (map.get(label) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) =>
            String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true })
        );
    }, [seats]);

    const canvasWidth = Number(layout?.canvas_width) || 1000;
    const canvasHeight = Number(layout?.canvas_height) || 800;
    const seatRadius = Math.max(4, Math.min(canvasWidth, canvasHeight) / 90);

    const handleEdit = () => {
        navigate(`/app/venues/edit/${id}`);
    };

    const handleDelete = async () => {
        if (!window.confirm(`Are you sure you want to delete "${venue?.name}"?`)) return;
        try {
            await api.delete(`/venues/${id}/`);
            toast.success('Venue deleted successfully');
            navigate('/app/venues');
        } catch (error) {
            console.error('Delete error:', error);
            toast.error('Failed to delete venue');
        }
    };

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: 'primary.main' }} />
            </LoadingWrapper>
        );
    }

    if (!venue) {
        return (
            <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography sx={{ color: 'text.disabled' }}>Venue not found</Typography>
                <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/app/venues')}>
                    Back to Venues
                </Button>
            </Box>
        );
    }

    // Fallback only: a seated venue with no parsed layout yet.
    const needsLayout =
        venue.has_reserved_seating && venue.has_layout === false;

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <IconButton onClick={() => navigate('/app/venues')} sx={{ color: 'text.secondary' }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Box sx={{ minWidth: 0 }}>
                        <PageTitle variant="h5" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {venue.name}
                        </PageTitle>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {venue.city}, {venue.state} • {venue.country}
                        </Typography>
                    </Box>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <Stack
                        direction={isMobile ? 'column' : 'row'}
                        spacing={1}
                        sx={{ width: isMobile ? '100%' : 'auto' }}
                    >
                        <Chip
                            label={venue.is_active ? 'Active' : 'Inactive'}
                            color={venue.is_active ? 'success' : 'default'}
                            sx={{ fontWeight: 600, alignSelf: isMobile ? 'flex-start' : 'center' }}
                        />
                        <OutlineButton
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            onClick={loadVenue}
                            sx={isMobile ? { width: '100%' } : undefined}
                        >
                            Refresh
                        </OutlineButton>
                        <PrimaryButton
                            variant="contained"
                            startIcon={<EditIcon />}
                            onClick={handleEdit}
                            sx={isMobile ? { width: '100%' } : undefined}
                        >
                            Edit
                        </PrimaryButton>
                        {isMobile && (
                            <OutlineButton
                                variant="outlined"
                                color="error"
                                startIcon={<DeleteIcon />}
                                onClick={handleDelete}
                                sx={{ width: '100%' }}
                            >
                                Delete
                            </OutlineButton>
                        )}
                    </Stack>
                </PageHeaderRight>
            </PageHeader>

            <Grid container spacing={isMobile ? 2 : 3}>
                <Grid item xs={12} md={8}>
                    <Card sx={{ borderRadius: 2, border: '1px solid rgba(226, 232, 240, 1)', mb: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 600, mb: 2 }}>
                                Description
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.primary', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {venue.description || 'No description provided'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 2, border: '1px solid rgba(226, 232, 240, 1)', mb: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 600, mb: 2 }}>
                                Contact Information
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {venue.contact_phone && (
                                    <Box
                                        component="a"
                                        href={`tel:${venue.contact_phone}`}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1.5,
                                            minHeight: 44,
                                            px: 1,
                                            borderRadius: 1,
                                            color: 'text.primary',
                                            textDecoration: 'none',
                                            transition: 'background 0.2s',
                                            '&:hover': { background: '#f1f5f9' },
                                        }}
                                    >
                                        <PhoneIcon sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
                                        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                                            {venue.contact_phone}
                                        </Typography>
                                    </Box>
                                )}
                                {venue.contact_email && (
                                    <Box
                                        component="a"
                                        href={`mailto:${venue.contact_email}`}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1.5,
                                            minHeight: 44,
                                            px: 1,
                                            borderRadius: 1,
                                            color: 'text.primary',
                                            textDecoration: 'none',
                                            transition: 'background 0.2s',
                                            '&:hover': { background: '#f1f5f9' },
                                        }}
                                    >
                                        <EmailIcon sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
                                        <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                                            {venue.contact_email}
                                        </Typography>
                                    </Box>
                                )}
                                {venue.website_url && (
                                    <Box
                                        component="a"
                                        href={venue.website_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1.5,
                                            minHeight: 44,
                                            px: 1,
                                            borderRadius: 1,
                                            color: 'primary.main',
                                            textDecoration: 'none',
                                            transition: 'background 0.2s',
                                            '&:hover': { background: '#eef2ff' },
                                        }}
                                    >
                                        <LanguageIcon sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
                                        <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                                            Visit Website
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </CardContent>
                    </Card>

                    <Card sx={{ borderRadius: 2, border: '1px solid rgba(226, 232, 240, 1)' }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 600, mb: 2 }}>
                                {t('venues.capacitySeating')}
                            </Typography>
                            <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                {venue.capacity || 'N/A'}
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{ color: 'text.secondary', mb: needsLayout ? 2 : 0 }}
                            >
                                {venue.has_reserved_seating
                                    ? t('venues.detailReservedSeating')
                                    : t('venues.detailGeneralAdmission')}
                            </Typography>

                            {venue.has_reserved_seating && seatCount > 0 && (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
                                    <Chip size="small" color="primary" label={t('venues.seatCount', { count: seatCount })} />
                                    <Chip size="small" label={t('venues.rowCount', { count: rows.length })} />
                                    <Chip size="small" label={t('venues.categoryCount', { count: categories.length })} />
                                </Box>
                            )}

                            {venue.has_reserved_seating && layoutError && !layout && (
                                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'error.main' }}>
                                    {t('venues.couldNotLoadLayout')}
                                </Typography>
                            )}

                            {needsLayout && (
                                <Box
                                    sx={{
                                        mt: 1,
                                        p: 1.5,
                                        borderRadius: 1,
                                        bgcolor: 'warning.50',
                                        border: '1px solid',
                                        borderColor: 'warning.200',
                                    }}
                                >
                                    <Typography
                                        variant="caption"
                                        sx={{ color: 'warning.dark', display: 'block', mb: 0.5 }}
                                    >
                                        {t('venues.noLayoutUploaded')}
                                    </Typography>
                                    <Box
                                        component="button"
                                        type="button"
                                        onClick={() =>
                                            navigate(
                                                `/app/venues/${id}/layout?return=${encodeURIComponent(
                                                    `/app/venues/${id}`,
                                                )}`,
                                            )
                                        }
                                        sx={{
                                            all: 'unset',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 0.75,
                                            color: 'primary.main',
                                            fontSize: '0.8125rem',
                                            fontWeight: 600,
                                            '&:hover': { textDecoration: 'underline' },
                                        }}
                                    >
                                        <SeatIcon sx={{ fontSize: 16 }} />
                                        {t('venues.uploadLayout')}
                                    </Box>
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {venue.has_reserved_seating && (
                    <Grid item xs={12}>
                        <Card sx={{ borderRadius: 2, border: '1px solid rgba(226, 232, 240, 1)' }}>
                            <CardContent>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 2,
                                        flexWrap: 'wrap',
                                        mb: 2,
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <SeatIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                                        <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 600 }}>
                                            {t('venues.seatLayout')}
                                        </Typography>
                                    </Box>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() => navigate(`/app/venues/${id}/layout`)}
                                        sx={{ textTransform: 'none' }}
                                    >
                                        {t('venues.openLayoutEditor')}
                                    </Button>
                                </Box>

                                {seatCount > 0 ? (
                                    <>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                                            <Chip size="small" color="primary" label={t('venues.seatCount', { count: seatCount })} />
                                            <Chip size="small" label={t('venues.rowCount', { count: rows.length })} />
                                            <Chip size="small" label={t('venues.categoryCount', { count: categories.length })} />
                                            <Chip size="small" label={t('venues.canvasSize', { width: canvasWidth, height: canvasHeight })} />
                                        </Box>

                                        <Grid container spacing={3}>
                                            <Grid item xs={12} md={7}>
                                                <Box
                                                    sx={{
                                                        border: '1px solid',
                                                        borderColor: 'divider',
                                                        borderRadius: 2,
                                                        bgcolor: '#f8fafc',
                                                        p: 1,
                                                        overflow: 'hidden',
                                                    }}
                                                >
                                                    <Box
                                                        component="svg"
                                                        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                                                        preserveAspectRatio="xMidYMid meet"
                                                        sx={{ width: '100%', height: 320, display: 'block' }}
                                                        role="img"
                                                        aria-label="Seat layout preview"
                                                    >
                                                        {seats.map((seat) => (
                                                            <circle
                                                                key={seat.id}
                                                                cx={seat.x_coord}
                                                                cy={seat.y_coord}
                                                                r={seatRadius}
                                                                fill={seat.category_color || '#94a3b8'}
                                                            />
                                                        ))}
                                                    </Box>
                                                </Box>
                                                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
                                                    {t('venues.seatPreviewNote')}
                                                </Typography>
                                            </Grid>

                                            <Grid item xs={12} md={5}>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                    {t('venues.categories')}
                                                </Typography>
                                                <Box sx={{ mt: 1, mb: 2 }}>
                                                    {categories.map((category) => (
                                                        <Box
                                                            key={category.key}
                                                            sx={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 1.25,
                                                                py: 0.85,
                                                                borderBottom: '1px solid',
                                                                borderColor: 'divider',
                                                                '&:last-of-type': { borderBottom: 'none' },
                                                            }}
                                                        >
                                                            <Box
                                                                sx={{
                                                                    width: 14,
                                                                    height: 14,
                                                                    borderRadius: '50%',
                                                                    bgcolor: category.color,
                                                                    flexShrink: 0,
                                                                    border: '1px solid rgba(0,0,0,0.12)',
                                                                }}
                                                            />
                                                            <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
                                                                {category.name}
                                                            </Typography>
                                                            <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 60, textAlign: 'right' }}>
                                                                {category.count} seats
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ minWidth: 80, textAlign: 'right' }}>
                                                                {formatMoney(category.price)}
                                                            </Typography>
                                                        </Box>
                                                    ))}
                                                </Box>

                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                    {t('venues.rows')}
                                                </Typography>
                                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                                                    {rows.map(([label, count]) => (
                                                        <Chip
                                                            key={label}
                                                            size="small"
                                                            variant="outlined"
                                                            label={`${label}: ${count}`}
                                                        />
                                                    ))}
                                                </Box>
                                            </Grid>
                                        </Grid>
                                    </>
                                ) : layoutError ? (
                                    <Typography variant="body2" sx={{ color: 'error.main' }}>
                                        {t('venues.seatLayoutLoadFailed')}
                                    </Typography>
                                ) : (
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                        {t('venues.noSeatLayout')}
                                    </Typography>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                )}
            </Grid>
        </PageContainer>
    );
};

export default VenueDetail;