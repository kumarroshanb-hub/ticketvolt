// frontend/src/pages/Organizations/Organizations.js
import React, { useEffect, useState } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Paper, Button,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Alert, CircularProgress, Chip, Stack,
    Autocomplete, Divider,
} from '@mui/material';
import {
    Add as AddIcon, Refresh as RefreshIcon, WarningAmber as WarningIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { useOrg } from '../../context/OrgContext';
import {
    PageContainer, PageHeader, PageTitle, PageSubtitle,
    PageHeaderLeft, PageHeaderRight, PrimaryButton, OutlineButton,
    LoadingWrapper,
} from '../../components/Common';

const EMPTY_FORM = { name: '' };

// Two-stage dialog: 'form' collects input, 'confirm' asks the user to
// acknowledge that creating an org makes them its owner (tenancy warning).
const STAGE_FORM = 'form';
const STAGE_CONFIRM = 'confirm';

const Organizations = () => {
    const { organizations, loading, refresh, isPlatformAdmin } = useOrg();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [stage, setStage] = useState(STAGE_FORM);
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState(EMPTY_FORM);

    const [potentialOwners, setPotentialOwners] = useState([]);
    const [ownersLoading, setOwnersLoading] = useState(false);
    const [selectedOwner, setSelectedOwner] = useState(null);

    // Load candidate owners when a Platform Admin opens the dialog.
    useEffect(() => {
        if (!isPlatformAdmin || !dialogOpen) return;

        let cancelled = false;
        setOwnersLoading(true);

        (async () => {
            try {
                const res = await api.get('/users/', {
                    params: { role: 'organizer', page_size: 200 },
                });
                const list = res.data?.results || res.data || [];
                if (!cancelled) setPotentialOwners(list);
            } catch {
                if (!cancelled) {
                    toast.error('Could not load users to assign as owners.');
                    setPotentialOwners([]);
                }
            } finally {
                if (!cancelled) setOwnersLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [isPlatformAdmin, dialogOpen]);

    const resetDialog = () => {
        setFormData(EMPTY_FORM);
        setSelectedOwner(null);
        setPotentialOwners([]);
        setStage(STAGE_FORM);
    };

    const handleClose = () => {
        if (creating) return;
        setDialogOpen(false);
        resetDialog();
    };

    const handleOpen = () => {
        resetDialog();
        setDialogOpen(true);
    };

    // Stage 1 → Stage 2: basic validation, then show the confirmation.
    const handleRequestCreate = () => {
        if (!formData.name.trim()) {
            toast.error('Organization name is required');
            return;
        }
        setStage(STAGE_CONFIRM);
    };

    // Stage 2 → submit.
    const handleConfirmCreate = async () => {
        setCreating(true);
        try {
            const payload = { name: formData.name.trim() };
            if (isPlatformAdmin && selectedOwner) {
                payload.owner_id = selectedOwner.id;
            }

            await api.post('/organizations/', payload);

            const ownerLabel = selectedOwner
                ? `${selectedOwner.name || selectedOwner.username || selectedOwner.email}`
                : 'you';
            toast.success(`Organization created. Owner: ${ownerLabel}.`);

            setDialogOpen(false);
            resetDialog();
            await refresh();
        } catch (err) {
            const data = err.response?.data;
            let msg = 'Failed to create organization';

            if (typeof data === 'string') {
                msg = data;
            } else if (data && typeof data === 'object') {
                if (data.owner_id) {
                    msg = Array.isArray(data.owner_id) ? data.owner_id[0] : data.owner_id;
                } else if (data.name) {
                    msg = Array.isArray(data.name) ? data.name[0] : data.name;
                } else if (data.detail) {
                    msg = data.detail;
                } else {
                    const firstKey = Object.keys(data)[0];
                    if (firstKey) {
                        const firstVal = data[firstKey];
                        msg = Array.isArray(firstVal)
                            ? `${firstKey}: ${firstVal[0]}`
                            : `${firstKey}: ${firstVal}`;
                    }
                }
            }
            toast.error(msg);
            // On failure, drop back to the form stage so the user can fix
            // the input rather than staring at a failed confirmation.
            setStage(STAGE_FORM);
        } finally {
            setCreating(false);
        }
    };

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress />
            </LoadingWrapper>
        );
    }

    const ownerDisplay = selectedOwner
        ? selectedOwner.name
            || [selectedOwner.first_name, selectedOwner.last_name]
                .filter(Boolean).join(' ').trim()
            || selectedOwner.username
            || selectedOwner.email
        : null;

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>Organizations</PageTitle>
                    <PageSubtitle>
                        Every event, venue, discount, and policy belongs to one
                        organization. Create one to get started.
                    </PageSubtitle>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton startIcon={<RefreshIcon />} onClick={refresh}>
                        Refresh
                    </OutlineButton>
                    <PrimaryButton
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleOpen}
                    >
                        New Organization
                    </PrimaryButton>
                </PageHeaderRight>
            </PageHeader>

            {isPlatformAdmin && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    You are a Platform Admin — you can see every organization.
                    When creating a new one, you may assign ownership to any
                    existing admin or organizer; otherwise you become the owner.
                </Alert>
            )}

            {organizations.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h6">No organizations yet</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                        Create one to start adding venues and events.
                    </Typography>
                    <PrimaryButton
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleOpen}
                    >
                        Create your first organization
                    </PrimaryButton>
                </Paper>
            ) : (
                <Grid container spacing={2}>
                    {organizations.map((org) => (
                        <Grid item xs={12} sm={6} md={4} key={org.id}>
                            <Card sx={{ height: '100%' }}>
                                <CardContent>
                                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                        {org.name}
                                    </Typography>
                                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                        <Chip
                                            size="small"
                                            label={org.role || 'member'}
                                            color={org.role === 'owner' ? 'success' : 'default'}
                                        />
                                        {org.can_manage && (
                                            <Chip size="small" label="manage" variant="outlined" />
                                        )}
                                    </Stack>
                                    <Typography
                                        variant="caption"
                                        sx={{ display: 'block', mt: 2, color: 'text.secondary' }}
                                    >
                                        {org.currency_code} · {org.default_timezone}
                                    </Typography>
                                    <Typography
                                        variant="caption"
                                        sx={{ display: 'block', color: 'text.secondary' }}
                                    >
                                        Owner: {org.owner_username}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            <Dialog
                open={dialogOpen}
                onClose={handleClose}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    {stage === STAGE_CONFIRM ? 'Confirm new organization' : 'New Organization'}
                </DialogTitle>

                <DialogContent>
                    {stage === STAGE_FORM && (
                        <>
                            {isPlatformAdmin ? (
                                <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
                                    As a Platform Admin, you may assign ownership of
                                    this new organization to another user. Leave the
                                    owner blank to keep ownership yourself.
                                </Alert>
                            ) : (
                                <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
                                    You will become the owner. You can invite other
                                    organizers from the Users page afterwards.
                                </Alert>
                            )}

                            <TextField
                                fullWidth
                                autoFocus
                                label="Organization name"
                                value={formData.name}
                                onChange={(e) => setFormData({ name: e.target.value })}
                                sx={{ mt: 1, mb: 2 }}
                                disabled={creating}
                            />

                            {isPlatformAdmin && (
                                <Autocomplete
                                    options={potentialOwners}
                                    loading={ownersLoading}
                                    value={selectedOwner}
                                    onChange={(_, value) => setSelectedOwner(value)}
                                    getOptionLabel={(option) => {
                                        if (!option) return '';
                                        const display =
                                            option.name
                                            || [option.first_name, option.last_name]
                                                .filter(Boolean).join(' ')
                                                .trim()
                                            || option.username
                                            || option.email;
                                        return option.email ? `${display} (${option.email})` : display;
                                    }}
                                    isOptionEqualToValue={(opt, val) => opt?.id === val?.id}
                                    filterOptions={(opts, state) => {
                                        const q = state.inputValue.trim().toLowerCase();
                                        if (!q) return opts;
                                        return opts.filter((o) => {
                                            const hay = [
                                                o.name, o.username, o.email,
                                                o.first_name, o.last_name,
                                            ].filter(Boolean).join(' ').toLowerCase();
                                            return hay.includes(q);
                                        });
                                    }}
                                    noOptionsText={
                                        ownersLoading
                                            ? 'Loading…'
                                            : 'No matching users'
                                    }
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Assign Owner (optional)"
                                            helperText="Choose an existing admin or organizer. Leaving blank makes you the owner."
                                            disabled={creating}
                                            InputProps={{
                                                ...params.InputProps,
                                                endAdornment: (
                                                    <>
                                                        {ownersLoading ? (
                                                            <CircularProgress size={16} />
                                                        ) : null}
                                                        {params.InputProps.endAdornment}
                                                    </>
                                                ),
                                            }}
                                        />
                                    )}
                                />
                            )}
                        </>
                    )}

                    {stage === STAGE_CONFIRM && (
                        <Box sx={{ mt: 1 }}>
                            <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
                                You're about to become the owner of a new tenant.
                                Venues, events, discounts, and policies you create
                                will belong to it.
                            </Alert>
                            <Typography variant="body2" sx={{ mb: 0.5 }}>
                                <strong>Name:</strong> {formData.name.trim()}
                            </Typography>
                            <Typography variant="body2">
                                <strong>Owner:</strong>{' '}
                                {ownerDisplay ? (
                                    <>
                                        {ownerDisplay}
                                        {selectedOwner?.email ? ` (${selectedOwner.email})` : ''}
                                    </>
                                ) : (
                                    'You'
                                )}
                            </Typography>
                            <Divider sx={{ my: 2 }} />
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                This action creates a new tenant and seeds its
                                regional defaults (currency, country, timezone,
                                branding) from platform settings. You can change
                                these later in Settings.
                            </Typography>
                        </Box>
                    )}
                </DialogContent>

                <DialogActions>
                    {stage === STAGE_CONFIRM ? (
                        <>
                            <Button
                                onClick={() => setStage(STAGE_FORM)}
                                disabled={creating}
                            >
                                Back
                            </Button>
                            <Button
                                variant="contained"
                                onClick={handleConfirmCreate}
                                disabled={creating}
                                startIcon={
                                    creating ? <CircularProgress size={16} /> : <AddIcon />
                                }
                            >
                                Confirm & Create
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button onClick={handleClose} disabled={creating}>
                                Cancel
                            </Button>
                            <Button
                                variant="contained"
                                onClick={handleRequestCreate}
                                startIcon={<AddIcon />}
                            >
                                Continue
                            </Button>
                        </>
                    )}
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default Organizations;