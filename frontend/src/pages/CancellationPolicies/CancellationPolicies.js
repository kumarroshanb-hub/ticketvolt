// frontend/src/pages/CancellationPolicies/CancellationPolicies.js
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
import { toast } from 'react-toastify';
import {
    PageContainer, PageHeader, PageTitle, PageSubtitle,
    PageHeaderLeft, PageHeaderRight, PrimaryButton,
    OutlineButton, LoadingWrapper,
} from '../../components/Common';

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
            { min_hours_before: 168, refund_percent: 100, label: '7+ days before' },
            { min_hours_before: 24,  refund_percent: 50,  label: '24h – 7 days before' },
            { min_hours_before: 0,   refund_percent: 0,   label: 'Within 24 hours' },
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
        label: 'Flexible (2-day cutoff)',
        rules: {
            version: 1,
            refund_tiers: [
                { min_hours_before: 48, refund_percent: 100, label: '2+ days before' },
                { min_hours_before: 24, refund_percent: 50,  label: '24-48 hours' },
                { min_hours_before: 0,  refund_percent: 0,   label: 'Within 24 hours' },
            ],
            cancellation_fee: 0,
            allow_partial_cancellation: true,
            allow_after_checkin: false,
            reschedule_allowed: false,
            notes: 'Free cancellation up to 2 days before the event.',
        },
    },
    standard: {
        label: 'Standard (7-day cutoff)',
        rules: EMPTY_POLICY.rules,
    },
    strict: {
        label: 'Strict (14-day cutoff, fee)',
        rules: {
            version: 1,
            refund_tiers: [
                { min_hours_before: 336, refund_percent: 100, label: '14+ days before' },
                { min_hours_before: 168, refund_percent: 50,  label: '7-14 days before' },
                { min_hours_before: 0,   refund_percent: 0,   label: 'Within 7 days' },
            ],
            cancellation_fee: 50,
            allow_partial_cancellation: false,
            allow_after_checkin: false,
            reschedule_allowed: false,
            notes: 'Full refund up to 14 days before. ₹50 fee applies to any refund.',
        },
    },
    nonrefundable: {
        label: 'Non-refundable',
        rules: {
            version: 1,
            refund_tiers: [
                { min_hours_before: 0, refund_percent: 0, label: 'No refunds' },
            ],
            cancellation_fee: 0,
            allow_partial_cancellation: true,
            allow_after_checkin: false,
            reschedule_allowed: false,
            notes: 'All sales are final.',
        },
    },
};

// ---------------------------------------------------------------------------
// Client-side validation mirroring the backend's validate_cancellation_rules.
// Runs on every tier edit so the UI shows problems immediately.
// ---------------------------------------------------------------------------
function validateRulesClient(rules) {
    const errors = [];

    const tiers = rules.refund_tiers || [];
    if (!tiers.length) {
        errors.push('At least one refund tier is required.');
        return errors;
    }

    let prevHours = Infinity;
    tiers.forEach((tier, i) => {
        const h = Number(tier.min_hours_before);
        const p = Number(tier.refund_percent);

        if (Number.isNaN(h) || h < 0) {
            errors.push(`Tier ${i + 1}: hours must be a non-negative number.`);
        } else if (h >= prevHours) {
            errors.push(
                `Tier ${i + 1}: hours must be strictly less than the previous tier (${h} ≥ ${prevHours}). Tiers are ordered most-generous-first.`
            );
        }
        prevHours = h;

        if (Number.isNaN(p) || p < 0 || p > 100) {
            errors.push(`Tier ${i + 1}: refund percent must be between 0 and 100.`);
        }
    });

    const fee = Number(rules.cancellation_fee);
    if (Number.isNaN(fee) || fee < 0) {
        errors.push('Cancellation fee must be a non-negative number.');
    }

    return errors;
}

const CancellationPolicies = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [policies, setPolicies] = useState([]);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [formData, setFormData] = useState({ ...EMPTY_POLICY });
    const [formErrors, setFormErrors] = useState([]);

    const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, name: '' });

    // ----------------------------------------------------------
    // Load
    // ----------------------------------------------------------
    const loadPolicies = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/cancellation-policies/');
            setPolicies(response.data?.results || response.data || []);
        } catch (err) {
            console.error('Failed to load policies:', err);
            toast.error(err.response?.data?.detail || 'Failed to load policies');
            setPolicies([]);
        } finally {
            setLoading(false);
        }
    }, []);

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
                rules: JSON.parse(JSON.stringify(policy.rules || EMPTY_POLICY.rules)),
            });
        } else {
            setEditing(null);
            setFormData({
                ...EMPTY_POLICY,
                rules: JSON.parse(JSON.stringify(EMPTY_POLICY.rules)),
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
            // New tier goes at the *bottom* with the smallest hours value
            const smallestHours = tiers.length
                ? Math.max(0, Number(tiers[tiers.length - 1].min_hours_before) - 1)
                : 0;
            tiers.push({
                min_hours_before: smallestHours,
                refund_percent: 0,
                label: 'Custom tier',
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
            rules: JSON.parse(JSON.stringify(preset.rules)),
        }));
        toast.info(`Applied preset: ${preset.label}`);
    };

    // ----------------------------------------------------------
    // Submit
    // ----------------------------------------------------------
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            setFormErrors(['Policy name is required.']);
            return;
        }

        const errors = validateRulesClient(formData.rules);
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
                toast.success('Policy updated successfully');
            } else {
                await api.post('/cancellation-policies/', payload);
                toast.success('Policy created successfully');
            }

            setDialogOpen(false);
            setEditing(null);
            loadPolicies();
        } catch (err) {
            console.error('Save policy error:', err);
            const data = err.response?.data;
            let msgs = ['Failed to save policy'];

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
            // Unset other defaults is handled by the backend constraint,
            // but we also do it explicitly here to be safe.
            await api.patch(`/cancellation-policies/${policy.id}/`, { is_default: true });
            toast.success(`"${policy.name}" is now the default policy`);
            loadPolicies();
        } catch (err) {
            console.error('Set default error:', err);
            toast.error(err.response?.data?.detail || 'Failed to set default');
        }
    };

    const handleDelete = async () => {
        try {
            await api.delete(`/cancellation-policies/${deleteDialog.id}/`);
            toast.success('Policy deleted');
            setDeleteDialog({ open: false, id: null, name: '' });
            loadPolicies();
        } catch (err) {
            console.error('Delete error:', err);
            toast.error(err.response?.data?.detail || 'Failed to delete policy');
        }
    };

    // ----------------------------------------------------------
    // Render helpers
    // ----------------------------------------------------------
    const describeTier = (tier) => {
        const h = Number(tier.min_hours_before);
        const p = Number(tier.refund_percent);
        const when =
            h === 0 ? 'Any time before'
            : h < 24 ? `≥ ${h} hours before`
            : h % 24 === 0 ? `≥ ${h / 24} day${h / 24 === 1 ? '' : 's'} before`
            : `≥ ${h} hours before`;
        const what = p === 0 ? 'no refund' : p === 100 ? 'full refund' : `${p}% refund`;
        return `${when}: ${what}`;
    };

    if (loading && policies.length === 0) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: '#4f46e5' }} />
            </LoadingWrapper>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>Cancellation Policies</PageTitle>
                    {!isMobile && (
                        <PageSubtitle>
                            Reusable refund rules you can attach to any event
                        </PageSubtitle>
                    )}
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton startIcon={<RefreshIcon />} onClick={loadPolicies}>
                        Refresh
                    </OutlineButton>
                    <PrimaryButton
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenDialog()}
                    >
                        New Policy
                    </PrimaryButton>
                </PageHeaderRight>
            </PageHeader>

            {policies.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                    <PolicyIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 2 }} />
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a' }}>
                        No policies yet
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#64748b', mt: 1, mb: 3 }}>
                        Create your first cancellation policy. You can attach it to any event.
                    </Typography>
                    <PrimaryButton
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenDialog()}
                    >
                        Create Policy
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
                                        ? '2px solid #22c55e'
                                        : '1px solid #e2e8f0',
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}
                            >
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                                        <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 600, flex: 1, minWidth: 0 }}>
                                            {policy.name}
                                        </Typography>
                                        {policy.is_default && (
                                            <Chip
                                                label="DEFAULT"
                                                size="small"
                                                color="success"
                                                sx={{ fontWeight: 600 }}
                                            />
                                        )}
                                    </Box>

                                    {policy.description && (
                                        <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
                                            {policy.description}
                                        </Typography>
                                    )}

                                    <Divider sx={{ my: 1.5 }} />

                                    <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                                        Refund tiers
                                    </Typography>
                                    <Box sx={{ mt: 1 }}>
                                        {(policy.rules?.refund_tiers || []).map((tier, i) => (
                                            <Typography key={i} variant="body2" sx={{ color: '#334155', mb: 0.5 }}>
                                                • {describeTier(tier)}
                                            </Typography>
                                        ))}
                                        {policy.rules?.cancellation_fee > 0 && (
                                            <Typography variant="body2" sx={{ color: '#ef4444', mt: 1 }}>
                                                Fee: ₹{policy.rules.cancellation_fee}
                                            </Typography>
                                        )}
                                        {!policy.rules?.allow_partial_cancellation && (
                                            <Typography variant="body2" sx={{ color: '#64748b', mt: 1 }}>
                                                All-or-nothing cancellation
                                            </Typography>
                                        )}
                                    </Box>

                                    <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                                        <Chip
                                            size="small"
                                            label={policy.is_active ? 'ACTIVE' : 'INACTIVE'}
                                            color={policy.is_active ? 'success' : 'default'}
                                        />
                                        <Chip
                                            size="small"
                                            variant="outlined"
                                            label={`${policy.event_count || 0} event(s)`}
                                        />
                                    </Box>
                                </CardContent>

                                <Box sx={{ p: 2, pt: 0, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 0.5 }}>
                                    {!policy.is_default && (
                                        <Tooltip title="Set as default">
                                            <IconButton
                                                size="small"
                                                sx={{ color: '#22c55e' }}
                                                onClick={() => handleSetDefault(policy)}
                                            >
                                                <StarBorderIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                    {policy.is_default && (
                                        <Tooltip title="This is the default">
                                            <IconButton size="small" sx={{ color: '#22c55e' }} disabled>
                                                <StarIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                    <Tooltip title="Edit">
                                        <IconButton
                                            size="small"
                                            sx={{ color: '#4f46e5' }}
                                            onClick={() => handleOpenDialog(policy)}
                                        >
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                        <IconButton
                                            size="small"
                                            sx={{ color: '#ef4444' }}
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
                        background: '#ffffff',
                        borderRadius: '16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.12)',
                    },
                }}
            >
                <DialogTitle sx={{ fontWeight: 700, color: '#0f172a' }}>
                    {editing ? 'Edit Policy' : 'New Cancellation Policy'}
                </DialogTitle>

                <DialogContent>
                    {!editing && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Pick a preset to start, then fine-tune the tiers below.
                            <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
                                {Object.entries(PRESETS).map(([key, preset]) => (
                                    <Button
                                        key={key}
                                        size="small"
                                        variant="outlined"
                                        onClick={() => handleApplyPreset(key)}
                                        sx={{ textTransform: 'none' }}
                                    >
                                        {preset.label}
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
                                label="Policy Name *"
                                name="name"
                                value={formData.name}
                                onChange={handleTopField}
                                placeholder="e.g. Standard Cancellation"
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Description"
                                name="description"
                                value={formData.description}
                                onChange={handleTopField}
                                multiline
                                rows={2}
                                placeholder="Shown to organizers. Not visible to customers."
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <Divider sx={{ my: 1 }} />
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a', mb: 1 }}>
                                Refund Tiers
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 2 }}>
                                Tiers are checked top-down. The first one whose hours threshold is met wins.
                                Enter the hours remaining before the event starts.
                            </Typography>
                        </Grid>

                        {formData.rules.refund_tiers.map((tier, index) => (
                            <Grid item xs={12} key={index}>
                                <Paper sx={{ p: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                    <Grid container spacing={2} alignItems="center">
                                        <Grid item xs={12} sm={3}>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                type="number"
                                                label="Hours before"
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
                                                label="Refund %"
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
                                                label="Label (shown to customer)"
                                                value={tier.label || ''}
                                                onChange={(e) =>
                                                    handleTierField(index, 'label', e.target.value)
                                                }
                                                placeholder="e.g. 7+ days before"
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={1} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <IconButton
                                                size="small"
                                                sx={{ color: '#ef4444' }}
                                                onClick={() => handleRemoveTier(index)}
                                                disabled={formData.rules.refund_tiers.length <= 1}
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Grid>
                                    </Grid>
                                    <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mt: 1 }}>
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
                                Add tier
                            </Button>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                type="number"
                                label="Flat Cancellation Fee (₹)"
                                value={formData.rules.cancellation_fee}
                                onChange={(e) => handleRuleField('cancellation_fee', e.target.value)}
                                inputProps={{ min: 0, step: '0.01' }}
                                helperText="Deducted from every refund. 0 for none."
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Customer-facing notes"
                                value={formData.rules.notes || ''}
                                onChange={(e) => handleRuleField('notes', e.target.value)}
                                helperText="Shown on the booking page. Does not affect calculations."
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
                                label="Allow partial cancellation (per-ticket)"
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
                                label="Allow refund after check-in"
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
                                label="Active"
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
                                label="Use as default policy"
                            />
                        </Grid>
                    </Grid>
                </DialogContent>

                <DialogActions sx={{ p: 2, gap: 1 }}>
                    <OutlineButton onClick={handleCloseDialog} disabled={saving}>
                        Cancel
                    </OutlineButton>
                    <PrimaryButton
                        variant="contained"
                        onClick={handleSubmit}
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />}
                    >
                        {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Policy'}
                    </PrimaryButton>
                </DialogActions>
            </Dialog>

            {/* ============ Delete confirmation ============ */}
            <Dialog
                open={deleteDialog.open}
                onClose={() => setDeleteDialog({ open: false, id: null, name: '' })}
            >
                <DialogTitle sx={{ fontWeight: 700 }}>Delete Policy</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        Events using this policy will keep their existing booking snapshots,
                        but new bookings will have no policy until you attach another one.
                    </Alert>
                    <Typography>
                        Are you sure you want to delete <strong>{deleteDialog.name}</strong>?
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <OutlineButton
                        onClick={() => setDeleteDialog({ open: false, id: null, name: '' })}
                    >
                        Cancel
                    </OutlineButton>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleDelete}
                        startIcon={<CancelIcon />}
                        sx={{ textTransform: 'none' }}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default CancellationPolicies;