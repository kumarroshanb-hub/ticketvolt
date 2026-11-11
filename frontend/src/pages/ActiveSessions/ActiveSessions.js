// frontend/src/pages/ActiveSessions/ActiveSessions.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, Paper, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, CircularProgress,
    TextField, Button, Chip, Alert, Tooltip, Switch, FormControlLabel,
    InputAdornment, IconButton, useMediaQuery, useTheme, Avatar,
    Divider, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import {
    Refresh as RefreshIcon,
    Search as SearchIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    Person as PersonIcon,
    People as PeopleIcon,
    Timer as TimerIcon,
    DevicesOther as DevicesIcon,
} from '@mui/icons-material';
import {
    PageContainer, PageHeader, PageTitle, PageHeaderLeft, PageHeaderRight,
    OutlineButton, LoadingWrapper,
} from '../../components/Common';
import activeSessionsService from '../../services/activeSessionsService';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { ROLES, ROLE_LABELS } from '../../constants';
import { theme } from '../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

const AUTO_REFRESH_MS = 30_000; // 30s

const StatCard = ({ title, value, icon, color, subtitle }) => (
    <Card sx={{ height: '100%', borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
        <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                    <Typography variant="caption" sx={{ color: C.textSecondary, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        {title}
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: C.textPrimary, mt: 1 }}>
                        {value}
                    </Typography>
                    {subtitle && (
                        <Typography variant="caption" sx={{ color: C.textSecondary }}>
                            {subtitle}
                        </Typography>
                    )}
                </Box>
                <Box sx={{ backgroundColor: `${color}15`, borderRadius: '50%', p: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {icon}
                </Box>
            </Box>
        </CardContent>
    </Card>
);

const formatRelative = (iso, t) => {
    if (!iso) return '—';
    const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (diff < 60) return t('activeSessions.suffixSeconds', { n: diff });
    if (diff < 3600) return t('activeSessions.suffixMinutes', { n: Math.floor(diff / 60) });
    if (diff < 86400) return t('activeSessions.suffixHours', { n: Math.floor(diff / 3600) });
    return t('activeSessions.suffixDays', { n: Math.floor(diff / 86400) });
};

const formatTimeToExpiry = (seconds, t) => {
    if (seconds == null) return '—';
    if (seconds <= 0) return t('activeSessions.expired');
    if (seconds < 60) return t('activeSessions.expirySeconds', { n: seconds });
    if (seconds < 3600) return t('activeSessions.expiryMinutes', { n: Math.floor(seconds / 60) });
    if (seconds < 86400) return t('activeSessions.expiryHours', { h: Math.floor(seconds / 3600), m: Math.floor((seconds % 3600) / 60) });
    return t('activeSessions.expiryDays', { d: Math.floor(seconds / 86400), h: Math.floor((seconds % 86400) / 3600) });
};

// NOTE: No STAFF branch — backend `_platform_role_label` emits only
// super_admin / admin / owner / user. Any unknown role falls through to default.
const roleChipColor = (role) => {
    switch (role) {
        case ROLES.SUPER_ADMIN: return { bg: `${C.success}1A`, color: C.successDark };
        case ROLES.ADMIN:       return { bg: `${C.info}1A`,    color: C.infoDark };
        case ROLES.OWNER:       return { bg: `${C.warning}1A`, color: C.warningDark };
        default:                return { bg: C.bgInput,        color: C.textSecondary };
    }
};

const ActiveSessions = () => {
    const { t } = useTranslation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [idleOnly, setIdleOnly] = useState(false);
    const [includeAnonymous, setIncludeAnonymous] = useState(false);
    const [idleMinutes, setIdleMinutes] = useState(30);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const load = useCallback(async (silent = false) => {
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError(null);

        try {
            const res = await activeSessionsService.getActiveSessions({
                includeAnonymous,
                idleMinutes,
            });
            setData(res);
        } catch (err) {
            const msg = err.response?.data?.error || err.message || t('activeSessions.loadFailed');
            setError(msg);
            if (!silent) toast.error(msg);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [includeAnonymous, idleMinutes, t]);

    useEffect(() => { load(false); }, [load]);

    // ── Auto-refresh ──
    useEffect(() => {
        if (!autoRefresh) return undefined;
        const id = setInterval(() => load(true), AUTO_REFRESH_MS);
        return () => clearInterval(id);
    }, [autoRefresh, load]);

    const sessions = data?.sessions || [];
    const summary = data?.summary || {};

    const roleKeyByRole = {
        [ROLES.SUPER_ADMIN]: 'roles.superAdmin',
        [ROLES.ADMIN]: 'roles.admin',
        [ROLES.OWNER]: 'roles.owner',
        [ROLES.USER]: 'roles.user',
    };
    const roleLabel = (role) => (roleKeyByRole[role] ? t(roleKeyByRole[role]) : (ROLE_LABELS[role] || role));

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return sessions.filter((s) => {
            if (idleOnly && !s.idle) return false;
            if (roleFilter !== 'all' && s.role !== roleFilter) return false;
            if (q) {
                const hay = `${s.username || ''} ${s.email || ''} ${s.full_name || ''} ${s.ip_address || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [sessions, search, roleFilter, idleOnly]);

    if (loading && !data) {
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
                    <PageTitle>{t('activeSessions.title')}</PageTitle>
                    {!isMobile && (
                        <Typography variant="body2" sx={{ color: C.textSecondary, ml: 2 }}>
                            {t('activeSessions.subtitle')}
                        </Typography>
                    )}
                </PageHeaderLeft>
                <PageHeaderRight>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                                size="small"
                            />
                        }
                        label={<Typography variant="caption">{t('activeSessions.autoRefresh')}</Typography>}
                        sx={{ mr: 1 }}
                    />
                    <OutlineButton
                        variant="outlined"
                        startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshIcon />}
                        onClick={() => load(false)}
                        disabled={refreshing}
                    >
                        {t('common.refresh')}
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {data && summary.idle_sessions > 0 && (
                <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
                    {t('activeSessions.idleAlert', {
                        count: summary.idle_sessions,
                        noun: t('activeSessions.idleAlertCount', { count: summary.idle_sessions }),
                        verb: summary.idle_sessions === 1 ? t('activeSessions.idleIs') : t('activeSessions.idleAre'),
                        idle: idleMinutes,
                    })}
                </Alert>
            )}

            {data && summary.total_sessions === 0 && (
                <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 2 }}>
                    {t('activeSessions.noSessionsTitle')}
                </Alert>
            )}

            {/* ── Stat cards ── */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title={t('activeSessions.statTotal')}
                        value={summary.total_sessions ?? 0}
                        icon={<DevicesIcon sx={{ color: C.primary }} />}
                        color={C.primary}
                        subtitle={t('activeSessions.statTotalSubtitle')}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title={t('activeSessions.statUnique')}
                        value={summary.unique_users ?? 0}
                        icon={<PeopleIcon sx={{ color: C.info }} />}
                        color={C.info}
                        subtitle={t('activeSessions.statUniqueSubtitle')}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title={t('activeSessions.statActive')}
                        value={(summary.authenticated_sessions ?? 0) - (summary.idle_sessions ?? 0)}
                        icon={<CheckCircleIcon sx={{ color: C.success }} />}
                        color={C.success}
                        subtitle={t('activeSessions.statActiveSubtitle')}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title={t('activeSessions.statIdle')}
                        value={summary.idle_sessions ?? 0}
                        icon={<TimerIcon sx={{ color: C.warning }} />}
                        color={C.warning}
                        subtitle={t('activeSessions.statIdleSubtitle', { n: idleMinutes })}
                    />
                </Grid>
            </Grid>

            {/* ── Filters ── */}
            <Paper sx={{ p: 2, mb: 2, borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={5}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder={t('activeSessions.searchPlaceholder')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ color: C.textMuted, fontSize: 18 }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                    </Grid>
                    <Grid item xs={6} md={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>{t('activeSessions.filterRoleLabel')}</InputLabel>
                            <Select
                                value={roleFilter}
                                label={t('activeSessions.filterRoleLabel')}
                                onChange={(e) => setRoleFilter(e.target.value)}
                            >
                                <MenuItem value="all">{t('activeSessions.filterRoleAll')}</MenuItem>
                                <MenuItem value={ROLES.SUPER_ADMIN}>{t('activeSessions.filterRoleSuperAdmin')}</MenuItem>
                                <MenuItem value={ROLES.ADMIN}>{t('activeSessions.filterRoleAdmin')}</MenuItem>
                                <MenuItem value={ROLES.OWNER}>{t('activeSessions.filterRoleOrganizer')}</MenuItem>
                                <MenuItem value={ROLES.USER}>{t('activeSessions.filterRoleUser')}</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={6} md={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>{t('activeSessions.filterIdleThreshold')}</InputLabel>
                            <Select
                                value={idleMinutes}
                                label={t('activeSessions.filterIdleThreshold')}
                                onChange={(e) => setIdleMinutes(Number(e.target.value))}
                            >
                                <MenuItem value={10}>{t('activeSessions.filterIdle10')}</MenuItem>
                                <MenuItem value={30}>{t('activeSessions.filterIdle30')}</MenuItem>
                                <MenuItem value={60}>{t('activeSessions.filterIdle60')}</MenuItem>
                                <MenuItem value={120}>{t('activeSessions.filterIdle120')}</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={6} md={2}>
                        <FormControlLabel
                            control={
                                <Switch
                                    size="small"
                                    checked={idleOnly}
                                    onChange={(e) => setIdleOnly(e.target.checked)}
                                />
                            }
                            label={<Typography variant="caption">{t('activeSessions.filterIdleOnly')}</Typography>}
                        />
                    </Grid>
                    <Grid item xs={6} md={1}>
                        <FormControlLabel
                            control={
                                <Switch
                                    size="small"
                                    checked={includeAnonymous}
                                    onChange={(e) => setIncludeAnonymous(e.target.checked)}
                                />
                            }
                            label={<Typography variant="caption">{t('activeSessions.filterIncludeAnon')}</Typography>}
                        />
                    </Grid>
                </Grid>
            </Paper>

            {/* ── Session list ── */}
            {isMobile ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {filtered.length === 0 ? (
                        <Paper sx={{ p: 4, textAlign: 'center', border: `1px solid ${C.borderLight}` }}>
                            <Typography sx={{ color: C.textMuted }}>{t('activeSessions.noMatching')}</Typography>
                        </Paper>
                    ) : filtered.map((s) => (
                        <Card key={s.session_key} sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
                            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                                    <Avatar sx={{ bgcolor: C.primaryGradient, width: 36, height: 36 }}>
                                        {(s.full_name || s.username || '?')[0].toUpperCase()}
                                    </Avatar>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: C.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {s.full_name || s.username || t('activeSessions.anonymous')}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: C.textMuted, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {s.email || '—'}
                                        </Typography>
                                    </Box>
                                    <Chip
                                        size="small"
                                        label={roleLabel(s.role)}
                                        sx={{
                                            bgcolor: roleChipColor(s.role).bg,
                                            color: roleChipColor(s.role).color,
                                            fontWeight: 600,
                                            fontSize: '10px',
                                        }}
                                    />
                                </Box>
                                <Divider sx={{ my: 1 }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                    <Typography variant="caption" sx={{ color: C.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>{t('activeSessions.colLastActivity')}</Typography>
                                    <Typography variant="caption" sx={{ color: s.idle ? C.warning : C.success, fontWeight: 600 }}>
                                        {s.last_activity ? formatRelative(s.last_activity, t) : '—'}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                    <Typography variant="caption" sx={{ color: C.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>{t('activeSessions.colExpiresIn')}</Typography>
                                    <Typography variant="caption" sx={{ color: C.textPrimary, fontWeight: 500 }}>
                                        {formatTimeToExpiry(s.seconds_to_expiry, t)}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption" sx={{ color: C.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>{t('activeSessions.colIp')}</Typography>
                                    <Typography variant="caption" sx={{ fontFamily: F.familyMono, color: C.textPrimary }}>
                                        {s.ip_address || '—'}
                                    </Typography>
                                </Box>
                            </CardContent>
                        </Card>
                    ))}
                </Box>
            ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>{t('activeSessions.colUser')}</TableCell>
                                <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>{t('activeSessions.colRole')}</TableCell>
                                <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>{t('activeSessions.colLastActivity')}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600, color: C.textSecondary }}>{t('activeSessions.colIdle')}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600, color: C.textSecondary }}>{t('activeSessions.colExpiresIn')}</TableCell>
                                <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>{t('activeSessions.colIp')}</TableCell>
                                <TableCell sx={{ fontWeight: 600, color: C.textSecondary }}>{t('activeSessions.colDevice')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                        <Typography sx={{ color: C.textMuted }}>{t('activeSessions.noMatching')}</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : filtered.map((s) => {
                                const rc = roleChipColor(s.role);
                                return (
                                    <TableRow key={s.session_key} hover sx={{ '&:hover': { backgroundColor: C.bgPrimary } }}>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                <Avatar sx={{ bgcolor: C.primaryGradient, width: 32, height: 32, fontSize: '13px' }}>
                                                    {(s.full_name || s.username || '?')[0].toUpperCase()}
                                                </Avatar>
                                                <Box sx={{ minWidth: 0 }}>
                                                    <Typography variant="body2" sx={{ fontWeight: 600, color: C.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                                                        {s.full_name || s.username || t('activeSessions.anonymous')}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: C.textMuted, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                                                        {s.email || '—'}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={roleLabel(s.role)}
                                                sx={{
                                                    bgcolor: rc.bg,
                                                    color: rc.color,
                                                    fontWeight: 600,
                                                    fontSize: '11px',
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ color: s.idle ? C.warning : C.success, fontWeight: 500 }}>
                                                {s.last_activity ? formatRelative(s.last_activity, t) : '—'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography variant="body2" sx={{ color: s.idle ? C.warning : C.textPrimary, fontFamily: F.familyMono }}>
                                                {s.idle_seconds != null ? `${Math.floor(s.idle_seconds / 60)}m` : '—'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography variant="body2" sx={{ color: C.textPrimary, fontFamily: F.familyMono }}>
                                                {formatTimeToExpiry(s.seconds_to_expiry, t)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption" sx={{ fontFamily: F.familyMono, color: C.textSecondary }}>
                                                {s.ip_address || '—'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Tooltip title={s.user_agent || t('activeSessions.unknown')}>
                                                <Typography variant="caption" sx={{ color: C.textSecondary, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                                    {s.user_agent ? s.user_agent.split(' ').slice(0, 3).join(' ') : '—'}
                                                </Typography>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <Typography variant="caption" sx={{ display: 'block', mt: 2, color: C.textMuted }}>
                {data?.generated_at && t('activeSessions.lastUpdated', { time: new Date(data.generated_at).toLocaleTimeString() })}
                {autoRefresh && ` ${t('activeSessions.autoRefreshHint')}`}
            </Typography>
        </PageContainer>
    );
};

export default ActiveSessions;