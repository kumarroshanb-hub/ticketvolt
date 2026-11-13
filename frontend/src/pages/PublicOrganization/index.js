import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { ArrowForward, Email, Language } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import Logo from '../../components/Logo';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const PublicOrganization = () => {
    const { slug } = useParams();
    const { t } = useTranslation();
    const [org, setOrg] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get(`/organizations/public/${slug}/`)
            .then((res) => setOrg(res.data))
            .catch((err) => setError(err.response?.data?.error || err.message))
            .finally(() => setLoading(false));
    }, [slug]);

    if (loading) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: C.bgPrimary }}><CircularProgress sx={{ color: C.secondary }} /></Box>;

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: C.bgPrimary, py: { xs: 3, md: 7 }, px: 2 }}>
            <Box sx={{ maxWidth: 780, mx: 'auto' }}>
                <Box sx={{ mb: 4 }}><Link to="/"><Logo height={44} /></Link></Box>
                {error || !org ? <Alert severity="error">{error || 'Organization not found.'}</Alert> : (
                    <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 4, border: `1px solid ${C.borderLight}`, boxShadow: '0 20px 50px rgba(51,51,51,.09)' }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                            <Avatar src={org.logo_url || undefined} sx={{ width: 96, height: 96, bgcolor: C.primary, fontSize: 34, fontWeight: 800 }}>
                                {org.name?.charAt(0)}
                            </Avatar>
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="overline" sx={{ color: C.secondary, fontWeight: 800 }}>{org.industry || org.organization_type || 'Organization'}</Typography>
                                <Typography sx={{ fontSize: { xs: '2rem', md: '2.6rem' }, fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1.1 }}>{org.name}</Typography>
                                {org.description && <Typography sx={{ color: C.textSecondary, mt: 1.5, lineHeight: 1.7 }}>{org.description}</Typography>}
                            </Box>
                        </Stack>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 3 }}>
                            {org.email && <Chip icon={<Email />} label={org.email} component="a" href={`mailto:${org.email}`} clickable />}
                            {(org.social_links || []).map((link) => (
                                <Chip key={`${link.platform}-${link.url}`} icon={<Language />} label={link.platform} component="a" href={link.url} target="_blank" rel="noopener noreferrer" clickable />
                            ))}
                        </Stack>
                        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 4 }}>
                            <Button component={Link} to="/" variant="contained" color="secondary" endIcon={<ArrowForward />}>
                                {t('organizationPage.browseEvents', 'Browse events')}
                            </Button>
                            <Button component={Link} to={`/login?org=${encodeURIComponent(org.slug)}`} variant="outlined">
                                {t('organizationPage.memberSignIn', 'Member sign in')}
                            </Button>
                        </Stack>
                    </Paper>
                )}
            </Box>
        </Box>
    );
};

export default PublicOrganization;
