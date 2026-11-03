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
    CheckCircle as CheckIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { PageContainer, PageHeader, PageTitle, PrimaryButton, OutlineButton } from '../../components/Common';
import SeatingCanvas from '../../components/Seating/SeatingCanvas'; // Reusing the canvas!
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
    
    // Verification state (reuses the SeatingCanvas data structure)
    const [layoutData, setLayoutData] = useState(null);
    const [loadingLayout, setLoadingLayout] = useState(false);

    useEffect(() => {
        const fetchVenue = async () => {
            try {
                const res = await api.get(`/venues/${venueId}/`);
                setVenue(res.data);
                // If venue already has a layout, fetch it for verification
                if (res.data.has_layout) {
                    fetchLayoutData();
                }
            } catch (err) {
                toast.error('Failed to load venue details');
            } finally {
                setLoadingVenue(false);
            }
        };
        fetchVenue();
    }, [venueId]);

    const fetchLayoutData = async () => {
        setLoadingLayout(true);
        try {
            const res = await api.get(`/venues/${venueId}/layout/`); 
            setLayoutData(res.data);
        } catch (err) {
            console.error('Failed to load layout data:', err);
            // ✅ Show a toast instead of silently failing
            toast.error('Failed to load layout data. Please try uploading again.');
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
            // Refresh the layout data to show the newly parsed seats
            fetchLayoutData();
            setSvgFile(null); // Clear file input
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
        <PageContainer>
            <PageHeader>
                <Box display="flex" alignItems="center" gap={2}>
                    <IconButton onClick={() => navigate('/app/venues')}>
                        <BackIcon />
                    </IconButton>
                    <PageTitle variant="h4">Seating Layout: {venue?.name}</PageTitle>
                </Box>
            </PageHeader>

            <Grid container spacing={3}>
                {/* LEFT COLUMN: Upload & Configuration */}
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                            1. Upload Venue Map (SVG)
                        </Typography>
                        <Alert severity="info" sx={{ mb: 2, fontSize: '0.85rem' }}>
                            Upload the vector (SVG) file of your venue. The system will automatically detect seats and assign Row/Seat numbers.
                        </Alert>

                        <Box sx={{ mb: 2 }}>
                            <Button
                                variant="outlined"
                                component="label"
                                startIcon={<UploadIcon />}
                                fullWidth
                                sx={{ mb: 1 }}
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

                    {/* Future: Seat Category Assignment UI goes here */}
                    <Paper sx={{ p: 3, mt: 3, opacity: 0.6 }}>
                        <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                            {layoutData && (
                                <Paper sx={{ p: 3, mt: 3 }}>
                                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                                    2. Assign Categories & Pricing
                                    </Typography>
                                    <CategoryAssignmentCanvas
                                    venueId={venueId}
                                    layoutData={layoutData}
                                    onCategoryChange={fetchLayoutData}
                                    />
                                </Paper>
                            )}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Click seats on the map to group them into VIP, Balcony, etc., and set pricing.
                        </Typography>
                    </Paper>
                </Grid>

                {/* RIGHT COLUMN: Visual Verification */}
                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                            Verify Parsed Layout
                        </Typography>
                        {loadingLayout ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                        ) : layoutData ? (
                            <Box>
                                <Alert severity="success" sx={{ mb: 2 }}>
                                    Successfully parsed <strong>{layoutData.seats?.length || 0}</strong> seats. 
                                    Verify the grid below.
                                </Alert>
                                {/* Reusing the exact same canvas component in read-only mode for verification */}
                                <SeatingCanvas
                                    layoutData={layoutData}
                                    loading={false}
                                    selectedSeatIds={[]}
                                    onSelectSeats={() => {}}
                                    height={500}
                                    readOnly={true} 
                                />
                            </Box>
                        ) : (
                            <Box sx={{ p: 4, textAlign: 'center', border: '1px dashed #ccc', borderRadius: 2 }}>
                                <Typography color="text.secondary">
                                    No layout generated yet. Upload an SVG file to begin.
                                </Typography>
                            </Box>
                        )}
                    </Paper>
                </Grid>
            </Grid>
        </PageContainer>
    );
};

export default VenueLayoutEditor;