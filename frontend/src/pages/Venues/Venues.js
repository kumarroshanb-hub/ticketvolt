// frontend/src/pages/Venues/Venues.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

// ❌ Removed unused EVENT_STATUS import (was dead code)

const Venues = () => {
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [venues, setVenues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadVenues = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get('/venues/');
            setVenues(response.data || []);
        } catch (error) {
            console.error('❌ Failed to load venues:', error);
            setError(error.message || 'Failed to load venues');
            toast.error('Failed to load venues');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadVenues();
    }, []);

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
        try {
            await api.delete(`/venues/${id}/`);
            toast.success('Venue deleted successfully');
            loadVenues();
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
                    Retry
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
                    <PageTitle>Venues</PageTitle>
                    {!isMobile && <PageSubtitle>Manage your event venues and locations</PageSubtitle>}
                </PageHeaderLeft>
                <PageHeaderRight
                    sx={{
                        flexWrap: 'wrap',
                        gap: 1,
                        rowGap: 1,
                        width: isMobile ? '100%' : 'auto',
                    }}
                >
                    <OutlineButton
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadVenues}
                        sx={isMobile ? { flex: 1, minWidth: 140 } : undefined}
                    >
                        Refresh
                    </OutlineButton>
                    <PrimaryButton
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => navigate('/venues/create')}
                        sx={isMobile ? { flex: 1, minWidth: 140 } : undefined}
                    >
                        Add Venue
                    </PrimaryButton>
                </PageHeaderRight>
            </PageHeader>

            {venues.length === 0 ? (
                <Box
                    sx={{
                        textAlign: 'center',
                        py: { xs: 6, sm: 8 },
                        color: '#94a3b8',
                        px: 2,
                    }}
                >
                    <LocationIcon sx={{ fontSize: 48, opacity: 0.3, mb: 2 }} />
                    <Typography variant="h6" sx={{ color: '#64748b' }}>
                        No venues found
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                        Create your first venue
                    </Typography>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => navigate('/venues/create')}
                        sx={{ mt: 2 }}
                    >
                        Add Venue
                    </Button>
                </Box>
            ) : (
                <Grid container spacing={isMobile ? 2 : 3}>
                    {venues.map((venue) => (
                        <Grid item xs={12} sm={6} md={4} lg={4} xl={3} key={venue.id}>
                            <Card
                                sx={{
                                    borderRadius: 2,
                                    border: '1px solid #e2e8f0',
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
                                            color: '#0f172a',
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
                                            sx={{ fontSize: 16, color: '#64748b', flexShrink: 0 }}
                                        />
                                        <Typography
                                            variant="body2"
                                            noWrap
                                            sx={{
                                                color: '#64748b',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                minWidth: 0,
                                            }}
                                        >
                                            {venue.city}, {venue.state || venue.country || 'N/A'}
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
                                            sx={{ fontSize: 16, color: '#64748b', flexShrink: 0 }}
                                        />
                                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                                            Capacity: {venue.capacity || 'N/A'}
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
                                            label={venue.is_active ? 'Active' : 'Inactive'}
                                            size="small"
                                            color={venue.is_active ? 'success' : 'default'}
                                        />
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <Tooltip title="View Details">
                                                <IconButton
                                                    size="small"
                                                    sx={{
                                                        color: '#64748b',
                                                        minWidth: { xs: 44, md: 40 },
                                                        minHeight: { xs: 44, md: 40 },
                                                    }}
                                                    onClick={() => navigate(`/venues/${venue.id}`)}
                                                    aria-label={`View ${venue.name}`}
                                                >
                                                    <VisibilityIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Edit">
                                                <IconButton
                                                    size="small"
                                                    sx={{
                                                        color: '#4f46e5',
                                                        minWidth: { xs: 44, md: 40 },
                                                        minHeight: { xs: 44, md: 40 },
                                                    }}
                                                    onClick={() => navigate(`/venues/edit/${venue.id}`)}
                                                    aria-label={`Edit ${venue.name}`}
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete">
                                                <IconButton
                                                    size="small"
                                                    sx={{
                                                        color: '#ef4444',
                                                        minWidth: { xs: 44, md: 40 },
                                                        minHeight: { xs: 44, md: 40 },
                                                    }}
                                                    onClick={() => handleDelete(venue.id, venue.name)}
                                                    aria-label={`Delete ${venue.name}`}
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