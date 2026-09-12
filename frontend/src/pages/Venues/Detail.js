// frontend/src/pages/Venues/Detail.js
import React, { useState, useEffect } from 'react';
import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
    Chip,
    IconButton,
    Button,
    Divider,
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
    LocationOn as LocationIcon,
    People as PeopleIcon,
    Email as EmailIcon,
    Phone as PhoneIcon,
    Language as LanguageIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
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

// ✅ Import shared constants
import { EVENT_STATUS } from '../../constants';

const VenueDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [venue, setVenue] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadVenue = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/venues/${id}/`);
            setVenue(response.data);
        } catch (error) {
            console.error('Venue detail error:', error);
            toast.error('Failed to load venue details');
            navigate('/venues');
        }
        setLoading(false);
    };

    useEffect(() => {
        if (id) loadVenue();
    }, [id]);

    const handleEdit = () => {
        navigate(`/venues/edit/${id}`);
    };

    const handleDelete = async () => {
        if (!window.confirm(`Are you sure you want to delete "${venue?.name}"?`)) return;
        try {
            await api.delete(`/venues/${id}/`);
            toast.success('Venue deleted successfully');
            navigate('/venues');
        } catch (error) {
            console.error('Delete error:', error);
            toast.error('Failed to delete venue');
        }
    };

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: '#4f46e5' }} />
            </LoadingWrapper>
        );
    }

    if (!venue) {
        return (
            <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography sx={{ color: '#94a3b8' }}>Venue not found</Typography>
                <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/venues')}>
                    Back to Venues
                </Button>
            </Box>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <IconButton onClick={() => navigate('/venues')} sx={{ color: '#64748b' }}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Box sx={{ minWidth: 0 }}>
                        <PageTitle variant="h5" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {venue.name}
                        </PageTitle>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
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
                    <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0', mb: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: '#4f46e5', fontWeight: 600, mb: 2 }}>
                                Description
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {venue.description || 'No description provided'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0', mb: 3 }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: '#4f46e5', fontWeight: 600, mb: 2 }}>
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
                                            color: '#334155',
                                            textDecoration: 'none',
                                            transition: 'background 0.2s',
                                            '&:hover': { background: '#f1f5f9' },
                                        }}
                                    >
                                        <PhoneIcon sx={{ fontSize: 18, color: '#4f46e5', flexShrink: 0 }} />
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
                                            color: '#334155',
                                            textDecoration: 'none',
                                            transition: 'background 0.2s',
                                            '&:hover': { background: '#f1f5f9' },
                                        }}
                                    >
                                        <EmailIcon sx={{ fontSize: 18, color: '#4f46e5', flexShrink: 0 }} />
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
                                            color: '#4f46e5',
                                            textDecoration: 'none',
                                            transition: 'background 0.2s',
                                            '&:hover': { background: '#eef2ff' },
                                        }}
                                    >
                                        <LanguageIcon sx={{ fontSize: 18, color: '#4f46e5', flexShrink: 0 }} />
                                        <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                                            Visit Website
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </CardContent>
                    </Card>

                    <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
                        <CardContent>
                            <Typography variant="subtitle2" sx={{ color: '#4f46e5', fontWeight: 600, mb: 2 }}>
                                Capacity
                            </Typography>
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a' }}>
                                {venue.capacity || 'N/A'}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                                {venue.has_reserved_seating ? 'Reserved Seating' : 'General Admission'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </PageContainer>
    );
};

export default VenueDetail;