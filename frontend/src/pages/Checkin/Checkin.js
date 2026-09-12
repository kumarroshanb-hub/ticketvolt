// frontend/src/pages/Checkin/Checkin.js
import React, { useState, useEffect, useCallback } from 'react';
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
    Snackbar,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Divider,
    Stack,
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
    TrendingUp as TrendingUpIcon,
    People as PeopleIcon,
    Error as ErrorIcon,
    Check as CheckIcon,
    RadioButtonChecked as RadioButtonCheckedIcon,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';

import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageHeaderLeft,
    PageHeaderRight,
    OutlineButton,
    StatusChip,
    LoadingWrapper,
} from '../../components/Common';

import {
    TICKET_STATUS,
    TICKET_STATUS_LABELS,
    TicketStatusUtils,
} from '../../constants';

// ============================================
// STAT CARD
// ============================================
const StatCard = ({ title, value, icon, color, subtitle }) => (
    <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #e2e8f0' }}>
        <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, letterSpacing: 0.5 }}>
                        {title}
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a', mt: 1 }}>
                        {value}
                    </Typography>
                    {subtitle && (
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
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
    if (!result) return null;

    const getResultColor = () => {
        switch (result.type) {
            case 'success': return '#10b981';
            case 'error': return '#ef4444';
            case 'warning': return '#f59e0b';
            case 'info': return '#3b82f6';
            default: return '#64748b';
        }
    };

    const getResultIcon = () => {
        switch (result.type) {
            case 'success': return <CheckCircleIcon sx={{ fontSize: 48, color: '#10b981' }} />;
            case 'error': return <CancelIcon sx={{ fontSize: 48, color: '#ef4444' }} />;
            case 'warning': return <WarningIcon sx={{ fontSize: 48, color: '#f59e0b' }} />;
            case 'info': return <InfoIcon sx={{ fontSize: 48, color: '#3b82f6' }} />;
            default: return <InfoIcon sx={{ fontSize: 48, color: '#64748b' }} />;
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
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                            {result.message}
                        </Typography>
                    </Box>
                </Box>
            </Alert>

            {result.ticket && (
                <Paper sx={{ p: 2, mt: 2, borderRadius: 2, border: '1px solid #e2e8f0' }}>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Avatar sx={{ bgcolor: '#4f46e5', width: 48, height: 48 }}>
                                    <PersonIcon />
                                </Avatar>
                                <Box>
                                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                                        Attendee
                                    </Typography>
                                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                        {result.ticket.attendee_name || 'Guest'}
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <VerifiedIcon sx={{ color: '#4f46e5' }} />
                                <Box>
                                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                                        Ticket Code
                                    </Typography>
                                    <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 600, wordBreak: 'break-all' }}>
                                        {result.ticket.code}
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <EventIcon sx={{ color: '#4f46e5' }} />
                                <Box>
                                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                                        Event
                                    </Typography>
                                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                        {result.ticket.event || 'N/A'}
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>
                        {result.checkin_time && (
                            <Grid item xs={12} sm={6}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <AccessTimeIcon sx={{ color: '#10b981' }} />
                                    <Box>
                                        <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                                            Checked In
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
                        {checkingIn ? 'Checking In...' : 'Confirm Check-In'}
                    </Button>
                )}
                <Button
                    variant="outlined"
                    startIcon={<CloseIcon />}
                    onClick={onReset}
                    sx={{ flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
                >
                    Reset
                </Button>
            </Box>
        </Box>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================
const Checkin = () => {
    const { user } = useAuth();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const [loading, setLoading] = useState(true);
    const [manualCode, setManualCode] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [checkingIn, setCheckingIn] = useState(false);
    const [result, setResult] = useState(null);
    const [history, setHistory] = useState([]);
    const [stats, setStats] = useState({
        total_scans: 0,
        today_scans: 0,
        success_scans: 0,
        failed_scans: 0,
    });
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [openScanner, setOpenScanner] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const historyResponse = await api.get('/checkin/history/', {
                params: { limit: 20 }
            });

            const historyData = historyResponse.data?.history || historyResponse.data || [];
            setHistory(historyData);

            const statsResponse = await api.get('/dashboard/stats/');
            const data = statsResponse.data;

            setStats({
                total_scans: data?.total_checkins || 0,
                today_scans: data?.today_checkins || 0,
                success_scans: data?.total_checkins || 0,
                failed_scans: 0,
            });
        } catch (error) {
            console.error('Error loading check-in data:', error);
            toast.error('Failed to load check-in data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const verifyTicket = async (code) => {
        setVerifying(true);
        setResult(null);

        try {
            const response = await api.get(`/checkin/verify/?code=${encodeURIComponent(code)}`);

            if (response.data?.valid) {
                setResult({
                    type: 'success',
                    title: 'Ticket Valid',
                    message: 'This ticket is valid and ready for check-in',
                    ticket: response.data.ticket
                });
            } else {
                setResult({
                    type: 'error',
                    title: 'Invalid Ticket',
                    message: response.data?.detail || 'This ticket is not valid',
                    ticket: response.data?.ticket
                });
            }
        } catch (error) {
            const errorData = error.response?.data;

            if (errorData?.ticket?.is_checked_in) {
                setResult({
                    type: 'warning',
                    title: 'Already Checked In',
                    message: 'This ticket has already been checked in',
                    ticket: errorData.ticket
                });
            } else if (errorData?.code === 'TICKET_USED' || errorData?.detail?.includes('already been used')) {
                setResult({
                    type: 'warning',
                    title: 'Already Used',
                    message: 'This ticket has already been used',
                    ticket: errorData?.ticket
                });
            } else if (errorData?.detail) {
                setResult({
                    type: 'error',
                    title: 'Invalid Ticket',
                    message: errorData.detail,
                    ticket: errorData?.ticket
                });
            } else {
                setResult({
                    type: 'error',
                    title: 'Verification Failed',
                    message: 'Failed to verify ticket. Please try again.',
                    ticket: null
                });
            }
        } finally {
            setVerifying(false);
        }
    };

    const checkInTicket = async (code) => {
        setCheckingIn(true);

        try {
            const response = await api.post('/checkin/', {
                code: code,
                device_id: 'admin-panel'
            });

            if (response.data?.success) {
                setResult({
                    type: 'success',
                    title: 'Check-in Successful!',
                    message: response.data.message,
                    ticket: response.data.ticket,
                    checkin_time: response.data.checkin_time
                });
                toast.success('Check-in successful!');

                setStats(prev => ({
                    ...prev,
                    total_scans: prev.total_scans + 1,
                    today_scans: prev.today_scans + 1,
                    success_scans: prev.success_scans + 1,
                }));
                loadData();
            }
        } catch (error) {
            const errorData = error.response?.data;

            if (errorData?.detail) {
                setResult({
                    type: 'error',
                    title: 'Check-in Failed',
                    message: errorData.detail,
                    ticket: errorData?.ticket
                });
                toast.error(errorData.detail);
            } else {
                toast.error('Failed to check in ticket');
            }
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

    const filteredHistory = history.filter(item => {
        if (search && !item.code?.toLowerCase().includes(search.toLowerCase()) &&
            !item.attendee_name?.toLowerCase().includes(search.toLowerCase())) {
            return false;
        }
        if (filter === 'success') return item.status === 'success';
        if (filter === 'failed') return item.status !== 'success';
        return true;
    });

    const formatDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return {
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        };
    };

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: '#4f46e5' }} />
            </LoadingWrapper>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <PageTitle variant="h4">QR Scanner & Check-in</PageTitle>
                    {!isMobile && (
                        <Typography variant="body2" sx={{ color: '#64748b', ml: 2 }}>
                            Scan and verify tickets at event entrance
                        </Typography>
                    )}
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton variant="outlined" startIcon={<RefreshIcon />} onClick={loadData}>
                        Refresh
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            {/* Stats Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title="Total Scans"
                        value={stats.total_scans || 0}
                        icon={<ScannerIcon sx={{ color: '#4f46e5' }} />}
                        color="#4f46e5"
                        subtitle={isMobile ? undefined : "All time check-ins"}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title="Today"
                        value={stats.today_scans || 0}
                        icon={<TodayIcon sx={{ color: '#10b981' }} />}
                        color="#10b981"
                        subtitle={isMobile ? undefined : "Today's check-ins"}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title="Success"
                        value={stats.success_scans || 0}
                        icon={<CheckCircleIcon sx={{ color: '#3b82f6' }} />}
                        color="#3b82f6"
                        subtitle={isMobile ? undefined : "Valid tickets"}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                    <StatCard
                        title="Failed"
                        value={stats.failed_scans || 0}
                        icon={<ErrorIcon sx={{ color: '#ef4444' }} />}
                        color="#ef4444"
                        subtitle={isMobile ? undefined : "Invalid tickets"}
                    />
                </Grid>
            </Grid>

            {/* Main Content */}
            <Grid container spacing={3}>
                {/* Left Column - Scanner */}
                <Grid item xs={12} md={5}>
                    <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                    <ScannerIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                                    Ticket Scanner
                                </Typography>
                                <Tooltip title="Open Camera Scanner">
                                    <IconButton
                                        color="primary"
                                        onClick={() => setOpenScanner(true)}
                                        sx={{ border: '1px solid #4f46e5' }}
                                    >
                                        <CameraIcon />
                                    </IconButton>
                                </Tooltip>
                            </Box>

                            {/* Scanner Area (Visual) */}
                            <Box
                                sx={{
                                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
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
                                    <ScannerIcon sx={{ fontSize: isMobile ? 48 : 64, color: '#00f5ff', mb: 2 }} />
                                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                        Ready to Scan
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.7 }}>
                                        Click camera icon or enter code manually
                                    </Typography>
                                </Box>
                            </Box>

                            {/* Manual Entry */}
                            <Box component="form" onSubmit={handleManualEntry} sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ color: '#64748b', mb: 1 }}>
                                    <KeyboardIcon sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                                    Manual Code Entry
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="Enter ticket code (e.g., TIX1234...)"
                                    value={manualCode}
                                    onChange={(e) => setManualCode(e.target.value)}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <VerifiedIcon sx={{ color: '#4f46e5' }} />
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
                                    {verifying ? 'Verifying...' : 'Verify Ticket'}
                                </Button>
                            </Box>

                            {/* Verification Result */}
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
                    <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
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
                                <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                    <HistoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                                    Recent Check-ins
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, width: isMobile ? '100%' : 'auto' }}>
                                    <TextField
                                        size="small"
                                        placeholder="Search..."
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
                                        sx={{ flex: isMobile ? 1 : 'unset', width: isMobile ? 'auto' : 120 }}
                                        SelectProps={{ native: true }}
                                    >
                                        <option value="all">All</option>
                                        <option value="success">Success</option>
                                        <option value="failed">Failed</option>
                                    </TextField>
                                </Box>
                            </Box>

                            {isMobile ? (
                                /* ---------- MOBILE: CARD LIST ---------- */
                                filteredHistory.length > 0 ? (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                        {filteredHistory.map((item, index) => {
                                            const { date, time } = formatDateTime(item.checked_in_at);
                                            return (
                                                <Card
                                                    key={index}
                                                    sx={{
                                                        borderRadius: 2,
                                                        border: '1px solid #e2e8f0',
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
                                                                    color: '#0f172a',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap',
                                                                    flex: 1,
                                                                }}
                                                            >
                                                                {item.code || 'N/A'}
                                                            </Typography>
                                                            {item.status === 'success' ? (
                                                                <Chip size="small" label="Success" icon={<CheckCircleIcon />} color="success" variant="outlined" />
                                                            ) : (
                                                                <Chip size="small" label="Failed" icon={<CancelIcon />} color="error" variant="outlined" />
                                                            )}
                                                        </Box>

                                                        <Divider sx={{ my: 1 }} />

                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                            <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                                                                Attendee
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ color: '#334155', fontWeight: 500 }}>
                                                                {item.attendee_name || 'Guest'}
                                                            </Typography>
                                                        </Box>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                            <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                                                                Event
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ color: '#334155', fontWeight: 500 }}>
                                                                {item.event || 'N/A'}
                                                            </Typography>
                                                        </Box>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                                                                Time
                                                            </Typography>
                                                            <Box sx={{ textAlign: 'right' }}>
                                                                <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: '#334155' }}>
                                                                    {time}
                                                                </Typography>
                                                                <Typography variant="caption" sx={{ color: '#94a3b8' }}>
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
                                    <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                                        <HistoryIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                            No Check-in History
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                                            Scan tickets to see them here
                                        </Typography>
                                    </Paper>
                                )
                            ) : (
                                /* ---------- DESKTOP: TABLE ---------- */
                                <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Ticket</TableCell>
                                                <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Attendee</TableCell>
                                                <TableCell sx={{ fontWeight: 600, color: '#475569' }}>Event</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#475569' }}>Status</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 600, color: '#475569' }}>Time</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {filteredHistory.length > 0 ? (
                                                filteredHistory.map((item, index) => {
                                                    const { date, time } = formatDateTime(item.checked_in_at);
                                                    return (
                                                        <TableRow
                                                            key={index}
                                                            hover
                                                            sx={{
                                                                cursor: 'pointer',
                                                                '&:hover': { backgroundColor: '#f8fafc' }
                                                            }}
                                                        >
                                                            <TableCell sx={{ fontFamily: 'monospace', color: '#0f172a', fontWeight: 600 }}>
                                                                {item.code || 'N/A'}
                                                            </TableCell>
                                                            <TableCell sx={{ color: '#334155' }}>
                                                                {item.attendee_name || 'Guest'}
                                                            </TableCell>
                                                            <TableCell sx={{ color: '#334155' }}>
                                                                {item.event || 'N/A'}
                                                            </TableCell>
                                                            <TableCell align="center">
                                                                {item.status === 'success' ? (
                                                                    <Chip
                                                                        size="small"
                                                                        label="Success"
                                                                        icon={<CheckCircleIcon />}
                                                                        color="success"
                                                                        variant="outlined"
                                                                    />
                                                                ) : (
                                                                    <Chip
                                                                        size="small"
                                                                        label="Failed"
                                                                        icon={<CancelIcon />}
                                                                        color="error"
                                                                        variant="outlined"
                                                                    />
                                                                )}
                                                            </TableCell>
                                                            <TableCell align="center" sx={{ color: '#64748b' }}>
                                                                <Box>
                                                                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                                                                        {time}
                                                                    </Typography>
                                                                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                                                        {date}
                                                                    </Typography>
                                                                </Box>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: '#94a3b8' }}>
                                                        <Box sx={{ textAlign: 'center' }}>
                                                            <HistoryIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                                                            <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                                                No Check-in History
                                                            </Typography>
                                                            <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                                                                Scan tickets to see them here
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

            {/* Camera Scanner Dialog */}
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
                            Camera Scanner
                        </Typography>
                        <IconButton onClick={() => setOpenScanner(false)}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Box
                        sx={{
                            background: '#000',
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
                                Camera Scanner
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.7 }}>
                                Place QR code within the frame
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block', mt: 2, opacity: 0.5 }}>
                                Note: Camera integration requires mobile app
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
                                border: '2px solid #00f5ff',
                                borderRadius: 2,
                                boxShadow: '0 0 20px rgba(0,245,255,0.5)',
                            }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenScanner(false)} color="inherit">
                        Close
                    </Button>
                    <Button variant="contained" color="primary">
                        Capture
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default Checkin;