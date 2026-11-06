// frontend/src/pages/Membership/ManagePlans.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Button, Chip, Divider,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    MenuItem, Alert, CircularProgress, Stack, IconButton, Tooltip,
    FormControlLabel, Switch, useMediaQuery, useTheme,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Refresh as RefreshIcon,
    PauseCircle as PauseIcon,
    PlayCircle as PlayIcon,
    Public as PublicIcon,
    VisibilityOff as HiddenIcon,
    People as PeopleIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';

import membershipService from '../../services/membershipService';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { useSettings } from '../../context/SettingsContext';
import {
    PageContainer, PageHeader, PageTitle, PageSubtitle,
    PageHeaderLeft, PageHeaderRight, PrimaryButton, OutlineButton,
    LoadingWrapper,
} from '../../components/Common';
import { theme as appTheme } from '../../theme/tokens';
import { ROLES } from '../../constants';

const C = appTheme.colors;

const BILLING_PERIODS = [
    { value: 'one_time',  label: 'One-time' },
    { value: 'monthly',   label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'yearly',    label: 'Yearly' },
];

const EMPTY_FORM = {
    name: '',
    description: '',
    price: 0,
    billing_period: 'yearly',
    max_members: 1,
    benefits_text: '',       // free-form JSON string; parsed on submit
    is_active: true,
    is_public: true,
};

const ManagePlans = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const { user } = useAuth();
    const { organizations, currentOrgId, isPlatformAdmin } = useOrg();
    const { formatMoney } = useSettings();

    // Which organization is being managed.
    const [orgId, setOrgId] = useState(currentOrgId || organizations[0]?.id || null);

    // Owner/admin check — matches backend can_manage_org().
    const canManage = useMemo(() => {
        if (isPlatformAdmin) return true;
        const org = organizations.find((o) => String(o.id) === String(orgId));
        return org && ['owner', 'admin'].includes(org.role);
    }, [isPlatformAdmin, organizations, orgId]);

    const [loading, setLoading] = useState(true);
    const [tiers, setTiers] = useState([]);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTier, setEditingTier] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    // Delete confirm
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // ------------------------------------------------------------------
    // Load
    // ------------------------------------------------------------------
    const loadTiers = useCallback(async () => {
        if (!orgId) {
            setTiers([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const list = await membershipService.listOrgTiers(orgId);
            setTiers(list);
        } catch (err) {
            console.error('Failed to load tiers:', err);
            toast.error(err.response?.data?.detail || 'Failed to load plans');
            setTiers([]);
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => { loadTiers(); }, [loadTiers]);

    // ------------------------------------------------------------------
    // Dialog open/close
    // ------------------------------------------------------------------
    const openCreate = () => {
        setEditingTier(null);
        setForm(EMPTY_FORM);
        setFormError('');
        setDialogOpen(true);
    };

    const openEdit = (tier) => {
        setEditingTier(tier);
        setForm({
            name: tier.name || '',
            description: tier.description || '',
            price: Number(tier.price) || 0,
            billing_period: tier.billing_period || 'yearly',
            max_members: tier.max_members || 1,
            benefits_text: tier.benefits && Object.keys(tier.benefits).length
                ? JSON.stringify(tier.benefits, null, 2)
                : '',
            is_active: !!tier.is_active,
            is_public: !!tier.is_public,
        });
        setFormError('');
        setDialogOpen(true);
    };

    const closeDialog = () => {
        if (saving) return;
        setDialogOpen(false);
        setEditingTier(null);
        setForm(EMPTY_FORM);
        setFormError('');
    };

    // ------------------------------------------------------------------
    // Submit
    // ------------------------------------------------------------------
    const handleSubmit = async () => {
        setFormError('');

        if (!form.name.trim()) {
            setFormError('Name is required.');
            return;
        }
        if (Number(form.price) < 0) {
            setFormError('Price cannot be negative.');
            return;
        }
        if (Number(form.max_members) < 1) {
            setFormError('Max members must be at least 1 (the primary member).');
            return;
        }

        let benefits = {};
        if (form.benefits_text.trim()) {
            try {
                benefits = JSON.parse(form.benefits_text);
                if (typeof benefits !== 'object' || Array.isArray(benefits) || benefits === null) {
                    throw new Error('Benefits must be a JSON object.');
                }
            } catch (err) {
                setFormError(`Benefits JSON error: ${err.message}`);
                return;
            }
        }

        const payload = {
            organization_id: orgId,
            name: form.name.trim(),
            description: form.description || '',
            price: Number(form.price) || 0,
            billing_period: form.billing_period,
            max_members: Number(form.max_members) || 1,
            benefits,
            is_active: !!form.is_active,
            is_public: !!form.is_public,
        };

        setSaving(true);
        try {
            if (editingTier) {
                await membershipService.updateTier(editingTier.id, payload);
                toast.success('Plan updated.');
            } else {
                await membershipService.createTier(payload);
                toast.success('Plan created.');
            }
            closeDialog();
            await loadTiers();
        } catch (err) {
            const data = err.response?.data;
            const msg =
                (data && typeof data === 'object' && Object.values(data).flat?.()[0]) ||
                data?.detail ||
                data?.error ||
                'Failed to save plan.';
            setFormError(Array.isArray(msg) ? msg[0] : String(msg));
        } finally {
            setSaving(false);
        }
    };

    // ------------------------------------------------------------------
    // Toggle active/public (single-click)
    // ------------------------------------------------------------------
    const toggleFlag = async (tier, flag) => {
        try {
            await membershipService.updateTier(tier.id, { [flag]: !tier[flag] });
            toast.success(`${flag === 'is_active' ? 'Active' : 'Public'} toggled.`);
            await loadTiers();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update plan.');
        }
    };

    // ------------------------------------------------------------------
    // Delete / soft-delete
    // ------------------------------------------------------------------
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await membershipService.deleteTier(deleteTarget.id);
            toast.success('Plan removed.');
            setDeleteTarget(null);
            await loadTiers();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to delete plan.');
        } finally {
            setDeleting(false);
        }
    };

    // ------------------------------------------------------------------
    // Guard: no org, no manager role
    // ------------------------------------------------------------------
    if (!orgId) {
        return (
            <PageContainer>
                <Alert severity="warning">
                    Select an organization to manage its membership plans.
                </Alert>
            </PageContainer>
        );
    }
    if (!canManage) {
        return (
            <PageContainer>
                <Alert severity="error">
                    Only the organization Owner or Admin can manage plans.
                </Alert>
            </PageContainer>
        );
    }

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: C.primary }} />
            </LoadingWrapper>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>Membership Plans</PageTitle>
                    {!isMobile && (
                        <PageSubtitle>
                            Create and manage the plans your organization sells.
                        </PageSubtitle>
                    )}
                </PageHeaderLeft>
                <PageHeaderRight>
                    {organizations.length > 1 && (
                        <TextField
                            select
                            size="small"
                            label="Organization"
                            value={orgId}
                            onChange={(e) => setOrgId(e.target.value)}
                            sx={{ minWidth: 200 }}
                        >
                            {organizations.map((o) => (
                                <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
                            ))}
                        </TextField>
                    )}
                    <OutlineButton startIcon={<RefreshIcon />} onClick={loadTiers}>
                        Refresh
                    </OutlineButton>
                    <PrimaryButton startIcon={<AddIcon />} onClick={openCreate}>
                        New Plan
                    </PrimaryButton>
                </PageHeaderRight>
            </PageHeader>

            {tiers.length === 0 ? (
                <Alert severity="info">
                    No plans yet. Create your first plan to start selling memberships.
                </Alert>
            ) : (
                <Grid container spacing={isMobile ? 2 : 3}>
                    {tiers.map((tier) => (
                        <Grid item xs={12} md={6} lg={4} key={tier.id}>
                            <Card sx={{
                                borderRadius: 2,
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                border: `1px solid ${tier.is_active ? C.borderLight : C.warning + '4D'}`,
                                opacity: tier.is_active ? 1 : 0.85,
                            }}>
                                <CardContent sx={{ flex: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                                        <Typography variant="h6" sx={{ fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {tier.name}
                                        </Typography>
                                        <Chip
                                            size="small"
                                            label={tier.is_active ? 'ACTIVE' : 'PAUSED'}
                                            color={tier.is_active ? 'success' : 'default'}
                                        />
                                    </Box>

                                    {tier.description && (
                                        <Typography variant="body2" sx={{ color: C.textSecondary, mb: 2 }}>
                                            {tier.description}
                                        </Typography>
                                    )}

                                    <Typography variant="h4" sx={{ fontWeight: 800, color: C.primary }}>
                                        {formatMoney(tier.price)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: C.textMuted, display: 'block', mb: 2 }}>
                                        {tier.billing_period.replace('_', ' ')} · covers {tier.max_members} {tier.max_members === 1 ? 'person' : 'people'}
                                    </Typography>

                                    <Divider sx={{ my: 2 }} />

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {tier.is_public
                                                ? <PublicIcon fontSize="small" sx={{ color: C.success }} />
                                                : <HiddenIcon fontSize="small" sx={{ color: C.textMuted }} />}
                                            <Typography variant="caption" sx={{ color: C.textSecondary }}>
                                                {tier.is_public ? 'Visible on public plans page' : 'Hidden from buyers'}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <PeopleIcon fontSize="small" sx={{ color: C.textMuted }} />
                                            <Typography variant="caption" sx={{ color: C.textSecondary }}>
                                                {Object.keys(tier.benefits || {}).length} benefit(s)
                                            </Typography>
                                        </Box>
                                    </Box>
                                </CardContent>

                                <Box sx={{ p: 2, pt: 0, display: 'flex', gap: 0.5, borderTop: `1px solid ${C.bgInput}` }}>
                                    <Tooltip title="Edit">
                                        <IconButton size="small" sx={{ color: C.primary }} onClick={() => openEdit(tier)}>
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title={tier.is_active ? 'Pause (hide from new buyers)' : 'Reactivate'}>
                                        <IconButton
                                            size="small"
                                            sx={{ color: tier.is_active ? C.warning : C.success }}
                                            onClick={() => toggleFlag(tier, 'is_active')}
                                        >
                                            {tier.is_active ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title={tier.is_public ? 'Hide from public' : 'Publish publicly'}>
                                        <IconButton
                                            size="small"
                                            sx={{ color: C.textSecondary }}
                                            onClick={() => toggleFlag(tier, 'is_public')}
                                        >
                                            {tier.is_public ? <HiddenIcon fontSize="small" /> : <PublicIcon fontSize="small" />}
                                        </IconButton>
                                    </Tooltip>
                                    <Box sx={{ flex: 1 }} />
                                    <Tooltip title="Delete">
                                        <IconButton size="small" sx={{ color: C.error }} onClick={() => setDeleteTarget(tier)}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* ---- Create / Edit dialog ---- */}
            <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
                <DialogTitle>{editingTier ? 'Edit Plan' : 'New Plan'}</DialogTitle>
                <DialogContent>
                    {formError && (
                        <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{formError}</Alert>
                    )}
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField
                            label="Plan name"
                            value={form.name}
                            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                            required
                            fullWidth
                        />
                        <TextField
                            label="Description"
                            value={form.description}
                            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                            multiline
                            rows={2}
                            fullWidth
                        />
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Price"
                                type="number"
                                value={form.price}
                                onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                                inputProps={{ min: 0, step: '0.01' }}
                                fullWidth
                            />
                            <TextField
                                select
                                label="Billing period"
                                value={form.billing_period}
                                onChange={(e) => setForm((p) => ({ ...p, billing_period: e.target.value }))}
                                fullWidth
                            >
                                {BILLING_PERIODS.map((b) => (
                                    <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>
                                ))}
                            </TextField>
                        </Box>
                        <TextField
                            label="Max members (incl. primary)"
                            type="number"
                            value={form.max_members}
                            onChange={(e) => setForm((p) => ({ ...p, max_members: e.target.value }))}
                            inputProps={{ min: 1, max: 100 }}
                            helperText="1 = primary only. 5 = primary + up to 4 dependents."
                            fullWidth
                        />
                        <TextField
                            label="Benefits (JSON, optional)"
                            value={form.benefits_text}
                            onChange={(e) => setForm((p) => ({ ...p, benefits_text: e.target.value }))}
                            multiline
                            rows={4}
                            placeholder='{"member_discount_pct": 15, "members_only_events": true}'
                            helperText="Structured perks granted to members on this plan."
                            inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
                            fullWidth
                        />
                        <Box sx={{ display: 'flex', gap: 3 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={form.is_active}
                                        onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                                    />
                                }
                                label="Active"
                            />
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={form.is_public}
                                        onChange={(e) => setForm((p) => ({ ...p, is_public: e.target.checked }))}
                                    />
                                }
                                label="Publicly visible"
                            />
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDialog} disabled={saving}>Cancel</Button>
                    <PrimaryButton onClick={handleSubmit} disabled={saving}>
                        {saving ? <CircularProgress size={20} /> : (editingTier ? 'Save Changes' : 'Create Plan')}
                    </PrimaryButton>
                </DialogActions>
            </Dialog>

            {/* ---- Delete dialog ---- */}
            <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Delete Plan</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        Plans with active members will be <strong>paused</strong> rather than
                        deleted, so existing members keep their benefits until expiry.
                    </Alert>
                    <Typography>
                        Delete <strong>{deleteTarget?.name}</strong>?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
                        Cancel
                    </Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={handleDelete}
                        disabled={deleting}
                    >
                        {deleting ? <CircularProgress size={18} /> : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default ManagePlans;