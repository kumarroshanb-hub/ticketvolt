// frontend/src/pages/Organizations/Organizations.js
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
    AdminPanelSettings as AssignOwnerIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
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

const ownerGroupKey = (u) => {
    if (!u) return 'Owner';
    if (u.is_superuser || u.role === 'super_admin') return 'Super Admin';
    return 'Owner';
};

const ownerGroupLabel = (u, t) =>
    ownerGroupKey(u) === 'Super Admin'
        ? t('organizations.superAdmin')
        : t('organizations.owner');

const resolveOwnerIntent = ({ selectedOwner, isPlatformAdmin }, t) => {
    if (selectedOwner) {
        return {
            kind: 'assigned',
            label:
                selectedOwner.name
                || [selectedOwner.first_name, selectedOwner.last_name]
                    .filter(Boolean).join(' ').trim()
                || selectedOwner.username
                || selectedOwner.email
                || t('organizations.selectedUser'),
            email: selectedOwner.email || null,
        };
    }
    if (isPlatformAdmin) {
        return { kind: 'unassigned', label: t('organizations.unassignedLater'), email: null };
    }
    return { kind: 'self', label: t('organizations.you'), email: null };
};

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

const displayName = (u) => {
    if (!u) return '';
    return (
        u.name
        || [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
        || u.username
        || u.email
        || ''
    );
};

const Organizations = () => {
    const { t } = useTranslation();
    const { organizations, loading, refresh, isPlatformAdmin } = useOrg();
    const { user: currentUser } = useAuth();
    const navigate = useNavigate();

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

    // Assign-owner dialog for unowned orgs.
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
        Boolean(org) && (isPlatformAdmin || org.is_owner || ['owner', 'admin'].includes(org.role));
    const canTransferOrg = (org) =>
        Boolean(org) && (isPlatformAdmin || org.is_owner || org.role === 'owner');
    const canDeleteOrg = () => Boolean(isPlatformAdmin);

    // Resolve the *live* owner label for an org. This is defensive: if the
    // serializer returns `owner_username` we use it directly. If it doesn't
    // (e.g. backend drops the field), we look up the freshest value from the
    // `organizations` list that the OrgContext keeps in sync. Never returns
    // null for an org that actually has an owner.
    const getOrgOwnerUsername = useCallback(
        (org) => {
            if (!org) return null;
            if (org.owner_username) return org.owner_username;
            const live = organizations.find((o) => o.id === org.id);
            return live?.owner_username || null;
        },
        [organizations],
    );

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
                    const oa = OWNER_GROUP_ORDER[ownerGroupKey(a)] ?? 99;
                    const ob = OWNER_GROUP_ORDER[ownerGroupKey(b)] ?? 99;
                    if (oa !== ob) return oa - ob;
                    const na = (a.name || a.username || a.email || '').toLowerCase();
                    const nb = (b.name || b.username || b.email || '').toLowerCase();
                    return na.localeCompare(nb);
                });

                if (!cancelled) setPotentialOwners(merged);
            } catch {
                if (!cancelled) {
                    toast.error(t('organizations.ownersLoadFailed'));
                    setPotentialOwners([]);
                }
            } finally {
                if (!cancelled) setOwnersLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [isPlatformAdmin, dialogOpen, currentUser, t]);

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
            toast.error(t('organizations.nameRequired'));
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
            toast.success(t('organizations.updatedSuccess'));
            setEditOpen(false);
            setEditForm(EMPTY_EDIT_FORM);
            setSelectedOrg(null);
            await refresh();
        } catch (err) {
            toast.error(formatApiError(err.response?.data, t('organizations.updateFailed')));
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
            toast.error(t('organizations.membersLoadFailed'));
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

    // Build the candidate list for transfer. We filter out anyone whose role
    // is already `owner` (that is the current owner — they cannot transfer to
    // themselves). The old code also compared `m.user_id !== selectedOrg.owner`
    // but `owner` is not part of the serializer and comparing user_id against
    // a username was always false. The `role !== 'owner'` check already
    // excludes the current owner, so that extra clause is removed.
    const transferCandidates = useMemo(() => {
        return members.filter((m) => !m.is_owner && m.role !== 'owner' && m.is_active !== false);
    }, [members]);

    const handleTransferOwnership = async () => {
        if (!selectedOrg || !selectedNewOwner) {
            toast.error(t('organizations.selectNewOwner'));
            return;
        }
        setTransferring(true);
        try {
            await api.post(`/organizations/${selectedOrg.id}/transfer-ownership/`, {
                new_owner_user_id: selectedNewOwner.user_id,
            });
            toast.success(t('organizations.transferSuccess', {
                name: selectedNewOwner.full_name || selectedNewOwner.email,
            }));
            setTransferOpen(false);
            setSelectedNewOwner(null);
            setMembers([]);
            setSelectedOrg(null);
            await refresh();
        } catch (err) {
            toast.error(formatApiError(err.response?.data, t('organizations.transferFailed')));
        } finally {
            setTransferring(false);
        }
    };

    // -----------------------------------------------------------------------
    // Assign owner (for UNOWNED orgs).
    //
    // Endpoint: POST /organizations/<id>/assign-owner/
    // Body:     { new_owner_user_id: <user_id> }
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
            toast.error(t('organizations.usersLoadFailed'));
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
            toast.error(t('organizations.selectAssignee'));
            return;
        }
        setAssigning(true);
        try {
            await api.post(`/organizations/${selectedOrg.id}/assign-owner/`, {
                new_owner_user_id: selectedAssignee.id,
            });
            toast.success(t('organizations.assignSuccess', {
                name: selectedAssignee.name || selectedAssignee.username || selectedAssignee.email,
            }));
            setAssignOpen(false);
            setSelectedAssignee(null);
            setAssignCandidates([]);
            setSelectedOrg(null);
            await refresh();
        } catch (err) {
            toast.error(formatApiError(err.response?.data, t('organizations.assignFailed')));
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
            toast.success(t('organizations.deletedSuccess'));
            setDeleteOpen(false);
            setSelectedOrg(null);
            await refresh();
        } catch (err) {
            toast.error(formatApiError(err.response?.data, t('organizations.deleteFailed')));
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
            toast.error(t('team.invalidEmail'));
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
            toast.success(t('team.inviteSent', { email: payload.email }));
            handleCloseInvite();
        } catch (err) {
            toast.error(formatApiError(err.response?.data, t('team.inviteFailed')));
        } finally {
            setIsInviting(false);
        }
    };

    // -----------------------------------------------------------------------
    // Create — stage 1
    // -----------------------------------------------------------------------
    const handleRequestCreate = () => {
        if (!formData.name.trim()) {
            toast.error(t('organizations.nameRequired'));
            return;
        }
        if (
            isPlatformAdmin &&
            selectedOwner &&
            currentUser &&
            selectedOwner.id === currentUser.id
        ) {
            toast.error(t('organizations.adminCannotOwn'));
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
                    toast.error(t('organizations.adminCannotOwn'));
                    setCreating(false);
                    setStage(STAGE_FORM);
                    return;
                }
                payload.owner_id = selectedOwner.id;
            }

            const response = await api.post('/organizations/', payload);
            const created = response.data || {};

            // Prefer the server-reported owner. If the backend assigned the
            // owner we requested but the serializer hasn't caught up, fall
            // back to the locally selected user so the toast is accurate.
            const serverOwner = created.owner_username
                || (isPlatformAdmin && selectedOwner
                    ? (selectedOwner.username || selectedOwner.email || null)
                    : null);
            const ownerLabel = serverOwner
                ? serverOwner
                : isPlatformAdmin
                    ? t('organizations.unassigned')
                    : t('organizations.you');

            toast.success(t('organizations.createdSuccess', { owner: ownerLabel }));

            setDialogOpen(false);
            resetDialog();
            await refresh();
        } catch (err) {
            toast.error(formatApiError(err.response?.data, t('organizations.createFailed')));
            setStage(STAGE_FORM);
        } finally {
            setCreating(false);
        }
    };

    const ownerIntent = useMemo(
        () => resolveOwnerIntent({ selectedOwner, isPlatformAdmin }, t),
        [selectedOwner, isPlatformAdmin, t]
    );

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress />
            </LoadingWrapper>
        );
    }

    // The effective owner label for the currently selected org. Uses the
    // live value from the organizations list when available, otherwise
    // falls back to the snapshot on `selectedOrg`.
    const selectedOrgOwner = getOrgOwnerUsername(selectedOrg);

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle>{t('organizations.title')}</PageTitle>
                    <PageSubtitle>
                        {t('organizations.subtitle')}
                    </PageSubtitle>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton startIcon={<RefreshIcon />} onClick={refresh}>
                        {t('common.refresh')}
                    </OutlineButton>
                    <PrimaryButton
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleOpen}
                    >
                        {t('organizations.newOrganization')}
                    </PrimaryButton>
                </PageHeaderRight>
            </PageHeader>

            {isPlatformAdmin && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    {t('organizations.platformAdminNotice')}
                </Alert>
            )}

            {organizations.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h6">{t('organizations.noOrganizations')}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                        {t('organizations.noOrganizationsHint')}
                    </Typography>
                    <PrimaryButton
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleOpen}
                    >
                        {t('organizations.createFirst')}
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
                                            <Tooltip title={t('organizations.orgActions')}>
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => handleOpenMenu(e, org)}
                                                    aria-label={t('organizations.actionsFor', { name: org.name })}
                                                >
                                                    <MoreVertIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </Stack>

                                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                        <Chip
                                            size="small"
                                            label={org.is_owner
                                                ? t('roles.owner')
                                                : t(`roles.org_${org.role || 'member'}`, {
                                                    defaultValue: org.role || 'member',
                                                })}
                                            color={
                                                org.is_owner || org.role === 'owner'
                                                    ? 'success'
                                                    : org.role === 'admin'
                                                        ? 'primary'
                                                        : org.role === 'staff'
                                                            ? 'secondary'
                                                            : 'default'
                                            }
                                        />
                                        {org.can_manage && (
                                            <Chip size="small" label={t('organizations.manage')} variant="outlined" />
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
                                        {t('organizations.ownerLabel', {
                                            owner: org.owner_username || t('organizations.unassigned'),
                                        })}
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
                    {t('organizations.editOrganization')}
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
                    {t('organizations.manageMembers')}
                </MenuItem>

                {/* Choose the right dialog based on the *live* owner. Uses
                    `selectedOrgOwner` so we don't rely solely on the stale
                    snapshot if the backend serializer lags. */}
                <MenuItem
                    disabled={!selectedOrg || !canManageOrg(selectedOrg)}
                    onClick={() => {
                        if (!selectedOrg) return;
                        if (selectedOrgOwner) {
                            handleOpenTransfer(selectedOrg);
                        } else {
                            handleOpenAssignOwner(selectedOrg);
                        }
                    }}
                >
                    {selectedOrgOwner ? (
                        <>
                            <TransferIcon fontSize="small" sx={{ mr: 1 }} />
                            {t('organizations.transferOwnership')}
                        </>
                    ) : (
                        <>
                            <AssignOwnerIcon fontSize="small" sx={{ mr: 1 }} />
                            {t('organizations.assignOwner')}
                        </>
                    )}
                </MenuItem>

                <MenuItem
                    disabled={!canDeleteOrg()}
                    onClick={() => selectedOrg && handleOpenDelete(selectedOrg)}
                    sx={{ color: 'error.main' }}
                >
                    <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
                    {t('organizations.deleteOrganization')}
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
                    {stage === STAGE_CONFIRM
                        ? t('organizations.confirmNewOrg')
                        : t('organizations.newOrganization')}
                </DialogTitle>

                <DialogContent>
                    {stage === STAGE_FORM && (
                        <>
                            {isPlatformAdmin ? (
                                <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
                                    {t('organizations.createAdminNotice')}
                                </Alert>
                            ) : (
                                <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
                                    {t('organizations.createSelfNotice')}
                                </Alert>
                            )}

                            <TextField
                                fullWidth
                                autoFocus
                                label={t('organizations.organizationName')}
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
                                    groupBy={(option) => ownerGroupLabel(option, t)}
                                    getOptionLabel={(option) => {
                                        if (!option) return '';
                                        const display = displayName(option);
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
                                        const isSuper = ownerGroupKey(option) === 'Super Admin';
                                        return (
                                            <li {...props}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                                        <Typography variant="body2" noWrap>
                                                            {displayName(option)}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary" noWrap>
                                                            {option.email}
                                                        </Typography>
                                                    </Box>
                                                    <Chip
                                                        size="small"
                                                        label={isSuper ? t('organizations.superAdmin') : t('organizations.owner')}
                                                        color={isSuper ? 'success' : 'warning'}
                                                        variant="outlined"
                                                    />
                                                </Box>
                                            </li>
                                        );
                                    }}
                                    noOptionsText={
                                        ownersLoading
                                            ? t('common.loading')
                                            : t('organizations.noOwnersFound')
                                    }
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label={t('organizations.assignOwnerOptional')}
                                            helperText={t('organizations.assignOwnerHelper')}
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
                                        {t('organizations.confirmAssigned', {
                                            name: ownerIntent.label,
                                        })}
                                        {ownerIntent.email ? ` (${ownerIntent.email})` : ''}
                                    </>
                                )}
                                {ownerIntent.kind === 'unassigned' && (
                                    <>
                                        {t('organizations.confirmUnassigned')}
                                    </>
                                )}
                                {ownerIntent.kind === 'self' && (
                                    <>
                                        {t('organizations.confirmSelf')}
                                    </>
                                )}
                            </Alert>

                            <Typography variant="body2" sx={{ mb: 0.5 }}>
                                <strong>{t('organizations.labelName')}</strong> {formData.name.trim()}
                            </Typography>

                            <Typography variant="body2">
                                <strong>{t('organizations.labelOwner')}</strong>{' '}
                                {ownerIntent.kind === 'assigned' ? (
                                    <>
                                        {ownerIntent.label}
                                        {ownerIntent.email ? ` (${ownerIntent.email})` : ''}
                                    </>
                                ) : ownerIntent.kind === 'unassigned' ? (
                                    <em>{t('organizations.unassignedLater')}</em>
                                ) : (
                                    t('organizations.you')
                                )}
                            </Typography>

                            <Divider sx={{ my: 2 }} />

                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {t('organizations.confirmFooter')}
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
                                {t('common.back')}
                            </Button>
                            <Button
                                variant="contained"
                                onClick={handleConfirmCreate}
                                disabled={creating}
                                startIcon={
                                    creating ? <CircularProgress size={16} /> : <AddIcon />
                                }
                            >
                                {t('organizations.confirmAndCreate')}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button onClick={handleClose} disabled={creating}>
                                {t('common.cancel')}
                            </Button>
                            <Button
                                variant="contained"
                                onClick={handleRequestCreate}
                                startIcon={<AddIcon />}
                            >
                                {t('organizations.continue')}
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
                <DialogTitle>{t('organizations.editOrganization')}</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
                        {t('organizations.settingsNotice')}
                    </Alert>
                    <TextField
                        fullWidth
                        label={t('organizations.organizationName')}
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        sx={{ mb: 2 }}
                        disabled={saving}
                    />
                    <TextField
                        fullWidth
                        label={t('organizations.orgEmail')}
                        value={editForm.org_email}
                        onChange={(e) => setEditForm({ ...editForm, org_email: e.target.value })}
                        sx={{ mb: 2 }}
                        disabled={saving}
                    />
                    <TextField
                        fullWidth
                        label={t('organizations.logoUrl')}
                        value={editForm.org_logo_url}
                        onChange={(e) => setEditForm({ ...editForm, org_logo_url: e.target.value })}
                        sx={{ mb: 2 }}
                        disabled={saving}
                    />
                    <TextField
                        fullWidth
                        label={t('organizations.emailSenderName')}
                        value={editForm.email_from_name}
                        onChange={(e) => setEditForm({ ...editForm, email_from_name: e.target.value })}
                        sx={{ mb: 2 }}
                        disabled={saving}
                    />
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label={t('organizations.currencyCode')}
                                value={editForm.currency_code}
                                onChange={(e) => setEditForm({ ...editForm, currency_code: e.target.value })}
                                disabled={saving}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label={t('organizations.timezone')}
                                value={editForm.default_timezone}
                                onChange={(e) => setEditForm({ ...editForm, default_timezone: e.target.value })}
                                disabled={saving}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseEdit} disabled={saving}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleSaveEdit}
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={16} /> : <EditIcon />}
                    >
                        {t('settings.saveChanges')}
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
                <DialogTitle>{t('organizations.transferOwnership')}</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2, mt: 1 }}>
                        {t('organizations.transferNotice', { name: selectedOrg?.name })}
                    </Alert>
                    {membersLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Autocomplete
                            options={transferCandidates}
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
                            noOptionsText={t('organizations.noEligibleMembers')}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label={t('organizations.newOwner')}
                                    helperText={t('organizations.newOwnerHelper')}
                                    disabled={transferring}
                                />
                            )}
                        />
                    )}
                    {selectedNewOwner && (
                        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>
                                {t('organizations.selectedNewOwner')}
                            </Typography>
                            <Typography variant="body2">
                                {selectedNewOwner.full_name || selectedNewOwner.username}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {t('organizations.currentRole', {
                                    email: selectedNewOwner.email,
                                    role: t(`roles.org_${selectedNewOwner.role}`, {
                                        defaultValue: selectedNewOwner.role,
                                    }),
                                })}
                            </Typography>
                        </Paper>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseTransfer} disabled={transferring}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleTransferOwnership}
                        disabled={transferring || !selectedNewOwner}
                        startIcon={transferring ? <CircularProgress size={16} /> : <TransferIcon />}
                    >
                        {t('organizations.confirmTransfer')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ---- Assign-owner dialog (unowned org → first owner) ---- */}
            <Dialog
                open={assignOpen}
                onClose={handleCloseAssign}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{t('organizations.assignOwner')}</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
                        {t('organizations.assignNotice', { name: selectedOrg?.name })}
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
                                const display = displayName(option);
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
                            noOptionsText={t('organizations.noEligibleUsers')}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label={t('organizations.newOwner')}
                                    helperText={t('organizations.assignHelper')}
                                    disabled={assigning}
                                />
                            )}
                        />
                    )}
                    {selectedAssignee && (
                        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>
                                {t('organizations.selectedOwner')}
                            </Typography>
                            <Typography variant="body2">
                                {displayName(selectedAssignee)}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {selectedAssignee.email}
                            </Typography>
                        </Paper>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseAssign} disabled={assigning}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleAssignOwner}
                        disabled={assigning || !selectedAssignee}
                        startIcon={assigning ? <CircularProgress size={16} /> : <AssignOwnerIcon />}
                    >
                        {t('organizations.assignOwner')}
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
                <DialogTitle>{t('organizations.deleteOrganization')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('organizations.deleteConfirm', { name: selectedOrg?.name })}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDelete} disabled={deleting}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={handleDeleteOrg}
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}
                    >
                        {t('common.delete')}
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
                    {t('team.inviteMember')}
                    <IconButton onClick={handleCloseInvite} disabled={isInviting} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <form onSubmit={handleInviteSubmit}>
                    <DialogContent sx={{ pt: 1 }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                            {t('team.inviteDescription')}
                        </Typography>

                        <TextField
                            fullWidth
                            label={t('team.emailAddress')}
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
                            label={t('team.assignRole')}
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                            sx={{ mb: 2.5 }}
                            disabled={isInviting}
                            helperText={t('team.roleHelper')}
                        >
                            <MenuItem value="member">{t('roles.org_member')}</MenuItem>
                            <MenuItem value="staff">{t('roles.org_staff')}</MenuItem>
                            <MenuItem value="admin">{t('roles.org_admin')}</MenuItem>
                            {/* Owner intentionally omitted — backend rejects
                                owner invites. Use Transfer Ownership for
                                existing members or Assign Owner for unowned orgs. */}
                        </TextField>

                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            <TextField
                                fullWidth
                                label={t('team.validFrom')}
                                type="date"
                                value={validFrom}
                                onChange={(e) => setValidFrom(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={{ flex: 1, minWidth: '140px' }}
                                disabled={isInviting}
                            />
                            <TextField
                                fullWidth
                                label={t('team.validUntil')}
                                type="date"
                                value={validUntil}
                                onChange={(e) => setValidUntil(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                helperText={t('team.validUntilHelper')}
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
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={isInviting || !inviteEmail}
                            sx={{ minWidth: 120 }}
                        >
                            {isInviting ? <CircularProgress size={20} /> : t('team.sendInvite')}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </PageContainer>
    );
};

export default Organizations;