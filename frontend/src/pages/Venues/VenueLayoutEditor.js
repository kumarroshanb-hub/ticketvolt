// frontend/src/pages/Venues/VenueLayoutEditor.js
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Box, Typography, Paper, Button, Alert, CircularProgress,
    TextField, IconButton, Chip, Stack, Divider, Tooltip,
} from '@mui/material';
import {
    CloudUpload as UploadIcon,
    ArrowBack as BackIcon,
    CheckCircle as CheckIcon,
    Map as MapIcon,
    ExpandMore as ExpandIcon,
    ExpandLess as CollapseIcon,
    Delete as DeleteIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';
import SeatingCanvas from '../../components/Seating/SeatingCanvas';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const BRAND = {
    charcoal: C.primary,
    red: C.secondary,
    redDark: C.secondaryDark,
    border: C.borderLight,
    bg: C.bgPrimary,
    bgSubtle: C.bgPrimary,
    textMuted: C.textMuted,
};

const VenueLayoutEditor = () => {
    const { venueId } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();

    const returnTo = searchParams.get('return');

    const [venue, setVenue] = useState(null);
    const [loadingVenue, setLoadingVenue] = useState(true);

    // Upload state
    const [svgFile, setSvgFile] = useState(null);
    const [canvasWidth, setCanvasWidth] = useState(1000);
    const [canvasHeight, setCanvasHeight] = useState(800);
    const [uploading, setUploading] = useState(false);

    // Parsed layout state
    const [layoutData, setLayoutData] = useState(null);
    const [loadingLayout, setLoadingLayout] = useState(false);
    const [showInstructions, setShowInstructions] = useState(false);

    // ---- Load venue + existing layout ----
    useEffect(() => {
        let cancelled = false;

        const fetchVenue = async () => {
            setLoadingVenue(true);
            try {
                const res = await api.get(`/venues/${venueId}/`);
                if (!cancelled) setVenue(res.data);
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Venue detail error:', err);
                toast.error(t('venues.loadDetailsFailed'));
                navigate('/app/venues');
            } finally {
                if (!cancelled) setLoadingVenue(false);
            }
        };

        fetchVenue();
        fetchLayoutData();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [venueId]);

    const fetchLayoutData = async () => {
        setLoadingLayout(true);
        try {
            const res = await api.get(`/venues/${venueId}/layout/`);
            setLayoutData(res.data);
        } catch (err) {
            if (err.response?.status === 404) {
                setLayoutData(null);
            } else {
                // eslint-disable-next-line no-console
                console.error('Failed to load layout data:', err);
                toast.error(t('seatLayout.loadLayoutFailed'));
            }
        } finally {
            setLoadingLayout(false);
        }
    };

    // ---- File handling ----
    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.svg')) {
            toast.error(t('seatLayout.invalidSvg'));
            setSvgFile(null);
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error(t('seatLayout.svgTooLarge'));
            setSvgFile(null);
            return;
        }
        setSvgFile(file);
    };

    const handleUpload = async () => {
        if (!svgFile) {
            toast.warning(t('seatLayout.selectSvgFirst'));
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('svg_file', svgFile);
        formData.append('canvas_width', canvasWidth);
        formData.append('canvas_height', canvasHeight);

        try {
            const res = await api.post(`/venues/${venueId}/layout/upload/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success(res.data.message || t('seatLayout.parseSuccess'));
            setSvgFile(null);
            await fetchLayoutData();
        } catch (err) {
            const msg =
                err.response?.data?.error
                || err.response?.data?.detail
                || t('seatLayout.uploadFailed');
            toast.error(msg);
        } finally {
            setUploading(false);
        }
    };

    // ---- Return to the event wizard (or venue list) ----
    const handleBack = () => {
        if (returnTo) {
            // Carry `venue_id` so the Event wizard can resume its draft
            // and auto-select the venue it just created. Without it the
            // reserved-seating path returns to a blank wizard.
            const sep = returnTo.includes('?') ? '&' : '?';
            navigate(
                `${returnTo}${sep}venue_id=${encodeURIComponent(venueId)}`
                + '&layout_updated=true'
            );
        } else {
            navigate(`/app/venues/${venueId}`);
        }
    };

    const previewLayout = useMemo(() => {
        if (!layoutData || !Array.isArray(layoutData.seats) || layoutData.seats.length === 0) {
            return null;
        }
        return {
            canvas_width: layoutData.canvas_width || canvasWidth,
            canvas_height: layoutData.canvas_height || canvasHeight,
            background_image: layoutData.background_image || null,
            seats: layoutData.seats.map((s) => ({
                id: s.id,
                x_coord: s.x_coord,
                y_coord: s.y_coord,
                row_label: s.row_label,
                seat_number: s.seat_number,
                status: s.status || 'available',
                category_color: null,
                category_name: null,
            })),
        };
    }, [layoutData, canvasWidth, canvasHeight]);

    if (loadingVenue) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    const hasExistingLayout = Boolean(
        layoutData && Array.isArray(layoutData.seats) && layoutData.seats.length > 0,
    );

    return (
        <Box
            sx={{
                position: 'fixed',
                inset: 0,
                zIndex: 1099, // ✅ FIX: Sits beneath the global AppBar (1100) to prevent overlap
                bgcolor: BRAND.bg,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            {/* ============ HEADER BAR ============ */}
            <Paper
                elevation={0}
                sx={{
                    px: 3, py: 1.5,
                    flexShrink: 0,
                    borderBottom: `1px solid ${BRAND.border}`,
                    bgcolor: C.white,
                    borderRadius: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                }}
            >
                <Stack direction="row" spacing={2} alignItems="center">
                    <IconButton onClick={handleBack} size="small">
                        <BackIcon />
                    </IconButton>
                    <Box>
                        <Typography
                            variant="h6"
                            sx={{ fontWeight: 700, color: BRAND.charcoal, lineHeight: 1 }}
                        >
                            {t('seatLayout.title', { name: venue?.name })}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {t('seatLayout.subtitle')}
                        </Typography>
                    </Box>
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center">
                    {hasExistingLayout && !svgFile && (
                        <Chip
                            label={t('seatLayout.seatsLoaded', { count: layoutData.seats.length })}
                            color="success"
                            size="small"
                            icon={<CheckIcon />}
                            sx={{ mr: 1 }}
                        />
                    )}
                    <Tooltip title={t('seatLayout.toggleInstructions')}>
                        <IconButton
                            onClick={() => setShowInstructions((v) => !v)}
                            size="small"
                            sx={{ color: 'text.secondary' }}
                        >
                            {showInstructions ? <CollapseIcon /> : <ExpandIcon />}
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Paper>

            {/* ============ CONTROL PANEL ============ */}
            {(showInstructions || !hasExistingLayout || svgFile) && (
                <Paper
                    elevation={0}
                    sx={{
                        px: 3, py: 2,
                        flexShrink: 0,
                        borderBottom: `1px solid ${BRAND.border}`,
                        bgcolor: BRAND.bgSubtle,
                    }}
                >
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={3}
                        alignItems="center"
                        justifyContent="space-between"
                    >
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={2}
                            alignItems="center"
                        >
                            <Button
                                variant="contained"
                                component="label"
                                startIcon={<UploadIcon />}
                                disabled={uploading}
                                sx={{
                                    bgcolor: BRAND.red,
                                    '&:hover': { bgcolor: BRAND.redDark },
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    boxShadow: 'none',
                                }}
                            >
                                {svgFile ? t('seatLayout.changeFile') : (hasExistingLayout ? t('seatLayout.replaceSvg') : t('seatLayout.chooseSvg'))}
                                <input
                                    type="file"
                                    hidden
                                    accept=".svg,image/svg+xml"
                                    onChange={handleFileChange}
                                />
                            </Button>

                            {svgFile && (
                                <Chip
                                    label={svgFile.name}
                                    onDelete={() => setSvgFile(null)}
                                    color="primary"
                                    size="small"
                                    deleteIcon={<DeleteIcon />}
                                    sx={{
                                        maxWidth: 220,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                />
                            )}
                        </Stack>

                        <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{
                                px: { md: 2 },
                                borderLeft: { md: `1px solid ${BRAND.border}` },
                                borderRight: { md: `1px solid ${BRAND.border}` },
                            }}
                        >
                            <TextField
                                size="small"
                                label={t('seatLayout.widthShort')}
                                type="number"
                                value={canvasWidth}
                                onChange={(e) => setCanvasWidth(e.target.value)}
                                sx={{ width: 80, '& .MuiOutlinedInput-input': { p: 1, textAlign: 'center' } }}
                            />
                            <Typography variant="caption">×</Typography>
                            <TextField
                                size="small"
                                label={t('seatLayout.heightShort')}
                                type="number"
                                value={canvasHeight}
                                onChange={(e) => setCanvasHeight(e.target.value)}
                                sx={{ width: 80, '& .MuiOutlinedInput-input': { p: 1, textAlign: 'center' } }}
                            />
                        </Stack>

                        <Button
                            variant="outlined"
                            onClick={handleUpload}
                            disabled={!svgFile || uploading}
                            startIcon={uploading ? <CircularProgress size={16} /> : <UploadIcon />}
                            sx={{
                                textTransform: 'none',
                                borderColor: BRAND.red,
                                color: BRAND.red,
                                '&:hover': { borderColor: BRAND.redDark, bgcolor: C.bgPrimary },
                            }}
                        >
                            {uploading ? t('seatLayout.parsing') : t('seatLayout.uploadParse')}
                        </Button>
                    </Stack>

                    {showInstructions && (
                        <Alert
                            severity="info"
                            onClose={() => setShowInstructions(false)}
                            sx={{ mt: 2, fontSize: '0.85rem', py: 1 }}
                        >
                            <strong>{t('seatLayout.howToTitle')}</strong>{' '}
                            {t('seatLayout.howToBody')}
                        </Alert>
                    )}
                </Paper>
            )}

            {/* ============ MAIN PREVIEW ============ */}
            <Box
                sx={{
                    flexGrow: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    p: 2,
                }}
            >
                {loadingLayout ? (
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '100%',
                            bgcolor: C.white,
                            borderRadius: 2,
                            border: `1px solid ${BRAND.border}`,
                        }}
                    >
                        <CircularProgress />
                    </Box>
                ) : previewLayout ? (
                    <Box sx={{ flexGrow: 1, minHeight: 0, position: 'relative' }}>
                        <SeatingCanvas
                            layoutData={previewLayout}
                            selectedSeatIds={[]}
                            onSelectSeats={() => {}}
                            readOnly
                        />
                    </Box>
                ) : (
                    <Box
                        sx={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            bgcolor: C.white,
                            border: `2px dashed ${BRAND.border}`,
                            borderRadius: 2,
                            color: 'text.secondary',
                        }}
                    >
                        <MapIcon sx={{ fontSize: 80, mb: 2, opacity: 0.3 }} />
                        <Typography variant="h6">{t('seatLayout.noLayoutTitle')}</Typography>
                        <Typography variant="body2">
                            {t('seatLayout.noLayoutHint')}
                        </Typography>
                    </Box>
                )}

                {/* Confirm-and-return bar — only shown once a layout exists */}
                {hasExistingLayout && (
                    <Paper
                        elevation={0}
                        sx={{
                            mt: 2,
                            p: 2,
                            flexShrink: 0,
                            bgcolor: C.white,
                            border: `1px solid ${BRAND.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 2,
                            flexWrap: 'wrap',
                        }}
                    >
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: BRAND.charcoal }}>
                                {t('seatLayout.layoutRight')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {returnTo
                                    ? t('seatLayout.returnToDraft')
                                    : t('seatLayout.returnToVenues')}
                            </Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                            <Button
                                variant="text"
                                onClick={handleBack}
                                sx={{ textTransform: 'none', color: BRAND.textMuted }}
                            >
                                {returnTo ? t('seatLayout.skipForNow') : t('venues.notFoundBack')}
                            </Button>
                            <Button
                                variant="contained"
                                onClick={handleBack}
                                startIcon={<CheckIcon />}
                                sx={{
                                    textTransform: 'none',
                                    bgcolor: BRAND.charcoal,
                                    '&:hover': { bgcolor: C.black },
                                }}
                            >
                                {returnTo ? t('seatLayout.saveContinue') : t('seatLayout.done')}
                            </Button>
                        </Stack>
                    </Paper>
                )}
            </Box>
        </Box>
    );
};

export default VenueLayoutEditor;