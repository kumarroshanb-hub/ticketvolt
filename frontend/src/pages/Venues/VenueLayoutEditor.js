// frontend/src/pages/Venues/VenueLayoutEditor.js
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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

const BRAND = {
    charcoal: '#333333',
    red: '#FF2A2A',
    redDark: '#e62626',
    border: '#e0e0e0',
    bg: '#f5f5f5',
    bgSubtle: '#fafafa',
    textMuted: '#888888',
};

const VenueLayoutEditor = () => {
    const { venueId } = useParams();
    const navigate = useNavigate();
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
                toast.error('Failed to load venue details');
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
                toast.error('Failed to load layout data.');
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
            toast.error('Please select a valid SVG file.');
            setSvgFile(null);
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('SVG must be under 5 MB.');
            setSvgFile(null);
            return;
        }
        setSvgFile(file);
    };

    const handleUpload = async () => {
        if (!svgFile) {
            toast.warning('Please select an SVG file first.');
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
            toast.success(res.data.message || 'Layout parsed successfully.');
            setSvgFile(null);
            await fetchLayoutData();
        } catch (err) {
            const msg =
                err.response?.data?.error
                || err.response?.data?.detail
                || 'Failed to upload and parse layout.';
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
                    bgcolor: '#fff',
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
                            Seating Layout: {venue?.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Upload an SVG with one shape per seat. Categories are
                            assigned on the event wizard.
                        </Typography>
                    </Box>
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center">
                    {hasExistingLayout && !svgFile && (
                        <Chip
                            label={`${layoutData.seats.length} Seats Loaded`}
                            color="success"
                            size="small"
                            icon={<CheckIcon />}
                            sx={{ mr: 1 }}
                        />
                    )}
                    <Tooltip title="Toggle instructions">
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
                                {svgFile ? 'Change File' : (hasExistingLayout ? 'Replace SVG' : 'Choose SVG')}
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
                                label="W"
                                type="number"
                                value={canvasWidth}
                                onChange={(e) => setCanvasWidth(e.target.value)}
                                sx={{ width: 80, '& .MuiOutlinedInput-input': { p: 1, textAlign: 'center' } }}
                            />
                            <Typography variant="caption">×</Typography>
                            <TextField
                                size="small"
                                label="H"
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
                                '&:hover': { borderColor: BRAND.redDark, bgcolor: '#fff5f5' },
                            }}
                        >
                            {uploading ? 'Parsing…' : 'Upload & Parse'}
                        </Button>
                    </Stack>

                    {showInstructions && (
                        <Alert
                            severity="info"
                            onClose={() => setShowInstructions(false)}
                            sx={{ mt: 2, fontSize: '0.85rem', py: 1 }}
                        >
                            <strong>How to prepare the SVG:</strong>{' '}
                            Include one <code>&lt;circle&gt;</code> or <code>&lt;rect&gt;</code>{' '}
                            per seat. The parser extracts their centers and auto-numbers
                            rows top-to-bottom and seats left-to-right. You'll assign
                            categories on the event wizard's Seat Categories step.
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
                            bgcolor: '#fff',
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
                            bgcolor: '#fff',
                            border: `2px dashed ${BRAND.border}`,
                            borderRadius: 2,
                            color: 'text.secondary',
                        }}
                    >
                        <MapIcon sx={{ fontSize: 80, mb: 2, opacity: 0.3 }} />
                        <Typography variant="h6">No Layout Uploaded</Typography>
                        <Typography variant="body2">
                            Upload an SVG file above to generate the seating grid.
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
                            bgcolor: '#fff',
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
                                Layout looks right?
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {returnTo
                                    ? 'You’ll return to the event draft and continue with seat categories.'
                                    : 'Return to the venue list when finished.'}
                            </Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                            <Button
                                variant="text"
                                onClick={handleBack}
                                sx={{ textTransform: 'none', color: BRAND.textMuted }}
                            >
                                {returnTo ? 'Skip for now' : 'Back to Venues'}
                            </Button>
                            <Button
                                variant="contained"
                                onClick={handleBack}
                                startIcon={<CheckIcon />}
                                sx={{
                                    textTransform: 'none',
                                    bgcolor: BRAND.charcoal,
                                    '&:hover': { bgcolor: '#000' },
                                }}
                            >
                                {returnTo ? 'Save & Continue' : 'Done'}
                            </Button>
                        </Stack>
                    </Paper>
                )}
            </Box>
        </Box>
    );
};

export default VenueLayoutEditor;