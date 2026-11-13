// frontend/src/pages/Bookings/BookingTickets.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Box, Button, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Typography, Chip, IconButton,
    CircularProgress, Card, CardContent, Grid,
    Alert, Tooltip, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField, InputAdornment,
    Checkbox, useMediaQuery, useTheme, Divider, Paper,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    Refresh as RefreshIcon,
    QrCode as QrCodeIcon,
    CheckCircle as CheckCircleIcon,
    Print as PrintIcon,
    Download as DownloadIcon,
    Search as SearchIcon,
    Cancel as CancelIcon,
    Send as SendIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageSubtitle,
    PageHeaderLeft,
    PageHeaderRight,
    StyledCard,
    StyledTableContainer,
    StatusChip,
    LoadingWrapper,
    OutlineButton,
    PrimaryButton,
} from '../../components/Common';

// ✅ Single source of truth — every color/font below flows from here.
import { theme } from '../../theme/tokens';
import { useSettings } from '../../context/SettingsContext';

const C = theme.colors;
const F = theme.fonts;

// ---------------------------------------------------------------------------
// Alpha helpers — derive rgba() equivalents from hex tokens so no raw
// rgba(…) strings live in this file. Suffixes are hex alpha bytes:
//   0D=5%  0F=6%  14=8%  1A=10%  26=15%  33=20%  40=25%  4D=30%  66=40%
// ---------------------------------------------------------------------------
const alpha = (hex, byte) => `${hex}${byte}`;

// ---------------------------------------------------------------------------
// QRCodeSVG is optional. If the package isn't installed, we degrade
// gracefully — the dialog still shows the raw code.
// ---------------------------------------------------------------------------
let QRCodeSVG = null;
try {
    const qrModule = require('qrcode.react');
    QRCodeSVG = qrModule.QRCodeSVG;
} catch (e) {
    if (process.env.NODE_ENV === 'development') {
        console.warn('qrcode.react not installed, using fallback');
    }
}

// ===========================================================================
// Styled components
// ===========================================================================

const BackButton = styled(IconButton)`
    color: ${props => props.theme.colors.textSecondary};

    &:hover {
        color: ${props => props.theme.colors.textPrimary};
        background: ${props => props.theme.colors.bgCardHover};
    }
`;

const SearchField = styled(TextField)`
    margin-bottom: 16px;

    & .MuiOutlinedInput-root {
        background: ${props => props.theme.colors.bgInput};
        border-radius: 10px;

        fieldset { border-color: ${props => props.theme.colors.borderLight}; }
        &:hover fieldset { border-color: ${props => props.theme.colors.borderHover}; }
        &.Mui-focused fieldset { border-color: ${props => props.theme.colors.primary}; }
    }

    & .MuiInputBase-input {
        color: ${props => props.theme.colors.textPrimary};
    }
`;

const StatValue = styled(Typography)`
    color: ${props => props.color || props.theme.colors.textPrimary};
    font-weight: 700;
    font-size: 24px;
`;

const StatLabel = styled(Typography)`
    color: ${props => props.theme.colors.textMuted};
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

const FooterSummary = styled(Box)`
    margin-top: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 0;
    border-top: 1px solid ${props => props.theme.colors.borderLight};
`;

// ===========================================================================
// Component
// ===========================================================================

const BookingTickets = () => {
    const { bookingId } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user } = useAuth();
    const { formatMoney } = useSettings();   // ✅ NEW
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // ---- Existing state ----
    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState(null);
    const [tickets, setTickets] = useState([]);
    const [filteredTickets, setFilteredTickets] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [qrDialogOpen, setQrDialogOpen] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        used: 0,
        cancelled: 0,
    });

    // ---- Cancellation state ----
    const [selectedTicketIds, setSelectedTicketIds] = useState([]);
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [transferTicket, setTransferTicket] = useState(null);
    const [transferEmail, setTransferEmail] = useState('');
    const [transferring, setTransferring] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

    // =======================================================================
    // Data loading
    // =======================================================================

    const loadBookingTickets = useCallback(async () => {
        setLoading(true);
        try {
            const bookingResponse = await api.get(`/bookings/${bookingId}/`);
            setBooking(bookingResponse.data);

            const ticketsResponse = await api.get(
                `/bookings/${bookingId}/tickets/`,
            );
            const ticketList = ticketsResponse.data.tickets || [];
            setTickets(ticketList);
            setFilteredTickets(ticketList);

            setStats({
                total: ticketList.length,
                active: ticketList.filter((t) => t.status === 'active').length,
                used: ticketList.filter((t) => t.status === 'used').length,
                cancelled: ticketList.filter(
                    (t) => t.status === 'cancelled' || t.status === 'refunded',
                ).length,
            });

            setSelectedTicketIds([]);
        } catch (error) {
            console.error('Error loading tickets:', error);
            toast.error(t('booking.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [bookingId, t]);

    useEffect(() => {
        loadBookingTickets();
    }, [loadBookingTickets]);

    // ---- Search filter ----
    useEffect(() => {
        if (searchTerm.trim() === '') {
            setFilteredTickets(tickets);
        } else {
            const q = searchTerm.toLowerCase();
            setFilteredTickets(
                tickets.filter(
                    (t) =>
                        t.unique_code?.toLowerCase().includes(q) ||
                        t.attendee_name?.toLowerCase().includes(q) ||
                        t.status?.toLowerCase().includes(q),
                ),
            );
        }
    }, [searchTerm, tickets]);

    // =======================================================================
    // Cancellation helpers
    // =======================================================================

    const isCancellable = useCallback(
        (ticket) => {
            if (!ticket) return false;
            if (ticket.status === 'active') return true;
            if (ticket.status === 'used' && user?.is_staff) return true;
            return false;
        },
        [user],
    );

    const cancellableTickets = useMemo(
        () => filteredTickets.filter(isCancellable),
        [filteredTickets, isCancellable],
    );

    const allCancellableSelected =
        cancellableTickets.length > 0 &&
        selectedTicketIds.length === cancellableTickets.length;

    const someCancellableSelected =
        selectedTicketIds.length > 0 && !allCancellableSelected;

    const handleToggleTicket = (event, ticketId) => {
        if (event.target.checked) {
            setSelectedTicketIds((prev) =>
                prev.includes(ticketId) ? prev : [...prev, ticketId],
            );
        } else {
            setSelectedTicketIds((prev) => prev.filter((id) => id !== ticketId));
        }
    };

    const handleToggleAll = (event) => {
        if (event.target.checked) {
            setSelectedTicketIds(cancellableTickets.map((t) => t.id));
        } else {
            setSelectedTicketIds([]);
        }
    };

    // =======================================================================
    // Preview + confirmation flow
    // =======================================================================

    const handleCancelSelected = async () => {
        if (selectedTicketIds.length === 0) return;

        setCancelDialogOpen(true);
        setLoadingPreview(true);
        setPreviewData(null);

        try {
            const response = await api.post(
                `/bookings/${bookingId}/preview_cancellation/`,
                { ticket_ids: selectedTicketIds },
            );
            setPreviewData(response.data);
        } catch (err) {
            console.warn('Preview unavailable:', err?.message);
            setPreviewData(null);
        } finally {
            setLoadingPreview(false);
        }
    };

    const executeCancelTickets = async () => {
        setCancelling(true);
        try {
            const result = await api.post(
                `/bookings/${bookingId}/cancel_tickets/`,
                {
                    ticket_ids: selectedTicketIds,
                    reason: cancelReason,
                },
            );

            const {
                cancelled_ticket_ids = [],
                fully_cancelled,
                refund_amount_added,
            } = result.data;

            const refundText =
                refund_amount_added && refund_amount_added > 0
                    ? ` (${formatMoney(refund_amount_added)} ${t('status.booking.refunded')})`
                    : '';

            toast.success(
                `${t('bookings.ticketsCancelled', { n: cancelled_ticket_ids.length })}${refundText}`,
            );

            if (fully_cancelled) {
                toast.info(t('bookings.allTicketsCancelled'));
            }

            setSelectedTicketIds([]);
            setCancelReason('');
            setPreviewData(null);
            setCancelDialogOpen(false);

            await loadBookingTickets();
        } catch (err) {
            console.error('Cancel tickets error:', err);
            toast.error(
                err.response?.data?.error || t('bookings.cancelTicketsFailed'),
            );
        } finally {
            setCancelling(false);
        }
    };

    const handleCloseCancelDialog = () => {
        if (cancelling) return;
        setCancelDialogOpen(false);
        setCancelReason('');
        setPreviewData(null);
    };

    // =======================================================================
    // Existing handlers (QR, print, export)
    // =======================================================================

    const getStatusChip = (status) => {
        const config = {
            active: { color: 'success', label: t('ticket.statusChipActive') },
            used: { color: 'error', label: t('ticket.statusChipUsed') },
            cancelled: { color: 'default', label: t('ticket.statusChipCancelled') },
            expired: { color: 'warning', label: t('ticket.statusChipExpired') },
            refunded: { color: 'secondary', label: t('ticket.statusChipRefunded') },
        };
        const { color, label } = config[status] || {
            color: 'default',
            label: status || t('status.unknown'),
        };
        return <StatusChip label={label} size="small" color={color} />;
    };

    const handleBack = () => navigate('/app/bookings');
    const handlePrint = () => window.print();

    const handleExport = () => {
        try {
            const headers = [
                t('booking.ticketCode'),
                t('booking.attendeeName'),
                t('booking.status'),
                t('booking.checkInTime'),
                t('booking.tier'),
                t('booking.price'),
            ];
            const rows = filteredTickets.map((ticket) => [
                ticket.unique_code || '',
                ticket.attendee_name || t('bookings.guest'),
                ticket.status || '',
                ticket.check_in_time
                    ? new Date(ticket.check_in_time).toLocaleString()
                    : '-',
                ticket.tier_name || t('common.nA'),
                formatMoney(ticket.price || 0),   // ✅ PATCHED
            ]);

            const csvContent = [
                headers.join(','),
                ...rows.map((row) => row.join(',')),
            ].join('\n');

            const blob = new Blob([csvContent], {
                type: 'text/csv;charset=utf-8;',
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tickets_${booking?.booking_reference || 'booking'}_${
                new Date().toISOString().split('T')[0]
            }.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast.success(t('booking.exportedSuccess'));
        } catch (error) {
            console.error('Export error:', error);
            toast.error(t('booking.exportFailed'));
        }
    };

    const handleViewQr = (ticket) => {
        setSelectedTicket(ticket);
        setQrDialogOpen(true);
    };

    const renderQrCode = (qrData) => {
        if (!qrData) {
            return (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                    <QrCodeIcon sx={{ fontSize: 60, color: C.textMuted }} />
                    <Typography sx={{ color: C.textMuted }}>
                        {t('booking.qrNotAvailable')}
                    </Typography>
                </Box>
            );
        }

        if (qrData.startsWith('data:image')) {
            return (
                <img
                    src={qrData}
                    alt={t('booking.qrCode')}
                    style={{
                        maxWidth: '100%',
                        maxHeight: 300,
                        objectFit: 'contain',
                        borderRadius: '8px',
                    }}
                />
            );
        }

        if (qrData.startsWith('http://') || qrData.startsWith('https://')) {
            return (
                <img
                    src={qrData}
                    alt={t('booking.qrCode')}
                    style={{
                        maxWidth: '100%',
                        maxHeight: 300,
                        objectFit: 'contain',
                        borderRadius: '8px',
                    }}
                />
            );
        }

        if (typeof qrData === 'string' && qrData.match(/^[A-Za-z0-9+/=]+$/)) {
            return (
                <img
                    src={`data:image/png;base64,${qrData}`}
                    alt={t('booking.qrCode')}
                    style={{
                        maxWidth: '100%',
                        maxHeight: 300,
                        objectFit: 'contain',
                        borderRadius: '8px',
                    }}
                />
            );
        }

        if (QRCodeSVG && typeof qrData === 'string') {
            try {
                return (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                        <QRCodeSVG
                            value={qrData}
                            size={200}
                            level="H"
                            includeMargin={true}
                            bgColor={C.bgCard}
                            fgColor={C.textPrimary}
                        />
                    </Box>
                );
            } catch (error) {
                console.error('QR generation error:', error);
            }
        }

        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <QrCodeIcon sx={{ fontSize: 60, color: C.textMuted }} />
                <Typography sx={{ color: C.textMuted, mt: 2 }}>
                    {t('booking.qrDataAvailable')}
                </Typography>
            </Box>
        );
    };

    // =======================================================================
    // Render guards
    // =======================================================================

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress sx={{ color: C.primary }} />
            </LoadingWrapper>
        );
    }

    if (!booking) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    {t('booking.bookingNotFound')}
                </Alert>
                <Button startIcon={<ArrowBackIcon />} onClick={handleBack}>
                    {t('booking.backToBookings')}
                </Button>
            </Box>
        );
    }

    // ---- Derived amounts ----
    const subtotal = Number(booking.total_amount || 0);
    const discountApplied = Number(booking.discount_applied || 0);
    const netPaid = Math.max(0, subtotal - discountApplied);

    // =======================================================================
    // Main render
    // =======================================================================

    return (
        <PageContainer>
            {/* ============ Header ============ */}
            <PageHeader>
                <PageHeaderLeft>
                    <BackButton onClick={handleBack}>
                        <ArrowBackIcon />
                    </BackButton>
                    <Box>
                        <PageTitle>{t('booking.bookingTickets')}</PageTitle>
                        <PageSubtitle>
                            {booking.booking_reference} - {booking.customer_name}
                        </PageSubtitle>
                    </Box>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadBookingTickets}
                        size="small"
                    >
                        {t('common.refresh')}
                    </OutlineButton>
                    <OutlineButton
                        variant="outlined"
                        startIcon={<PrintIcon />}
                        onClick={handlePrint}
                        size="small"
                    >
                        {t('booking.print')}
                    </OutlineButton>
                    <OutlineButton
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={handleExport}
                        size="small"
                    >
                        {t('booking.exportCsv')}
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            {/* ============ Summary cards ============ */}
            <Grid container spacing={isMobile ? 2 : 3} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6} md={4}>
                    <StyledCard>
                        <CardContent>
                            <Typography
                                sx={{ color: C.textSecondary }}
                                gutterBottom
                                variant="caption"
                            >
                                {t('booking.customer')}
                            </Typography>
                            <Typography
                                variant="h6"
                                sx={{ color: C.textPrimary, wordBreak: 'break-word' }}
                            >
                                {booking.customer_name}
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{ color: C.textPrimary, wordBreak: 'break-word' }}
                            >
                                {booking.customer_email}
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{ color: C.textPrimary }}
                            >
                                {booking.customer_phone}
                            </Typography>
                        </CardContent>
                    </StyledCard>
                </Grid>

                {/* ---- Event card with Subtotal / Discount / Net Paid ---- */}
                <Grid item xs={12} sm={6} md={4}>
                    <StyledCard>
                        <CardContent>
                            <Typography
                                sx={{ color: C.textSecondary }}
                                gutterBottom
                                variant="caption"
                            >
                                {t('booking.event')}
                            </Typography>
                            <Typography
                                variant="h6"
                                sx={{ color: C.textPrimary, wordBreak: 'break-word' }}
                            >
                                {booking.event_title || booking.event?.title || t('common.nA')}
                            </Typography>

                            {/* Subtotal */}
                            <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: C.textSecondary }}>
                                    {t('booking.subtotal')}
                                </Typography>
                                <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                    {formatMoney(subtotal)}   {/* ✅ PATCHED */}
                                </Typography>
                            </Box>

                            {/* Discount (only if any) */}
                            {discountApplied > 0 && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                                    <Typography variant="body2" sx={{ color: C.success, fontWeight: 600 }}>
                                        {t('booking.discount')}
                                        {booking.discount_code ? ` (${booking.discount_code})` : ''}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: C.success, fontWeight: 600 }}>
                                        −{formatMoney(discountApplied)}   {/* ✅ PATCHED */}
                                    </Typography>
                                </Box>
                            )}

                            {/* Net paid */}
                            <Box
                                sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    mt: 1,
                                    pt: 1,
                                    borderTop: `1px solid ${C.borderLight}`,
                                }}
                            >
                                <Typography variant="body2" sx={{ color: C.textPrimary, fontWeight: 700 }}>
                                    {t('booking.netPaid')}
                                </Typography>
                                <Typography variant="body2" sx={{ color: C.primary, fontWeight: 700 }}>
                                    {formatMoney(netPaid)}   {/* ✅ PATCHED */}
                                </Typography>
                            </Box>

                            <Box sx={{ mt: 1.5 }}>
                                <StatusChip
                                    label={booking.status?.toUpperCase()}
                                    size="small"
                                    color={
                                        booking.status === 'paid' ||
                                        booking.status === 'confirmed'
                                            ? 'success'
                                            : 'warning'
                                    }
                                />
                            </Box>
                        </CardContent>
                    </StyledCard>
                </Grid>

                <Grid item xs={12} sm={12} md={4}>
                    <StyledCard>
                        <CardContent>
                            <Typography
                                sx={{ color: C.textSecondary }}
                                gutterBottom
                                variant="caption"
                            >
                                {t('booking.ticketStatistics')}
                            </Typography>
                            <Grid container spacing={1}>
                                <Grid item xs={3}>
                                    <StatValue color={C.primary}>
                                        {stats.total}
                                    </StatValue>
                                    <StatLabel>{t('booking.total')}</StatLabel>
                                </Grid>
                                <Grid item xs={3}>
                                    <StatValue color={C.success}>
                                        {stats.active}
                                    </StatValue>
                                    <StatLabel>{t('booking.active')}</StatLabel>
                                </Grid>
                                <Grid item xs={3}>
                                    <StatValue color={C.error}>
                                        {stats.used}
                                    </StatValue>
                                    <StatLabel>{t('booking.used')}</StatLabel>
                                </Grid>
                                <Grid item xs={3}>
                                    <StatValue color={C.textLight}>
                                        {stats.cancelled}
                                    </StatValue>
                                    <StatLabel>{t('booking.cancelled')}</StatLabel>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </StyledCard>
                </Grid>
            </Grid>

            {/* ============ Search ============ */}
            <SearchField
                placeholder={
                    isMobile
                        ? t('booking.searchByTicketShort')
                        : t('booking.searchByTicket')
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                size="small"
                fullWidth
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon sx={{ color: C.textMuted }} />
                        </InputAdornment>
                    ),
                }}
            />

            {/* ============ Bulk action bar ============ */}
            {selectedTicketIds.length > 0 && (
                <Paper
                    elevation={0}
                    sx={{
                        p: 2,
                        mb: 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        flexWrap: 'wrap',
                        border: `1px solid ${alpha(C.error, '4D')}`,
                        bgcolor: alpha(C.error, '0F'),
                        borderRadius: 2,
                    }}
                >
                    <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: C.errorDark, flex: 1, minWidth: 0 }}
                    >
                        {t('bookings.ticketsSelectedCount', { count: selectedTicketIds.length })}
                    </Typography>
                    <Button
                        variant="contained"
                        color="error"
                        size="small"
                        startIcon={<CancelIcon />}
                        onClick={handleCancelSelected}
                        sx={{ textTransform: 'none' }}
                    >
                        {t('booking.cancelSelectedTickets')}
                    </Button>
                    <Button
                        variant="text"
                        size="small"
                        onClick={() => setSelectedTicketIds([])}
                    >
                        {t('common.clear')}
                    </Button>
                </Paper>
            )}

            {/* ============ MOBILE: card list ============ */}
            {isMobile ? (
                filteredTickets.length === 0 ? (
                    <Paper
                        sx={{
                            p: 4,
                            textAlign: 'center',
                            borderRadius: 2,
                            border: `1px solid ${C.borderLight}`,
                        }}
                    >
                        <Typography sx={{ color: C.textMuted }}>
                            {tickets.length === 0
                                ? t('booking.noTicketsFound')
                                : t('booking.noMatchingTickets')}
                        </Typography>
                    </Paper>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {filteredTickets.map((ticket, index) => {
                            const cancellable = isCancellable(ticket);
                            const selected = selectedTicketIds.includes(ticket.id);

                            return (
                                <Card
                                    key={ticket.id || index}
                                    sx={{
                                        borderRadius: 2,
                                        border: selected
                                            ? `2px solid ${C.error}`
                                            : `1px solid ${C.borderLight}`,
                                        overflow: 'hidden',
                                        transition: 'border 0.15s ease',
                                    }}
                                >
                                    <CardContent
                                        sx={{ p: 2, '&:last-child': { pb: 2 } }}
                                    >
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: 1,
                                                mb: 1,
                                            }}
                                        >
                                            {cancellable && (
                                                <Checkbox
                                                    size="small"
                                                    checked={selected}
                                                    onChange={(e) =>
                                                        handleToggleTicket(e, ticket.id)
                                                    }
                                                    sx={{
                                                        p: 0.5,
                                                        color: C.textMuted,
                                                        '&.Mui-checked': {
                                                            color: C.error,
                                                        },
                                                        mt: -0.5,
                                                    }}
                                                />
                                            )}
                                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                                <Typography
                                                    variant="subtitle2"
                                                    sx={{
                                                        fontFamily: F.familyMono,
                                                        fontWeight: 700,
                                                        color: C.textPrimary,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {ticket.unique_code}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ color: C.textMuted }}
                                                >
                                                    #{index + 1}
                                                </Typography>
                                            </Box>
                                            {getStatusChip(ticket.status)}
                                        </Box>

                                        <Divider sx={{ my: 1.5 }} />

                                        <Box
                                            sx={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                mb: 1,
                                            }}
                                        >
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    color: C.textMuted,
                                                    textTransform: 'uppercase',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {t('booking.attendeeName')}
                                            </Typography>
                                            <Typography
                                                variant="body2"
                                                sx={{ color: C.textPrimary, fontWeight: 500 }}
                                            >
                                                {ticket.attendee_name || t('bookings.guest')}
                                            </Typography>
                                        </Box>
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                mb: 1,
                                            }}
                                        >
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    color: C.textMuted,
                                                    textTransform: 'uppercase',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {t('booking.tier')}
                                            </Typography>
                                            <Typography
                                                variant="body2"
                                                sx={{ color: C.textPrimary }}
                                            >
                                                {ticket.tier_name || t('common.nA')}
                                            </Typography>
                                        </Box>
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                mb: 1,
                                            }}
                                        >
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    color: C.textMuted,
                                                    textTransform: 'uppercase',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {t('booking.price')}
                                            </Typography>
                                            <Typography
                                                variant="body2"
                                                sx={{ color: C.textPrimary, fontWeight: 600 }}
                                            >
                                                {formatMoney(ticket.price || 0)}   {/* ✅ PATCHED */}
                                            </Typography>
                                        </Box>
                                        {ticket.check_in_time && (
                                            <Box
                                                sx={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    mb: 1,
                                                }}
                                            >
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color: C.textMuted,
                                                        textTransform: 'uppercase',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {t('booking.checkedIn')}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ color: C.success, fontWeight: 600 }}
                                                >
                                                    {new Date(
                                                        ticket.check_in_time,
                                                    ).toLocaleString()}
                                                </Typography>
                                            </Box>
                                        )}

                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            startIcon={<QrCodeIcon />}
                                            onClick={() => handleViewQr(ticket)}
                                            sx={{
                                                mt: 1.5,
                                                borderColor: alpha(C.primary, '4D'),
                                                color: C.primary,
                                                textTransform: 'none',
                                            }}
                                        >
                                            {t('booking.viewQrCode')}
                                        </Button>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </Box>
                )
            ) : (
                /* ============ DESKTOP: table ============ */
                <StyledTableContainer>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell
                                        padding="checkbox"
                                        sx={{
                                            borderBottom: `1px solid ${C.borderLight}`,
                                        }}
                                    >
                                        <Checkbox
                                            size="small"
                                            indeterminate={someCancellableSelected}
                                            checked={allCancellableSelected}
                                            onChange={handleToggleAll}
                                            disabled={cancellableTickets.length === 0}
                                            sx={{
                                                color: C.textMuted,
                                                '&.Mui-checked': { color: C.error },
                                                '&.MuiCheckbox-indeterminate': {
                                                    color: C.error,
                                                },
                                            }}
                                        />
                                    </TableCell>
                                    {[
                                        { label: '#', align: 'left' },
                                        { label: t('booking.ticketCode'), align: 'left' },
                                        { label: t('booking.attendeeName'), align: 'left' },
                                        { label: t('booking.status'), align: 'center' },
                                        { label: t('booking.tier'), align: 'left' },
                                        { label: t('booking.price'), align: 'right' },
                                        { label: t('booking.checkInTime'), align: 'center' },
                                        { label: t('common.actions'), align: 'center' },
                                    ].map((h, headerIndex) => (
                                        <TableCell
                                            key={headerIndex}
                                            align={h.align}
                                            sx={{
                                                color: C.textSecondary,
                                                fontWeight: 600,
                                                borderBottom: `1px solid ${C.borderLight}`,
                                            }}
                                        >
                                            {h.label}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredTickets.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                                            <Typography sx={{ color: C.textMuted }}>
                                                {tickets.length === 0
                                                    ? t('booking.noTicketsFound')
                                                    : t('booking.noMatchingTickets')}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredTickets.map((ticket, index) => {
                                        const cancellable = isCancellable(ticket);
                                        const selected = selectedTicketIds.includes(
                                            ticket.id,
                                        );

                                        return (
                                            <TableRow
                                                key={ticket.id || index}
                                                hover
                                                selected={selected}
                                                sx={{
                                                    '&:hover': {
                                                        backgroundColor: C.bgPrimary,
                                                    },
                                                    '&.Mui-selected': {
                                                        backgroundColor: alpha(C.error, '26'),
                                                    },
                                                    '&.Mui-selected:hover': {
                                                        backgroundColor: alpha(C.error, '40'),
                                                    },
                                                }}
                                            >
                                                <TableCell padding="checkbox">
                                                    {cancellable && (
                                                        <Checkbox
                                                            size="small"
                                                            checked={selected}
                                                            onChange={(e) =>
                                                                handleToggleTicket(
                                                                    e,
                                                                    ticket.id,
                                                                )
                                                            }
                                                            sx={{
                                                                color: C.textMuted,
                                                                '&.Mui-checked': {
                                                                    color: C.error,
                                                                },
                                                            }}
                                                        />
                                                    )}
                                                </TableCell>
                                                <TableCell sx={{ color: C.textSecondary }}>
                                                    {index + 1}
                                                </TableCell>
                                                <TableCell>
                                                    <Typography
                                                        variant="body2"
                                                        fontWeight="bold"
                                                        sx={{ color: C.textPrimary }}
                                                    >
                                                        {ticket.unique_code}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={{ color: C.textPrimary }}>
                                                    {ticket.attendee_name || t('bookings.guest')}
                                                </TableCell>
                                                <TableCell align="center">
                                                    {getStatusChip(ticket.status)}
                                                </TableCell>
                                                <TableCell sx={{ color: C.textPrimary }}>
                                                    {ticket.tier_name || t('common.nA')}
                                                </TableCell>
                                                <TableCell
                                                    align="right"
                                                    sx={{ color: C.textPrimary }}
                                                >
                                                    {formatMoney(ticket.price || 0)}   {/* ✅ PATCHED */}
                                                </TableCell>
                                                <TableCell align="center">
                                                    {ticket.check_in_time ? (
                                                        <Tooltip
                                                            title={new Date(
                                                                ticket.check_in_time,
                                                            ).toLocaleString()}
                                                        >
                                                            <StatusChip
                                                                label={new Date(
                                                                    ticket.check_in_time,
                                                                ).toLocaleDateString()}
                                                                size="small"
                                                                color="success"
                                                                variant="outlined"
                                                                icon={
                                                                    <CheckCircleIcon
                                                                        sx={{ fontSize: 16 }}
                                                                    />
                                                                }
                                                            />
                                                        </Tooltip>
                                                    ) : (
                                                        <StatusChip
                                                            label={t('booking.notCheckedIn')}
                                                            size="small"
                                                            variant="outlined"
                                                            sx={{
                                                                borderColor: C.borderLight,
                                                                color: C.textMuted,
                                                            }}
                                                        />
                                                    )}
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Tooltip title={t('booking.viewQrCode')}>
                                                        <IconButton
                                                            size="small"
                                                            sx={{ color: C.primary }}
                                                            onClick={() =>
                                                                handleViewQr(ticket)
                                                            }
                                                        >
                                                            <QrCodeIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                    {ticket.status === 'active' && (
                                                        <Tooltip title={t('booking.transferTicket', 'Transfer ticket')}>
                                                            <IconButton size="small" sx={{ color: C.secondary }} onClick={() => { setTransferTicket(ticket); setTransferEmail(''); }}>
                                                                <SendIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </StyledTableContainer>
            )}

            {/* ============ Footer summary ============ */}
            {filteredTickets.length > 0 && (
                <FooterSummary>
                    <Typography variant="body2" sx={{ color: C.textMuted }}>
                        {t('booking.showingTickets', { shown: filteredTickets.length, total: tickets.length })}
                    </Typography>
                    <Typography variant="body2" sx={{ color: C.textMuted }}>
                        {t('bookings.footerStats', { total: stats.total, active: stats.active, used: stats.used, cancelled: stats.cancelled })}
                    </Typography>
                </FooterSummary>
            )}

            {/* ============ QR Dialog ============ */}
            <Dialog
                open={qrDialogOpen}
                onClose={() => setQrDialogOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: C.bgCard,
                        border: `1px solid ${C.borderLight}`,
                        borderRadius: '16px',
                        boxShadow: theme.shadows.modal,
                    },
                }}
            >
                <DialogTitle>
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <Typography
                            variant="h6"
                            sx={{ color: C.textPrimary, fontWeight: 600 }}
                        >
                            {t('booking.qrCode')}
                        </Typography>
                        {selectedTicket && getStatusChip(selectedTicket.status)}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {selectedTicket && (
                        <Box sx={{ textAlign: 'center', py: 2 }}>
                            <Typography variant="caption" sx={{ color: C.textMuted }}>
                                {t('booking.ticketCode')}
                            </Typography>
                            <Typography
                                variant="h5"
                                gutterBottom
                                sx={{
                                    color: C.textPrimary,
                                    fontWeight: 700,
                                    wordBreak: 'break-all',
                                }}
                            >
                                {selectedTicket.unique_code}
                            </Typography>

                            <Box
                                sx={{
                                    my: 3,
                                    p: 3,
                                    bgcolor: C.bgPrimary,
                                    borderRadius: 2,
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    minHeight: 250,
                                    border: `1px solid ${C.borderLight}`,
                                }}
                            >
                                {selectedTicket.qr_code ? (
                                    renderQrCode(selectedTicket.qr_code)
                                ) : (
                                    <Box sx={{ textAlign: 'center', py: 4 }}>
                                        <QrCodeIcon
                                            sx={{ fontSize: 60, color: C.textMuted }}
                                        />
                                        <Typography sx={{ color: C.textMuted }}>
                                            {t('booking.qrNotAvailable')}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>

                            <Grid container spacing={2} sx={{ mt: 1 }}>
                                <Grid item xs={6}>
                                    <Typography
                                        variant="caption"
                                        sx={{ color: C.textMuted }}
                                    >
                                        {t('booking.attendeeName')}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        fontWeight="bold"
                                        sx={{ color: C.textPrimary }}
                                    >
                                        {selectedTicket.attendee_name || t('bookings.guest')}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography
                                        variant="caption"
                                        sx={{ color: C.textMuted }}
                                    >
                                        {t('booking.status')}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        fontWeight="bold"
                                        sx={{ color: C.textPrimary }}
                                    >
                                        {selectedTicket.status?.toUpperCase()}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography
                                        variant="caption"
                                        sx={{ color: C.textMuted }}
                                    >
                                        {t('booking.tier')}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        sx={{ color: C.textPrimary }}
                                    >
                                        {selectedTicket.tier_name || 'N/A'}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography
                                        variant="caption"
                                        sx={{ color: C.textMuted }}
                                    >
                                        {t('booking.price')}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        sx={{ color: C.textPrimary }}
                                    >
                                        {formatMoney(selectedTicket.price || 0)}   {/* ✅ PATCHED */}
                                    </Typography>
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <OutlineButton onClick={() => setQrDialogOpen(false)}>
                        {t('common.close')}
                    </OutlineButton>
                    {selectedTicket?.qr_code && (
                        <PrimaryButton
                            onClick={() => {
                                const qrData = selectedTicket.qr_code;
                                if (qrData.startsWith('data:image')) {
                                    const link = document.createElement('a');
                                    link.href = qrData;
                                    link.download = `qr_${selectedTicket.unique_code}.png`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    toast.success(t('booking.qrDownloaded'));
                                } else if (qrData.startsWith('http')) {
                                    window.open(qrData, '_blank');
                                } else {
                                    toast.info(
                                        t('booking.qrCannotDownload'),
                                    );
                                }
                            }}
                        >
                            {t('booking.downloadQr')}
                        </PrimaryButton>
                    )}
                </DialogActions>
            </Dialog>

            <Dialog open={!!transferTicket} onClose={() => setTransferTicket(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('booking.transferTicket', 'Transfer ticket')}</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth autoFocus sx={{ mt: 1 }}
                        label={t('booking.recipientEmail', 'Recipient email')}
                        value={transferEmail}
                        onChange={(e) => setTransferEmail(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTransferTicket(null)}>{t('common.cancel')}</Button>
                    <Button
                        variant="contained" disabled={transferring || !transferEmail.trim()}
                        onClick={async () => {
                            setTransferring(true);
                            try {
                                await api.post(`/tickets/${transferTicket.id}/transfer/`, { to_email: transferEmail.trim() });
                                toast.success(t('booking.transferCreated', 'Transfer created. The recipient can accept it.'));
                                setTransferTicket(null); setTransferEmail('');
                            } catch (err) {
                                toast.error(err.response?.data?.error || err.message);
                            } finally { setTransferring(false); }
                        }}
                    >
                        {t('booking.sendTransfer', 'Send transfer')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ============ Cancel Tickets Dialog ============ */}
            <Dialog
                open={cancelDialogOpen}
                onClose={handleCloseCancelDialog}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: C.bgCard,
                        border: `1px solid ${C.borderLight}`,
                        borderRadius: '16px',
                        boxShadow: theme.shadows.modal,
                    },
                }}
            >
                <DialogTitle sx={{ color: C.textPrimary, fontWeight: 700 }}>
                    {t('booking.cancelTicketsTitle', { count: selectedTicketIds.length })}
                </DialogTitle>

                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        {t('booking.cancelTicketsWarning')}
                    </Alert>

                    {loadingPreview && (
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                py: 2,
                            }}
                        >
                            <CircularProgress size={18} />
                            <Typography variant="body2" sx={{ color: C.textSecondary }}>
                                {t('booking.calculatingRefund')}
                            </Typography>
                        </Box>
                    )}

                    {!loadingPreview && previewData && previewData.preview?.length > 0 && (
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2,
                                mb: 2,
                                bgcolor: C.bgPrimary,
                                border: `1px solid ${C.borderLight}`,
                                borderRadius: 2,
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: C.textSecondary,
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.5,
                                }}
                            >
                                {t('booking.refundPreview')}
                                {previewData.policy_name
                                    ? ` · ${previewData.policy_name}`
                                    : ''}
                            </Typography>

                            <Box sx={{ mt: 1 }}>
                                {previewData.preview.map((row) => (
                                    <Box
                                        key={row.ticket_id}
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            py: 0.75,
                                            borderBottom: `1px dashed ${C.borderLight}`,
                                            gap: 1,
                                            '&:last-of-type': { borderBottom: 'none' },
                                        }}
                                    >
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontFamily: F.familyMono,
                                                    fontWeight: 600,
                                                    color: C.textPrimary,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}
                                            >
                                                {row.unique_code}
                                            </Typography>
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    color: row.allowed
                                                        ? C.textSecondary
                                                        : C.error,
                                                }}
                                            >
                                                {row.allowed
                                                    ? row.tier_label
                                                    : row.reason || t('booking.notAllowed')}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontWeight: 700,
                                                    color: row.allowed
                                                        ? C.success
                                                        : C.textLight,
                                                }}
                                            >
                                                {formatMoney(row.refund_amount)}   {/* ✅ PATCHED */}
                                            </Typography>
                                            {row.cancellation_fee > 0 && (
                                                <Typography
                                                    variant="caption"
                                                    sx={{ color: C.error }}
                                                >
                                                    −{formatMoney(row.cancellation_fee)} {t('booking.fee')}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>
                                ))}

                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        pt: 1.5,
                                        mt: 0.5,
                                        borderTop: `2px solid ${C.borderLight}`,
                                    }}
                                >
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 700, color: C.textPrimary }}
                                    >
                                        {t('booking.totalRefund')}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 700, color: C.success }}
                                    >
                                        {formatMoney(previewData.total_refund)}   {/* ✅ PATCHED */}
                                    </Typography>
                                </Box>
                            </Box>
                        </Paper>
                    )}

                    <TextField
                        fullWidth
                        label={t('booking.reason')}
                        placeholder={t('booking.reasonPlaceholder')}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        multiline
                        rows={2}
                        disabled={cancelling}
                        sx={{ mt: 1 }}
                    />
                </DialogContent>

                <DialogActions sx={{ p: 2, gap: 1 }}>
                    <Button
                        onClick={handleCloseCancelDialog}
                        disabled={cancelling}
                        sx={{ textTransform: 'none' }}
                    >
                        {t('booking.keepTickets')}
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={executeCancelTickets}
                        disabled={cancelling || loadingPreview}
                        startIcon={
                            cancelling ? (
                                <CircularProgress size={16} color="inherit" />
                            ) : (
                                <CancelIcon />
                            )
                        }
                        sx={{ textTransform: 'none' }}
                    >
                        {cancelling ? t('booking.cancelling') : t('bookings.cancelTickets')}
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default BookingTickets;