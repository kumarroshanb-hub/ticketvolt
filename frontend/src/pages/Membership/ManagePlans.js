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
import { useTranslation } from 'react-i18next';

import membershipService from '../../services/membershipService';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { useSettings } from '../../context/SettingsContext';
import {
    PageContainer, PageHeader, PageTitle, PageSubtitle,
    PageHeaderLeft, PageHeaderRight, PrimaryButton, OutlineButton,
    LoadingWrapper,
} from '../../components/Common';
import OrganizationAdminTabs from '../Organizations/OrganizationAdminTabs';
import { theme as appTheme } from '../../theme/tokens';
import { ROLES } from '../../constants';

const C = appTheme.colors;

const BILLING_PERIODS = [
    { value: 'one_time' },
    { value: 'monthly' },
    { value: 'quarterly' },
    { value: 'yearly' },
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
    const { t } = useTranslation();
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
            toast.error(err.response?.data?.detail || t('managePlans.loadFailed'));
            setTiers([]);
        } finally {
            setLoading(false);
        }
    }, [orgId, t]);

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
            setFormError(t('managePlans.nameRequired'));
            return;
        }
        if (Number(form.price) < 0) {
            setFormError(t('managePlans.priceNegative'));
            return;
        }
        if (Number(form.max_members) < 1) {
            setFormError(t('managePlans.maxMembersMin'));
            return;
        }

        let benefits = {};
        if (form.benefits_text.trim()) {
            try {
                benefits = JSON.parse(form.benefits_text);
                if (typeof benefits !== 'object' || Array.isArray(benefits) || benefits === null) {
                    throw new Error(t('managePlans.benefitsMustBeObject'));
                }
            } catch (err) {
                setFormError(t('managePlans.benefitsJsonError', { message: err.message }));
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
                toast.success(t('managePlans.planUpdated'));
            } else {
                await membershipService.createTier(payload);
                toast.success(t('managePlans.planCreated'));
            }
            closeDialog();
            await loadTiers();
        } catch (err) {
            const data = err.response?.data;
            const msg =
                (data && typeof data === 'object' && Object.values(data).flat?.()[0]) ||
                data?.detail ||
                data?.error ||
                t('managePlans.saveFailed');
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
            toast.success(
                flag === 'is_active'
                    ? t('managePlans.activeToggled')
                    : t('managePlans.publicToggled'),
            );
            await loadTiers();
        } catch (err) {
            toast.error(err.response?.data?.error || t('managePlans.updateFailed'));
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
            toast.success(t('managePlans.planRemoved'));
            setDeleteTarget(null);
            await loadTiers();
        } catch (err) {
            toast.error(err.response?.data?.error || t('managePlans.deleteFailed'));
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
                    {t('managePlans.selectOrgFirst')}
                </Alert>
            </PageContainer>
        );
    }
    if (!canManage) {
        return (
            <PageContainer>
                <Alert severity="error">
                    {t('managePlans.ownerOnly')}
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
                    <PageTitle>{t('managePlans.title')}</PageTitle>
                    {!isMobile && (
                        <PageSubtitle>
                            {t('managePlans.subtitle')}
                        </PageSubtitle>
                    )}
                </PageHeaderLeft>
                <PageHeaderRight>
                    {organizations.length > 1 && (
                        <TextField
                            select
                            size="small"
                            label={t('bulkUpload.organization')}
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
                        {t('common.refresh')}
                    </OutlineButton>
                    <PrimaryButton startIcon={<AddIcon />} onClick={openCreate}>
                        {t('managePlans.newPlan')}
                    </PrimaryButton>
                </PageHeaderRight>
            </PageHeader>

            <OrganizationAdminTabs />

            {tiers.length === 0 ? (
                <Alert severity="info">
                    {t('managePlans.noPlans')}
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
                                            label={tier.is_active ? t('managePlans.statusActive') : t('managePlans.statusPaused')}
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
                                        {t('managePlans.billingCovers', {
                                            period: t(`membership.billingPeriods.${tier.billing_period}`, {
                                                defaultValue: tier.billing_period.replace('_', ' '),
                                            }),
                                            count: tier.max_members,
                                        })}
                                    </Typography>

                                    <Divider sx={{ my: 2 }} />

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {tier.is_public
                                                ? <PublicIcon fontSize="small" sx={{ color: C.success }} />
                                                : <HiddenIcon fontSize="small" sx={{ color: C.textMuted }} />}
                                            <Typography variant="caption" sx={{ color: C.textSecondary }}>
                                                {tier.is_public ? t('managePlans.visiblePublic') : t('managePlans.hiddenFromBuyers')}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <PeopleIcon fontSize="small" sx={{ color: C.textMuted }} />
                                            <Typography variant="caption" sx={{ color: C.textSecondary }}>
                                                {t('managePlans.benefitsCount', {
                                                    count: Object.keys(tier.benefits || {}).length,
                                                })}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </CardContent>

                                <Box sx={{ p: 2, pt: 0, display: 'flex', gap: 0.5, borderTop: `1px solid ${C.bgInput}` }}>
                                    <Tooltip title={t('common.edit')}>
                                        <IconButton size="small" sx={{ color: C.primary }} onClick={() => openEdit(tier)}>
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title={tier.is_active ? t('managePlans.pauseTooltip') : t('managePlans.reactivateTooltip')}>
                                        <IconButton
                                            size="small"
                                            sx={{ color: tier.is_active ? C.warning : C.success }}
                                            onClick={() => toggleFlag(tier, 'is_active')}
                                        >
                                            {tier.is_active ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title={tier.is_public ? t('managePlans.hideTooltip') : t('managePlans.publishTooltip')}>
                                        <IconButton
                                            size="small"
                                            sx={{ color: C.textSecondary }}
                                            onClick={() => toggleFlag(tier, 'is_public')}
                                        >
                                            {tier.is_public ? <HiddenIcon fontSize="small" /> : <PublicIcon fontSize="small" />}
                                        </IconButton>
                                    </Tooltip>
                                    <Box sx={{ flex: 1 }} />
                                    <Tooltip title={t('common.delete')}>
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
                <DialogTitle>{editingTier ? t('managePlans.editPlan') : t('managePlans.newPlan')}</DialogTitle>
                <DialogContent>
                    {formError && (
                        <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{formError}</Alert>
                    )}
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField
                            label={t('managePlans.planName')}
                            value={form.name}
                            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                            required
                            fullWidth
                        />
                        <TextField
                            label={t('managePlans.description')}
                            value={form.description}
                            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                            multiline
                            rows={2}
                            fullWidth
                        />
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label={t('managePlans.price')}
                                type="number"
                                value={form.price}
                                onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                                inputProps={{ min: 0, step: '0.01' }}
                                fullWidth
                            />
                            <TextField
                                select
                                label={t('managePlans.billingPeriod')}
                                value={form.billing_period}
                                onChange={(e) => setForm((p) => ({ ...p, billing_period: e.target.value }))}
                                fullWidth
                            >
                                {BILLING_PERIODS.map((b) => (
                                    <MenuItem key={b.value} value={b.value}>
                                        {t(`membership.billingPeriods.${b.value}`)}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Box>
                        <TextField
                            label={t('managePlans.maxMembers')}
                            type="number"
                            value={form.max_members}
                            onChange={(e) => setForm((p) => ({ ...p, max_members: e.target.value }))}
                            inputProps={{ min: 1, max: 100 }}
                            helperText={t('managePlans.maxMembersHelper')}
                            fullWidth
                        />
                        <TextField
                            label={t('managePlans.benefitsJson')}
                            value={form.benefits_text}
                            onChange={(e) => setForm((p) => ({ ...p, benefits_text: e.target.value }))}
                            multiline
                            rows={4}
                            placeholder='{"member_discount_pct": 15, "members_only_events": true}'
                            helperText={t('managePlans.benefitsHelper')}
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
                                label={t('managePlans.active')}
                            />
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={form.is_public}
                                        onChange={(e) => setForm((p) => ({ ...p, is_public: e.target.checked }))}
                                    />
                                }
                                label={t('managePlans.publiclyVisible')}
                            />
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDialog} disabled={saving}>{t('common.cancel')}</Button>
                    <PrimaryButton onClick={handleSubmit} disabled={saving}>
                        {saving ? <CircularProgress size={20} /> : (editingTier ? t('settings.saveChanges') : t('managePlans.createPlan'))}
                    </PrimaryButton>
                </DialogActions>
            </Dialog>

            {/* ---- Delete dialog ---- */}
            <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('managePlans.deleteTitle')}</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        {t('managePlans.deleteWarning')}
                    </Alert>
                    <Typography>
                        {t('managePlans.deleteConfirm', { name: deleteTarget?.name })}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={handleDelete}
                        disabled={deleting}
                    >
                        {deleting ? <CircularProgress size={18} /> : t('common.delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default ManagePlans;