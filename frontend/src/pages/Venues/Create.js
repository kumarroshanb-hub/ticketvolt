// frontend/src/pages/Venues/Create.js
import React, { useState, useEffect, useMemo } from 'react';
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

// ✅ Import shared constants (kept for backwards compatibility,
//    but not used on this page — safe to remove in a future cleanup)
import { EVENT_STATUS } from '../../constants';

// ============================================================
// COUNTRY LIST
// ------------------------------------------------------------
// Kept local to this file for now. If you later need it in other
// forms (Register.js, EventDetail.js, Profile.js, etc.), move this
// array to `frontend/src/constants/index.js` and import it there.
//
// Sorted alphabetically. Includes common alternatives spelled out.
// ============================================================
const COUNTRIES = [
    'Afghanistan',
    'Albania',
    'Algeria',
    'Andorra',
    'Angola',
    'Antigua and Barbuda',
    'Argentina',
    'Armenia',
    'Australia',
    'Austria',
    'Azerbaijan',
    'Bahamas',
    'Bahrain',
    'Bangladesh',
    'Barbados',
    'Belarus',
    'Belgium',
    'Belize',
    'Benin',
    'Bhutan',
    'Bolivia',
    'Bosnia and Herzegovina',
    'Botswana',
    'Brazil',
    'Brunei',
    'Bulgaria',
    'Burkina Faso',
    'Burundi',
    'Cabo Verde',
    'Cambodia',
    'Cameroon',
    'Canada',
    'Central African Republic',
    'Chad',
    'Chile',
    'China',
    'Colombia',
    'Comoros',
    'Congo (Brazzaville)',
    'Congo (Kinshasa)',
    'Costa Rica',
    'Croatia',
    'Cuba',
    'Cyprus',
    'Czech Republic',
    'Denmark',
    'Djibouti',
    'Dominica',
    'Dominican Republic',
    'Ecuador',
    'Egypt',
    'El Salvador',
    'Equatorial Guinea',
    'Eritrea',
    'Estonia',
    'Eswatini',
    'Ethiopia',
    'Fiji',
    'Finland',
    'France',
    'Gabon',
    'Gambia',
    'Georgia',
    'Germany',
    'Ghana',
    'Greece',
    'Grenada',
    'Guatemala',
    'Guinea',
    'Guinea-Bissau',
    'Guyana',
    'Haiti',
    'Honduras',
    'Hong Kong',
    'Hungary',
    'Iceland',
    'India',
    'Indonesia',
    'Iran',
    'Iraq',
    'Ireland',
    'Israel',
    'Italy',
    'Ivory Coast',
    'Jamaica',
    'Japan',
    'Jordan',
    'Kazakhstan',
    'Kenya',
    'Kiribati',
    'Kosovo',
    'Kuwait',
    'Kyrgyzstan',
    'Laos',
    'Latvia',
    'Lebanon',
    'Lesotho',
    'Liberia',
    'Libya',
    'Liechtenstein',
    'Lithuania',
    'Luxembourg',
    'Macau',
    'Madagascar',
    'Malawi',
    'Malaysia',
    'Maldives',
    'Mali',
    'Malta',
    'Marshall Islands',
    'Mauritania',
    'Mauritius',
    'Mexico',
    'Micronesia',
    'Moldova',
    'Monaco',
    'Mongolia',
    'Montenegro',
    'Morocco',
    'Mozambique',
    'Myanmar',
    'Namibia',
    'Nauru',
    'Nepal',
    'Netherlands',
    'New Zealand',
    'Nicaragua',
    'Niger',
    'Nigeria',
    'North Korea',
    'North Macedonia',
    'Norway',
    'Oman',
    'Pakistan',
    'Palau',
    'Palestine',
    'Panama',
    'Papua New Guinea',
    'Paraguay',
    'Peru',
    'Philippines',
    'Poland',
    'Portugal',
    'Puerto Rico',
    'Qatar',
    'Romania',
    'Russia',
    'Rwanda',
    'Saint Kitts and Nevis',
    'Saint Lucia',
    'Saint Vincent and the Grenadines',
    'Samoa',
    'San Marino',
    'Sao Tome and Principe',
    'Saudi Arabia',
    'Senegal',
    'Serbia',
    'Seychelles',
    'Sierra Leone',
    'Singapore',
    'Slovakia',
    'Slovenia',
    'Solomon Islands',
    'Somalia',
    'South Africa',
    'South Korea',
    'South Sudan',
    'Spain',
    'Sri Lanka',
    'Sudan',
    'Suriname',
    'Sweden',
    'Switzerland',
    'Syria',
    'Taiwan',
    'Tajikistan',
    'Tanzania',
    'Thailand',
    'Timor-Leste',
    'Togo',
    'Tonga',
    'Trinidad and Tobago',
    'Tunisia',
    'Turkey',
    'Turkmenistan',
    'Tuvalu',
    'UAE',
    'Uganda',
    'UK',
    'Ukraine',
    'Uruguay',
    'USA',
    'Uzbekistan',
    'Vanuatu',
    'Vatican City',
    'Venezuela',
    'Vietnam',
    'Yemen',
    'Zambia',
    'Zimbabwe',
];

// ============================================================
// STYLED COMPONENTS
// ============================================================

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

// ============================================================
// COMPONENT
// ============================================================

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

    // If the currently-saved country is NOT in our list (e.g. a legacy
    // value like "United States of America"), inject it so the Select
    // doesn't render empty. Memoized so we don't rebuild the array on
    // every render.
    const countryOptions = useMemo(() => {
        const current = (formData.country || '').trim();
        if (current && !COUNTRIES.includes(current)) {
            // Insert the legacy value at the top so it's visible & selected
            return [current, ...COUNTRIES];
        }
        return COUNTRIES;
    }, [formData.country]);

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

            // Surface field-level errors from DRF when available.
            const data = error.response?.data;
            let msg = 'Failed to save venue';
            if (typeof data === 'string') {
                msg = data;
            } else if (data && typeof data === 'object') {
                // Show the first field error, or the first non-field error.
                const firstKey =
                    Object.keys(data).find(k => k !== 'non_field_errors') ||
                    'non_field_errors';
                const firstVal = data[firstKey];
                msg = Array.isArray(firstVal)
                    ? `${firstKey}: ${firstVal[0]}`
                    : `${firstKey}: ${String(firstVal)}`;
            } else if (error.message) {
                msg = error.message;
            }
            setError(msg);
            toast.error(msg);
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
                                SelectProps={{
                                    MenuProps: {
                                        PaperProps: {
                                            sx: { maxHeight: 400 },
                                        },
                                    },
                                }}
                            >
                                {countryOptions.map((country) => (
                                    <MenuItem key={country} value={country}>
                                        {country}
                                    </MenuItem>
                                ))}
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