// frontend/src/pages/Organizations/Organizations.js
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';                       // ✅ FIX [#1]
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
    PersonAdd as PersonAddIcon,
    Close as CloseIcon,
    People as PeopleIcon,
    AdminPanelSettings as AssignOwnerIcon,                             // ✅ FIX [#3]
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import {
    PageContainer, PageHeader, PageTitle, PageSubtitle,
    PageHeaderLeft, PageHeaderRight, PrimaryButton, OutlineButton,
    LoadingWrapper,
} from '../../components/Common';

const EMPTY_FORM = { name: '' };

const EMPTY_EDIT_FORM = {
    name: '',
    org_email: '',
    org_logo_url: '',
    email_from_name: '',
    currency_code: '',
    default_timezone: '',
};

const STAGE_FORM = 'form';
const STAGE_CONFIRM = 'confirm';

const OWNER_GROUP_ORDER = { 'Super Admin': 0, 'Owner': 1 };

const ownerGroupLabel = (u) => {
    if (!u) return 'Owner';
    if (u.is_superuser || u.role === 'super_admin') return 'Super Admin';
    return 'Owner';
};

const resolveOwnerIntent = ({ selectedOwner, isPlatformAdmin }) => {
    if (selectedOwner) {
        return {
            kind: 'assigned',
            label:
                selectedOwner.name
                || [selectedOwner.first_name, selectedOwner.last_name]
                    .filter(Boolean).join(' ').trim()
                || selectedOwner.username
                || selectedOwner.email
                || 'the selected user',
            email: selectedOwner.email || null,
        };
    }
    if (isPlatformAdmin) {
        return { kind: 'unassigned', label: 'Unassigned — assign later', email: null };
    }
    return { kind: 'self', label: 'You', email: null };
};

// Format a Django-style error body into a single human-readable string.
const formatApiError = (data, fallback = 'Request failed') => {
    if (!data) return fallback;
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return data.map(String).join('; ');
    if (typeof data === 'object') {
        const firstKey = Object.keys(data)[0];
        if (!firstKey) return fallback;
        const firstVal = data[firstKey];
        if (Array.isArray(firstVal)) return `${firstKey}: ${firstVal[0]}`;
        if (firstVal && typeof firstVal === 'object') {
            return formatApiError(firstVal, fallback);
        }
        return `${firstKey}: ${firstVal}`;
    }
    return fallback;
};

const Organizations = () => {
    const { organizations, loading, refresh, isPlatformAdmin } = useOrg();
    const { user: currentUser } = useAuth();
    const navigate = useNavigate();                                    // ✅ FIX [#1]

    const [dialogOpen, setDialogOpen] = useState(false);
    const [stage, setStage] = useState(STAGE_FORM);
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [potentialOwners, setPotentialOwners] = useState([]);
    const [ownersLoading, setOwnersLoading] = useState(false);
    const [selectedOwner, setSelectedOwner] = useState(null);

    // Org CRUD + ownership transfer
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

    // ✅ FIX [#2/#3]: Assign-owner dialog for unowned orgs.
    // Transfer-ownership requires an *existing* owner (it demotes the old one).
    // Unowned orgs need the `assign-owner` endpoint instead.
    const [assignOpen, setAssignOpen] = useState(false);
    const [assignCandidates, setAssignCandidates] = useState([]);
    const [assignLoading, setAssignLoading] = useState(false);
    const [selectedAssignee, setSelectedAssignee] = useState(null);
    const [assigning, setAssigning] = useState(false);

    // Invite member
    const [openInvite, setOpenInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('member');
    const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0]);
    const [validUntil, setValidUntil] = useState('');
    const [isInviting, setIsInviting] = useState(false);

    // Permission helpers
    const canManageOrg = (org) =>
        Boolean(org) && (isPlatformAdmin || ['owner', 'admin'].includes(org.role));
    const canTransferOrg = (org) =>
        Boolean(org) && (isPlatformAdmin || org.role === 'owner');
    const canDeleteOrg = () => Boolean(isPlatformAdmin);

    // -----------------------------------------------------------------------
    // Owner-candidate loader for the *create* dialog.
    // Excludes the current user — a superuser must never assign themselves.
    // -----------------------------------------------------------------------
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

                const seen = new Set();
                const merged = [];
                for (const u of [...supers, ...owners]) {
                    if (!u || seen.has(u.id)) continue;
                    if (currentUser && u.id === currentUser.id) continue;
                    seen.add(u.id);
                    merged.push(u);
                }

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
    }, [isPlatformAdmin, dialogOpen, currentUser]);

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

    // -----------------------------------------------------------------------
    // Action menu
    // -----------------------------------------------------------------------
    const handleOpenMenu = (event, org) => {
        event.stopPropagation();
        setSelectedOrg(org);
        setMenuAnchor(event.currentTarget);
    };

    const handleCloseMenu = () => setMenuAnchor(null);

    // -----------------------------------------------------------------------
    // Edit
    // -----------------------------------------------------------------------
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
            toast.error(formatApiError(err.response?.data, 'Failed to update organization'));
        } finally {
            setSaving(false);
        }
    };

    // -----------------------------------------------------------------------
    // Members loader (shared by transfer + assign flows)
    // -----------------------------------------------------------------------
    const fetchOrganizationMembers = useCallback(async (orgId) => {
        const res = await api.get(`/organizations/${orgId}/members/`);
        const list = Array.isArray(res.data) ? res.data : (res.data?.results || []);
        return list;
    }, []);

    // -----------------------------------------------------------------------
    // Transfer ownership (owner → another member)
    // -----------------------------------------------------------------------
    const handleOpenTransfer = async (org) => {
        setSelectedOrg(org);
        setSelectedNewOwner(null);
        setMembers([]);
        setTransferOpen(true);
        handleCloseMenu();
        setMembersLoading(true);
        try {
            const list = await fetchOrganizationMembers(org.id);
            setMembers(list);
        } catch {
            toast.error('Could not load organization members.');
            setMembers([]);
        } finally {
            setMembersLoading(false);
        }
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
            toast.success(
                `Ownership transferred to ${selectedNewOwner.full_name || selectedNewOwner.email}.`
            );
            setTransferOpen(false);
            setSelectedNewOwner(null);
            setMembers([]);
            setSelectedOrg(null);
            await refresh();
        } catch (err) {
            toast.error(formatApiError(err.response?.data, 'Failed to transfer ownership'));
        } finally {
            setTransferring(false);
        }
    };

    // -----------------------------------------------------------------------
    // ✅ FIX [#2/#3]: Assign owner (for UNOWNED orgs).
    //
    // Endpoint: POST /organizations/<id>/assign-owner/
    // Body:     { new_owner_user_id: <user_id> }
    //
    // Unlike transfer-ownership, this endpoint:
    //   • refuses if any owner already exists (409),
    //   • refuses to assign a superuser (400),
    //   • creates the OWNER membership AND sets Organization.owner_id.
    // So it is exactly what an unowned org needs.
    // -----------------------------------------------------------------------
    const handleOpenAssignOwner = async (org) => {
        setSelectedOrg(org);
        setSelectedAssignee(null);
        setAssignCandidates([]);
        setAssignOpen(true);
        handleCloseMenu();

        // Candidates: all active non-superuser users. If we only showed
        // existing org members, an unowned org with no members would have
        // an empty list. The backend guard rejects superusers itself, but
        // we filter them out to avoid a pointless failed submit.
        setAssignLoading(true);
        try {
            const res = await api.get('/users/', {
                params: { page_size: 200, is_active: true },
            });
            const list = res.data?.results || res.data || [];
            setAssignCandidates(
                list.filter((u) => u && !u.is_superuser && u.is_active !== false)
            );
        } catch {
            toast.error('Could not load users to assign.');
            setAssignCandidates([]);
        } finally {
            setAssignLoading(false);
        }
    };

    const handleCloseAssign = () => {
        if (assigning) return;
        setAssignOpen(false);
        setSelectedAssignee(null);
        setAssignCandidates([]);
        setSelectedOrg(null);
    };

    const handleAssignOwner = async () => {
        if (!selectedOrg || !selectedAssignee) {
            toast.error('Please select a user to become the owner.');
            return;
        }
        setAssigning(true);
        try {
            await api.post(`/organizations/${selectedOrg.id}/assign-owner/`, {
                new_owner_user_id: selectedAssignee.id,
            });
            toast.success(
                `Owner assigned: ${selectedAssignee.name || selectedAssignee.username || selectedAssignee.email}.`
            );
            setAssignOpen(false);
            setSelectedAssignee(null);
            setAssignCandidates([]);
            setSelectedOrg(null);
            await refresh();
        } catch (err) {
            toast.error(formatApiError(err.response?.data, 'Failed to assign owner'));
        } finally {
            setAssigning(false);
        }
    };

    // -----------------------------------------------------------------------
    // Delete
    // -----------------------------------------------------------------------
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
            toast.error(formatApiError(err.response?.data, 'Failed to delete organization'));
        } finally {
            setDeleting(false);
        }
    };

    // -----------------------------------------------------------------------
    // Invite member
    // -----------------------------------------------------------------------
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
            toast.error(formatApiError(err.response?.data, 'Failed to send invitation.'));
        } finally {
            setIsInviting(false);
        }
    };

    // -----------------------------------------------------------------------
    // Create — stage 1
    // -----------------------------------------------------------------------
    const handleRequestCreate = () => {
        if (!formData.name.trim()) {
            toast.error('Organization name is required');
            return;
        }
        if (
            isPlatformAdmin &&
            selectedOwner &&
            currentUser &&
            selectedOwner.id === currentUser.id
        ) {
            toast.error(
                'A Platform Admin cannot own a tenant. Pick a different user, or leave the owner blank.'
            );
            return;
        }
        setStage(STAGE_CONFIRM);
    };

    // -----------------------------------------------------------------------
    // Create — stage 2
    // -----------------------------------------------------------------------
    const handleConfirmCreate = async () => {
        setCreating(true);
        try {
            const payload = { name: formData.name.trim() };

            if (isPlatformAdmin && selectedOwner) {
                if (currentUser && selectedOwner.id === currentUser.id) {
                    toast.error(
                        'A Platform Admin cannot own a tenant. Pick a different user, or leave the owner blank.'
                    );
                    setCreating(false);
                    setStage(STAGE_FORM);
                    return;
                }
                payload.owner_id = selectedOwner.id;
            }

            const response = await api.post('/organizations/', payload);
            const created = response.data || {};

            const serverOwner = created.owner_username;
            const ownerLabel = serverOwner
                ? serverOwner
                : isPlatformAdmin
                    ? 'unassigned'
                    : 'you';

            toast.success(`Organization created. Owner: ${ownerLabel}.`);

            setDialogOpen(false);
            resetDialog();
            await refresh();
        } catch (err) {
            toast.error(formatApiError(err.response?.data, 'Failed to create organization'));
            setStage(STAGE_FORM);
        } finally {
            setCreating(false);
        }
    };

    const ownerIntent = useMemo(
        () => resolveOwnerIntent({ selectedOwner, isPlatformAdmin }),
        [selectedOwner, isPlatformAdmin]
    );

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress />
            </LoadingWrapper>
        );
    }

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
                    New organizations you create will be <strong>unowned</strong>
                    {' '}unless you explicitly assign an owner. Use{' '}
                    <em>Assign Owner</em> from the organization's action menu
                    once a tenant owner exists.
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
                                        Owner: {org.owner_username || '— unassigned —'}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* ---- Action menu ---- */}
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

                <MenuItem
                    disabled={!selectedOrg || !canManageOrg(selectedOrg)}
                    onClick={() => {
                        if (!selectedOrg) return;
                        const id = selectedOrg.id;
                        handleCloseMenu();
                        navigate(`/app/organizations/${id}/team`);
                    }}
                >
                    <PeopleIcon fontSize="small" sx={{ mr: 1 }} />
                    Manage Members
                </MenuItem>

                <MenuItem
                    disabled={!selectedOrg || !canManageOrg(selectedOrg)}
                    onClick={() => selectedOrg && handleOpenInvite(selectedOrg)}
                >
                    <PersonAddIcon fontSize="small" sx={{ mr: 1 }} />
                    Invite Member
                </MenuItem>

                {/* ✅ FIX [#2/#3]: choose the right dialog based on current
                    ownership. Unowned org → assign-owner. Owned org →
                    transfer-ownership. Also update the label so the menu
                    reflects what will actually happen. */}
                <MenuItem
                    disabled={!selectedOrg || !canManageOrg(selectedOrg)}
                    onClick={() => {
                        if (!selectedOrg) return;
                        if (selectedOrg.owner_username) {
                            handleOpenTransfer(selectedOrg);
                        } else {
                            handleOpenAssignOwner(selectedOrg);
                        }
                    }}
                >
                    {selectedOrg?.owner_username ? (
                        <>
                            <TransferIcon fontSize="small" sx={{ mr: 1 }} />
                            Transfer Ownership
                        </>
                    ) : (
                        <>
                            <AssignOwnerIcon fontSize="small" sx={{ mr: 1 }} />
                            Assign Owner
                        </>
                    )}
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

            {/* ---- Create dialog ---- */}
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
                                    owner blank to create it <strong>unowned</strong>
                                    {' '}— you will then assign an owner afterward
                                    via <em>Assign Owner</em>.
                                </Alert>
                            ) : (
                                <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
                                    You will become the owner. You can invite other
                                    Admins or Staff from the Team page afterwards.
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
                                            helperText="Pick an existing Owner or Superuser to own this organization. Leave blank to create an unowned tenant (Platform Admin) or to own it yourself (Regular user)."
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
                                {ownerIntent.kind === 'assigned' && (
                                    <>
                                        You're about to create a new tenant owned by{' '}
                                        <strong>{ownerIntent.label}</strong>
                                        {ownerIntent.email ? ` (${ownerIntent.email})` : ''}.
                                        Venues, events, discounts, and policies
                                        created under it will belong to that
                                        organization.
                                    </>
                                )}
                                {ownerIntent.kind === 'unassigned' && (
                                    <>
                                        You're about to create a new{' '}
                                        <strong>unowned tenant</strong>. Use{' '}
                                        <em>Assign Owner</em> afterwards to
                                        hand it to a tenant owner. Venues, events,
                                        discounts, and policies created under it
                                        will belong to the organization, not to you.
                                    </>
                                )}
                                {ownerIntent.kind === 'self' && (
                                    <>
                                        You're about to become the owner of a new
                                        tenant. Venues, events, discounts, and
                                        policies you create will belong to it.
                                    </>
                                )}
                            </Alert>

                            <Typography variant="body2" sx={{ mb: 0.5 }}>
                                <strong>Name:</strong> {formData.name.trim()}
                            </Typography>

                            <Typography variant="body2">
                                <strong>Owner:</strong>{' '}
                                {ownerIntent.kind === 'assigned' ? (
                                    <>
                                        {ownerIntent.label}
                                        {ownerIntent.email ? ` (${ownerIntent.email})` : ''}
                                    </>
                                ) : ownerIntent.kind === 'unassigned' ? (
                                    <em>Unassigned — assign later</em>
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

            {/* ---- Edit dialog ---- */}
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

            {/* ---- Transfer ownership dialog (existing owner → new owner) ---- */}
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
                        The current owner will be retained as Admin.
                    </Alert>
                    {membersLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Autocomplete
                            options={members.filter((m) =>
                                m.role !== 'owner'
                                && m.is_active !== false
                                && (!selectedOrg?.owner || m.user_id !== selectedOrg.owner)
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

            {/* ---- ✅ FIX [#3]: Assign-owner dialog (unowned org → first owner) ---- */}
            <Dialog
                open={assignOpen}
                onClose={handleCloseAssign}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Assign Owner</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
                        <strong>{selectedOrg?.name}</strong> is currently unowned.
                        Choose the user who will own it. The new owner will receive
                        a full OWNER membership and become the canonical owner of
                        this organization.
                    </Alert>
                    {assignLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Autocomplete
                            options={assignCandidates}
                            value={selectedAssignee}
                            onChange={(_, value) => setSelectedAssignee(value)}
                            getOptionLabel={(option) => {
                                if (!option) return '';
                                const display =
                                    option.name
                                    || [option.first_name, option.last_name]
                                        .filter(Boolean).join(' ').trim()
                                    || option.username
                                    || option.email
                                    || '';
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
                            noOptionsText="No eligible users found"
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="New owner"
                                    helperText="Must be an existing, active, non-superuser account."
                                    disabled={assigning}
                                />
                            )}
                        />
                    )}
                    {selectedAssignee && (
                        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>
                                Selected owner
                            </Typography>
                            <Typography variant="body2">
                                {selectedAssignee.name
                                    || [selectedAssignee.first_name, selectedAssignee.last_name]
                                        .filter(Boolean).join(' ').trim()
                                    || selectedAssignee.username}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {selectedAssignee.email}
                            </Typography>
                        </Paper>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseAssign} disabled={assigning}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleAssignOwner}
                        disabled={assigning || !selectedAssignee}
                        startIcon={assigning ? <CircularProgress size={16} /> : <AssignOwnerIcon />}
                    >
                        Assign Owner
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ---- Delete dialog ---- */}
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

            {/* ---- Invite member dialog ---- */}
            <Dialog
                open={openInvite}
                onClose={handleCloseInvite}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: { bgcolor: 'background.paper', borderRadius: 3 },
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
                            Enter the email address of the person you want to invite.
                            They will receive a magic link to join your organization.
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
                            helperText="Ownership transfers only via Transfer Ownership."
                        >
                            <MenuItem value="member">Member</MenuItem>
                            <MenuItem value="staff">Staff</MenuItem>
                            <MenuItem value="admin">Admin</MenuItem>
                            {/* Owner intentionally omitted — backend rejects
                                owner invites. Use Transfer Ownership for
                                existing members or Assign Owner for unowned orgs. */}
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