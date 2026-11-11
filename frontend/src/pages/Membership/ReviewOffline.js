// frontend/src/pages/Membership/ReviewOffline.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box, Card, CardContent, Grid, Typography, Button, Chip, Checkbox,
    TextField, Divider, Alert, CircularProgress, Stack, Dialog,
    DialogTitle, DialogContent, DialogActions, Tooltip,
    useMediaQuery, useTheme,
} from '@mui/material';
import {
    Refresh as RefreshIcon,
    Check as CheckIcon,
    Close as CloseIcon,
    Receipt as ReceiptIcon,
    UploadFile as UploadIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import membershipService from '../../services/membershipService';
import { useOrg } from '../../context/OrgContext';
import { useSettings } from '../../context/SettingsContext';
import {
    PageContainer, PageHeader, PageTitle, PageSubtitle,
    PageHeaderLeft, PageHeaderRight, PrimaryButton, OutlineButton,
    LoadingWrapper,
} from '../../components/Common';
import { theme as appTheme } from '../../theme/tokens';

const C = appTheme.colors;

const ReviewOffline = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { organizations, currentOrgId } = useOrg();
    const { formatMoney } = useSettings();

    const [orgId, setOrgId] = useState(currentOrgId || organizations[0]?.id || null);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [reference, setReference] = useState('');

    const [dialog, setDialog] = useState({
        open: false,
        action: 'activate',
        target: null,          // single id when non-bulk
        bulk: false,
        reference: '',
        reason: '',
    });
    const [submitting, setSubmitting] = useState(false);

    // ------------------------------------------------------------------
    // Load
    // ------------------------------------------------------------------
    const loadPending = useCallback(async () => {
        if (!orgId) {
            setPending([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await membershipService.listPendingOffline({ organizationId: orgId });
            setPending(data.results || []);
            setSelectedIds([]);
        } catch (err) {
            console.error('Failed to load pending offline memberships:', err);
            toast.error(err.response?.data?.error || t('reviewOffline.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [orgId, t]);

    useEffect(() => { loadPending(); }, [loadPending]);

    const pendingCount = pending.length;
    const allSelected = pendingCount > 0 && selectedIds.length === pendingCount;
    const someSelected = selectedIds.length > 0 && !allSelected;

    const toggleOne = (id) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const toggleAll = () => {
        setSelectedIds(allSelected ? [] : pending.map((m) => m.id));
    };

    // ------------------------------------------------------------------
    // Confirm dialog helpers
    // ------------------------------------------------------------------
    const openSingle = (target, action) => {
        setDialog({
            open: true,
            action,
            target,
            bulk: false,
            reference: '',
            reason: '',
        });
    };

    const openBulk = (action) => {
        if (selectedIds.length === 0) {
            toast.warning(t('reviewOffline.selectAtLeastOne'));
            return;
        }
        setDialog({
            open: true,
            action,
            target: null,
            bulk: true,
            reference: '',
            reason: '',
        });
    };

    const closeDialog = () => {
        if (submitting) return;
        setDialog((d) => ({ ...d, open: false }));
    };

    const handleConfirm = async () => {
        setSubmitting(true);
        try {
            if (dialog.bulk) {
                const res = await membershipService.bulkReviewOffline({
                    action: dialog.action,
                    membershipIds: selectedIds,
                    reference: dialog.reference,
                    reason: dialog.reason,
                });
                const ok = res.succeeded || 0;
                const fail = res.failed || 0;
                if (ok) {
                    toast.success(t(
                        dialog.action === 'activate'
                            ? 'reviewOffline.bulkActivated'
                            : 'reviewOffline.bulkRejected',
                        { count: ok },
                    ));
                }
                if (fail) toast.warning(t('reviewOffline.bulkFailed', { count: fail }));
            } else {
                await membershipService.reviewOffline(dialog.target, {
                    action: dialog.action,
                    reference: dialog.reference,
                    reason: dialog.reason,
                });
                toast.success(
                    dialog.action === 'activate'
                        ? t('reviewOffline.activated')
                        : t('reviewOffline.rejected'),
                );
            }
            closeDialog();
            await loadPending();
        } catch (err) {
            toast.error(err.response?.data?.error || t('reviewOffline.reviewFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------
    if (!orgId) {
        return (
            <PageContainer>
                <Alert severity="warning">{t('reviewOffline.selectOrg')}</Alert>
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
                    <PageTitle>{t('reviewOffline.title')}</PageTitle>
                    {!isMobile && (
                        <PageSubtitle>
                            {t('reviewOffline.subtitle')}
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
                                <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                        </TextField>
                    )}
                    <OutlineButton
                        startIcon={<UploadIcon />}
                        onClick={() => navigate('/app/membership/bulk-upload')}
                    >
                        {t('membership.bulkAddMembers')}
                    </OutlineButton>
                    <OutlineButton startIcon={<RefreshIcon />} onClick={loadPending}>
                        {t('common.refresh')}
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            {pendingCount === 0 ? (
                <Alert severity="success" icon={<CheckIcon />}>
                    {t('reviewOffline.noPending')}
                </Alert>
            ) : (
                <Card sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
                    <CardContent sx={{ p: isMobile ? 1.5 : 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                            <Checkbox
                                checked={allSelected}
                                indeterminate={someSelected}
                                onChange={toggleAll}
                            />
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {t('reviewOffline.selectedCount', {
                                    selected: selectedIds.length,
                                    total: pendingCount,
                                })}
                            </Typography>
                            <Box sx={{ flex: 1 }} />
                            <TextField
                                size="small"
                                label={t('reviewOffline.receiptReference')}
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                                sx={{ minWidth: 200 }}
                            />
                            <Button
                                variant="contained"
                                color="success"
                                startIcon={<CheckIcon />}
                                disabled={selectedIds.length === 0}
                                onClick={() => {
                                    openBulk('activate');
                                }}
                            >
                                {t('reviewOffline.bulkActivate')}
                            </Button>
                            <Button
                                variant="outlined"
                                color="error"
                                startIcon={<CloseIcon />}
                                disabled={selectedIds.length === 0}
                                onClick={() => openBulk('reject')}
                            >
                                {t('reviewOffline.bulkReject')}
                            </Button>
                        </Box>

                        <Divider sx={{ mb: 1 }} />

                        {pending.map((m) => (
                            <Box
                                key={m.id}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 1,
                                    py: 1.5,
                                    borderBottom: `1px solid ${C.bgInput}`,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <Checkbox
                                    checked={selectedIds.includes(m.id)}
                                    onChange={() => toggleOne(m.id)}
                                    sx={{ mt: -0.5 }}
                                />
                                <Box sx={{ flex: 1, minWidth: 240 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                        {m.user_name || m.user_email}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: C.textMuted }}>
                                        {m.user_email}
                                    </Typography>
                                    <Box sx={{ mt: 0.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                        <Chip size="small" label={m.tier?.name || '—'} />
                                        <Chip
                                            size="small"
                                            label={`${m.payment_method === 'cash' ? 'CASH' : 'OFFLINE'} · ${formatMoney(m.tier?.price || 0)}`}
                                            variant="outlined"
                                            color="warning"
                                        />
                                        {m.offline_reference && (
                                            <Tooltip title={t('reviewOffline.referenceProvided')}>
                                                <Chip
                                                    size="small"
                                                    icon={<ReceiptIcon />}
                                                    label={m.offline_reference}
                                                    variant="outlined"
                                                />
                                            </Tooltip>
                                        )}
                                    </Box>
                                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: C.textMuted }}>
                                        {t('reviewOffline.requested', {
                                            date: new Date(m.created_at).toLocaleString(),
                                        })}
                                    </Typography>
                                </Box>
                                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                    <PrimaryButton
                                        size="small"
                                        startIcon={<CheckIcon />}
                                        onClick={() => openSingle(m.id, 'activate')}
                                        sx={{ background: C.success, '&:hover': { background: C.successDark } }}
                                    >
                                        {t('reviewOffline.activate')}
                                    </PrimaryButton>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        color="error"
                                        startIcon={<CloseIcon />}
                                        onClick={() => openSingle(m.id, 'reject')}
                                    >
                                        {t('reviewOffline.reject')}
                                    </Button>
                                </Stack>
                            </Box>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* ---- Confirm dialog ---- */}
            <Dialog open={dialog.open} onClose={closeDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {dialog.action === 'activate'
                        ? t('reviewOffline.activateTitle')
                        : t('reviewOffline.rejectTitle')}
                </DialogTitle>
                <DialogContent>
                    <Typography sx={{ mb: 2 }}>
                        {dialog.action === 'activate'
                            ? (dialog.bulk
                                ? t('reviewOffline.activateBulk', { count: selectedIds.length })
                                : t('reviewOffline.activateSingle'))
                            : (dialog.bulk
                                ? t('reviewOffline.rejectBulk', { count: selectedIds.length })
                                : t('reviewOffline.rejectSingle'))}
                    </Typography>
                    {dialog.action === 'activate' && (
                        <TextField
                            label={t('reviewOffline.receiptReference')}
                            value={dialog.reference}
                            onChange={(e) => setDialog((d) => ({ ...d, reference: e.target.value }))}
                            fullWidth
                            sx={{ mb: 2 }}
                        />
                    )}
                    {dialog.action === 'reject' && (
                        <TextField
                            label={t('reviewOffline.reason')}
                            value={dialog.reason}
                            onChange={(e) => setDialog((d) => ({ ...d, reason: e.target.value }))}
                            multiline
                            rows={2}
                            fullWidth
                            sx={{ mb: 2 }}
                        />
                    )}
                    <Alert severity={dialog.action === 'activate' ? 'success' : 'warning'}>
                        {dialog.action === 'activate'
                            ? t('reviewOffline.activateNotice')
                            : t('reviewOffline.rejectNotice')}
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDialog} disabled={submitting}>{t('common.cancel')}</Button>
                    <PrimaryButton
                        onClick={handleConfirm}
                        disabled={submitting}
                        sx={{
                            background: dialog.action === 'activate' ? C.success : C.error,
                            '&:hover': {
                                background: dialog.action === 'activate' ? C.successDark : C.errorDark,
                            },
                        }}
                    >
                        {submitting ? <CircularProgress size={18} /> : t('common.confirm')}
                    </PrimaryButton>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default ReviewOffline;