// frontend/src/pages/Venues/Create.js
import React, { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, TextField, Button, Grid, Alert,
    CircularProgress, MenuItem, Divider, FormControlLabel, Switch,
    useMediaQuery, useTheme,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../services/api';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageHeaderLeft,
    PrimaryButton,
    OutlineButton,
} from '../../components/Common';
import styled from 'styled-components';

// ✅ Import shared constants
import { EVENT_STATUS } from '../../constants';

const StyledPaper = styled(Paper)`
    background: ${props => props.theme?.colors?.bgCard || '#ffffff'};
    border: 1px solid ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
    border-radius: ${props => props.theme?.borderRadius?.lg || '16px'};
    padding: 32px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);

    @media (max-width: 900px) {
        padding: 16px;
    }
`;

const SectionTitle = styled(Typography)`
    color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
    font-weight: 600;
    margin-bottom: 16px;
`;

const StyledTextField = styled(TextField)`
    & .MuiOutlinedInput-root {
        color: ${props => props.theme?.colors?.textPrimary || '#0f172a'};
        background: ${props => props.theme?.colors?.bgInput || '#f8fafc'};

        fieldset {
            border-color: ${props => props.theme?.colors?.borderLight || '#e2e8f0'};
        }

        &:hover fieldset {
            border-color: ${props => props.theme?.colors?.borderHover || '#c7d2fe'};
        }

        &.Mui-focused fieldset {
            border-color: ${props => props.theme?.colors?.primary || '#4f46e5'};
        }
    }

    & .MuiInputLabel-root {
        color: ${props => props.theme?.colors?.textSecondary || '#64748b'};
    }

    & .MuiInputLabel-root.Mui-focused {
        color: ${props => props.theme?.colors?.primary || '#4f46e5'};
    }

    & .MuiSvgIcon-root {
        color: ${props => props.theme?.colors?.textMuted || '#94a3b8'};
    }
`;

const CreateVenue = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        venue_type: 'indoor',
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        postal_code: '',
        country: 'India',
        capacity: '',
        contact_phone: '',
        contact_email: '',
        has_reserved_seating: false,
        is_active: true,
    });

    useEffect(() => {
        if (id) {
            loadVenue();
        }
    }, [id]);

    const loadVenue = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/venues/${id}/`);
            const data = response.data;
            setFormData({
                name: data.name || '',
                description: data.description || '',
                venue_type: data.venue_type || 'indoor',
                address_line1: data.address_line1 || '',
                address_line2: data.address_line2 || '',
                city: data.city || '',
                state: data.state || '',
                postal_code: data.postal_code || '',
                country: data.country || 'India',
                capacity: data.capacity || '',
                contact_phone: data.contact_phone || '',
                contact_email: data.contact_email || '',
                has_reserved_seating: data.has_reserved_seating || false,
                is_active: data.is_active !== undefined ? data.is_active : true,
            });
        } catch (error) {
            console.error('Failed to load venue:', error);
            toast.error('Failed to load venue details');
            navigate('/venues');
        }
        setLoading(false);
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData({
            ...formData,
            [name]: type === 'checkbox' ? checked : value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        try {
            if (!formData.name) {
                setError('Venue name is required');
                setSubmitting(false);
                return;
            }

            const venueData = {
                ...formData,
                capacity: formData.capacity ? parseInt(formData.capacity) : null,
            };

            if (id) {
                await api.put(`/venues/${id}/`, venueData);
                toast.success('Venue updated successfully!');
            } else {
                await api.post('/venues/', venueData);
                toast.success('Venue created successfully!');
            }
            navigate('/venues');
        } catch (error) {
            console.error('Submit error:', error);
            setError(error.response?.data?.message || error.message || 'Failed to save venue');
            toast.error('Failed to save venue');
        }
        setSubmitting(false);
    };

    if (loading) {
        return (
            <PageContainer>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress sx={{ color: '#4f46e5' }} />
                </Box>
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>{id ? 'Edit Venue' : 'Add New Venue'}</PageTitle>
                </PageHeaderLeft>
            </PageHeader>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <StyledPaper>
                <form onSubmit={handleSubmit}>
                    <Grid container spacing={isMobile ? 2 : 3}>
                        {/* Basic Information */}
                        <Grid item xs={12}>
                            <SectionTitle variant="h6">Basic Information</SectionTitle>
                            <Divider sx={{ borderColor: '#e2e8f0' }} />
                        </Grid>

                        <Grid item xs={12}>
                            <StyledTextField
                                fullWidth
                                label="Venue Name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                required
                                autoComplete="organization"
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <StyledTextField
                                fullWidth
                                label="Description"
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                multiline
                                rows={3}
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                select
                                label="Venue Type"
                                name="venue_type"
                                value={formData.venue_type}
                                onChange={handleChange}
                            >
                                <MenuItem value="indoor">Indoor</MenuItem>
                                <MenuItem value="outdoor">Outdoor</MenuItem>
                                <MenuItem value="both">Both</MenuItem>
                            </StyledTextField>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                label="Capacity"
                                name="capacity"
                                type="number"
                                inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                                value={formData.capacity}
                                onChange={handleChange}
                            />
                        </Grid>

                        {/* Address */}
                        <Grid item xs={12}>
                            <SectionTitle variant="h6">Address</SectionTitle>
                            <Divider sx={{ borderColor: '#e2e8f0' }} />
                        </Grid>

                        <Grid item xs={12}>
                            <StyledTextField
                                fullWidth
                                label="Address Line 1"
                                name="address_line1"
                                value={formData.address_line1}
                                onChange={handleChange}
                                autoComplete="address-line1"
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <StyledTextField
                                fullWidth
                                label="Address Line 2"
                                name="address_line2"
                                value={formData.address_line2}
                                onChange={handleChange}
                                autoComplete="address-line2"
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                label="City"
                                name="city"
                                value={formData.city}
                                onChange={handleChange}
                                autoComplete="address-level2"
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                label="State"
                                name="state"
                                value={formData.state}
                                onChange={handleChange}
                                autoComplete="address-level1"
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                label="Postal Code"
                                name="postal_code"
                                inputProps={{ inputMode: 'numeric' }}
                                value={formData.postal_code}
                                onChange={handleChange}
                                autoComplete="postal-code"
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                select
                                label="Country"
                                name="country"
                                value={formData.country}
                                onChange={handleChange}
                            >
                                <MenuItem value="India">India</MenuItem>
                                <MenuItem value="USA">United States</MenuItem>
                                <MenuItem value="UK">United Kingdom</MenuItem>
                                <MenuItem value="Australia">Australia</MenuItem>
                                <MenuItem value="Canada">Canada</MenuItem>
                                <MenuItem value="Singapore">Singapore</MenuItem>
                                <MenuItem value="Malaysia">Malaysia</MenuItem>
                                <MenuItem value="UAE">UAE</MenuItem>
                                <MenuItem value="Other">Other</MenuItem>
                            </StyledTextField>
                        </Grid>

                        {/* Contact Information */}
                        <Grid item xs={12}>
                            <SectionTitle variant="h6">Contact Information</SectionTitle>
                            <Divider sx={{ borderColor: '#e2e8f0' }} />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                label="Contact Phone"
                                name="contact_phone"
                                type="tel"
                                inputProps={{ inputMode: 'tel', autoComplete: 'tel' }}
                                value={formData.contact_phone}
                                onChange={handleChange}
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                label="Contact Email"
                                name="contact_email"
                                type="email"
                                inputProps={{ inputMode: 'email', autoComplete: 'email' }}
                                value={formData.contact_email}
                                onChange={handleChange}
                            />
                        </Grid>

                        {/* Settings */}
                        <Grid item xs={12}>
                            <SectionTitle variant="h6">Settings</SectionTitle>
                            <Divider sx={{ borderColor: '#e2e8f0' }} />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.has_reserved_seating}
                                        onChange={handleChange}
                                        name="has_reserved_seating"
                                        sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': { color: '#4f46e5' },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#4f46e5' }
                                        }}
                                    />
                                }
                                label="Has Reserved Seating"
                                sx={{ color: '#475569' }}
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.is_active}
                                        onChange={handleChange}
                                        name="is_active"
                                        sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': { color: '#4f46e5' },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#4f46e5' }
                                        }}
                                    />
                                }
                                label="Active"
                                sx={{ color: '#475569' }}
                            />
                        </Grid>

                        {/* Submit */}
                        <Grid item xs={12}>
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    gap: 2,
                                    mt: 2,
                                }}
                            >
                                <PrimaryButton
                                    variant="contained"
                                    type="submit"
                                    disabled={submitting}
                                    size="large"
                                    sx={isMobile ? { width: '100%' } : undefined}
                                >
                                    {submitting ? <CircularProgress size={24} sx={{ color: 'white' }} /> : (id ? 'Update Venue' : 'Create Venue')}
                                </PrimaryButton>
                                <OutlineButton
                                    variant="outlined"
                                    onClick={() => navigate('/venues')}
                                    sx={isMobile ? { width: '100%' } : undefined}
                                >
                                    Cancel
                                </OutlineButton>
                            </Box>
                        </Grid>
                    </Grid>
                </form>
            </StyledPaper>
        </PageContainer>
    );
};

export default CreateVenue;