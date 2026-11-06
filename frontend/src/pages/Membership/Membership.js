// frontend/src/pages/Membership/Membership.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
    Box, Grid, Card, CardContent, Typography, Button, Chip, Divider,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Alert, CircularProgress, Stack, IconButton,
    Tooltip, useMediaQuery, useTheme,
} from '@mui/material';
import ReceiptIcon from '@mui/icons-material/Receipt';
import {
    Add as AddIcon,
    Refresh as RefreshIcon,
    PersonAdd as PersonAddIcon,
    Delete as DeleteIcon,
    Star as StarIcon,
    WorkspacePremium as BadgeIcon,
    CheckCircle as CheckCircleIcon,
    Login as PromoteIcon,
} from '@mui/icons-material';

import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
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

const C = appTheme.colors;
const F = appTheme.fonts;

const RELATIONSHIPS = [
    { value: 'spouse', label: 'Spouse' },
    { value: 'child', label: 'Child' },
    { value: 'parent', label: 'Parent' },
    { value: 'sibling', label: 'Sibling' },
    { value: 'other', label: 'Other' },
];

const EMPTY_DEP = {
    full_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    relationship: 'other',
};

const Membership = () => {
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { user } = useAuth();
    const { currentOrgId, organizations } = useOrg();
    const { formatMoney } = useSettings();

    const [loading, setLoading] = useState(true);
    const [tiers, setTiers] = useState([]);
    const [myMemberships, setMyMemberships] = useState([]);

    // Checkout dialog
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [checkoutTier, setCheckoutTier] = useState(null);
    const [processing, setProcessing] = useState(false);

    // Dependent dialog
    const [depOpen, setDepOpen] = useState(false);
    const [depTarget, setDepTarget] = useState(null);
    const [depForm, setDepForm] = useState(EMPTY_DEP);
    const [depSaving, setDepSaving] = useState(false);

    // --- Load ---

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [tiersList, mineList] = await Promise.all([
                membershipService.listTiers({ organizationId: currentOrgId || undefined }),
                membershipService.myMemberships(),
            ]);
            setTiers(tiersList);
            setMyMemberships(mineList);
        } catch (err) {
            console.error('Membership load failed:', err);
            toast.error(err.response?.data?.error || 'Failed to load memberships');
        } finally {
            setLoading(false);
        }
    }, [currentOrgId]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // --- Derived: which tiers are available to purchase? ---
    const activeByOrg = useMemo(() => {
        const map = {};
        for (const m of myMemberships) {
            if (
                m.is_active
                || m.status === 'pending_offline'
                || m.status === 'pending'
            ) {
                map[m.organization] = m;
            }
        }
        return map;
    }, [myMemberships]);

    const purchasableTiers = useMemo(() => {
        return tiers.filter((t) => t.is_active && t.is_public && !activeByOrg[t.organization]);
    }, [tiers, activeByOrg]);

    // --- Checkout flow ---

    const openCheckout = (tier) => {
        setCheckoutTier(tier);
        setCheckoutOpen(true);
    };

    const closeCheckout = () => {
        if (processing) return;
        setCheckoutOpen(false);
        setCheckoutTier(null);
    };

    const startFreeActivation = async (tier) => {
        setProcessing(true);
        try {
            const result = await membershipService.createCheckout({ tierId: tier.id });
            if (result.status === 'active') {
                toast.success('Membership activated!');
                setCheckoutOpen(false);
                setCheckoutTier(null);
                await loadAll();
                return;
            }
            toast.error('Unexpected response from server.');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not activate membership.');
        } finally {
            setProcessing(false);
        }
    };
    
    const startOfflineRequest = async (tier) => {
        setProcessing(true);
        try {
            const result = await membershipService.requestOfflineMembership({
                tierId: tier.id,
                method: 'cash',
            });
            toast.success(result.message || 'Request submitted.');
            setCheckoutOpen(false);
            setCheckoutTier(null);
            await loadAll();  // refresh my memberships (will show "pending")
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not submit request.');
        } finally {
            setProcessing(false);
        }
    };

    const startRazorpayCheckout = async (tier) => {
        setProcessing(true);
        try {
            const order = await membershipService.createCheckout({
                tierId: tier.id,
                gateway: 'razorpay',
            });

            if (!window.Razorpay) {
                toast.error('Razorpay SDK not loaded. Please refresh and try again.');
                return;
            }

            const rzp = new window.Razorpay({
                ...order.client,
                handler: async (response) => {
                    try {
                        await membershipService.verifyCheckout({
                            membershipPaymentId: order.membership_payment_id,
                            params: response,
                        });
                        toast.success('Membership activated!');
                        setCheckoutOpen(false);
                        setCheckoutTier(null);
                        await loadAll();
                    } catch (err) {
                        toast.error(err.response?.data?.error || 'Payment verification failed.');
                    }
                },
                modal: {
                    ondismiss: () => {
                        setProcessing(false);
                        toast.info('Checkout cancelled.');
                    },
                },
            });
            rzp.open();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not start checkout.');
        } finally {
            setProcessing(false);
        }
    };

    const startStripeCheckout = async (tier) => {
        setProcessing(true);
        try {
            const order = await membershipService.createCheckout({
                tierId: tier.id,
                gateway: 'stripe',
            });
            // Stripe uses a hosted payment page — redirect with the client_secret.
            // In your real Stripe setup, you'd redirect to a dedicated page
            // that uses Stripe.js Elements with order.client.client_secret.
            // For v1, we surface the secret so the caller can drive their
            // existing Stripe Elements page.
            toast.info('Redirecting to Stripe…');
            window.location.href = `/app/membership/stripe-checkout?mp=${order.membership_payment_id}`;
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not start Stripe checkout.');
        } finally {
            setProcessing(false);
        }
    };

    // --- Dependent management ---

    const openAddDependent = (membership) => {
        setDepTarget(membership);
        setDepForm(EMPTY_DEP);
        setDepOpen(true);
    };

    const closeDepDialog = () => {
        if (depSaving) return;
        setDepOpen(false);
        setDepTarget(null);
    };

    const handleAddDependent = async () => {
        if (!depForm.full_name.trim()) {
            toast.error('Full name is required.');
            return;
        }
        setDepSaving(true);
        try {
            await membershipService.addDependent(depTarget.id, {
                ...depForm,
                date_of_birth: depForm.date_of_birth || null,
            });
            toast.success('Family member added.');
            closeDepDialog();
            await loadAll();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not add dependent.');
        } finally {
            setDepSaving(false);
        }
    };

    const handleRemoveDependent = async (membershipId, depId, name) => {
        if (!window.confirm(`Remove ${name} from your membership?`)) return;
        try {
            await membershipService.removeDependent(membershipId, depId);
            toast.success('Family member removed.');
            await loadAll();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not remove dependent.');
        }
    };

    const handlePromoteDependent = async (membershipId, depId) => {
        if (!window.confirm('Give this family member their own login?')) return;
        try {
            const res = await membershipService.promoteDependent(membershipId, depId);
            toast.success(res.message || 'Login link sent.');
            await loadAll();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not promote dependent.');
        }
    };

    const shownMemberships = useMemo(
        () => myMemberships.filter(
            (m) => m.is_active
                || m.status === 'pending_offline'
                || m.status === 'rejected',
        ),
        [myMemberships],
    );

    // --- Render ---

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
                    <PageTitle>Memberships</PageTitle>
                    {!isMobile && (
                        <PageSubtitle>
                            Manage your paid memberships and family members
                        </PageSubtitle>
                    )}
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadAll}
                    >
                        Refresh
                    </OutlineButton>
                    {/* ✅ NEW: quick jump to plan management, gated by role */}
                    {['owner', 'admin', 'super_admin'].includes(
                        organizations.find((o) => String(o.id) === String(currentOrgId))?.role
                    ) && (
                        <PrimaryButton
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => navigate('/app/membership/manage')}
                        >
                            Manage Plans
                        </PrimaryButton>
                    )}
                    {['owner', 'admin', 'super_admin'].includes(
                        organizations.find((o) => String(o.id) === String(currentOrgId))?.role
                    ) && (
                        <OutlineButton
                            startIcon={<ReceiptIcon />}
                            onClick={() => navigate('/app/membership/review-offline')}
                        >
                            Offline Requests
                        </OutlineButton>
                    )}
                </PageHeaderRight>
            </PageHeader>

            {/* Active memberships */}
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                My Active Memberships
            </Typography>

            {shownMemberships.filter((m) => m.is_active).length === 0 ? (
                <Alert severity="info" sx={{ mb: 4 }}>
                    You don't have an active membership in any organization yet.
                    Browse available plans below.
                </Alert>
            ) : (
                <Grid container spacing={isMobile ? 2 : 3} sx={{ mb: 4 }}>
                    {shownMemberships.filter((m) => m.is_active).map((m) => {
                        const org = organizations.find((o) => o.id === m.organization);
                        const depCount = m.dependents?.length || 0;
                        return (
                            <Grid item xs={12} md={6} key={m.id}>
                                <Card sx={{
                                    borderRadius: 2,
                                    border: `2px solid ${C.success}`,
                                    height: '100%',
                                }}>
                                    <CardContent>
                                        <Box sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            mb: 1,
                                            gap: 1,
                                        }}>
                                            <Box>
                                                <Typography variant="overline" sx={{ color: C.textMuted }}>
                                                    {org?.name || 'Organization'}
                                                </Typography>
                                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                                    {m.tier.name}
                                                </Typography>
                                            </Box>
                                            <Chip
                                                icon={<CheckCircleIcon />}
                                                label={
                                                    m.is_active
                                                        ? 'ACTIVE'
                                                        : m.status === 'pending_offline'
                                                            ? 'AWAITING REVIEW'
                                                            : 'REJECTED'
                                                }
                                                color={
                                                    m.is_active
                                                        ? 'success'
                                                        : m.status === 'pending_offline'
                                                            ? 'warning'
                                                            : 'error'
                                                }
                                                size="small"
                                            />
                                        </Box>

                                        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">
                                                    Valid until
                                                </Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                    {m.valid_until
                                                        ? new Date(m.valid_until).toLocaleDateString()
                                                        : 'Lifetime'}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">
                                                    Seats
                                                </Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                    {m.seats_used} / {m.seats_max}
                                                </Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" color="text.secondary">
                                                    Paid
                                                </Typography>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                    {formatMoney(m.price_paid)}
                                                </Typography>
                                            </Box>
                                        </Stack>

                                        <Divider sx={{ my: 2 }} />

                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                                Family Members ({depCount})
                                            </Typography>
                                            <Button
                                                size="small"
                                                startIcon={<PersonAddIcon />}
                                                onClick={() => openAddDependent(m)}
                                                disabled={m.seats_used >= m.seats_max}
                                            >
                                                Add
                                            </Button>
                                        </Box>

                                        {depCount === 0 ? (
                                            <Typography variant="body2" sx={{ color: C.textMuted }}>
                                                No dependents added.
                                            </Typography>
                                        ) : (
                                            <Stack spacing={1}>
                                                {m.dependents.map((dep) => (
                                                    <Box
                                                        key={dep.id}
                                                        sx={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 1,
                                                            p: 1,
                                                            borderRadius: 1,
                                                            bgcolor: C.bgPrimary,
                                                        }}
                                                    >
                                                        <BadgeIcon sx={{ fontSize: 18, color: C.primary }} />
                                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                {dep.full_name}
                                                            </Typography>
                                                            <Typography variant="caption" sx={{ color: C.textMuted, fontFamily: F.familyMono }}>
                                                                {dep.member_code}
                                                                {dep.promoted_user && ' · Has own login'}
                                                            </Typography>
                                                        </Box>
                                                        {!dep.promoted_user && dep.email && (
                                                            <Tooltip title="Give this person their own login">
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => handlePromoteDependent(m.id, dep.id)}
                                                                >
                                                                    <PromoteIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        <Tooltip title="Remove">
                                                            <IconButton
                                                                size="small"
                                                                color="error"
                                                                onClick={() => handleRemoveDependent(m.id, dep.id, dep.full_name)}
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </Box>
                                                ))}
                                            </Stack>
                                        )}
                                    </CardContent>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
            )}

            {/* Available plans */}
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                Available Plans
            </Typography>

            {purchasableTiers.length === 0 ? (
                <Alert severity="info">
                    No plans available to purchase right now.
                </Alert>
            ) : (
                <Grid container spacing={isMobile ? 2 : 3}>
                    {purchasableTiers.map((tier) => {
                        const org = organizations.find((o) => o.id === tier.organization);
                        return (
                            <Grid item xs={12} sm={6} md={4} key={tier.id}>
                                <Card sx={{
                                    borderRadius: 2,
                                    border: `1px solid ${C.borderLight}`,
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}>
                                    <CardContent sx={{ flex: 1 }}>
                                        <Typography variant="overline" sx={{ color: C.textMuted }}>
                                            {org?.name || 'Organization'}
                                        </Typography>
                                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                                            {tier.name}
                                        </Typography>
                                        {tier.description && (
                                            <Typography variant="body2" sx={{ color: C.textSecondary, mb: 2 }}>
                                                {tier.description}
                                            </Typography>
                                        )}
                                        <Box sx={{ mb: 2 }}>
                                            <Typography variant="h4" sx={{ fontWeight: 800, color: C.primary }}>
                                                {formatMoney(tier.price)}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: C.textMuted }}>
                                                {tier.billing_period.replace('_', ' ')}
                                            </Typography>
                                        </Box>
                                        <Stack spacing={0.5}>
                                            <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                                👥 Covers up to {tier.max_members} {tier.max_members === 1 ? 'person' : 'people'}
                                            </Typography>
                                            {Object.entries(tier.benefits || {}).map(([k, v]) => (
                                                <Typography key={k} variant="body2" sx={{ color: C.textSecondary }}>
                                                    ✨ {k.replace(/_/g, ' ')}: {String(v)}
                                                </Typography>
                                            ))}
                                        </Stack>
                                    </CardContent>
                                    <Box sx={{ p: 2, pt: 0 }}>
                                        <PrimaryButton
                                            fullWidth
                                            startIcon={<StarIcon />}
                                            onClick={() => openCheckout(tier)}
                                        >
                                            {tier.price > 0 ? 'Join Plan' : 'Activate Free'}
                                        </PrimaryButton>
                                    </Box>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
            )}

            {/* ---- Checkout dialog ---- */}
            <Dialog open={checkoutOpen} onClose={closeCheckout} maxWidth="xs" fullWidth>
                <DialogTitle>Join {checkoutTier?.name}</DialogTitle>
                <DialogContent>
                    {checkoutTier && (
                        <>
                            <Typography variant="body2" sx={{ color: C.textSecondary, mb: 2 }}>
                                You'll be charged {formatMoney(checkoutTier.price)} for {checkoutTier.billing_period.replace('_', ' ')}.
                                Covers up to {checkoutTier.max_members} {checkoutTier.max_members === 1 ? 'person' : 'people'}.
                            </Typography>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                Choose your payment method:
                            </Alert>
                            <Stack spacing={1}>
                                <Button
                                    fullWidth
                                    variant="contained"
                                    disabled={processing}
                                    onClick={() => startRazorpayCheckout(checkoutTier)}
                                >
                                    Pay with Razorpay
                                </Button>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    disabled={processing}
                                    onClick={() => startStripeCheckout(checkoutTier)}
                                >
                                    Pay with Stripe
                                </Button>
                                {checkoutTier.price === 0 && (
                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        color="success"
                                        disabled={processing}
                                        onClick={() => startFreeActivation(checkoutTier)}
                                    >
                                        Activate Free Membership
                                    </Button>
                                )}
                                {checkoutTier.price > 0 && (
                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        color="warning"
                                        disabled={processing}
                                        onClick={() => startOfflineRequest(checkoutTier)}
                                    >
                                        Pay at office (Cash)
                                    </Button>
                                )}
                            </Stack>
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeCheckout} disabled={processing}>
                        Cancel
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ---- Add dependent dialog ---- */}
            <Dialog open={depOpen} onClose={closeDepDialog} maxWidth="sm" fullWidth>
                <DialogTitle>Add Family Member</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField
                            label="Full name"
                            value={depForm.full_name}
                            onChange={(e) => setDepForm((p) => ({ ...p, full_name: e.target.value }))}
                            required
                            fullWidth
                        />
                        <TextField
                            label="Email (used for check-in QR)"
                            value={depForm.email}
                            onChange={(e) => setDepForm((p) => ({ ...p, email: e.target.value }))}
                            type="email"
                            fullWidth
                        />
                        <TextField
                            label="Phone"
                            value={depForm.phone}
                            onChange={(e) => setDepForm((p) => ({ ...p, phone: e.target.value }))}
                            fullWidth
                        />
                        <TextField
                            select
                            label="Relationship"
                            value={depForm.relationship}
                            onChange={(e) => setDepForm((p) => ({ ...p, relationship: e.target.value }))}
                            fullWidth
                        >
                            {RELATIONSHIPS.map((r) => (
                                <MenuItem key={r.value} value={r.value}>
                                    {r.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            label="Date of birth"
                            type="date"
                            value={depForm.date_of_birth}
                            onChange={(e) => setDepForm((p) => ({ ...p, date_of_birth: e.target.value }))}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDepDialog} disabled={depSaving}>
                        Cancel
                    </Button>
                    <PrimaryButton onClick={handleAddDependent} disabled={depSaving}>
                        {depSaving ? <CircularProgress size={20} /> : 'Add Member'}
                    </PrimaryButton>
                </DialogActions>
            </Dialog>

            {/* Razorpay script loader */}
            <script src="https://checkout.razorpay.com/v1/checkout.js" async />
        </PageContainer>
    );
};

export default Membership;