import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Paper, Button,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    Switch, FormControlLabel, IconButton, Tooltip, Chip, Divider,
    Alert, CircularProgress, Stack, useMediaQuery, useTheme,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon,
    Policy as PolicyIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    Star as StarIcon,
    StarBorder as StarBorderIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import {
    PageContainer, PageHeader, PageTitle, PageSubtitle,
    PageHeaderLeft, PageHeaderRight, PrimaryButton,
    OutlineButton, LoadingWrapper,
} from '../../components/Common';
import { useSettings } from '../../context/SettingsContext';

// ✅ Platform Filter Imports
import usePlatformFilter from '../../hooks/usePlatformFilter';
import { OrgFilterSelect } from '../../components/Common';
import { theme } from '../../theme/tokens';

const C = theme.colors;

// ---------------------------------------------------------------------------
// Default new-policy draft. Kept at module scope so "reset" is trivial.
// ---------------------------------------------------------------------------
const EMPTY_POLICY = {
    name: '',
    description: '',
    is_active: true,
    is_default: false,
    rules: {
        version: 1,
        refund_tiers: [
            { min_hours_before: 168, refund_percent: 100, labelKey: 'cancellationPolicies.tierLabel7Days' },
            { min_hours_before: 24,  refund_percent: 50,  labelKey: 'cancellationPolicies.tierLabel24h7d' },
            { min_hours_before: 0,   refund_percent: 0,   labelKey: 'cancellationPolicies.tierLabelWithin24h' },
        ],
        cancellation_fee: 0,
        allow_partial_cancellation: true,
        allow_after_checkin: false,
        reschedule_allowed: false,
        notes: '',
    },
};

// ---------------------------------------------------------------------------
// A few preset templates so organizers aren't staring at a blank slate.
// ---------------------------------------------------------------------------
const PRESETS = {
    flexible: {
        labelKey: 'cancellationPolicies.presetFlexible',
        rules: {
            version: 1,
            refund_tiers: [
                { min_hours_before: 48, refund_percent: 100, labelKey: 'cancellationPolicies.tierLabel2Days' },
                { min_hours_before: 24, refund_percent: 50,  labelKey: 'cancellationPolicies.tierLabel24to48h' },
                { min_hours_before: 0,  refund_percent: 0,   labelKey: 'cancellationPolicies.tierLabelWithin24h' },
            ],
            cancellation_fee: 0,
            allow_partial_cancellation: true,
            allow_after_checkin: false,
            reschedule_allowed: false,
            notesKey: 'cancellationPolicies.presetFlexibleNotes',
        },
    },
    standard: {
        labelKey: 'cancellationPolicies.presetStandard',
        rules: EMPTY_POLICY.rules,
    },
    strict: {
        labelKey: 'cancellationPolicies.presetStrict',
        rules: {
            version: 1,
            refund_tiers: [
                { min_hours_before: 336, refund_percent: 100, labelKey: 'cancellationPolicies.tierLabel14Days' },
                { min_hours_before: 168, refund_percent: 50,  labelKey: 'cancellationPolicies.tierLabel7to14Days' },
                { min_hours_before: 0,   refund_percent: 0,   labelKey: 'cancellationPolicies.tierLabelWithin7Days' },
            ],
            cancellation_fee: 50,
            allow_partial_cancellation: false,
            allow_after_checkin: false,
            reschedule_allowed: false,
            notesKey: 'cancellationPolicies.presetStrictNotes',
        },
    },
    nonrefundable: {
        labelKey: 'cancellationPolicies.presetNonRefundable',
        rules: {
            version: 1,
            refund_tiers: [
                { min_hours_before: 0, refund_percent: 0, labelKey: 'cancellationPolicies.tierLabelNoRefunds' },
            ],
            cancellation_fee: 0,
            allow_partial_cancellation: true,
            allow_after_checkin: false,
            reschedule_allowed: false,
            notesKey: 'cancellationPolicies.presetNonRefundableNotes',
        },
    },
};

// ---------------------------------------------------------------------------
// Client-side validation mirroring the backend's validate_cancellation_rules.
// Runs on every tier edit so the UI shows problems immediately.
// ---------------------------------------------------------------------------
function validateRulesClient(rules, t) {
    const errors = [];

    const tiers = rules.refund_tiers || [];
    if (!tiers.length) {
        errors.push(t('cancellationPolicies.errorsTiersRequired'));
        return errors;
    }

    let prevHours = Infinity;
    tiers.forEach((tier, i) => {
        const h = Number(tier.min_hours_before);
        const p = Number(tier.refund_percent);

        if (Number.isNaN(h) || h < 0) {
            errors.push(t('cancellationPolicies.errorsTierHours', { index: i + 1 }));
        } else if (h >= prevHours) {
            errors.push(
                t('cancellationPolicies.errorsTierHoursOrder', { index: i + 1, hours: h, prev: prevHours })
            );
        }
        prevHours = h;

        if (Number.isNaN(p) || p < 0 || p > 100) {
            errors.push(t('cancellationPolicies.errorsTierPercent', { index: i + 1 }));
        }
    });

    const fee = Number(rules.cancellation_fee);
    if (Number.isNaN(fee) || fee < 0) {
        errors.push(t('cancellationPolicies.errorsFeeNonNegative'));
    }

    return errors;
}

const localizeRules = (rules, t) => {
    const copy = JSON.parse(JSON.stringify(rules || {}));
    copy.refund_tiers = (copy.refund_tiers || []).map((tier) => {
        const { labelKey, ...rest } = tier;
        return { ...rest, label: labelKey ? t(labelKey) : (tier.label || '') };
    });
    if (copy.notesKey) {
        copy.notes = t(copy.notesKey);
        delete copy.notesKey;
    }
    return copy;
};

const CancellationPolicies = () => {
    const { t } = useTranslation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { formatMoney, settings } = useSettings();

    // ✅ 1. Initialize Platform Filter Hook
    const { 
        params: orgParams, 
        isPlatformAdmin, 
        orgFilter, 
        setOrgFilter, 
        organizations 
    } = usePlatformFilter();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [policies, setPolicies] = useState([]);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [formData, setFormData] = useState({ ...EMPTY_POLICY, rules: localizeRules(EMPTY_POLICY.rules, t) });
    const [formErrors, setFormErrors] = useState([]);

    const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, name: '' });

    // ----------------------------------------------------------
    // Load
    // ----------------------------------------------------------
    const loadPolicies = useCallback(async () => {
        setLoading(true);
        try {
            // ✅ 2. Merge orgParams (Super Admin sees all if empty, or filtered if selected)
            const response = await api.get('/cancellation-policies/', { params: orgParams });
            setPolicies(response.data?.results || response.data || []);
        } catch (err) {
            console.error('Failed to load policies:', err);
            toast.error(err.response?.data?.detail || t('cancellationPolicies.loadFailed'));
            setPolicies([]);
        } finally {
            setLoading(false);
        }
    }, [orgParams, t]); // ✅ Added orgParams to dependency array

    useEffect(() => { loadPolicies(); }, [loadPolicies]);

    // ----------------------------------------------------------
    // Dialog open/close
    // ----------------------------------------------------------
    const handleOpenDialog = (policy = null) => {
        if (policy) {
            setEditing(policy);
            setFormData({
                name: policy.name || '',
                description: policy.description || '',
                is_active: policy.is_active !== false,
                is_default: policy.is_default === true,
                rules: localizeRules(policy.rules || EMPTY_POLICY.rules, t),
            });
        } else {
            setEditing(null);
            setFormData({
                ...EMPTY_POLICY,
                rules: localizeRules(EMPTY_POLICY.rules, t),
            });
        }
        setFormErrors([]);
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        if (saving) return;
        setDialogOpen(false);
        setEditing(null);
        setFormErrors([]);
    };

    // ----------------------------------------------------------
    // Field changes
    // ----------------------------------------------------------
    const handleTopField = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleRuleField = (field, value) => {
        setFormData((prev) => ({
            ...prev,
            rules: { ...prev.rules, [field]: value },
        }));
    };

    const handleTierField = (index, field, value) => {
        setFormData((prev) => {
            const tiers = [...prev.rules.refund_tiers];
            tiers[index] = { ...tiers[index], [field]: value };
            return { ...prev, rules: { ...prev.rules, refund_tiers: tiers } };
        });
    };

    const handleAddTier = () => {
        setFormData((prev) => {
            const tiers = [...prev.rules.refund_tiers];
            const smallestHours = tiers.length
                ? Math.max(0, Number(tiers[tiers.length - 1].min_hours_before) - 1)
                : 0;
            tiers.push({
                min_hours_before: smallestHours,
                refund_percent: 0,
                label: t('cancellationPolicies.customTier'),
            });
            return { ...prev, rules: { ...prev.rules, refund_tiers: tiers } };
        });
    };

    const handleRemoveTier = (index) => {
        setFormData((prev) => {
            const tiers = prev.rules.refund_tiers.filter((_, i) => i !== index);
            return { ...prev, rules: { ...prev.rules, refund_tiers: tiers } };
        });
    };

    const handleApplyPreset = (key) => {
        const preset = PRESETS[key];
        if (!preset) return;
        setFormData((prev) => ({
            ...prev,
            rules: localizeRules(preset.rules, t),
        }));
        toast.info(t('cancellationPolicies.presetApplied', { label: t(preset.labelKey) }));
    };

    // ----------------------------------------------------------
    // Submit
    // ----------------------------------------------------------
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            setFormErrors([t('cancellationPolicies.errorsNameRequired')]);
            return;
        }

        const errors = validateRulesClient(formData.rules, t);
        if (errors.length) {
            setFormErrors(errors);
            return;
        }

        setFormErrors([]);
        setSaving(true);

        try {
            const payload = {
                name: formData.name.trim(),
                description: formData.description || '',
                is_active: !!formData.is_active,
                is_default: !!formData.is_default,
                rules: {
                    version: 1,
                    refund_tiers: formData.rules.refund_tiers.map((t) => ({
                        min_hours_before: Number(t.min_hours_before),
                        refund_percent: Number(t.refund_percent),
                        label: t.label || '',
                    })),
                    cancellation_fee: Number(formData.rules.cancellation_fee) || 0,
                    allow_partial_cancellation: !!formData.rules.allow_partial_cancellation,
                    allow_after_checkin: !!formData.rules.allow_after_checkin,
                    reschedule_allowed: !!formData.rules.reschedule_allowed,
                    notes: formData.rules.notes || '',
                },
            };

            if (editing) {
                await api.put(`/cancellation-policies/${editing.id}/`, payload);
                toast.success(t('cancellationPolicies.updatedSuccess'));
            } else {
                await api.post('/cancellation-policies/', payload);
                toast.success(t('cancellationPolicies.createdSuccess'));
            }

            setDialogOpen(false);
            setEditing(null);
            loadPolicies();
        } catch (err) {
            console.error('Save policy error:', err);
            const data = err.response?.data;
            let msgs = [t('cancellationPolicies.errorsSaveFailed')];

            if (typeof data === 'string') msgs = [data];
            else if (data?.detail) msgs = [data.detail];
            else if (data?.rules) msgs = Array.isArray(data.rules) ? data.rules : [data.rules];
            else if (data && typeof data === 'object') {
                msgs = Object.entries(data).flatMap(([k, v]) =>
                    Array.isArray(v) ? v.map((m) => `${k}: ${m}`) : [`${k}: ${v}`]
                );
            }
            setFormErrors(msgs);
            toast.error(msgs[0]);
        } finally {
            setSaving(false);
        }
    };

    // ----------------------------------------------------------
    // Set default / delete
    // ----------------------------------------------------------
    const handleSetDefault = async (policy) => {
        try {
            await api.patch(`/cancellation-policies/${policy.id}/`, { is_default: true });
            toast.success(t('cancellationPolicies.defaultSet', { name: policy.name }));
            loadPolicies();
        } catch (err) {
            console.error('Set default error:', err);
            toast.error(err.response?.data?.detail || t('cancellationPolicies.defaultFailed'));
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/cancellation-policies/${deleteDialog.id}/`);
            toast.success(t('cancellationPolicies.deletedSuccess'));
            setDeleteDialog({ open: false, id: null, name: '' });
            loadPolicies();
        } catch (err) {
            console.error('Delete error:', err);
            toast.error(err.response?.data?.detail || t('cancellationPolicies.deleteFailed'));
        }
    };

    // ----------------------------------------------------------
    // Render helpers
    // ----------------------------------------------------------
    const describeTier = (tier) => {
        const h = Number(tier.min_hours_before);
        const p = Number(tier.refund_percent);
        const when =
            h === 0 ? t('cancellationPolicies.describeTierAnyTime')
            : h < 24 ? t('cancellationPolicies.describeTierAtLeast', { hours: h })
            : h % 24 === 0 ? t('cancellationPolicies.describeTierDays', { days: h / 24 })
            : t('cancellationPolicies.describeTierAtLeast', { hours: h });
        const what = p === 0 ? t('cancellationPolicies.describeTierNoRefund') : p === 100 ? t('cancellationPolicies.describeTierFullRefund') : t('cancellationPolicies.describeTierPercent', { percent: p });
        return t('cancellationPolicies.describeTierPrefix', { when, what });
    };

    if (loading && policies.length === 0) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: 'primary.main' }} />
            </LoadingWrapper>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>{t('cancellationPolicies.title')}</PageTitle>
                    {!isMobile && (
                        <PageSubtitle>
                            {t('cancellationPolicies.subtitle')}
                        </PageSubtitle>
                    )}
                </PageHeaderLeft>
                <PageHeaderRight>
                    {/* ✅ 3. Render the Organization Filter Dropdown */}
                    <OrgFilterSelect
                        isPlatformAdmin={isPlatformAdmin}
                        organizations={organizations}
                        orgFilter={orgFilter}
                        setOrgFilter={setOrgFilter}
                    />
                    <OutlineButton startIcon={<RefreshIcon />} onClick={loadPolicies}>
                        {t('common.refresh')}
                    </OutlineButton>
                    <PrimaryButton
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenDialog()}
                    >
                        {t('cancellationPolicies.newPolicy')}
                    </PrimaryButton>
                </PageHeaderRight>
            </PageHeader>

            {policies.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: '1px solid rgba(226, 232, 240, 1)' }}>
                    <PolicyIcon sx={{ fontSize: 48, color: C.borderHover, mb: 2 }} />
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                        {t('cancellationPolicies.noPolicies')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, mb: 3 }}>
                        {t('cancellationPolicies.noPoliciesHint')}
                    </Typography>
                    <PrimaryButton
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenDialog()}
                    >
                        {t('cancellationPolicies.createPolicy')}
                    </PrimaryButton>
                </Paper>
            ) : (
                <Grid container spacing={isMobile ? 2 : 3}>
                    {policies.map((policy) => (
                        <Grid item xs={12} md={6} lg={4} key={policy.id}>
                            <Card
                                sx={{
                                    borderRadius: 2,
                                    border: policy.is_default
                                        ? `2px solid ${C.success}`
                                        : `1px solid ${C.borderLight}`,
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}
                            >
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                                        <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 600, flex: 1, minWidth: 0 }}>
                                            {policy.name}
                                        </Typography>
                                        {policy.is_default && (
                                            <Chip
                                                label={t('cancellationPolicies.statusDefault')}
                                                size="small"
                                                color="success"
                                                sx={{ fontWeight: 600 }}
                                            />
                                        )}
                                    </Box>

                                    {policy.description && (
                                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                                            {policy.description}
                                        </Typography>
                                    )}

                                    <Divider sx={{ my: 1.5 }} />

                                    <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', fontWeight: 600 }}>
                                        {t('cancellationPolicies.refundTiersLabel')}
                                    </Typography>
                                    <Box sx={{ mt: 1 }}>
                                        {(policy.rules?.refund_tiers || []).map((tier, i) => (
                                            <Typography key={i} variant="body2" sx={{ color: 'text.primary', mb: 0.5 }}>
                                                • {describeTier(tier)}
                                            </Typography>
                                        ))}
                                        {policy.rules?.cancellation_fee > 0 && (
                                            <Typography variant="body2" sx={{ color: 'error.main', mt: 1 }}>
                                                {t('cancellationPolicies.feeLabel')}: {formatMoney(policy.rules.cancellation_fee)}
                                            </Typography>
                                        )}
                                        {!policy.rules?.allow_partial_cancellation && (
                                            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                                                {t('cancellationPolicies.allOrNothing')}
                                            </Typography>
                                        )}
                                    </Box>

                                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                                        <Chip
                                            size="small"
                                            label={policy.is_active ? t('cancellationPolicies.statusActive') : t('cancellationPolicies.statusInactive')}
                                            color={policy.is_active ? 'success' : 'default'}
                                        />
                                        <Chip
                                            size="small"
                                            variant="outlined"
                                            label={t('cancellationPolicies.eventCount', { count: policy.event_count || 0 })}
                                        />
                                    </Box>
                                </CardContent>

                                <Box sx={{ p: 2, pt: 0, borderTop: '1px solid rgba(241, 245, 249, 1)', display: 'flex', gap: 0.5 }}>
                                    {!policy.is_default && (
                                        <Tooltip title={t('cancellationPolicies.setAsDefault')}>
                                            <IconButton
                                                size="small"
                                                sx={{ color: 'success.main' }}
                                                onClick={() => handleSetDefault(policy)}
                                            >
                                                <StarBorderIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                    {policy.is_default && (
                                        <Tooltip title={t('cancellationPolicies.isDefault')}>
                                            <IconButton size="small" sx={{ color: 'success.main' }} disabled>
                                                <StarIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                    <Tooltip title={t('common.edit')}>
                                        <IconButton
                                            size="small"
                                            sx={{ color: 'primary.main' }}
                                            onClick={() => handleOpenDialog(policy)}
                                        >
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title={t('common.delete')}>
                                        <IconButton
                                            size="small"
                                            sx={{ color: 'error.main' }}
                                            onClick={() =>
                                                setDeleteDialog({ open: true, id: policy.id, name: policy.name })
                                            }
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* ============ Create / Edit dialog ============ */}
            <Dialog
                open={dialogOpen}
                onClose={handleCloseDialog}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        background: C.white,
                        borderRadius: '16px',
                        border: '1px solid rgba(226, 232, 240, 1)',
                        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.12)',
                    },
                }}
            >
                <DialogTitle sx={{ fontWeight: 700, color: 'text.primary' }}>
                    {editing ? t('cancellationPolicies.editPolicy') : t('cancellationPolicies.newPolicyTitle')}
                </DialogTitle>

                <DialogContent>
                    {!editing && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            {t('cancellationPolicies.presetHint')}
                            <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
                                {Object.entries(PRESETS).map(([key, preset]) => (
                                    <Button
                                        key={key}
                                        size="small"
                                        variant="outlined"
                                        onClick={() => handleApplyPreset(key)}
                                        sx={{ textTransform: 'none' }}
                                    >
                                        {t(preset.labelKey)}
                                    </Button>
                                ))}
                            </Stack>
                        </Alert>
                    )}

                    {formErrors.length > 0 && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            <Box component="ul" sx={{ m: 0, pl: 2 }}>
                                {formErrors.map((e, i) => (
                                    <li key={i}>{e}</li>
                                ))}
                            </Box>
                        </Alert>
                    )}

                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label={t('cancellationPolicies.policyNameLabel')}
                                name="name"
                                value={formData.name}
                                onChange={handleTopField}
                                placeholder={t('cancellationPolicies.policyNamePlaceholder')}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label={t('cancellationPolicies.descriptionLabel')}
                                name="description"
                                value={formData.description}
                                onChange={handleTopField}
                                multiline
                                rows={2}
                                placeholder={t('cancellationPolicies.descriptionHelper')}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <Divider sx={{ my: 1 }} />
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
                                {t('cancellationPolicies.refundTiersLabel')}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
                                {t('cancellationPolicies.refundTiersHelper')}
                            </Typography>
                        </Grid>

                        {formData.rules.refund_tiers.map((tier, index) => (
                            <Grid item xs={12} key={index}>
                                <Paper sx={{ p: 2, bgcolor: 'background.default', border: '1px solid rgba(226, 232, 240, 1)' }}>
                                    <Grid container spacing={2} alignItems="center">
                                        <Grid item xs={12} sm={3}>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                type="number"
                                                label={t('cancellationPolicies.hoursBeforeLabel')}
                                                value={tier.min_hours_before}
                                                onChange={(e) =>
                                                    handleTierField(index, 'min_hours_before', e.target.value)
                                                }
                                                inputProps={{ min: 0 }}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={3}>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                type="number"
                                                label={t('cancellationPolicies.refundPercentLabel')}
                                                value={tier.refund_percent}
                                                onChange={(e) =>
                                                    handleTierField(index, 'refund_percent', e.target.value)
                                                }
                                                inputProps={{ min: 0, max: 100 }}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={5}>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label={t('cancellationPolicies.tierLabelLabel')}
                                                value={tier.label || ''}
                                                onChange={(e) =>
                                                    handleTierField(index, 'label', e.target.value)
                                                }
                                                placeholder={t('cancellationPolicies.tierLabelPlaceholder')}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={1} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <IconButton
                                                size="small"
                                                sx={{ color: 'error.main' }}
                                                onClick={() => handleRemoveTier(index)}
                                                disabled={formData.rules.refund_tiers.length <= 1}
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Grid>
                                    </Grid>
                                    <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 1 }}>
                                        → {describeTier(tier)}
                                    </Typography>
                                </Paper>
                            </Grid>
                        ))}

                        <Grid item xs={12}>
                            <Button
                                size="small"
                                startIcon={<AddIcon />}
                                onClick={handleAddTier}
                                sx={{ textTransform: 'none' }}
                            >
                                {t('cancellationPolicies.addTier')}
                            </Button>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                type="number"
                                label={t('cancellationPolicies.cancellationFeeLabel', { currency: settings.currency_code })}
                                value={formData.rules.cancellation_fee}
                                onChange={(e) => handleRuleField('cancellation_fee', e.target.value)}
                                inputProps={{ min: 0, step: '0.01' }}
                                helperText={t('cancellationPolicies.cancellationFeeHelper')}
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label={t('cancellationPolicies.customerNotesLabel')}
                                value={formData.rules.notes || ''}
                                onChange={(e) => handleRuleField('notes', e.target.value)}
                                helperText={t('cancellationPolicies.customerNotesHelper')}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <Divider sx={{ my: 1 }} />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.rules.allow_partial_cancellation}
                                        onChange={(e) =>
                                            handleRuleField('allow_partial_cancellation', e.target.checked)
                                        }
                                    />
                                }
                                label={t('cancellationPolicies.allowPartialLabel')}
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.rules.allow_after_checkin}
                                        onChange={(e) =>
                                            handleRuleField('allow_after_checkin', e.target.checked)
                                        }
                                    />
                                }
                                label={t('cancellationPolicies.allowAfterCheckinLabel')}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <Divider sx={{ my: 1 }} />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.is_active}
                                        onChange={handleTopField}
                                        name="is_active"
                                    />
                                }
                                label={t('cancellationPolicies.activeLabel')}
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.is_default}
                                        onChange={handleTopField}
                                        name="is_default"
                                    />
                                }
                                label={t('cancellationPolicies.defaultLabel')}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>

                <DialogActions sx={{ p: 2, gap: 1 }}>
                    <OutlineButton onClick={handleCloseDialog} disabled={saving}>
                        {t('cancellationPolicies.cancel')}
                    </OutlineButton>
                    <PrimaryButton
                        variant="contained"
                        onClick={handleSubmit}
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />}
                    >
                        {saving ? t('cancellationPolicies.saving') : editing ? t('cancellationPolicies.savePolicy') : t('cancellationPolicies.createPolicy')}
                    </PrimaryButton>
                </DialogActions>
            </Dialog>

            {/* ============ Delete confirmation ============ */}
            <Dialog
                open={deleteDialog.open}
                onClose={() => setDeleteDialog({ open: false, id: null, name: '' })}
            >
                <DialogTitle sx={{ fontWeight: 700 }}>{t('cancellationPolicies.deletePolicy')}</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        {t('cancellationPolicies.deleteWarning')}
                    </Alert>
                    <Typography>
                        {t('cancellationPolicies.deleteConfirm', { name: deleteDialog.name })}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <OutlineButton
                        onClick={() => setDeleteDialog({ open: false, id: null, name: '' })}
                    >
                        {t('cancellationPolicies.cancel')}
                    </OutlineButton>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleDelete}
                        startIcon={<CancelIcon />}
                        sx={{ textTransform: 'none' }}
                    >
                        {t('cancellationPolicies.delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default CancellationPolicies;