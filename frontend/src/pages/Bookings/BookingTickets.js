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
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
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
    const { user } = useAuth();
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
            toast.error('Failed to load tickets');
        } finally {
            setLoading(false);
        }
    }, [bookingId]);

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
                    ? ` (₹${refund_amount_added} refunded)`
                    : '';

            toast.success(
                `${cancelled_ticket_ids.length} ticket(s) cancelled${refundText}`,
            );

            if (fully_cancelled) {
                toast.info(
                    'All tickets cancelled — booking is now marked as cancelled.',
                );
            }

            setSelectedTicketIds([]);
            setCancelReason('');
            setPreviewData(null);
            setCancelDialogOpen(false);

            await loadBookingTickets();
        } catch (err) {
            console.error('Cancel tickets error:', err);
            toast.error(
                err.response?.data?.error || 'Failed to cancel tickets',
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
            active: { color: 'success', label: 'ACTIVE' },
            used: { color: 'error', label: 'USED' },
            cancelled: { color: 'default', label: 'CANCELLED' },
            expired: { color: 'warning', label: 'EXPIRED' },
            refunded: { color: 'secondary', label: 'REFUNDED' },
        };
        const { color, label } = config[status] || {
            color: 'default',
            label: status || 'UNKNOWN',
        };
        return <StatusChip label={label} size="small" color={color} />;
    };

    const handleBack = () => navigate('/bookings');
    const handlePrint = () => window.print();

    const handleExport = () => {
        try {
            const headers = [
                'Ticket Code',
                'Attendee Name',
                'Status',
                'Check-in Time',
                'Tier',
                'Price',
            ];
            const rows = filteredTickets.map((t) => [
                t.unique_code || '',
                t.attendee_name || 'Guest',
                t.status || '',
                t.check_in_time
                    ? new Date(t.check_in_time).toLocaleString()
                    : '-',
                t.tier_name || 'N/A',
                `₹${t.price || '0'}`,
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

            toast.success('Tickets exported successfully');
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Failed to export tickets');
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
                    <QrCodeIcon sx={{ fontSize: 60, color: '#94a3b8' }} />
                    <Typography sx={{ color: '#94a3b8' }}>
                        QR Code not available
                    </Typography>
                </Box>
            );
        }

        if (qrData.startsWith('data:image')) {
            return (
                <img
                    src={qrData}
                    alt="QR Code"
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
                    alt="QR Code"
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
                    alt="QR Code"
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
                            bgColor="#ffffff"
                            fgColor="#1a1a1a"
                        />
                    </Box>
                );
            } catch (error) {
                console.error('QR generation error:', error);
            }
        }

        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <QrCodeIcon sx={{ fontSize: 60, color: '#94a3b8' }} />
                <Typography sx={{ color: '#94a3b8', mt: 2 }}>
                    QR Code data available
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
                <CircularProgress sx={{ color: '#4f46e5' }} />
            </LoadingWrapper>
        );
    }

    if (!booking) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    Booking not found
                </Alert>
                <Button startIcon={<ArrowBackIcon />} onClick={handleBack}>
                    Back to Bookings
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
                        <PageTitle>Booking Tickets</PageTitle>
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
                        Refresh
                    </OutlineButton>
                    <OutlineButton
                        variant="outlined"
                        startIcon={<PrintIcon />}
                        onClick={handlePrint}
                        size="small"
                    >
                        Print
                    </OutlineButton>
                    <OutlineButton
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={handleExport}
                        size="small"
                    >
                        Export CSV
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            {/* ============ Summary cards ============ */}
            <Grid container spacing={isMobile ? 2 : 3} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6} md={4}>
                    <StyledCard>
                        <CardContent>
                            <Typography
                                sx={{ color: '#64748b' }}
                                gutterBottom
                                variant="caption"
                            >
                                Customer
                            </Typography>
                            <Typography
                                variant="h6"
                                sx={{ color: '#0f172a', wordBreak: 'break-word' }}
                            >
                                {booking.customer_name}
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{ color: '#334155', wordBreak: 'break-word' }}
                            >
                                {booking.customer_email}
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{ color: '#334155' }}
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
                                sx={{ color: '#64748b' }}
                                gutterBottom
                                variant="caption"
                            >
                                Event
                            </Typography>
                            <Typography
                                variant="h6"
                                sx={{ color: '#0f172a', wordBreak: 'break-word' }}
                            >
                                {booking.event_title || booking.event?.title || 'N/A'}
                            </Typography>

                            {/* Subtotal */}
                            <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                    Subtotal
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#334155' }}>
                                    ₹{subtotal.toFixed(2)}
                                </Typography>
                            </Box>

                            {/* Discount (only if any) */}
                            {discountApplied > 0 && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                                    <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 600 }}>
                                        Discount
                                        {booking.discount_code ? ` (${booking.discount_code})` : ''}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 600 }}>
                                        −₹{discountApplied.toFixed(2)}
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
                                    borderTop: '1px solid #e2e8f0',
                                }}
                            >
                                <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 700 }}>
                                    Net Paid
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#4f46e5', fontWeight: 700 }}>
                                    ₹{netPaid.toFixed(2)}
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
                                sx={{ color: '#64748b' }}
                                gutterBottom
                                variant="caption"
                            >
                                Ticket Statistics
                            </Typography>
                            <Grid container spacing={1}>
                                <Grid item xs={3}>
                                    <StatValue color="#4f46e5">
                                        {stats.total}
                                    </StatValue>
                                    <StatLabel>Total</StatLabel>
                                </Grid>
                                <Grid item xs={3}>
                                    <StatValue color="#10b981">
                                        {stats.active}
                                    </StatValue>
                                    <StatLabel>Active</StatLabel>
                                </Grid>
                                <Grid item xs={3}>
                                    <StatValue color="#ef4444">
                                        {stats.used}
                                    </StatValue>
                                    <StatLabel>Used</StatLabel>
                                </Grid>
                                <Grid item xs={3}>
                                    <StatValue color="#94a3b8">
                                        {stats.cancelled}
                                    </StatValue>
                                    <StatLabel>Cancelled</StatLabel>
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
                        ? 'Search tickets...'
                        : 'Search by ticket code, attendee name, or status...'
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                size="small"
                fullWidth
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon sx={{ color: '#94a3b8' }} />
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
                        border: '1px solid #fecaca',
                        bgcolor: 'rgba(254, 202, 202, 0.1)',
                        borderRadius: 2,
                    }}
                >
                    <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: '#b91c1c', flex: 1, minWidth: 0 }}
                    >
                        {selectedTicketIds.length} ticket(s) selected
                    </Typography>
                    <Button
                        variant="contained"
                        color="error"
                        size="small"
                        startIcon={<CancelIcon />}
                        onClick={handleCancelSelected}
                        sx={{ textTransform: 'none' }}
                    >
                        Cancel Selected Tickets
                    </Button>
                    <Button
                        variant="text"
                        size="small"
                        onClick={() => setSelectedTicketIds([])}
                    >
                        Clear
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
                            border: '1px solid #e2e8f0',
                        }}
                    >
                        <Typography sx={{ color: '#94a3b8' }}>
                            {tickets.length === 0
                                ? 'No tickets found for this booking'
                                : 'No matching tickets found'}
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
                                            ? '2px solid #ef4444'
                                            : '1px solid #e2e8f0',
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
                                                        color: '#94a3b8',
                                                        '&.Mui-checked': {
                                                            color: '#ef4444',
                                                        },
                                                        mt: -0.5,
                                                    }}
                                                />
                                            )}
                                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                                <Typography
                                                    variant="subtitle2"
                                                    sx={{
                                                        fontFamily: 'monospace',
                                                        fontWeight: 700,
                                                        color: '#0f172a',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {ticket.unique_code}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ color: '#94a3b8' }}
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
                                                    color: '#94a3b8',
                                                    textTransform: 'uppercase',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                Attendee
                                            </Typography>
                                            <Typography
                                                variant="body2"
                                                sx={{ color: '#334155', fontWeight: 500 }}
                                            >
                                                {ticket.attendee_name || 'Guest'}
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
                                                    color: '#94a3b8',
                                                    textTransform: 'uppercase',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                Tier
                                            </Typography>
                                            <Typography
                                                variant="body2"
                                                sx={{ color: '#334155' }}
                                            >
                                                {ticket.tier_name || 'N/A'}
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
                                                    color: '#94a3b8',
                                                    textTransform: 'uppercase',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                Price
                                            </Typography>
                                            <Typography
                                                variant="body2"
                                                sx={{ color: '#334155', fontWeight: 600 }}
                                            >
                                                ₹{ticket.price || '0'}
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
                                                        color: '#94a3b8',
                                                        textTransform: 'uppercase',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    Checked In
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ color: '#10b981', fontWeight: 600 }}
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
                                                borderColor: '#c7d2fe',
                                                color: '#4f46e5',
                                                textTransform: 'none',
                                            }}
                                        >
                                            View QR Code
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
                                            borderBottom: '1px solid #e2e8f0',
                                        }}
                                    >
                                        <Checkbox
                                            size="small"
                                            indeterminate={someCancellableSelected}
                                            checked={allCancellableSelected}
                                            onChange={handleToggleAll}
                                            disabled={cancellableTickets.length === 0}
                                            sx={{
                                                color: '#94a3b8',
                                                '&.Mui-checked': { color: '#ef4444' },
                                                '&.MuiCheckbox-indeterminate': {
                                                    color: '#ef4444',
                                                },
                                            }}
                                        />
                                    </TableCell>
                                    {[
                                        { label: '#', align: 'left' },
                                        { label: 'Ticket Code', align: 'left' },
                                        { label: 'Attendee Name', align: 'left' },
                                        { label: 'Status', align: 'center' },
                                        { label: 'Tier', align: 'left' },
                                        { label: 'Price', align: 'right' },
                                        { label: 'Check-in Time', align: 'center' },
                                        { label: 'Actions', align: 'center' },
                                    ].map((h) => (
                                        <TableCell
                                            key={h.label}
                                            align={h.align}
                                            sx={{
                                                color: '#475569',
                                                fontWeight: 600,
                                                borderBottom: '1px solid #e2e8f0',
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
                                            <Typography sx={{ color: '#94a3b8' }}>
                                                {tickets.length === 0
                                                    ? 'No tickets found for this booking'
                                                    : 'No matching tickets found'}
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
                                                        backgroundColor: '#f8fafc',
                                                    },
                                                    '&.Mui-selected': {
                                                        backgroundColor:
                                                            'rgba(254, 202, 202, 0.15)',
                                                    },
                                                    '&.Mui-selected:hover': {
                                                        backgroundColor:
                                                            'rgba(254, 202, 202, 0.25)',
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
                                                                color: '#94a3b8',
                                                                '&.Mui-checked': {
                                                                    color: '#ef4444',
                                                                },
                                                            }}
                                                        />
                                                    )}
                                                </TableCell>
                                                <TableCell sx={{ color: '#64748b' }}>
                                                    {index + 1}
                                                </TableCell>
                                                <TableCell>
                                                    <Typography
                                                        variant="body2"
                                                        fontWeight="bold"
                                                        sx={{ color: '#0f172a' }}
                                                    >
                                                        {ticket.unique_code}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={{ color: '#334155' }}>
                                                    {ticket.attendee_name || 'Guest'}
                                                </TableCell>
                                                <TableCell align="center">
                                                    {getStatusChip(ticket.status)}
                                                </TableCell>
                                                <TableCell sx={{ color: '#334155' }}>
                                                    {ticket.tier_name || 'N/A'}
                                                </TableCell>
                                                <TableCell
                                                    align="right"
                                                    sx={{ color: '#334155' }}
                                                >
                                                    ₹{ticket.price || '0'}
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
                                                            label="Not checked in"
                                                            size="small"
                                                            variant="outlined"
                                                            sx={{
                                                                borderColor: '#e2e8f0',
                                                                color: '#94a3b8',
                                                            }}
                                                        />
                                                    )}
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Tooltip title="View QR Code">
                                                        <IconButton
                                                            size="small"
                                                            sx={{ color: '#4f46e5' }}
                                                            onClick={() =>
                                                                handleViewQr(ticket)
                                                            }
                                                        >
                                                            <QrCodeIcon />
                                                        </IconButton>
                                                    </Tooltip>
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
                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                        Showing {filteredTickets.length} of {tickets.length} tickets
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                        Total: {stats.total} | Active: {stats.active} | Used:{' '}
                        {stats.used} | Cancelled: {stats.cancelled}
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
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.12)',
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
                            sx={{ color: '#0f172a', fontWeight: 600 }}
                        >
                            QR Code
                        </Typography>
                        {selectedTicket && getStatusChip(selectedTicket.status)}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {selectedTicket && (
                        <Box sx={{ textAlign: 'center', py: 2 }}>
                            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                                Ticket Code
                            </Typography>
                            <Typography
                                variant="h5"
                                gutterBottom
                                sx={{
                                    color: '#0f172a',
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
                                    bgcolor: '#f8fafc',
                                    borderRadius: 2,
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    minHeight: 250,
                                    border: '1px solid #e2e8f0',
                                }}
                            >
                                {selectedTicket.qr_code ? (
                                    renderQrCode(selectedTicket.qr_code)
                                ) : (
                                    <Box sx={{ textAlign: 'center', py: 4 }}>
                                        <QrCodeIcon
                                            sx={{ fontSize: 60, color: '#94a3b8' }}
                                        />
                                        <Typography sx={{ color: '#94a3b8' }}>
                                            QR Code not available
                                        </Typography>
                                    </Box>
                                )}
                            </Box>

                            <Grid container spacing={2} sx={{ mt: 1 }}>
                                <Grid item xs={6}>
                                    <Typography
                                        variant="caption"
                                        sx={{ color: '#94a3b8' }}
                                    >
                                        Attendee
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        fontWeight="bold"
                                        sx={{ color: '#0f172a' }}
                                    >
                                        {selectedTicket.attendee_name || 'Guest'}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography
                                        variant="caption"
                                        sx={{ color: '#94a3b8' }}
                                    >
                                        Status
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        fontWeight="bold"
                                        sx={{ color: '#0f172a' }}
                                    >
                                        {selectedTicket.status?.toUpperCase()}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography
                                        variant="caption"
                                        sx={{ color: '#94a3b8' }}
                                    >
                                        Tier
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        sx={{ color: '#334155' }}
                                    >
                                        {selectedTicket.tier_name || 'N/A'}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography
                                        variant="caption"
                                        sx={{ color: '#94a3b8' }}
                                    >
                                        Price
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        sx={{ color: '#334155' }}
                                    >
                                        ₹{selectedTicket.price || '0'}
                                    </Typography>
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <OutlineButton onClick={() => setQrDialogOpen(false)}>
                        Close
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
                                    toast.success('QR code downloaded');
                                } else if (qrData.startsWith('http')) {
                                    window.open(qrData, '_blank');
                                } else {
                                    toast.info(
                                        'QR code is embedded and cannot be downloaded directly',
                                    );
                                }
                            }}
                        >
                            Download QR
                        </PrimaryButton>
                    )}
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
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.12)',
                    },
                }}
            >
                <DialogTitle sx={{ color: '#0f172a', fontWeight: 700 }}>
                    Cancel {selectedTicketIds.length} Ticket
                    {selectedTicketIds.length === 1 ? '' : 's'}?
                </DialogTitle>

                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        This action cannot be undone. The selected tickets will be
                        marked as cancelled and a refund will be recorded on the
                        booking.
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
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                                Calculating refund...
                            </Typography>
                        </Box>
                    )}

                    {!loadingPreview && previewData && previewData.preview?.length > 0 && (
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2,
                                mb: 2,
                                bgcolor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: 2,
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: '#64748b',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.5,
                                }}
                            >
                                Refund preview
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
                                            borderBottom: '1px dashed #e2e8f0',
                                            gap: 1,
                                            '&:last-of-type': { borderBottom: 'none' },
                                        }}
                                    >
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontFamily: 'monospace',
                                                    fontWeight: 600,
                                                    color: '#0f172a',
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
                                                        ? '#64748b'
                                                        : '#ef4444',
                                                }}
                                            >
                                                {row.allowed
                                                    ? row.tier_label
                                                    : row.reason || 'Not allowed'}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontWeight: 700,
                                                    color: row.allowed
                                                        ? '#10b981'
                                                        : '#94a3b8',
                                                }}
                                            >
                                                ₹{row.refund_amount.toFixed(2)}
                                            </Typography>
                                            {row.cancellation_fee > 0 && (
                                                <Typography
                                                    variant="caption"
                                                    sx={{ color: '#ef4444' }}
                                                >
                                                    −₹{row.cancellation_fee.toFixed(2)} fee
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
                                        borderTop: '2px solid #e2e8f0',
                                    }}
                                >
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 700, color: '#0f172a' }}
                                    >
                                        Total refund
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 700, color: '#10b981' }}
                                    >
                                        ₹{previewData.total_refund.toFixed(2)}
                                    </Typography>
                                </Box>
                            </Box>
                        </Paper>
                    )}

                    <TextField
                        fullWidth
                        label="Reason (optional)"
                        placeholder="e.g. Customer request, event rescheduled..."
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
                        Keep Tickets
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
                        {cancelling ? 'Cancelling...' : 'Cancel Tickets'}
                    </Button>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default BookingTickets;