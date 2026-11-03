// frontend/src/pages/Venues/VenueLayoutEditor.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Paper, Button, Alert, CircularProgress,
    TextField, Grid, IconButton, Chip, Stack
} from '@mui/material';
import {
    CloudUpload as UploadIcon,
    ArrowBack as BackIcon,
    CheckCircle as CheckIcon,
    Palette as PaletteIcon,
    Map as MapIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { PageContainer, PageHeader, PageTitle, PrimaryButton } from '../../components/Common';
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
        // ✅ FORCE FULL VIEWPORT HEIGHT FLEX LAYOUT
        <PageContainer sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 3 }}>
            <PageHeader sx={{ flexShrink: 0, mb: 2 }}>
                <Box display="flex" alignItems="center" gap={2}>
                    <IconButton onClick={() => navigate('/app/venues')}>
                        <BackIcon />
                    </IconButton>
                    <PageTitle variant="h4">Seating Layout: {venue?.name}</PageTitle>
                </Box>
            </PageHeader>

            {/* ✅ MAIN CONTENT: 50/50 SPLIT, FULL REMAINING HEIGHT */}
            <Box sx={{ display: 'flex', gap: 3, flexGrow: 1, minHeight: 0 }}>
                
                {/* ================= LEFT COLUMN: CONTROLS (50%) ================= */}
                <Box sx={{ width: '50%', overflowY: 'auto', pr: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    
                    {/* 1. Upload Section */}
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <UploadIcon color="primary" /> 1. Upload Venue Map (SVG)
                        </Typography>
                        <Alert severity="info" sx={{ mb: 2, fontSize: '0.85rem' }}>
                            Upload the vector (SVG) file of your venue. The system will automatically detect seats.
                        </Alert>

                        <Box sx={{ mb: 2 }}>
                            <Button
                                variant="outlined"
                                component="label"
                                startIcon={<UploadIcon />}
                                fullWidth
                                sx={{ mb: 1, py: 1.5 }}
                            >
                                {svgFile ? svgFile.name : 'Choose SVG File'}
                                <input type="file" hidden accept=".svg" onChange={handleFileChange} />
                            </Button>
                            {svgFile && (
                                <Chip label="Ready to upload" color="success" size="small" icon={<CheckIcon />} />
                            )}
                        </Box>

                        <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>Canvas Dimensions (Optional)</Typography>
                        <Grid container spacing={2} sx={{ mb: 3 }}>
                            <Grid item xs={6}>
                                <TextField 
                                    fullWidth size="small" label="Width (px)" type="number" 
                                    value={canvasWidth} onChange={(e) => setCanvasWidth(e.target.value)} 
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField 
                                    fullWidth size="small" label="Height (px)" type="number" 
                                    value={canvasHeight} onChange={(e) => setCanvasHeight(e.target.value)} 
                                />
                            </Grid>
                        </Grid>

                        <PrimaryButton 
                            variant="contained" 
                            fullWidth 
                            onClick={handleUpload} 
                            disabled={!svgFile || uploading}
                            startIcon={uploading ? <CircularProgress size={20} /> : <UploadIcon />}
                        >
                            {uploading ? 'Parsing Layout...' : 'Generate Seating Grid'}
                        </PrimaryButton>
                    </Paper>

                    {/* 2. Instructions Section (Eliminates Confusion) */}
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PaletteIcon color="primary" /> 2. How to Assign Categories
                        </Typography>
                        <Box component="ol" sx={{ pl: 2, m: 0, '& li': { mb: 1.5, color: 'text.secondary', lineHeight: 1.6 } }}>
                            <li>Click seats on the right canvas to <strong>select</strong> them (they will turn blue).</li>
                            <li>Click a category chip (e.g., <strong>VIP</strong>) to set it as your target.</li>
                            <li>Click the <strong>"Assign"</strong> button. The selected seats permanently become that category.</li>
                            <li><em>Note: Assigning a new category ONLY affects the seats you currently have selected. Previously assigned seats remain unchanged.</em></li>
                        </Box>
                    </Paper>
                </Box>

                {/* ================= RIGHT COLUMN: CANVAS (50%) ================= */}
                <Box sx={{ width: '50%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <Typography variant="h6" sx={{ mb: 1, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                            <MapIcon color="primary" /> Interactive Seat Map
                        </Typography>
                        
                        {loadingLayout ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
                                <CircularProgress />
                            </Box>
                        ) : layoutData ? (
                            <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                                <Alert severity="success" sx={{ mb: 2, fontSize: '0.85rem', flexShrink: 0 }}>
                                    Successfully parsed <strong>{layoutData.seats?.length || 0}</strong> seats. 
                                </Alert>
                                
                                {/* ✅ Canvas fills all remaining vertical space */}
                                <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                                    <CategoryAssignmentCanvas
                                        venueId={venueId}
                                        layoutData={layoutData}
                                        onCategoryChange={fetchLayoutData}
                                        useFullHeight={true} 
                                    />
                                </Box>
                            </Box>
                        ) : (
                            <Box sx={{ 
                                flexGrow: 1, 
                                display: 'flex', 
                                flexDirection: 'column',
                                justifyContent: 'center', 
                                alignItems: 'center', 
                                border: '2px dashed #e0e0e0', 
                                borderRadius: 2,
                                bgcolor: '#fafafa'
                            }}>
                                <MapIcon sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
                                <Typography variant="h6" color="text.secondary" gutterBottom>
                                    No Layout Uploaded Yet
                                </Typography>
                                <Typography variant="body2" color="text.secondary" align="center">
                                    Upload an SVG file on the left to generate your seating grid.
                                </Typography>
                            </Box>
                        )}
                    </Paper>
                </Box>

            </Box>
        </PageContainer>
    );
};

export default VenueLayoutEditor;