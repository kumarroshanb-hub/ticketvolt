import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box, Button, Checkbox, Chip, CircularProgress, Dialog,
    DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid,
    MenuItem, Paper, Tab, Tabs, Table, TableBody, TableCell, TableHead,
    TableRow, TextField, Typography,
} from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import api from '../../services/api';
import {
    LoadingWrapper, PageContainer, PageHeader, PageTitle, PageSubtitle,
    PrimaryButton,
} from '../../components/Common';
import { useOrg } from '../../context/OrgContext';
import { theme } from '../../theme/tokens';

const C = theme.colors;
const EMPTY = { code: '', name: '', description: '', feature_keys: [], is_default: false };

const Features = () => {
    const { t } = useTranslation();
    const { organizations = [] } = useOrg();
    const [tab, setTab] = useState(0);
    const [packages, setPackages] = useState([]);
    const [features, setFeatures] = useState([]);
    const [overrides, setOverrides] = useState([]);
    const [orgId, setOrgId] = useState('');
    const [loading, setLoading] = useState(true);
    const [dialog, setDialog] = useState(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [p, f] = await Promise.all([
                api.get('/platform/feature-packages/'),
                api.get('/platform/features/'),
            ]);
            const rows = (r) => r.data?.results || r.data || [];
            setPackages(rows(p));
            setFeatures(rows(f));
            if (organizations.length && !orgId) setOrgId(organizations[0].id);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    }, [organizations, orgId]);

    useEffect(() => { load(); }, [load]);

    const loadOverrides = useCallback(async () => {
        if (!orgId) return;
        try {
            const res = await api.get('/platform/organization-features/', { params: { organization_id: orgId } });
            setOverrides(res.data?.results || res.data || []);
        } catch (err) {
            toast.error(err.message);
        }
    }, [orgId]);

    useEffect(() => { loadOverrides(); }, [loadOverrides]);

    const selectedOrg = organizations.find((o) => String(o.id) === String(orgId));
    const overrideMap = useMemo(
        () => Object.fromEntries(overrides.map((o) => [o.feature_key, o])),
        [overrides],
    );

    const packageHas = (key) => {
        const pkg = packages.find((p) => String(p.id) === String(selectedOrg?.feature_package));
        return pkg ? (pkg.feature_keys || []).includes(key) : false;
    };

    const toggleFeature = async (feature, enabled) => {
        const existing = overrideMap[feature.key];
        try {
            if (existing) {
                await api.patch(`/platform/organization-features/${existing.id}/`, { enabled });
            } else {
                await api.post('/platform/organization-features/', {
                    organization: orgId,
                    feature: feature.id,
                    enabled,
                });
            }
            await loadOverrides();
        } catch (err) {
            toast.error(err.response?.data?.detail || err.message);
        }
    };

    const assignPackage = async (packageId) => {
        try {
            await api.patch(`/organizations/${orgId}/`, { feature_package: packageId || null });
            toast.success(t('features.packageAssigned', 'Package assigned.'));
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    const savePackage = async () => {
        setSaving(true);
        try {
            const payload = {
                code: dialog.code, name: dialog.name, description: dialog.description,
                feature_keys: dialog.feature_keys, is_default: !!dialog.is_default,
            };
            if (dialog.id) await api.put(`/platform/feature-packages/${dialog.id}/`, payload);
            else await api.post('/platform/feature-packages/', payload);
            toast.success(t('features.saved', 'Feature package saved.'));
            setDialog(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.detail || JSON.stringify(err.response?.data) || err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <LoadingWrapper><CircularProgress /></LoadingWrapper>;

    return (
        <PageContainer>
            <PageHeader><div>
                <PageTitle variant="h4">{t('features.title', 'Feature entitlements')}</PageTitle>
                <PageSubtitle>{t('features.subtitle', 'Control which product capabilities each organisation can use.')}</PageSubtitle>
            </div></PageHeader>
            <Paper sx={{ mb: 2 }}><Tabs value={tab} onChange={(_, v) => setTab(v)}>
                <Tab label={t('features.packages', 'Packages')} />
                <Tab label={t('features.organizations', 'Organisations')} />
            </Tabs></Paper>

            {tab === 0 && (
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                        <PrimaryButton onClick={() => setDialog({ ...EMPTY })}>{t('features.newPackage', 'New package')}</PrimaryButton>
                    </Box>
                    <Paper sx={{ border: `1px solid ${C.borderLight}` }}>
                        <Table size="small"><TableHead><TableRow>
                            <TableCell>{t('features.name', 'Name')}</TableCell>
                            <TableCell>{t('features.code', 'Code')}</TableCell>
                            <TableCell>{t('features.featuresCount', 'Features')}</TableCell>
                            <TableCell>{t('features.default', 'Default')}</TableCell>
                            <TableCell />
                        </TableRow></TableHead><TableBody>
                            {packages.map((pkg) => (
                                <TableRow key={pkg.id}>
                                    <TableCell>{pkg.name}</TableCell>
                                    <TableCell>{pkg.code}</TableCell>
                                    <TableCell>{(pkg.feature_keys || []).length}</TableCell>
                                    <TableCell>{pkg.is_default ? <Chip size="small" label="default" color="success" /> : '—'}</TableCell>
                                    <TableCell><Button size="small" onClick={() => setDialog({ ...pkg })}>{t('common.edit')}</Button></TableCell>
                                </TableRow>
                            ))}
                        </TableBody></Table>
                    </Paper>
                </Box>
            )}

            {tab === 1 && (
                <Box>
                    <Paper sx={{ p: 2, mb: 2, border: `1px solid ${C.borderLight}` }}>
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={5}>
                                <TextField select fullWidth label={t('features.organization', 'Organisation')} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                                    {organizations.map((org) => <MenuItem key={org.id} value={org.id}>{org.name}</MenuItem>)}
                                </TextField>
                            </Grid>
                            <Grid item xs={12} sm={5}>
                                <TextField select fullWidth label={t('features.package', 'Feature package')} value={selectedOrg?.feature_package || ''} onChange={(e) => assignPackage(e.target.value)}>
                                    <MenuItem value="">{t('features.noPackage', 'No package')}</MenuItem>
                                    {packages.map((pkg) => <MenuItem key={pkg.id} value={pkg.id}>{pkg.name}</MenuItem>)}
                                </TextField>
                            </Grid>
                        </Grid>
                    </Paper>
                    <Paper sx={{ p: 2, border: `1px solid ${C.borderLight}` }}>
                        {features.map((feature) => {
                            const override = overrideMap[feature.key];
                            const enabled = override ? override.enabled : packageHas(feature.key);
                            return (
                                <Box key={feature.id} sx={{ py: 1, borderBottom: `1px solid ${C.borderLight}` }}>
                                    <FormControlLabel
                                        control={<Checkbox checked={enabled} onChange={(e) => toggleFeature(feature, e.target.checked)} />}
                                        label={<>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{feature.name}</Typography>
                                            <Typography variant="caption" sx={{ color: C.textSecondary }}>{feature.description}</Typography>
                                        </>}
                                    />
                                    <Chip size="small" label={feature.category} sx={{ ml: 1 }} />
                                    {override && <Chip size="small" label={t('features.override', 'override')} color="warning" sx={{ ml: 1 }} />}
                                </Box>
                            );
                        })}
                    </Paper>
                </Box>
            )}

            <Dialog open={!!dialog} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
                <DialogTitle>{dialog?.id ? t('features.editPackage', 'Edit package') : t('features.newPackage', 'New package')}</DialogTitle>
                <DialogContent>
                    <TextField fullWidth label={t('features.name', 'Name')} value={dialog?.name || ''} onChange={(e) => setDialog({ ...dialog, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
                    <TextField fullWidth label={t('features.code', 'Code')} value={dialog?.code || ''} onChange={(e) => setDialog({ ...dialog, code: e.target.value })} sx={{ mb: 2 }} />
                    <TextField fullWidth multiline label={t('features.description', 'Description')} value={dialog?.description || ''} onChange={(e) => setDialog({ ...dialog, description: e.target.value })} sx={{ mb: 2 }} />
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('features.features', 'Features')}</Typography>
                    {features.map((feature) => (
                        <FormControlLabel key={feature.id} control={
                            <Checkbox
                                checked={(dialog?.feature_keys || []).includes(feature.key)}
                                onChange={(e) => {
                                    const keys = new Set(dialog.feature_keys || []);
                                    if (e.target.checked) keys.add(feature.key); else keys.delete(feature.key);
                                    setDialog({ ...dialog, feature_keys: [...keys] });
                                }}
                            />
                        } label={feature.name} />
                    ))}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
                    <Button variant="contained" onClick={savePackage} disabled={saving} startIcon={<SaveIcon />}>{t('common.save')}</Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default Features;
