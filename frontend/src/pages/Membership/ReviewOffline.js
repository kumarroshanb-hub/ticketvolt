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
} from '@mui/icons-material';
import { toast } from 'react-toastify';

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
            toast.error(err.response?.data?.error || 'Failed to load pending requests.');
        } finally {
            setLoading(false);
        }
    }, [orgId]);

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
            toast.warning('Select at least one request.');
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
                if (ok) toast.success(`${ok} request(s) ${dialog.action === 'activate' ? 'activated' : 'rejected'}.`);
                if (fail) toast.warning(`${fail} request(s) could not be processed.`);
            } else {
                await membershipService.reviewOffline(dialog.target, {
                    action: dialog.action,
                    reference: dialog.reference,
                    reason: dialog.reason,
                });
                toast.success(dialog.action === 'activate' ? 'Membership activated.' : 'Request rejected.');
            }
            closeDialog();
            await loadPending();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Review failed.');
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
                <Alert severity="warning">Select an organization first.</Alert>
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
                    <PageTitle>Offline Membership Requests</PageTitle>
                    {!isMobile && (
                        <PageSubtitle>
                            Review cash / offline payments and activate members.
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
                                <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                        </TextField>
                    )}
                    <OutlineButton startIcon={<RefreshIcon />} onClick={loadPending}>
                        Refresh
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            {pendingCount === 0 ? (
                <Alert severity="success" icon={<CheckIcon />}>
                    No pending offline requests. You're all caught up.
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
                                {selectedIds.length} of {pendingCount} selected
                            </Typography>
                            <Box sx={{ flex: 1 }} />
                            <TextField
                                size="small"
                                label="Receipt / reference (optional)"
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
                                Bulk Activate
                            </Button>
                            <Button
                                variant="outlined"
                                color="error"
                                startIcon={<CloseIcon />}
                                disabled={selectedIds.length === 0}
                                onClick={() => openBulk('reject')}
                            >
                                Bulk Reject
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
                                            <Tooltip title="Reference provided by user">
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
                                        Requested {new Date(m.created_at).toLocaleString()}
                                    </Typography>
                                </Box>
                                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                    <PrimaryButton
                                        size="small"
                                        startIcon={<CheckIcon />}
                                        onClick={() => openSingle(m.id, 'activate')}
                                        sx={{ background: C.success, '&:hover': { background: C.successDark } }}
                                    >
                                        Activate
                                    </PrimaryButton>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        color="error"
                                        startIcon={<CloseIcon />}
                                        onClick={() => openSingle(m.id, 'reject')}
                                    >
                                        Reject
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
                    {dialog.action === 'activate' ? 'Activate Membership' : 'Reject Membership'}
                </DialogTitle>
                <DialogContent>
                    <Typography sx={{ mb: 2 }}>
                        {dialog.action === 'activate'
                            ? (dialog.bulk
                                ? `Activate ${selectedIds.length} offline membership(s)?`
                                : 'Activate this offline membership?')
                            : (dialog.bulk
                                ? `Reject ${selectedIds.length} offline membership(s)?`
                                : 'Reject this offline membership?')}
                    </Typography>
                    {dialog.action === 'activate' && (
                        <TextField
                            label="Receipt / reference (optional)"
                            value={dialog.reference}
                            onChange={(e) => setDialog((d) => ({ ...d, reference: e.target.value }))}
                            fullWidth
                            sx={{ mb: 2 }}
                        />
                    )}
                    {dialog.action === 'reject' && (
                        <TextField
                            label="Reason (optional)"
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
                            ? 'The user will be notified their membership is active.'
                            : 'The membership will be marked rejected. The user can reapply later.'}
                    </Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDialog} disabled={submitting}>Cancel</Button>
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
                        {submitting ? <CircularProgress size={18} /> : 'Confirm'}
                    </PrimaryButton>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default ReviewOffline;