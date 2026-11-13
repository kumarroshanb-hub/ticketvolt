// frontend/src/pages/Organizations/TeamMembers.js
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
    Box, Paper, Typography, TextField, Button, IconButton,
    Chip, Dialog, DialogTitle, DialogContent, DialogActions,
    CircularProgress, MenuItem, useMediaQuery, useTheme,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import {
    PersonAdd as PersonAddIcon,
    Close as CloseIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
} from '@mui/icons-material';
import { theme as appTheme } from '../../theme/tokens';
import { MEMBERSHIP_ROLES } from '../../constants';

const C = appTheme.colors;
const F = appTheme.fonts;

const formatApiError = (data, fallback = 'Request failed') => {
    if (!data) return fallback;
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return data.map(String).join('; ');
    if (typeof data === 'object') {
        const firstKey = Object.keys(data)[0];
        if (!firstKey) return fallback;
        const firstVal = data[firstKey];
        if (Array.isArray(firstVal)) return `${firstKey}: ${firstVal[0]}`;
        return `${firstKey}: ${firstVal}`;
    }
    return fallback;
};

// Local (not UTC) YYYY-MM-DD so the default "valid from" date matches the
// user's calendar day rather than shifting a day east/west of UTC.
const todayLocalISO = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const TeamMembers = () => {
    const { orgId } = useParams();
    const { t } = useTranslation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    useAuth();

    // The caller's *org* role comes from RoleContext, not user.role
    // (which is the platform role).
    const { hasOrgRole, isSuperAdmin } = useRole();
    const canRemoveMembers =
        isSuperAdmin || hasOrgRole(MEMBERSHIP_ROLES.OWNER);
    const canEditRoles = isSuperAdmin || hasOrgRole(MEMBERSHIP_ROLES.OWNER);

    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [removingId, setRemovingId] = useState(null);
    const [roleEditMember, setRoleEditMember] = useState(null);
    const [roleEditValue, setRoleEditValue] = useState(MEMBERSHIP_ROLES.MEMBER);
    const [savingRole, setSavingRole] = useState(false);

    // Invite modal state
    const [openInvite, setOpenInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    // Default MEMBER. OWNER is not a valid invite role.
    const [inviteRole, setInviteRole] = useState(MEMBERSHIP_ROLES.MEMBER);
    const [validFrom, setValidFrom] = useState(todayLocalISO());
    const [validUntil, setValidUntil] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchMembers = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const response = await api.get(`/organizations/${orgId}/members/`);
            setMembers(response.data.results || response.data || []);
        } catch (err) {
            console.error('Failed to fetch members:', err);
            setMembers([]);
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => { fetchMembers(); }, [fetchMembers]);

    const handleInvite = async (e) => {
        e.preventDefault();
        if (!inviteEmail || !inviteEmail.includes('@')) {
            toast.error(t('team.invalidEmail'));
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                email: inviteEmail.toLowerCase().trim(),
                role: inviteRole,
                valid_from: validFrom ? new Date(validFrom).toISOString() : undefined,
                valid_until: validUntil ? new Date(validUntil).toISOString() : undefined,
            };

            await api.post(`/organizations/${orgId}/invite/`, payload);

            toast.success(t('team.inviteSent', { email: payload.email }));
            setOpenInvite(false);
            setInviteEmail('');
            setValidUntil('');
            await fetchMembers();
        } catch (err) {
            const errorMsg = formatApiError(err.response?.data, t('team.inviteFailed'));
            toast.error(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Removal handler wired to DELETE members/<user_id>/.
    // Guard against a missing user_id so we never fire /members/undefined/.
    const handleRemoveMember = async (member) => {
        const userId = member.user_id;
        if (!userId) {
            toast.error(t('team.missingUserId'));
            return;
        }

        const label = member.name || member.full_name || member.email || t('team.thisMember');
        if (!window.confirm(t('team.removeConfirm', { name: label }))) return;

        setRemovingId(userId);
        try {
            await api.delete(`/organizations/${orgId}/members/${userId}/`);
            toast.success(t('team.removedSuccess', { name: label }));
            await fetchMembers();
        } catch (err) {
            toast.error(
                formatApiError(err.response?.data, t('team.removeFailed'))
            );
        } finally {
            setRemovingId(null);
        }
    };

    const openRoleEdit = (member) => {
        setRoleEditMember(member);
        setRoleEditValue(member.role);
    };

    const saveRole = async () => {
        if (!roleEditMember) return;
        setSavingRole(true);
        try {
            await api.patch(
                `/organizations/${orgId}/members/${roleEditMember.user_id}/`,
                { role: roleEditValue },
            );
            toast.success(t('team.roleUpdated', 'Role updated.'));
            setRoleEditMember(null);
            await fetchMembers();
        } catch (err) {
            toast.error(formatApiError(err.response?.data, t('team.roleUpdateFailed', 'Failed to update role.')));
        } finally {
            setSavingRole(false);
        }
    };

    const getRoleColor = (role) => {
        switch (role) {
            case 'owner':  return C.warning;
            case 'admin':  return C.info;
            case 'staff':  return C.secondary;
            case 'member': return C.primary;
            default:       return C.textSecondary;
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress sx={{ color: C.primary }} />
            </Box>
        );
    }

    return (
        <Box sx={{ p: isMobile ? 1 : 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: C.textPrimary, fontFamily: F.family }}>
                    {t('team.title')}
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<PersonAddIcon />}
                    onClick={() => setOpenInvite(true)}
                    sx={{
                        background: C.primaryGradient,
                        color: C.textInverse,
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: 2,
                    }}
                >
                    {t('team.inviteMember')}
                </Button>
            </Box>

            <TableContainer component={Paper} sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}`, bgcolor: C.bgCard }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>{t('team.member')}</TableCell>
                            <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>{t('team.role')}</TableCell>
                            <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>{t('team.validity')}</TableCell>
                            <TableCell sx={{ fontWeight: 600, color: C.textSecondary, textAlign: 'right' }}>{t('team.actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {members.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 4, color: C.textSecondary }}>
                                    {t('team.noMembers')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            members.map((member) => {
                                const memberLabel =
                                    member.name
                                    || member.full_name
                                    || member.username
                                    || member.email
                                    || '?';
                                const canRemoveRow =
                                    !member.is_owner
                                    && member.role !== 'owner'
                                    && canRemoveMembers
                                    && Boolean(member.user_id);
                                return (
                                    <TableRow key={member.id} hover>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                <Box sx={{
                                                    width: 36, height: 36, borderRadius: '50%',
                                                    bgcolor: `${getRoleColor(member.role)}20`,
                                                    color: getRoleColor(member.role),
                                                    display: 'flex', alignItems: 'center',
                                                    justifyContent: 'center', fontWeight: 700,
                                                }}>
                                                    {String(memberLabel).charAt(0).toUpperCase()}
                                                </Box>
                                                <Box>
                                                    <Typography variant="body2" sx={{ fontWeight: 600, color: C.textPrimary }}>
                                                        {memberLabel}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: C.textSecondary }}>
                                                        {member.email}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={t(`roles.org_${member.role}`, { defaultValue: member.role })}
                                                size="small"
                                                sx={{
                                                    bgcolor: `${getRoleColor(member.role)}15`,
                                                    color: getRoleColor(member.role),
                                                    fontWeight: 600,
                                                    textTransform: 'capitalize',
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                                {member.valid_from ? new Date(member.valid_from).toLocaleDateString() : '—'}
                                                {' → '}
                                                {member.valid_until ? new Date(member.valid_until).toLocaleDateString() : t('team.indefinite')}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            {canEditRoles && !member.is_owner && member.role !== 'owner' && (
                                                <IconButton
                                                    size="small"
                                                    sx={{ color: C.info, mr: 1 }}
                                                    onClick={() => openRoleEdit(member)}
                                                    title={t('team.editRole', 'Edit role')}
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                            {canRemoveRow && (
                                                <IconButton
                                                    size="small"
                                                    sx={{ color: C.error }}
                                                    onClick={() => handleRemoveMember(member)}
                                                    disabled={removingId === member.user_id}
                                                    title={t('team.removeTooltip', { name: memberLabel })}
                                                >
                                                    {removingId === member.user_id
                                                        ? <CircularProgress size={16} sx={{ color: C.error }} />
                                                        : <DeleteIcon fontSize="small" />}
                                                </IconButton>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Invite dialog */}
            <Dialog
                open={openInvite}
                onClose={() => !isSubmitting && setOpenInvite(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: { bgcolor: C.bgCard, border: `1px solid ${C.borderLight}`, borderRadius: 3 },
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: C.textPrimary, fontWeight: 700 }}>
                    {t('team.inviteMember')}
                    <IconButton onClick={() => setOpenInvite(false)} disabled={isSubmitting} sx={{ color: C.textSecondary }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <form onSubmit={handleInvite}>
                    <DialogContent sx={{ pt: 1 }}>
                        <Typography variant="body2" sx={{ color: C.textSecondary, mb: 3 }}>
                            {t('team.inviteDescription')}
                        </Typography>

                        <TextField
                            fullWidth
                            label={t('team.emailAddress')}
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            required
                            helperText={t('team.multiOrgInviteHint', 'They can belong to other organizations too; this invite adds membership here without affecting those.')}
                            sx={{ mb: 2.5, '& .MuiOutlinedInput-root': { bgcolor: C.bgInput } }}
                        />

                        {/* OWNER intentionally excluded — backend rejects it.
                            Ownership transfers only via the Organizations page. */}
                        <TextField
                            fullWidth
                            select
                            label={t('team.assignRole')}
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                            sx={{ mb: 2.5, '& .MuiOutlinedInput-root': { bgcolor: C.bgInput } }}
                            helperText={t('team.roleHelper')}
                        >
                            <MenuItem value={MEMBERSHIP_ROLES.MEMBER}>{t('roles.org_member')}</MenuItem>
                            <MenuItem value={MEMBERSHIP_ROLES.STAFF}>{t('roles.org_staff')}</MenuItem>
                        <MenuItem value={MEMBERSHIP_ROLES.FINANCE}>{t('roles.org_finance', 'Finance')}</MenuItem>
                            <MenuItem value={MEMBERSHIP_ROLES.ADMIN}>{t('roles.org_admin')}</MenuItem>
                        </TextField>

                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            <TextField
                                fullWidth
                                label={t('team.validFrom')}
                                type="date"
                                value={validFrom}
                                onChange={(e) => setValidFrom(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={{ flex: 1, minWidth: '140px', '& .MuiOutlinedInput-root': { bgcolor: C.bgInput } }}
                            />
                            <TextField
                                fullWidth
                                label={t('team.validUntil')}
                                type="date"
                                value={validUntil}
                                onChange={(e) => setValidUntil(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                helperText={t('team.validUntilHelper')}
                                sx={{ flex: 1, minWidth: '140px', '& .MuiOutlinedInput-root': { bgcolor: C.bgInput } }}
                            />
                        </Box>
                    </DialogContent>

                    <DialogActions sx={{ p: 2.5, pt: 0 }}>
                        <Button
                            onClick={() => setOpenInvite(false)}
                            disabled={isSubmitting}
                            sx={{ color: C.textSecondary, textTransform: 'none' }}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={isSubmitting || !inviteEmail}
                            sx={{
                                background: C.primaryGradient,
                                color: C.textInverse,
                                textTransform: 'none',
                                fontWeight: 600,
                                minWidth: 120,
                            }}
                        >
                            {isSubmitting ? <CircularProgress size={20} sx={{ color: C.textInverse }} /> : t('team.sendInvite')}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>

            <Dialog open={!!roleEditMember} onClose={() => setRoleEditMember(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('team.editRole', 'Edit role')}</DialogTitle>
                <DialogContent>
                    <TextField
                        select fullWidth sx={{ mt: 1 }}
                        label={t('team.role')}
                        value={roleEditValue}
                        onChange={(e) => setRoleEditValue(e.target.value)}
                    >
                        <MenuItem value={MEMBERSHIP_ROLES.MEMBER}>{t('roles.org_member')}</MenuItem>
                        <MenuItem value={MEMBERSHIP_ROLES.STAFF}>{t('roles.org_staff')}</MenuItem>
                        <MenuItem value={MEMBERSHIP_ROLES.FINANCE}>{t('roles.org_finance', 'Finance')}</MenuItem>
                        <MenuItem value={MEMBERSHIP_ROLES.ADMIN}>{t('roles.org_admin')}</MenuItem>
                    </TextField>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRoleEditMember(null)}>{t('common.cancel')}</Button>
                    <Button variant="contained" onClick={saveRole} disabled={savingRole}>{t('common.save')}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default TeamMembers;