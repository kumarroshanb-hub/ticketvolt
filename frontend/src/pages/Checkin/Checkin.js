// frontend/src/pages/Checkin/Checkin.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    TextField,
    Button,
    Chip,
    IconButton,
    Alert,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Divider,
    Avatar,
    InputAdornment,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import {
    QrCodeScanner as ScannerIcon,
    CameraAlt as CameraIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    History as HistoryIcon,
    Person as PersonIcon,
    Event as EventIcon,
    Refresh as RefreshIcon,
    Search as SearchIcon,
    AccessTime as AccessTimeIcon,
    Verified as VerifiedIcon,
    Warning as WarningIcon,
    Info as InfoIcon,
    Close as CloseIcon,
    Keyboard as KeyboardIcon,
    Today as TodayIcon,
    Error as ErrorIcon,
    Check as CheckIcon,
    Undo as UndoIcon,
    Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { toast } from 'react-toastify';

import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageHeaderLeft,
    PageHeaderRight,
    OutlineButton,
    LoadingWrapper,
    OrgFilterSelect,
} from '../../components/Common';
import usePlatformFilter from '../../hooks/usePlatformFilter';

import { theme } from '../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

// ============================================
// CHECK-IN LOG STATUS → UI PRESENTATION
// ============================================
const LOG_STATUS_UI = {
    success: {
        labelKey: 'checkin.statusSuccess',
        color: 'success',
        icon: <CheckCircleIcon fontSize="small" />,
    },
    failed: {
        labelKey: 'checkin.statusFailed',
        color: 'error',
        icon: <CancelIcon fontSize="small" />,
    },
    cancelled: {
        labelKey: 'checkin.statusCancelled',
        color: 'warning',
        icon: <UndoIcon fontSize="small" />,
    },
};

const getLogStatusUI = (status, t) =>
    LOG_STATUS_UI[status] ? {
        ...LOG_STATUS_UI[status],
        label: t(LOG_STATUS_UI[status].labelKey),
    } : {
        label: status ? status.charAt(0).toUpperCase() + status.slice(1) : t('checkin.statusUnknown'),
        color: 'default',
        icon: <InfoIcon fontSize="small" />,
    };

// ============================================
// STAT CARD
// ============================================
const StatCard = ({ title, value, icon, color, subtitle }) => (
    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid rgba(226, 232, 240, 1)' }}>
        <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: 0.5 }}>
                        {title}
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mt: 1 }}>
                        {value}
                    </Typography>
                    {subtitle && (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {subtitle}
                        </Typography>
                    )}
                </Box>
                <Box
                    sx={{
                        backgroundColor: `${color}15`,
                        borderRadius: '50%',
                        p: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {icon}
                </Box>
            </Box>
        </CardContent>
    </Card>
);

// ============================================
// VERIFICATION RESULT COMPONENT
// ============================================
const VerificationResult = ({ result, onCheckIn, onReset, checkingIn }) => {
    const { t } = useTranslation();
    if (!result) return null;

    const getResultColor = () => {
        switch (result.type) {
            case 'success': return C.success;
            case 'error': return C.error;
            case 'warning': return C.warning;
            case 'info': return C.info;
            default: return C.textSecondary;
        }
    };

    const getResultIcon = () => {
        switch (result.type) {
            case 'success': return <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main' }} />;
            case 'error': return <CancelIcon sx={{ fontSize: 48, color: 'error.main' }} />;
            case 'warning': return <WarningIcon sx={{ fontSize: 48, color: 'warning.main' }} />;
            case 'info': return <InfoIcon sx={{ fontSize: 48, color: 'info.main' }} />;
            default: return <InfoIcon sx={{ fontSize: 48, color: 'text.secondary' }} />;
        }
    };

    return (
        <Box sx={{ mt: 2 }}>
            <Alert
                severity={result.type === 'success' ? 'success' : result.type === 'warning' ? 'warning' : result.type === 'error' ? 'error' : 'info'}
                sx={{
                    borderRadius: 2,
                    '& .MuiAlert-icon': { fontSize: 32 }
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    {getResultIcon()}
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600, color: getResultColor() }}>
                            {result.title}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {result.message}
                        </Typography>
                    </Box>
                </Box>
            </Alert>

            {result.ticket && (
                <Paper sx={{ p: 2, mt: 2, borderRadius: 2, border: '1px solid rgba(226, 232, 240, 1)' }}>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
                                    <PersonIcon />
                                </Avatar>
                                <Box>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                        {t('checkin.colAttendee')}
                                    </Typography>
                                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                        {result.ticket.attendee_name || t('checkin.guest')}
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <VerifiedIcon sx={{ color: 'primary.main' }} />
                                <Box>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                        {t('booking.ticketCode')}
                                    </Typography>
                                    <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 600, wordBreak: 'break-all' }}>
                                        {result.ticket.code}
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <EventIcon sx={{ color: 'primary.main' }} />
                                <Box>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                        {t('checkin.colEvent')}
                                    </Typography>
                                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                        {result.ticket.event || t('common.nA')}
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>
                        {result.checkin_time && (
                            <Grid item xs={12} sm={6}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <AccessTimeIcon sx={{ color: 'success.main' }} />
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                            {t('booking.checkedIn')}
                                        </Typography>
                                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                            {new Date(result.checkin_time).toLocaleTimeString()}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>
                        )}
                    </Grid>
                </Paper>
            )}

            <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {result.type === 'success' && !result.checkin_time && (
                    <Button
                        variant="contained"
                        color="success"
                        startIcon={<CheckCircleIcon />}
                        onClick={onCheckIn}
                        disabled={checkingIn}
                        sx={{ flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
                    >
                        {checkingIn ? t('checkin.checkingIn') : t('checkin.confirmCheckIn')}
                    </Button>
                )}
                <Button
                    variant="outlined"
                    startIcon={<CloseIcon />}
                    onClick={onReset}
                    sx={{ flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
                >
                    {t('checkin.reset')}
                </Button>
            </Box>
        </Box>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================
const Checkin = () => {
    const { params, isPlatformAdmin, orgFilter, setOrgFilter, organizations } = usePlatformFilter();
    const { t } = useTranslation();
    const { user } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [loading, setLoading] = useState(true);
    const [manualCode, setManualCode] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [checkingIn, setCheckingIn] = useState(false);
    const [result, setResult] = useState(null);
    const [history, setHistory] = useState([]);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [openScanner, setOpenScanner] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const historyResponse = await api.get('/checkin/history/', {
                params: { ...params, limit: 100 },
            });

            const raw = historyResponse.data;
            const historyData = Array.isArray(raw?.history)
                ? raw.history
                : Array.isArray(raw)
                    ? raw
                    : [];

            setHistory(historyData);
        } catch (error) {
            console.error('Error loading check-in data:', error);
            toast.error(t('checkin.loadFailed'));
            setHistory([]);
        } finally {
            setLoading(false);
        }
    }, [t, params]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const stats = useMemo(() => {
        const total = history.length;
        const success = history.filter((h) => h.status === 'success').length;
        const failed = history.filter((h) => h.status === 'failed').length;
        const cancelled = history.filter((h) => h.status === 'cancelled').length;

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const today = history.filter((h) => {
            if (!h.checked_in_at) return false;
            return new Date(h.checked_in_at) >= startOfToday;
        }).length;

        return {
            total_scans: total,
            today_scans: today,
            success_scans: success,
            failed_scans: failed,
            cancelled_scans: cancelled,
        };
    }, [history]);

    // ============================================================
    // VERIFY (read-only)
    // ------------------------------------------------------------
    // ✅ FIX [404-VS-403-COLLAPSE]:
    // The backend now returns a uniform 404 with
    //   { code: 'TICKET_NOT_FOUND' }        for unknown codes, AND
    //   { code: 'PERMISSION_DENIED' }       for cross-org access.
    // Both are `detail` payloads on a 404. The previous catch only
    // branched on OUTSIDE_SLOT_WINDOW / is_checked_in / TICKET_USED
    // and then fell through to `errorData.detail` — which meant a
    // 404 with TICKET_NOT_FOUND surfaced as a red "Invalid Ticket"
    // (fine) BUT a 404 with PERMISSION_DENIED also surfaced as the
    // same message (confusing for an operator who actually *does*
    // have access elsewhere). We now branch on `code` explicitly:
    //   TICKET_NOT_FOUND → "Invalid Ticket"
    //   PERMISSION_DENIED → neutral "not permitted" warning
    // No UI path depends on the old 403 shape.
    // ============================================================
    const verifyTicket = async (code) => {
        setVerifying(true);
        setResult(null);

        try {
            const response = await api.post('/checkin/manual-verify/', {
                code: code.trim(),
            });

            if (response.data?.valid) {
                const slotWindow = response.data?.slot_window;

                if (slotWindow && slotWindow.open === false) {
                    setResult({
                        type: 'warning',
                        title: t('checkin.outsideSlotWindow'),
                        message:
                            slotWindow.message ||
                            t('checkin.outsideSlotMessage'),
                        ticket: response.data.ticket,
                    });
                } else {
                    setResult({
                        type: 'success',
                        title: t('checkin.ticketValid'),
                        message: t('checkin.ticketValidMessage'),
                        ticket: response.data.ticket,
                    });
                }
            } else {
                setResult({
                    type: 'error',
                    title: t('checkin.ticketInvalid'),
                    message: response.data?.detail || t('checkin.ticketInvalidMessage'),
                    ticket: response.data?.ticket,
                });
            }
        } catch (error) {
            const errorData = error.response?.data;
            const errCode = errorData?.code;

            // ✅ FIX [404-VS-403-COLLAPSE]: explicit code branches first.
            if (errCode === 'TICKET_NOT_FOUND') {
                setResult({
                    type: 'error',
                    title: t('checkin.ticketInvalid'),
                    message: errorData?.detail || t('checkin.noTicketMatches'),
                    ticket: errorData?.ticket,
                });
            } else if (errCode === 'PERMISSION_DENIED') {
                setResult({
                    type: 'warning',
                    title: t('checkin.notPermitted'),
                    message:
                        errorData?.detail ||
                        t('checkin.notPermittedMessage'),
                    ticket: errorData?.ticket,
                });
            } else if (errCode === 'OUTSIDE_SLOT_WINDOW') {
                setResult({
                    type: 'warning',
                    title: t('checkin.outsideSlotWindow'),
                    message: errorData.detail,
                    ticket: errorData?.ticket,
                });
            } else if (errorData?.ticket?.is_checked_in) {
                setResult({
                    type: 'warning',
                    title: t('checkin.alreadyCheckedIn'),
                    message: t('checkin.alreadyCheckedInMessage'),
                    ticket: errorData.ticket,
                });
            } else if (
                errCode === 'TICKET_USED' ||
                errorData?.detail?.includes('already been used')
            ) {
                setResult({
                    type: 'warning',
                    title: t('checkin.alreadyUsed'),
                    message: t('checkin.alreadyUsedMessage'),
                    ticket: errorData?.ticket,
                });
            } else if (errorData?.detail) {
                setResult({
                    type: 'error',
                    title: t('checkin.ticketInvalid'),
                    message: errorData.detail,
                    ticket: errorData?.ticket,
                });
            } else {
                setResult({
                    type: 'error',
                    title: t('checkin.verificationFailed'),
                    message: t('checkin.verificationFailedMessage'),
                    ticket: null,
                });
            }
        } finally {
            setVerifying(false);
        }
    };

    // ============================================================
    // CHECK-IN (state-changing)
    // ------------------------------------------------------------
    // ✅ FIX [404-VS-403-COLLAPSE]: same explicit code branching.
    // ============================================================
    const checkInTicket = async (code) => {
        setCheckingIn(true);

        try {
            const response = await api.post('/checkin/manual/', {
                code: code.trim(),
                device_id: 'admin-panel',
            });

            if (response.data?.success) {
                setResult({
                    type: 'success',
                    title: t('checkin.checkInSuccess'),
                    message: response.data.message,
                    ticket: response.data.ticket,
                    checkin_time: response.data.checkin_time,
                });
                toast.success(t('checkin.checkInSuccessToast'));
                loadData();
            } else {
                setResult({
                    type: 'error',
                    title: t('checkin.checkInFailed'),
                    message: response.data?.detail || t('checkin.checkInRejected'),
                    ticket: response.data?.ticket,
                });
                toast.error(response.data?.detail || t('checkin.checkInFailed'));
            }
        } catch (error) {
            const errorData = error.response?.data;
            const errCode = errorData?.code;
            let title = t('checkin.checkInFailed');
            let message = errorData?.detail || t('checkin.checkInUnexpected');
            let resultType = 'error';

            // ✅ FIX [404-VS-403-COLLAPSE]
            if (errCode === 'TICKET_NOT_FOUND') {
                title = t('checkin.ticketInvalid');
                message = errorData?.detail || t('checkin.noTicketMatches');
                resultType = 'error';
            } else if (errCode === 'PERMISSION_DENIED') {
                title = t('checkin.notPermitted');
                message =
                    errorData?.detail ||
                    t('checkin.notPermittedMessage');
                resultType = 'warning';
            } else if (errCode === 'OUTSIDE_SLOT_WINDOW') {
                title = t('checkin.checkInInvalidTime');
                resultType = 'warning';
            }

            setResult({
                type: resultType,
                title: title,
                message: message,
                ticket: errorData?.ticket,
            });
            toast.error(message);
        } finally {
            setCheckingIn(false);
        }
    };

    const handleManualEntry = async (e) => {
        e.preventDefault();
        if (!manualCode.trim()) return;
        await verifyTicket(manualCode.trim());
    };

    const handleCheckIn = () => {
        if (result?.ticket?.code) {
            checkInTicket(result.ticket.code);
        }
    };

    const handleReset = () => {
        setResult(null);
        setManualCode('');
    };

    const filteredHistory = useMemo(() => {
        const q = search.trim().toLowerCase();

        return history.filter((item) => {
            if (q) {
                const code = (item.code || '').toLowerCase();
                const name = (item.attendee_name || '').toLowerCase();
                if (!code.includes(q) && !name.includes(q)) return false;
            }

            if (filter === 'all') return true;
            if (filter === 'success') return item.status === 'success';
            if (filter === 'failed') return item.status === 'failed';
            if (filter === 'cancelled') return item.status === 'cancelled';
            return true;
        });
    }, [history, search, filter]);

    const formatDateTime = (dateString) => {
        if (!dateString) return { date: t('common.nA'), time: t('common.nA') };
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return { date: t('common.nA'), time: t('common.nA') };
        return {
            date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            time: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        };
    };

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: 'primary.main' }} />
            </LoadingWrapper>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle variant="h4">{t('checkin.title')}</PageTitle>
                    {!isMobile && (
                        <Typography variant="body2" sx={{ color: 'text.secondary', ml: 2 }}>
                            {t('checkin.subtitle')}
                        </Typography>
                    )}
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OrgFilterSelect
                        isPlatformAdmin={isPlatformAdmin}
                        organizations={organizations}
                        orgFilter={orgFilter}
                        setOrgFilter={setOrgFilter}
                    />
                    <OutlineButton variant="outlined" startIcon={<RefreshIcon />} onClick={loadData}>
                        {t('common.refresh')}
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            {/* Stats Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title={t('checkin.statTotal')}
                        value={stats.total_scans}
                        icon={<ScannerIcon sx={{ color: C.primary }} />}
                        color={C.primary}
                        subtitle={isMobile ? undefined : t('checkin.statAllSubtitle')}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title={t('checkin.statToday')}
                        value={stats.today_scans}
                        icon={<TodayIcon sx={{ color: C.success }} />}
                        color={C.success}
                        subtitle={isMobile ? undefined : t('checkin.statTodaySubtitle')}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title={t('checkin.statSuccess')}
                        value={stats.success_scans}
                        icon={<CheckCircleIcon sx={{ color: C.info }} />}
                        color={C.info}
                        subtitle={isMobile ? undefined : t('checkin.statSuccessSubtitle')}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title={t('checkin.statFailed')}
                        value={stats.failed_scans}
                        icon={<ErrorIcon sx={{ color: C.error }} />}
                        color={C.error}
                        subtitle={isMobile ? undefined : t('checkin.statFailedSubtitle')}
                    />
                </Grid>
            </Grid>

            {/* Main Content */}
            <Grid container spacing={3}>
                {/* Left Column - Scanner */}
                <Grid item xs={12} md={5}>
                    <Card sx={{ borderRadius: 2, border: '1px solid rgba(226, 232, 240, 1)' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                                    <ScannerIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                                    {t('checkin.ticketScanner')}
                                </Typography>
                                <Tooltip title={t('checkin.openCamera')}>
                                    <IconButton
                                        color="primary"
                                        onClick={() => setOpenScanner(true)}
                                        sx={{ border: '1px solid rgba(51, 51, 51, 1)' }}
                                    >
                                        <CameraIcon />
                                    </IconButton>
                                </Tooltip>
                            </Box>

                            <Box
                                sx={{
                                    background: `linear-gradient(135deg, ${C.scannerBg} 0%, ${C.scannerPanel} 50%, ${C.scannerPanelAlt} 100%)`,
                                    borderRadius: 2,
                                    height: isMobile ? 180 : 250,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    position: 'relative',
                                    mb: 2,
                                    overflow: 'hidden',
                                }}
                            >
                                <Box sx={{ textAlign: 'center', color: 'white', px: 2 }}>
                                    <ScannerIcon sx={{ fontSize: isMobile ? 48 : 64, color: C.scannerAccent, mb: 2 }} />
                                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                        {t('checkin.readyToScan')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.7 }}>
                                        {t('checkin.readyHint')}
                                    </Typography>
                                </Box>
                            </Box>

                            <Alert
                                severity="info"
                                icon={<ScheduleIcon fontSize="small" />}
                                sx={{
                                    mb: 2,
                                    borderRadius: 2,
                                    '& .MuiAlert-message': { fontSize: '0.75rem' },
                                }}
                            >
                                {t('checkin.slotWindowHint')}
                            </Alert>

                            <Box component="form" onSubmit={handleManualEntry} sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
                                    <KeyboardIcon sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                                    {t('checkin.manualCodeTitle')}
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder={t('checkin.manualCodePlaceholder')}
                                    value={manualCode}
                                    onChange={(e) => setManualCode(e.target.value)}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <VerifiedIcon sx={{ color: 'primary.main' }} />
                                            </InputAdornment>
                                        ),
                                    }}
                                />
                                <Button
                                    fullWidth
                                    variant="contained"
                                    type="submit"
                                    disabled={verifying || !manualCode.trim()}
                                    startIcon={verifying ? <CircularProgress size={20} color="inherit" /> : <CheckIcon />}
                                    sx={{ mt: 1 }}
                                >
                                    {verifying ? t('checkin.verifying') : t('checkin.verifyTicket')}
                                </Button>
                            </Box>

                            <VerificationResult
                                result={result}
                                onCheckIn={handleCheckIn}
                                onReset={handleReset}
                                checkingIn={checkingIn}
                            />
                        </CardContent>
                    </Card>
                </Grid>

                {/* Right Column - History */}
                <Grid item xs={12} md={7}>
                    <Card sx={{ borderRadius: 2, border: '1px solid rgba(226, 232, 240, 1)' }}>
                        <CardContent>
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    justifyContent: 'space-between',
                                    alignItems: isMobile ? 'stretch' : 'center',
                                    gap: 1.5,
                                    mb: 2,
                                }}
                            >
                                <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                                    <HistoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                                    {t('checkin.recentCheckins')}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, width: isMobile ? '100%' : 'auto' }}>
                                    <TextField
                                        size="small"
                                        placeholder={t('checkin.searchPlaceholder')}
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <SearchIcon sx={{ fontSize: 18 }} />
                                                </InputAdornment>
                                            ),
                                        }}
                                        sx={{ flex: isMobile ? 1 : 'unset', width: isMobile ? 'auto' : 180 }}
                                    />
                                    <TextField
                                        select
                                        size="small"
                                        value={filter}
                                        onChange={(e) => setFilter(e.target.value)}
                                        sx={{ flex: isMobile ? 1 : 'unset', width: isMobile ? 'auto' : 140 }}
                                        SelectProps={{ native: true }}
                                    >
                                        <option value="all">{t('checkin.filterAll')}</option>
                                        <option value="success">{t('checkin.filterSuccess')}</option>
                                        <option value="failed">{t('checkin.filterFailed')}</option>
                                        <option value="cancelled">{t('checkin.filterCancelled')}</option>
                                    </TextField>
                                </Box>
                            </Box>

                            {isMobile ? (
                                filteredHistory.length > 0 ? (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                        {filteredHistory.map((item) => {
                                            const { date, time } = formatDateTime(item.checked_in_at);
                                            const statusUI = getLogStatusUI(item.status, t);
                                            const rowKey = item.id || `${item.code}-${item.checked_in_at}`;

                                            return (
                                                <Card
                                                    key={rowKey}
                                                    sx={{
                                                        borderRadius: 2,
                                                        border: '1px solid rgba(226, 232, 240, 1)',
                                                        overflow: 'hidden',
                                                    }}
                                                >
                                                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, gap: 1 }}>
                                                            <Typography
                                                                variant="subtitle2"
                                                                sx={{
                                                                    fontFamily: 'monospace',
                                                                    fontWeight: 700,
                                                                    color: 'text.primary',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap',
                                                                    flex: 1,
                                                                }}
                                                            >
                                                                {item.code || 'N/A'}
                                                            </Typography>
                                                            <Chip
                                                                size="small"
                                                                label={statusUI.label}
                                                                icon={statusUI.icon}
                                                                color={statusUI.color}
                                                                variant="outlined"
                                                            />
                                                        </Box>

                                                        <Divider sx={{ my: 1 }} />

                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                            <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', fontWeight: 600 }}>
                                                                {t('checkin.colAttendee')}
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
                                                                {item.attendee_name || t('checkin.guest')}
                                                            </Typography>
                                                        </Box>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                            <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', fontWeight: 600 }}>
                                                                {t('checkin.colEvent')}
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
                                                                {item.event || t('common.nA')}
                                                            </Typography>
                                                        </Box>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', fontWeight: 600 }}>
                                                                {t('checkin.colTime')}
                                                            </Typography>
                                                            <Box sx={{ textAlign: 'right' }}>
                                                                <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.primary' }}>
                                                                    {time}
                                                                </Typography>
                                                                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                                                    {date}
                                                                </Typography>
                                                            </Box>
                                                        </Box>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </Box>
                                ) : (
                                    <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: '1px solid rgba(226, 232, 240, 1)' }}>
                                        <HistoryIcon sx={{ fontSize: 48, color: C.borderHover, mb: 1 }} />
                                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                            {t('checkin.noHistory')}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                                            {history.length === 0 ? t('checkin.noHistoryHint') : t('checkin.noRowsMatch')}
                                        </Typography>
                                    </Paper>
                                )
                            ) : (
                                <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid rgba(226, 232, 240, 1)' }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>{t('checkin.colTicket')}</TableCell>
                                                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>{t('checkin.colAttendee')}</TableCell>
                                                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>{t('checkin.colEvent')}</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: 'text.secondary' }}>{t('checkin.colStatus')}</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: 'text.secondary' }}>{t('checkin.colTime')}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {filteredHistory.length > 0 ? (
                                                filteredHistory.map((item) => {
                                                    const { date, time } = formatDateTime(item.checked_in_at);
                                                    const statusUI = getLogStatusUI(item.status, t);
                                                    const rowKey = item.id || `${item.code}-${item.checked_in_at}`;

                                                    return (
                                                        <TableRow
                                                            key={rowKey}
                                                            hover
                                                            sx={{
                                                                cursor: 'pointer',
                                                                '&:hover': { backgroundColor: C.bgPrimary },
                                                            }}
                                                        >
                                                            <TableCell sx={{ fontFamily: 'monospace', color: 'text.primary', fontWeight: 600 }}>
                                                                {item.code || 'N/A'}
                                                            </TableCell>
                                                            <TableCell sx={{ color: 'text.primary' }}>
                                                                {item.attendee_name || t('checkin.guest')}
                                                            </TableCell>
                                                            <TableCell sx={{ color: 'text.primary' }}>
                                                                {item.event || 'N/A'}
                                                            </TableCell>
                                                            <TableCell align="center">
                                                                <Chip
                                                                    size="small"
                                                                    label={statusUI.label}
                                                                    icon={statusUI.icon}
                                                                    color={statusUI.color}
                                                                    variant="outlined"
                                                                />
                                                            </TableCell>
                                                            <TableCell align="center" sx={{ color: 'text.secondary' }}>
                                                                <Box>
                                                                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                                                                        {time}
                                                                    </Typography>
                                                                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                                                        {date}
                                                                    </Typography>
                                                                </Box>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                                        <Box sx={{ textAlign: 'center' }}>
                                                            <HistoryIcon sx={{ fontSize: 48, color: C.borderHover, mb: 1 }} />
                                                            <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                                                {t('checkin.noHistory')}
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                                                                {history.length === 0 ? t('checkin.noHistoryHint') : t('checkin.noRowsMatch')}
                                                            </Typography>
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Dialog
                open={openScanner}
                onClose={() => setOpenScanner(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            <CameraIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                            {t('checkin.cameraTitle')}
                        </Typography>
                        <IconButton onClick={() => setOpenScanner(false)}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Box
                        sx={{
                            background: C.black,
                            borderRadius: 2,
                            height: isMobile ? 300 : 400,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                        }}
                    >
                        <Box sx={{ textAlign: 'center', color: 'white', px: 2 }}>
                            <CameraIcon sx={{ fontSize: 80, mb: 2, opacity: 0.5 }} />
                            <Typography variant="h6">
                                {t('checkin.cameraTitle')}
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.7 }}>
                                {t('checkin.cameraHint')}
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block', mt: 2, opacity: 0.5 }}>
                                {t('checkin.cameraMobileNote')}
                            </Typography>
                        </Box>

                        <Box
                            sx={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: isMobile ? 200 : 250,
                                height: isMobile ? 200 : 250,
                                border: `2px solid ${C.scannerAccent}`,
                                borderRadius: 2,
                                boxShadow: '0 0 20px rgba(0,245,255,0.5)',
                            }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenScanner(false)} color="inherit">
                        {t('common.close')}
                    </Button>
                    <Button variant="contained" color="primary">
                        {t('checkin.capture')}
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default Checkin;