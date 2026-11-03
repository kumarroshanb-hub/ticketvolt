import React, { useEffect, useState } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Paper, Button,
    Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText,
    TextField, Alert, CircularProgress, Chip, Stack,
    Autocomplete, Divider, IconButton, Menu, MenuItem, Tooltip,
} from '@mui/material';
import {
    Add as AddIcon,
    Refresh as RefreshIcon,
    WarningAmber as WarningIcon,
    MoreVert as MoreVertIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    SwapHoriz as TransferIcon,
    PersonAdd as PersonAddIcon, // ✅ ADDED
    Close as CloseIcon,         // ✅ ADDED
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

// ADDED FOR ORGANIZATION CRUD:
const EMPTY_EDIT_FORM = {
    name: '',
    org_email: '',
    org_logo_url: '',
    email_from_name: '',
    currency_code: '',
    default_timezone: '',
};

// Two-stage dialog: 'form' collects input, 'confirm' asks the user to
// acknowledge that creating an org makes them its owner (tenancy warning).
const STAGE_FORM = 'form';
const STAGE_CONFIRM = 'confirm';

// ---------------------------------------------------------------------------
// Owner-assignment grouping: candidates are either Superusers or Owners.
// ---------------------------------------------------------------------------
const OWNER_GROUP_ORDER = { 'Super Admin': 0, 'Owner': 1 };

const ownerGroupLabel = (u) => {
    if (!u) return 'Owner';
    if (u.is_superuser || u.role === 'super_admin') return 'Super Admin';
    return 'Owner';
};

const Organizations = () => {
    const { organizations, loading, refresh, isPlatformAdmin } = useOrg();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [stage, setStage] = useState(STAGE_FORM);
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState(EMPTY_FORM);

    const [potentialOwners, setPotentialOwners] = useState([]);
    const [ownersLoading, setOwnersLoading] = useState(false);
    const [selectedOwner, setSelectedOwner] = useState(null);

    // ADDED FOR ORGANIZATION CRUD + OWNERSHIP TRANSFER
    const [menuAnchor, setMenuAnchor] = useState(null);
    const [selectedOrg, setSelectedOrg] = useState(null);

    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
    const [saving, setSaving] = useState(false);

    const [transferOpen, setTransferOpen] = useState(false);
    const [members, setMembers] = useState([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [selectedNewOwner, setSelectedNewOwner] = useState(null);
    const [transferring, setTransferring] = useState(false);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // ✅ NEW: Invite Member State
    const [openInvite, setOpenInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('member');
    const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0]);
    const [validUntil, setValidUntil] = useState('');
    const [isInviting, setIsInviting] = useState(false);

    // ADDED FOR ORGANIZATION CRUD + OWNERSHIP TRANSFER: permission helpers
    const canManageOrg = (org) =>
        Boolean(org) && (isPlatformAdmin || ['owner', 'admin'].includes(org.role));

    const canTransferOrg = (org) =>
        Boolean(org) && (isPlatformAdmin || org.role === 'owner');

    const canDeleteOrg = () => Boolean(isPlatformAdmin);

    // Load owner candidates when a Platform Admin opens the create dialog.
    // We fetch both existing Owners and Superusers so the admin can
    // deliberately assign the new tenant to either, grouped + badged in the UI.
    useEffect(() => {
        if (!isPlatformAdmin || !dialogOpen) return;

        let cancelled = false;
        setOwnersLoading(true);

        (async () => {
            try {
                const [ownerRes, superRes] = await Promise.all([
                    api.get('/users/', { params: { page_size: 200, role: 'owner' } }),
                    api.get('/users/', { params: { page_size: 200, role: 'super_admin' } }),
                ]);
                const owners = ownerRes.data?.results || ownerRes.data || [];
                const supers = superRes.data?.results || superRes.data || [];

                // Merge + dedupe by id (a superuser can also be an owner).
                const seen = new Set();
                const merged = [];
                for (const u of [...supers, ...owners]) {
                    if (!u || seen.has(u.id)) continue;
                    seen.add(u.id);
                    merged.push(u);
                }

                // Sort so each role renders as one clean group:
                // Super Admin first, then Owner; alphabetical within a group.
                merged.sort((a, b) => {
                    const oa = OWNER_GROUP_ORDER[ownerGroupLabel(a)] ?? 99;
                    const ob = OWNER_GROUP_ORDER[ownerGroupLabel(b)] ?? 99;
                    if (oa !== ob) return oa - ob;
                    const na = (a.name || a.username || a.email || '').toLowerCase();
                    const nb = (b.name || b.username || b.email || '').toLowerCase();
                    return na.localeCompare(nb);
                });

                if (!cancelled) setPotentialOwners(merged);
            } catch {
                if (!cancelled) {
                    toast.error('Could not load Owners/Superusers to assign.');
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

    // ADDED FOR ORGANIZATION CRUD: action menu handlers
    const handleOpenMenu = (event, org) => {
        event.stopPropagation();
        setSelectedOrg(org);
        setMenuAnchor(event.currentTarget);
    };

    const handleCloseMenu = () => {
        setMenuAnchor(null);
    };

    // ADDED FOR ORGANIZATION CRUD: edit handlers
    const handleOpenEdit = (org) => {
        setSelectedOrg(org);
        setEditForm({
            name: org.name || '',
            org_email: org.org_email || '',
            org_logo_url: org.org_logo_url || '',
            email_from_name: org.email_from_name || '',
            currency_code: org.currency_code || '',
            default_timezone: org.default_timezone || '',
        });
        setEditOpen(true);
        handleCloseMenu();
    };

    const handleCloseEdit = () => {
        if (saving) return;
        setEditOpen(false);
        setEditForm(EMPTY_EDIT_FORM);
        setSelectedOrg(null);
    };

    const handleSaveEdit = async () => {
        if (!selectedOrg) return;

        if (!editForm.name.trim()) {
            toast.error('Organization name is required');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: editForm.name.trim(),
                org_email: editForm.org_email.trim(),
                org_logo_url: editForm.org_logo_url.trim(),
                email_from_name: editForm.email_from_name.trim(),
                currency_code: editForm.currency_code.trim(),
                default_timezone: editForm.default_timezone.trim(),
            };

            await api.patch(`/organizations/${selectedOrg.id}/`, payload);

            toast.success('Organization updated successfully.');
            setEditOpen(false);
            setEditForm(EMPTY_EDIT_FORM);
            setSelectedOrg(null);
            await refresh();
        } catch (err) {
            const data = err.response?.data;
            let msg = 'Failed to update organization';

            if (typeof data === 'string') {
                msg = data;
            } else if (data && typeof data === 'object') {
                const firstKey = Object.keys(data)[0];
                if (firstKey) {
                    const firstVal = data[firstKey];
                    msg = Array.isArray(firstVal)
                        ? `${firstKey}: ${firstVal[0]}`
                        : `${firstKey}: ${firstVal}`;
                }
            }

            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    // ADDED FOR OWNERSHIP TRANSFER: handlers
    const fetchOrganizationMembers = async (orgId) => {
        setMembersLoading(true);
        try {
            const res = await api.get(`/organizations/${orgId}/members/`);
            const list = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setMembers(list);
        } catch {
            toast.error('Could not load organization members.');
            setMembers([]);
        } finally {
            setMembersLoading(false);
        }
    };

    const handleOpenTransfer = async (org) => {
        setSelectedOrg(org);
        setSelectedNewOwner(null);
        setMembers([]);
        setTransferOpen(true);
        handleCloseMenu();

        await fetchOrganizationMembers(org.id);
    };

    const handleCloseTransfer = () => {
        if (transferring) return;
        setTransferOpen(false);
        setSelectedNewOwner(null);
        setMembers([]);
        setSelectedOrg(null);
    };

    const handleTransferOwnership = async () => {
        if (!selectedOrg || !selectedNewOwner) {
            toast.error('Please select a new owner.');
            return;
        }

        setTransferring(true);
        try {
            await api.post(`/organizations/${selectedOrg.id}/transfer-ownership/`, {
                new_owner_user_id: selectedNewOwner.user_id,
            });

            toast.success(`Ownership transferred to ${selectedNewOwner.full_name || selectedNewOwner.email}.`);

            setTransferOpen(false);
            setSelectedNewOwner(null);
            setMembers([]);
            setSelectedOrg(null);
            await refresh();
        } catch (err) {
            const data = err.response?.data;
            let msg = 'Failed to transfer ownership';

            if (typeof data === 'string') {
                msg = data;
            } else if (data && typeof data === 'object') {
                if (data.new_owner_user_id) {
                    msg = Array.isArray(data.new_owner_user_id)
                        ? data.new_owner_user_id[0]
                        : data.new_owner_user_id;
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
        } finally {
            setTransferring(false);
        }
    };

    // ADDED FOR PLATFORM ADMIN DELETE: handlers
    const handleOpenDelete = (org) => {
        setSelectedOrg(org);
        setDeleteOpen(true);
        handleCloseMenu();
    };

    const handleCloseDelete = () => {
        if (deleting) return;
        setDeleteOpen(false);
        setSelectedOrg(null);
    };

    const handleDeleteOrg = async () => {
        if (!selectedOrg) return;

        setDeleting(true);
        try {
            await api.delete(`/organizations/${selectedOrg.id}/`);
            toast.success('Organization deleted successfully.');
            setDeleteOpen(false);
            setSelectedOrg(null);
            await refresh();
        } catch (err) {
            const data = err.response?.data;
            const msg =
                data?.detail ||
                data?.error ||
                (typeof data === 'string' ? data : null) ||
                'Failed to delete organization';

            toast.error(msg);
        } finally {
            setDeleting(false);
        }
    };

    // ✅ NEW: Invite Member Handlers
    const handleOpenInvite = (org) => {
        setSelectedOrg(org);
        setInviteEmail('');
        setInviteRole('member');
        setValidFrom(new Date().toISOString().split('T')[0]);
        setValidUntil('');
        setOpenInvite(true);
        handleCloseMenu();
    };

    const handleCloseInvite = () => {
        if (isInviting) return;
        setOpenInvite(false);
        setSelectedOrg(null);
        setInviteEmail('');
    };

    const handleInviteSubmit = async (e) => {
        e.preventDefault();
        if (!inviteEmail || !inviteEmail.includes('@')) {
            toast.error('Please enter a valid email address.');
            return;
        }

        setIsInviting(true);
        try {
            const payload = {
                email: inviteEmail.toLowerCase().trim(),
                role: inviteRole,
                valid_from: validFrom ? new Date(validFrom).toISOString() : undefined,
                valid_until: validUntil ? new Date(validUntil).toISOString() : undefined,
            };

            await api.post(`/organizations/${selectedOrg.id}/invite/`, payload);
            
            toast.success(`Invitation sent to ${payload.email}!`);
            handleCloseInvite();
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Failed to send invitation.';
            toast.error(errorMsg);
        } finally {
            setIsInviting(false);
        }
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
                    existing user; otherwise you become the owner.
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
                            <Card sx={{ height: '100%', position: 'relative' }}>
                                <CardContent>
                                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                            {org.name}
                                        </Typography>

                                        {(canManageOrg(org) || canTransferOrg(org) || canDeleteOrg()) && (
                                            <Tooltip title="Organization actions">
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => handleOpenMenu(e, org)}
                                                    aria-label={`Actions for ${org.name}`}
                                                >
                                                    <MoreVertIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </Stack>
                                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                        <Chip
                                            size="small"
                                            label={org.role || 'member'}
                                            color={
                                                org.role === 'owner'
                                                    ? 'success'
                                                    : org.role === 'admin'
                                                        ? 'primary'
                                                        : org.role === 'staff'
                                                            ? 'secondary'
                                                            : 'default'
                                            }
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

            {/* ADDED FOR ORGANIZATION CRUD + TRANSFER: action menu */}
            <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={handleCloseMenu}
            >
                <MenuItem
                    disabled={!selectedOrg || !canManageOrg(selectedOrg)}
                    onClick={() => selectedOrg && handleOpenEdit(selectedOrg)}
                >
                    <EditIcon fontSize="small" sx={{ mr: 1 }} />
                    Edit Organization
                </MenuItem>

                {/* ✅ NEW: Invite Member Menu Item */}
                <MenuItem
                    disabled={!selectedOrg || !canManageOrg(selectedOrg)}
                    onClick={() => selectedOrg && handleOpenInvite(selectedOrg)}
                >
                    <PersonAddIcon fontSize="small" sx={{ mr: 1 }} />
                    Invite Member
                </MenuItem>

                <MenuItem
                    disabled={!selectedOrg || !canTransferOrg(selectedOrg)}
                    onClick={() => selectedOrg && handleOpenTransfer(selectedOrg)}
                >
                    <TransferIcon fontSize="small" sx={{ mr: 1 }} />
                    Transfer Ownership
                </MenuItem>

                <MenuItem
                    disabled={!canDeleteOrg()}
                    onClick={() => selectedOrg && handleOpenDelete(selectedOrg)}
                    sx={{ color: 'error.main' }}
                >
                    <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
                    Delete Organization
                </MenuItem>
            </Menu>

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
                                    Admins or Staff from the Users page afterwards.
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
                                    groupBy={ownerGroupLabel}
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
                                    renderOption={(props, option) => {
                                        const isSuper = ownerGroupLabel(option) === 'Super Admin';
                                        return (
                                            <li {...props}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                                        <Typography variant="body2" noWrap>
                                                            {option.name
                                                                || [option.first_name, option.last_name]
                                                                    .filter(Boolean).join(' ')
                                                                    .trim()
                                                                || option.username}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary" noWrap>
                                                            {option.email}
                                                        </Typography>
                                                    </Box>
                                                    <Chip
                                                        size="small"
                                                        label={isSuper ? 'Super Admin' : 'Owner'}
                                                        color={isSuper ? 'success' : 'warning'}
                                                        variant="outlined"
                                                    />
                                                </Box>
                                            </li>
                                        );
                                    }}
                                    noOptionsText={
                                        ownersLoading
                                            ? 'Loading…'
                                            : 'No Owners or Superusers found'
                                    }
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Assign Owner (optional)"
                                            helperText="Pick an existing Owner or Superuser to own this organization. Leave blank to own it yourself."
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
                                {selectedOwner
                                    ? `You're about to create a new tenant owned by ${ownerDisplay || 'the selected user'}. Venues, events, discounts, and policies created under it will belong to that organization.`
                                    : "You're about to become the owner of a new tenant. Venues, events, discounts, and policies you create will belong to it."}
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

            {/* ADDED: EDIT ORGANIZATION DIALOG */}
            <Dialog
                open={editOpen}
                onClose={handleCloseEdit}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Edit Organization</DialogTitle>

                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
                        Organization settings apply to all events, venues, discounts,
                        and policies under this tenant.
                    </Alert>

                    <TextField
                        fullWidth
                        label="Organization name"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        sx={{ mb: 2 }}
                        disabled={saving}
                    />

                    <TextField
                        fullWidth
                        label="Organization email"
                        value={editForm.org_email}
                        onChange={(e) => setEditForm({ ...editForm, org_email: e.target.value })}
                        sx={{ mb: 2 }}
                        disabled={saving}
                    />

                    <TextField
                        fullWidth
                        label="Logo URL"
                        value={editForm.org_logo_url}
                        onChange={(e) => setEditForm({ ...editForm, org_logo_url: e.target.value })}
                        sx={{ mb: 2 }}
                        disabled={saving}
                    />

                    <TextField
                        fullWidth
                        label="Email sender name"
                        value={editForm.email_from_name}
                        onChange={(e) => setEditForm({ ...editForm, email_from_name: e.target.value })}
                        sx={{ mb: 2 }}
                        disabled={saving}
                    />

                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Currency code"
                                value={editForm.currency_code}
                                onChange={(e) => setEditForm({ ...editForm, currency_code: e.target.value })}
                                disabled={saving}
                            />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Timezone"
                                value={editForm.default_timezone}
                                onChange={(e) => setEditForm({ ...editForm, default_timezone: e.target.value })}
                                disabled={saving}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>

                <DialogActions>
                    <Button onClick={handleCloseEdit} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleSaveEdit}
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={16} /> : <EditIcon />}
                    >
                        Save Changes
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ADDED: TRANSFER OWNERSHIP DIALOG */}
            <Dialog
                open={transferOpen}
                onClose={handleCloseTransfer}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Transfer Ownership</DialogTitle>

                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2, mt: 1 }}>
                        The selected member will become the new Owner of{' '}
                        <strong>{selectedOrg?.name}</strong>.
                        You will retain access as Admin if you are the current owner.
                    </Alert>

                    {membersLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Autocomplete
                            options={members.filter((m) =>
                                m.role !== 'owner' &&
                                m.user_id !== selectedOrg?.owner &&
                                m.is_active !== false
                            )}
                            value={selectedNewOwner}
                            onChange={(_, value) => setSelectedNewOwner(value)}
                            getOptionLabel={(option) => {
                                if (!option) return '';
                                const display =
                                    option.full_name
                                    || option.username
                                    || option.email
                                    || '';
                                return option.email ? `${display} (${option.email})` : display;
                            }}
                            isOptionEqualToValue={(opt, val) => opt?.user_id === val?.user_id}
                            noOptionsText="No eligible members found"
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="New owner"
                                    helperText="Only existing active members can receive ownership."
                                    disabled={transferring}
                                />
                            )}
                        />
                    )}

                    {selectedNewOwner && (
                        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>
                                Selected new owner
                            </Typography>
                            <Typography variant="body2">
                                {selectedNewOwner.full_name || selectedNewOwner.username}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {selectedNewOwner.email} · Current role: {selectedNewOwner.role}
                            </Typography>
                        </Paper>
                    )}
                </DialogContent>

                <DialogActions>
                    <Button onClick={handleCloseTransfer} disabled={transferring}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleTransferOwnership}
                        disabled={transferring || !selectedNewOwner}
                        startIcon={transferring ? <CircularProgress size={16} /> : <TransferIcon />}
                    >
                        Confirm Transfer
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ADDED: DELETE ORGANIZATION DIALOG */}
            <Dialog
                open={deleteOpen}
                onClose={handleCloseDelete}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>Delete Organization</DialogTitle>

                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete{' '}
                        <strong>{selectedOrg?.name}</strong>?
                        This action cannot be undone and may affect associated events,
                        venues, bookings, discounts, and policies.
                    </DialogContentText>
                </DialogContent>

                <DialogActions>
                    <Button onClick={handleCloseDelete} disabled={deleting}>
                        Cancel
                    </Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={handleDeleteOrg}
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ✅ NEW: INVITE MEMBER DIALOG */}
            <Dialog
                open={openInvite}
                onClose={handleCloseInvite}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: { bgcolor: 'background.paper', borderRadius: 3 }
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    Invite Member
                    <IconButton onClick={handleCloseInvite} disabled={isInviting} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                
                <form onSubmit={handleInviteSubmit}>
                    <DialogContent sx={{ pt: 1 }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                            Enter the email address of the person you want to invite. They will receive a magic link to join your organization.
                        </Typography>

                        <TextField
                            fullWidth
                            label="Email Address"
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            required
                            sx={{ mb: 2.5 }}
                            disabled={isInviting}
                        />

                        <TextField
                            fullWidth
                            select
                            label="Assign Role"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                            sx={{ mb: 2.5 }}
                            disabled={isInviting}
                        >
                            <MenuItem value="member">Member</MenuItem>
                            <MenuItem value="staff">Staff</MenuItem>
                            <MenuItem value="admin">Admin</MenuItem>
                            {selectedOrg?.role === 'owner' && <MenuItem value="owner">Owner</MenuItem>}
                        </TextField>

                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            <TextField
                                fullWidth
                                label="Valid From"
                                type="date"
                                value={validFrom}
                                onChange={(e) => setValidFrom(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={{ flex: 1, minWidth: '140px' }}
                                disabled={isInviting}
                            />
                            <TextField
                                fullWidth
                                label="Valid Until (Optional)"
                                type="date"
                                value={validUntil}
                                onChange={(e) => setValidUntil(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                helperText="Leave blank for indefinite membership"
                                sx={{ flex: 1, minWidth: '140px' }}
                                disabled={isInviting}
                            />
                        </Box>
                    </DialogContent>

                    <DialogActions sx={{ p: 2.5, pt: 0 }}>
                        <Button 
                            onClick={handleCloseInvite} 
                            disabled={isInviting}
                        >
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            variant="contained" 
                            disabled={isInviting || !inviteEmail}
                            sx={{ minWidth: 120 }}
                        >
                            {isInviting ? <CircularProgress size={20} /> : 'Send Invite'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>

        </PageContainer>
    );
};

export default Organizations;