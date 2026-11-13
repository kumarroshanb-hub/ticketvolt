// frontend/src/pages/Venues/Create.js
//
// Venue details and the (optional) seat layout are captured on ONE page
// and submitted in ONE request. The backend wraps the venue write, layout
// parse, and seat/category writes in a single transaction and bumps the
// VenueMaster only once, so a create/edit produces exactly one version
// instead of "save venue" + "save layout" = two versions.
//
// The advanced `/app/venues/<id>/layout` editor remains available for
// seat-category assignment / fine-tuning, but it is no longer part of the
// create flow.
//
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Paper, Typography, TextField, Button, Grid, Alert,
    CircularProgress, MenuItem, Divider, FormControlLabel, Switch,
    useMediaQuery, useTheme,
} from '@mui/material';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { UploadFile as UploadFileIcon } from '@mui/icons-material';
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

import { theme } from '../../theme/tokens';
import { useSettings } from '../../context/SettingsContext';
import { useOrg } from '../../context/OrgContext';
import {
    getCountryOptionsWithDefault,
    normaliseCountryName,
} from '../../config/countries';

const C = theme.colors;
const F = theme.fonts;

const StyledPaper = styled(Paper)`
    background: ${props => props.theme?.colors?.bgCard || C.bgCard};
    border: 1px solid ${props => props.theme?.colors?.borderLight || C.borderLight};
    border-radius: ${props => props.theme?.borderRadius?.lg || '16px'};
    padding: 32px;
    box-shadow: ${theme.shadows.card};

    @media (max-width: 900px) {
        padding: 16px;
    }
`;

const SectionTitle = styled(Typography)`
    color: ${props => props.theme?.colors?.textPrimary || C.textPrimary};
    font-weight: 600;
    margin-bottom: 16px;
`;

const StyledTextField = styled(TextField)`
    & .MuiOutlinedInput-root {
        color: ${props => props.theme?.colors?.textPrimary || C.textPrimary};
        background: ${props => props.theme?.colors?.bgInput || C.bgInput};

        fieldset {
            border-color: ${props => props.theme?.colors?.borderLight || C.borderLight};
        }
        &:hover fieldset {
            border-color: ${props => props.theme?.colors?.borderHover || C.borderHover};
        }
        &.Mui-focused fieldset {
            border-color: ${props => props.theme?.colors?.primary || C.primary};
        }
    }

    & .MuiInputLabel-root {
        color: ${props => props.theme?.colors?.textSecondary || C.textSecondary};
    }
    & .MuiInputLabel-root.Mui-focused {
        color: ${props => props.theme?.colors?.primary || C.primary};
    }
    & .MuiSvgIcon-root {
        color: ${props => props.theme?.colors?.textMuted || C.textMuted};
    }
`;

const CreateVenue = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { settings } = useSettings();

    const isNew = !id || id === 'new';
    const returnTo = searchParams.get('return');

    const {
        organizations,
        currentOrgId,
        setCurrentOrgId,
        isPlatformAdmin,
        loading: orgLoading,
        needsOrganization,
    } = useOrg();

    const platformCountry = useMemo(() => {
        const normalised = normaliseCountryName(settings?.country);
        return normalised || 'Hong Kong';
    }, [settings?.country]);

    const countryOptions = useMemo(
        () => getCountryOptionsWithDefault(platformCountry),
        [platformCountry],
    );

    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [existingLayout, setExistingLayout] = useState(null);

    // Seat layout is captured on THIS page and saved in the same request
    // as the venue, so the venue produces exactly one VenueMaster version.
    const [svgFile, setSvgFile] = useState(null);
    const [canvasWidth, setCanvasWidth] = useState(1000);
    const [canvasHeight, setCanvasHeight] = useState(800);

    const [formData, setFormData] = useState(() => ({
        name: '',
        description: '',
        venue_type: 'indoor',
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        postal_code: '',
        country: platformCountry,
        capacity: '',
        contact_phone: '',
        contact_email: '',
        map_url: '',
        has_reserved_seating: false,
        is_active: true,
        organization_id: '',
    }));

    useEffect(() => {
        setFormData((prev) => {
            if (prev.organization_id) return prev;
            if (currentOrgId) return { ...prev, organization_id: currentOrgId };
            if (organizations.length === 1) {
                return { ...prev, organization_id: organizations[0].id };
            }
            return prev;
        });
    }, [currentOrgId, organizations]);

    useEffect(() => {
        setFormData((prev) => {
            if (prev.country && prev.country !== '') return prev;
            return { ...prev, country: platformCountry };
        });
    }, [platformCountry]);

    const countryMenuOptions = useMemo(() => {
        const current = (formData.country || '').trim();
        if (current && !countryOptions.some((o) => o.value === current)) {
            return [
                { value: current, label: current, code: '', currencyCode: '', currencySymbol: '' },
                ...countryOptions,
            ];
        }
        return countryOptions;
    }, [formData.country, countryOptions]);

    useEffect(() => {
        if (!isNew) loadVenue();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isNew, id]);

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
                country: data.country || platformCountry,
                capacity: data.capacity || '',
                contact_phone: data.contact_phone || '',
                contact_email: data.contact_email || '',
                map_url: data.map_url || '',
                has_reserved_seating: data.has_reserved_seating || false,
                is_active: data.is_active !== undefined ? data.is_active : true,
                organization_id: data.organization || currentOrgId || '',
            });

            try {
                const layout = await api.get(`/venues/${id}/layout/`);
                setExistingLayout(layout.data);
                setCanvasWidth(layout.data?.canvas_width || 1000);
                setCanvasHeight(layout.data?.canvas_height || 800);
            } catch {
                setExistingLayout(null);
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Failed to load venue:', err);
            toast.error(t('venues.loadDetailsFailed'));
            navigate('/app/venues');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
    };

    const buildLayoutEditorUrl = (venueId) => {
        const base = `/app/venues/${venueId}/layout`;
        if (!returnTo) return base;
        return `${base}?return=${encodeURIComponent(returnTo)}`;
    };

    const buildVenueFormData = (venueData) => {
        const fd = new FormData();
        Object.entries(venueData).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            if (typeof value === 'boolean') {
                fd.append(key, value ? 'true' : 'false');
            } else {
                fd.append(key, value);
            }
        });
        if (svgFile) {
            fd.append('svg_file', svgFile);
            fd.append('canvas_width', String(canvasWidth));
            fd.append('canvas_height', String(canvasHeight));
        }
        return fd;
    };

    /**
     * Safety net: if the combined venue+layout request saved the venue
     * but the SVG did not land (e.g. an older backend or a proxy that
     * dropped the multipart part), upload it through the dedicated
     * endpoint instead of leaving the venue without seats.
     */
    const ensureLayoutUploaded = async (venueId, responseData) => {
        if (!svgFile || !venueId) return true;
        if (responseData?.has_layout) return true;

        try {
            const existing = await api.get(`/venues/${venueId}/layout/`);
            if ((existing.data?.seats?.length || 0) > 0) return true;
        } catch {
            // 404 = no layout yet; continue to upload.
        }

        const fd = new FormData();
        fd.append('svg_file', svgFile);
        fd.append('canvas_width', String(canvasWidth));
        fd.append('canvas_height', String(canvasHeight));
        try {
            await api.post(`/venues/${venueId}/layout/upload/`, fd);
            toast.info(t('venues.layoutUploadedFollowup'));
        } catch (err) {
            // The venue is saved; don't lose it. Surface a clear warning
            // so the operator can retry from the venue's layout editor.
            const msg =
                err.response?.data?.error
                || err.response?.data?.detail
                || err.message
                || t('venues.unknownError');
            toast.warn(
                t('venues.layoutUploadFailed', { error: msg })
            );
        }
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        try {
            if (!formData.name) {
                setError(t('venues.nameRequired'));
                return;
            }
            if (!formData.organization_id) {
                setError(
                    organizations.length > 1
                        ? t('venues.organizationRequiredMulti')
                        : t('venues.organizationRequiredNone'),
                );
                return;
            }

            const hasExistingSeats = (existingLayout?.seats?.length || 0) > 0;
            if (
                formData.has_reserved_seating
                && !svgFile
                && !hasExistingSeats
            ) {
                setError(t('venues.reservedLayoutRequired'));
                return;
            }

            const venueData = {
                ...formData,
                capacity: formData.capacity ? parseInt(formData.capacity, 10) : null,
            };
            // Reserved venues use multipart so the SVG can travel in the
            // SAME request as the venue fields. This is what lets one
            // save produce one VenueMaster version.
            const payload = (
                svgFile || formData.has_reserved_seating
            ) ? buildVenueFormData(venueData) : venueData;

            // ---- EDIT MODE ----
            if (!isNew) {
                const response = await api.put(`/venues/${id}/`, payload);
                await ensureLayoutUploaded(id, response.data);
                toast.success(t('venues.updatedSuccess'));
                if (returnTo) {
                    const sep = returnTo.includes('?') ? '&' : '?';
                    navigate(`${returnTo}${sep}venue_id=${id}`);
                } else {
                    navigate('/app/venues');
                }
                return;
            }

            // ---- CREATE MODE ----
            const response = await api.post('/venues/', payload);
            const created = response.data;
            await ensureLayoutUploaded(created?.id, created);
            toast.success(t('venues.createdSuccess'));

            if (returnTo && created?.id) {
                const sep = returnTo.includes('?') ? '&' : '?';
                navigate(`${returnTo}${sep}venue_id=${created.id}`);
            } else if (created?.id) {
                navigate(`/app/venues/${created.id}`);
            } else {
                navigate('/app/venues');
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Submit error:', err);

            const data = err.response?.data;
            let msg = t('venues.saveFailed');
            if (typeof data === 'string') {
                msg = data;
            } else if (data && typeof data === 'object') {
                const firstKey =
                    Object.keys(data).find((k) => k !== 'non_field_errors')
                    || 'non_field_errors';
                const firstVal = data[firstKey];
                msg = Array.isArray(firstVal)
                    ? `${firstKey}: ${firstVal[0]}`
                    : `${firstKey}: ${String(firstVal)}`;
            } else if (err.message) {
                msg = err.message;
            }
            setError(msg);
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading || orgLoading) {
        return (
            <PageContainer>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress sx={{ color: C.primary }} />
                </Box>
            </PageContainer>
        );
    }

    if (needsOrganization) {
        return (
            <PageContainer>
                <PageHeader>
                    <PageHeaderLeft>
                        <PageTitle>{t('venues.createTitle')}</PageTitle>
                    </PageHeaderLeft>
                </PageHeader>
                <Alert
                    severity="warning"
                    action={
                        <Button
                            color="inherit"
                            size="small"
                            onClick={() => navigate('/app/organizations')}
                        >
                            {t('venues.createOrganization')}
                        </Button>
                    }
                >
                    {t('venues.needsOrganizationBody')}
                </Alert>
            </PageContainer>
        );
    }

    const showOrgPicker = isPlatformAdmin || organizations.length > 1;

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>{isNew ? t('venues.createTitle') : t('venues.editVenue')}</PageTitle>
                </PageHeaderLeft>
                {returnTo && isNew && (
                    <Typography variant="caption" sx={{ color: C.textSecondary }}>
                        {t('venues.draftPreserved')}
                    </Typography>
                )}
            </PageHeader>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <StyledPaper>
                <form onSubmit={handleSubmit}>
                    <Grid container spacing={isMobile ? 2 : 3}>
                        {showOrgPicker && (
                            <>
                                <Grid item xs={12}>
                                    <SectionTitle variant="h6">{t('venues.organizationSection')}</SectionTitle>
                                    <Divider sx={{ borderColor: 'divider' }} />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <StyledTextField
                                        fullWidth
                                        select
                                        label={t('venues.organizationLabel')}
                                        name="organization_id"
                                        value={formData.organization_id || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setFormData((prev) => ({ ...prev, organization_id: val }));
                                            setCurrentOrgId(val);
                                        }}
                                        required
                                        helperText={t('venues.organizationHelper')}
                                    >
                                        {organizations.map((org) => (
                                            <MenuItem key={org.id} value={org.id}>
                                                {org.name}
                                            </MenuItem>
                                        ))}
                                    </StyledTextField>
                                </Grid>
                            </>
                        )}

                        <Grid item xs={12}>
                            <SectionTitle variant="h6">{t('venues.basicInfoSection')}</SectionTitle>
                            <Divider sx={{ borderColor: 'divider' }} />
                        </Grid>

                        <Grid item xs={12}>
                            <StyledTextField
                                fullWidth
                                label={t('venues.nameLabel')}
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
                                label={t('venues.descriptionLabel')}
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
                                label={t('venues.typeLabel')}
                                name="venue_type"
                                value={formData.venue_type}
                                onChange={handleChange}
                            >
                                <MenuItem value="indoor">{t('venues.typeIndoor')}</MenuItem>
                                <MenuItem value="outdoor">{t('venues.typeOutdoor')}</MenuItem>
                                <MenuItem value="both">{t('venues.typeBoth')}</MenuItem>
                            </StyledTextField>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                label={t('venues.capacityLabel')}
                                name="capacity"
                                type="number"
                                inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                                value={formData.capacity}
                                onChange={handleChange}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <StyledTextField
                                fullWidth
                                label={t('venues.mapUrlLabel', 'Map link')}
                                name="map_url"
                                value={formData.map_url || ''}
                                onChange={handleChange}
                                placeholder="https://maps.google.com/..."
                                helperText={t('venues.mapUrlHelper', 'Google Maps or any public map link for this venue.')}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <SectionTitle variant="h6">{t('venues.addressSection')}</SectionTitle>
                            <Divider sx={{ borderColor: 'divider' }} />
                        </Grid>

                        <Grid item xs={12}>
                            <StyledTextField
                                fullWidth
                                label={t('venues.addressLine1')}
                                name="address_line1"
                                value={formData.address_line1}
                                onChange={handleChange}
                                autoComplete="address-line1"
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <StyledTextField
                                fullWidth
                                label={t('venues.addressLine2')}
                                name="address_line2"
                                value={formData.address_line2}
                                onChange={handleChange}
                                autoComplete="address-line2"
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                label={t('venues.cityLabel')}
                                name="city"
                                value={formData.city}
                                onChange={handleChange}
                                autoComplete="address-level2"
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                label={t('venues.stateLabel')}
                                name="state"
                                value={formData.state}
                                onChange={handleChange}
                                autoComplete="address-level1"
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                label={t('venues.postalCodeLabel')}
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
                                label={t('venues.countryLabel')}
                                name="country"
                                value={formData.country}
                                onChange={handleChange}
                                SelectProps={{
                                    MenuProps: { PaperProps: { sx: { maxHeight: 400 } } },
                                }}
                            >
                                {countryMenuOptions.map((country) => (
                                    <MenuItem key={country.value} value={country.value}>
                                        {country.label}
                                    </MenuItem>
                                ))}
                            </StyledTextField>
                        </Grid>

                        <Grid item xs={12}>
                            <SectionTitle variant="h6">{t('venues.contactSection')}</SectionTitle>
                            <Divider sx={{ borderColor: 'divider' }} />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <StyledTextField
                                fullWidth
                                label={t('venues.contactPhoneLabel')}
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
                                label={t('venues.contactEmailLabel')}
                                name="contact_email"
                                type="email"
                                inputProps={{ inputMode: 'email', autoComplete: 'email' }}
                                value={formData.contact_email}
                                onChange={handleChange}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <SectionTitle variant="h6">{t('venues.settingsSection')}</SectionTitle>
                            <Divider sx={{ borderColor: 'divider' }} />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.has_reserved_seating}
                                        onChange={handleChange}
                                        name="has_reserved_seating"
                                        sx={{
                                            '& .MuiSwitch-switchBase.Mui-checked': { color: C.primary },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: C.primary },
                                        }}
                                    />
                                }
                                label={t('venues.hasReservedSeating')}
                                sx={{ color: 'text.secondary' }}
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
                                            '& .MuiSwitch-switchBase.Mui-checked': { color: C.primary },
                                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: C.primary },
                                        }}
                                    />
                                }
                                label={t('venues.activeLabel')}
                                sx={{ color: 'text.secondary' }}
                            />
                        </Grid>

                        {/* Reserved seating: the layout is captured and
                            saved in the SAME request as the venue so only
                            one VenueMaster version is created. */}
                        {formData.has_reserved_seating && (
                            <>
                                <Grid item xs={12}>
                                    <SectionTitle variant="h6">{t('venues.seatLayout')}</SectionTitle>
                                    <Divider sx={{ borderColor: 'divider' }} />
                                    <Alert
                                        severity="info"
                                        sx={{ mt: 2, alignItems: 'flex-start' }}
                                    >
                                        <Typography variant="body2">
                                            {t('venues.layoutInfo')}
                                        </Typography>
                                        {existingLayout?.seats?.length > 0 && (
                                            <Typography
                                                variant="caption"
                                                sx={{ display: 'block', mt: 1, color: 'success.main', fontWeight: 600 }}
                                            >
                                                {t('venues.existingSeats', { count: existingLayout.seats.length })}
                                            </Typography>
                                        )}
                                    </Alert>
                                </Grid>

                                <Grid item xs={12} sm={6}>
                                    <Button
                                        component="label"
                                        variant="outlined"
                                        startIcon={<UploadFileIcon />}
                                        sx={{ textTransform: 'none' }}
                                    >
                                        {svgFile ? t('venues.replaceSvg') : t('venues.chooseSvg')}
                                        <input
                                            type="file"
                                            hidden
                                            accept=".svg,image/svg+xml"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0] || null;
                                                if (file && !/\.svg$/i.test(file.name)) {
                                                    toast.error(t('venues.svgOnly'));
                                                    e.target.value = '';
                                                    return;
                                                }
                                                setSvgFile(file);
                                            }}
                                        />
                                    </Button>
                                    <Typography
                                        variant="caption"
                                        sx={{ display: 'block', mt: 1, color: C.textSecondary }}
                                    >
                                        {svgFile
                                            ? svgFile.name
                                            : existingLayout?.seats?.length > 0
                                                ? t('venues.keepExistingLayout')
                                                : t('venues.noSvgSelected')}
                                    </Typography>
                                </Grid>

                                <Grid item xs={12} sm={6}>
                                    <Grid container spacing={2}>
                                        <Grid item xs={6}>
                                            <StyledTextField
                                                fullWidth
                                                label={t('venues.canvasWidth')}
                                                type="number"
                                                value={canvasWidth}
                                                onChange={(e) => setCanvasWidth(e.target.value)}
                                                inputProps={{ min: 1 }}
                                            />
                                        </Grid>
                                        <Grid item xs={6}>
                                            <StyledTextField
                                                fullWidth
                                                label={t('venues.canvasHeight')}
                                                type="number"
                                                value={canvasHeight}
                                                onChange={(e) => setCanvasHeight(e.target.value)}
                                                inputProps={{ min: 1 }}
                                            />
                                        </Grid>
                                    </Grid>
                                    {!isNew && existingLayout?.seats?.length > 0 && (
                                        <Button
                                            variant="text"
                                            size="small"
                                            onClick={() => navigate(buildLayoutEditorUrl(id))}
                                            sx={{ textTransform: 'none', mt: 1 }}
                                        >
                                            {t('venues.openAdvancedEditor')}
                                        </Button>
                                    )}
                                </Grid>
                            </>
                        )}

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
                                    {submitting ? (
                                        <CircularProgress size={24} sx={{ color: C.textInverse }} />
                                    ) : isNew ? (
                                        t('venues.createButton')
                                    ) : (
                                        t('venues.updateButton')
                                    )}
                                </PrimaryButton>
                                <OutlineButton
                                    variant="outlined"
                                    onClick={() => {
                                        if (returnTo) {
                                            if (
                                                window.confirm(
                                                    t('venues.leaveWithoutSaving'),
                                                )
                                            ) {
                                                navigate(returnTo);
                                            }
                                        } else {
                                            navigate('/app/venues');
                                        }
                                    }}
                                    sx={isMobile ? { width: '100%' } : undefined}
                                >
                                    {t('venues.cancelButton')}
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