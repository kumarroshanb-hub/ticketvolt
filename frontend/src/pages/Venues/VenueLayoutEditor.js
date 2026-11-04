// frontend/src/pages/Venues/VenueLayoutEditor.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Paper, Button, Alert, CircularProgress,
    TextField, Grid, IconButton, Chip, Stack, Divider
} from '@mui/material';
import {
    CloudUpload as UploadIcon,
    ArrowBack as BackIcon,
    CheckCircle as CheckIcon,
    Palette as PaletteIcon,
    Map as MapIcon,
    ExpandMore as ExpandIcon,
    ExpandLess as CollapseIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';
import CategoryAssignmentCanvas from '../../components/Seating/CategoryAssignmentCanvas';

const VenueLayoutEditor = () => {
    const { venueId } = useParams();
    const navigate = useNavigate();
    
    const [venue, setVenue] = useState(null);
    const [loadingVenue, setLoadingVenue] = useState(true);
    
    // Upload state
    const [svgFile, setSvgFile] = useState(null);
    const [canvasWidth, setCanvasWidth] = useState(1000);
    const [canvasHeight, setCanvasHeight] = useState(800);
    const [uploading, setUploading] = useState(false);
    
    // Layout state
    const [layoutData, setLayoutData] = useState(null);
    const [loadingLayout, setLoadingLayout] = useState(false);
    const [showInstructions, setShowInstructions] = useState(false);

    useEffect(() => {
        const fetchVenue = async () => {
            setLoadingVenue(true);
            try {
                const res = await api.get(`/venues/${venueId}/`);
                setVenue(res.data);
            } catch (err) {
                console.error('Venue detail error:', err);
                toast.error('Failed to load venue details');
                navigate('/app/venues');
            } finally {
                setLoadingVenue(false);
            }
        };
        
        fetchVenue();
        fetchLayoutData(); 
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
                console.error('Failed to load layout data:', err);
                toast.error('Failed to load layout data.');
            }
        } finally {
            setLoadingLayout(false);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'image/svg+xml') {
            setSvgFile(file);
        } else {
            toast.error('Please select a valid SVG file.');
            setSvgFile(null);
        }
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
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success(res.data.message);
            fetchLayoutData();
            setSvgFile(null);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to upload and parse layout.');
        } finally {
            setUploading(false);
        }
    };

    if (loadingVenue) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    }

    return (
        // ✅ FIX: Force Full Screen Breakout
        // This overrides any max-width or centering styles from the global PageContainer/Layout
        <Box 
            sx={{ 
                position: 'fixed',       // Take over the entire viewport
                top: 0, left: 0, right: 0, bottom: 0, // Pin to all edges
                zIndex: 1000,            // Ensure it sits above sidebar/header if needed
                bgcolor: '#f5f5f5',      // Match app background
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'       // Prevent body scrollbars
            }}
        >
            
            {/* =========================================
               HEADER BAR (Fixed Top)
               ========================================= */}
            <Paper 
                elevation={0}
                sx={{ 
                    px: 3, py: 1.5, 
                    flexShrink: 0,
                    borderBottom: '1px solid #e0e0e0',
                    bgcolor: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    borderRadius: 0 // Square corners for full-screen feel
                }}
            >
                <Stack direction="row" spacing={2} alignItems="center">
                    <IconButton onClick={() => navigate('/app/venues')} size="small">
                        <BackIcon />
                    </IconButton>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#333', lineHeight: 1 }}>
                            Seating Layout: {venue?.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Manage venue map and seat categories
                        </Typography>
                    </Box>
                </Stack>

                {/* Right Side Actions */}
                <Stack direction="row" spacing={1} alignItems="center">
                     {layoutData && !svgFile && (
                         <Chip 
                            label={`${layoutData.seats?.length || 0} Seats Loaded`} 
                            color="success" 
                            size="small"
                            icon={<CheckIcon />}
                            sx={{ mr: 1 }}
                         />
                    )}
                    <IconButton 
                        onClick={() => setShowInstructions(!showInstructions)}
                        size="small"
                        sx={{ color: 'text.secondary' }}
                        title="Toggle Instructions"
                    >
                        {showInstructions ? <CollapseIcon /> : <ExpandIcon />}
                    </IconButton>
                </Stack>
            </Paper>

            {/* =========================================
               CONTROL PANEL (Collapsible / Conditional)
               ========================================= */}
            {(showInstructions || !layoutData || svgFile) && (
                <Paper 
                    elevation={0}
                    sx={{ 
                        px: 3, py: 2, 
                        flexShrink: 0,
                        borderBottom: '1px solid #e0e0e0',
                        bgcolor: '#fafafa',
                        animation: 'fadeIn 0.3s ease-out'
                    }}
                >
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center" justifyContent="space-between">
                        
                        {/* Left: Upload Controls */}
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                            <Button
                                variant="contained"
                                component="label"
                                startIcon={<UploadIcon />}
                                disabled={uploading}
                                sx={{ 
                                    bgcolor: '#FF2A2A', 
                                    '&:hover': { bgcolor: '#e62626' },
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    boxShadow: 'none'
                                }}
                            >
                                {svgFile ? 'Change File' : 'Choose SVG'}
                                <input type="file" hidden accept=".svg" onChange={handleFileChange} />
                            </Button>
                            
                            {svgFile && (
                                <Chip 
                                    label={svgFile.name} 
                                    onDelete={() => setSvgFile(null)} 
                                    color="primary" 
                                    size="small"
                                    sx={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                />
                            )}
                        </Stack>

                        {/* Middle: Dimensions (Only when relevant) */}
                        {(!layoutData || svgFile) && (
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ px: { md: 2 }, borderLeft: { md: '1px solid #eee' }, borderRight: { md: '1px solid #eee' } }}>
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
                        )}

                        {/* Right: Generate Button */}
                        {(svgFile || !layoutData) && (
                            <Button 
                                variant="outlined" 
                                onClick={handleUpload} 
                                disabled={!svgFile || uploading}
                                startIcon={uploading ? <CircularProgress size={16} /> : <UploadIcon />}
                                sx={{ textTransform: 'none', borderColor: '#FF2A2A', color: '#FF2A2A', '&:hover': { borderColor: '#e62626', bgcolor: '#fff5f5' } }}
                            >
                                {uploading ? 'Uploading...' : 'Generate Grid'}
                            </Button>
                        )}
                    </Stack>

                    {/* Instructions Content */}
                    {showInstructions && (
                        <Alert 
                            severity="info" 
                            onClose={() => setShowInstructions(false)}
                            sx={{ mt: 2, fontSize: '0.85rem', py: 1 }}
                        >
                            <strong>How to assign:</strong> 
                            1. Click seats on the map to select them (they turn red). 
                            2. Choose a category chip below. 
                            3. Click "Assign". 
                            <em>Note: Assigning affects ONLY selected seats.</em>
                        </Alert>
                    )}
                </Paper>
            )}

            {/* =========================================
               MAIN CANVAS AREA (Flex Grow - Takes All Space)
               ========================================= */}
            <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 2 }}>
                {loadingLayout ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', bgcolor: '#fff', borderRadius: 2, border: '1px solid #e0e0e0' }}>
                        <CircularProgress />
                    </Box>
                ) : layoutData ? (
                    <CategoryAssignmentCanvas
                        venueId={venueId}
                        layoutData={layoutData}
                        onCategoryChange={fetchLayoutData}
                    />
                ) : (
                    <Box sx={{ 
                        height: '100%', 
                        display: 'flex', 
                        flexDirection: 'column',
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        bgcolor: '#fff',
                        border: '2px dashed #e0e0e0',
                        borderRadius: 2,
                        color: 'text.secondary'
                    }}>
                        <MapIcon sx={{ fontSize: 80, mb: 2, opacity: 0.3 }} />
                        <Typography variant="h6">No Layout Uploaded</Typography>
                        <Typography variant="body2">Upload an SVG file above to generate the seating grid.</Typography>
                    </Box>
                )}
            </Box>

        </Box>
    );
};

export default VenueLayoutEditor;