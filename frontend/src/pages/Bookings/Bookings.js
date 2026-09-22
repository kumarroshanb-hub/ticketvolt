// frontend/src/pages/Bookings/Bookings.js
import React, { useState, useEffect } from 'react';
import {
    Box, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Typography, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions,
    CircularProgress, Tooltip, MenuItem, Select, FormControl, InputLabel,
    Checkbox, Chip, Grid, Paper, Divider, Alert,
    Button, Card, CardContent,
    useMediaQuery, useTheme,
} from '@mui/material';
import {
    Refresh as RefreshIcon,
    Visibility as ViewIcon,
    QrCode as QrCodeIcon,
    ArrowForward as ArrowForwardIcon,
    Payment as PaymentIcon,
    Cancel as CancelIcon,
    Refresh as RefreshIcon2,
    Receipt as ReceiptIcon,
    Email as EmailIcon,
    ShoppingCart as ShoppingCartIcon,
    Event as EventIcon,
    ConfirmationNumber as TicketIcon,
    AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import api from '../../services/api';
import { toast } from 'react-toastify';

// Import from Common
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageHeaderLeft,
    PageHeaderRight,
    PrimaryButton,
    OutlineButton,
    StatusChip,
    StyledTableContainer,
    BulkActionsBar,
    LoadingWrapper,
} from '../../components/Common';

// Import shared constants
import {
    BOOKING_STATUS,
    BookingStatusUtils,
    ROLES,
} from '../../constants';

import Ticket from '../../components/Ticket/E-Ticket';

// ============================================
// STAT CARD — matches Dashboard.js
// ============================================
const StatCard = ({ title, value, icon, color }) => {
    const theme = useTheme();
    const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

    return (
        <Card sx={{ height: '100%', borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <CardContent sx={{ p: isSmall ? 1.5 : 2, '&:last-child': { pb: isSmall ? 1.5 : 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                            variant="caption"
                            sx={{
                                color: '#64748b',
                                fontWeight: 600,
                                letterSpacing: 0.5,
                                fontSize: isSmall ? '10px' : '12px',
                            }}
                        >
                            {title}
                        </Typography>
                        <Typography
                            variant="h4"
                            sx={{
                                fontWeight: 700,
                                color: '#0f172a',
                                mt: 1,
                                fontSize: isSmall ? '1.25rem' : '2rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {value}
                        </Typography>
                    </Box>
                    <Box
                        sx={{
                            backgroundColor: `${color}15`,
                            borderRadius: '50%',
                            p: isSmall ? 0.75 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        {icon}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
};

// ============================================
// MOBILE BOOKING CARD — matches Dashboard.js
// ============================================
const MobileBookingCard = ({ booking, onClick, renderActions, isSelected, showCheckbox, onToggleSelect }) => {
    const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;

    return (
        <Card
            sx={{
                borderRadius: 2,
                border: isSelected ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                opacity: isCompleted ? 0.75 : 1,
                overflow: 'hidden',
                transition: 'all 0.2s ease',
            }}
        >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                {/* Header: Reference + Status */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
                    {showCheckbox && (
                        <Checkbox
                            checked={isSelected}
                            onChange={(e) => onToggleSelect && onToggleSelect(e, booking.id)}
                            disabled={isCompleted}
                            sx={{ color: '#94a3b8', p: 0.5, mt: -0.5 }}
                            size="small"
                        />
                    )}
                    <Box
                        onClick={onClick}
                        sx={{
                            cursor: 'pointer',
                            flex: 1,
                            minWidth: 0,
                            '&:active': { opacity: 0.7 },
                        }}
                    >
                        <Typography
                            variant="subtitle1"
                            sx={{
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                color: '#0f172a',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {booking.booking_reference}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                            {booking.formatted_date || new Date(booking.created_at).toLocaleDateString()}
                        </Typography>
                    </Box>
                    <StatusChip
                        status={booking.status}
                        type="booking"
                        size="small"
                        showIcon={true}
                        variant="filled"
                    />
                </Box>

                <Divider sx={{ mb: 1.5 }} />

                {/* Customer + Event */}
                <Box
                    onClick={onClick}
                    sx={{ cursor: 'pointer', '&:active': { opacity: 0.7 } }}
                >
                    <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600, letterSpacing: 0.5 }}>
                            Customer
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#334155', fontWeight: 500 }}>
                            {booking.customer_name || 'N/A'}
                        </Typography>
                    </Box>

                    <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '10px', fontWeight: 600, letterSpacing: 0.5 }}>
                            Event
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{
                                color: '#334155',
                                fontWeight: 500,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {booking.event_title || booking.event?.title || 'N/A'}
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 1.5, borderTop: '1px dashed #e2e8f0' }}>
                        <Typography variant="h6" sx={{ color: '#4f46e5', fontWeight: 700 }}>
                            ₹{booking.total_amount}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                            {booking.ticket_count || 0} ticket{(booking.ticket_count || 0) !== 1 ? 's' : ''}
                        </Typography>
                    </Box>

                    {isCompleted && (
                        <Typography variant="caption" sx={{ color: '#10b981', display: 'block', mt: 1, fontWeight: 600 }}>
                            ✅ All tickets used
                        </Typography>
                    )}
                </Box>

                {/* Actions */}
                {renderActions && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #f1f5f9' }}>
                        {renderActions(booking)}
                    </Box>
                )}
            </CardContent>
        </Card>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================
const Bookings = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { role } = useRole();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Determine user permissions
    const isSuperAdmin = role === ROLES.SUPER_ADMIN;
    const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
    const isOrganizer = role === ROLES.ORGANIZER;
    const canManageAllBookings = isAdmin || isOrganizer || isSuperAdmin;
    const isRegularUser = role === ROLES.USER;

    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkAction, setBulkAction] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState({
        open: false,
        title: '',
        message: '',
        action: null,
        bookingId: null,
        bookingIds: []
    });
    const [eticketOpen, setEticketOpen] = useState(false);
    const [eticketData, setEticketData] = useState({
        tickets: [],
        booking: null,
        event: null,
    });
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        confirmed: 0,
        completed: 0,
        cancelled: 0,
        refunded: 0,
    });

    const loadBookings = async () => {
        setLoading(true);
        setError(null);
        try {
            console.log('📊 Loading bookings for user:', user?.email, 'role:', role);

            const response = await api.get('/bookings/');
            console.log('📊 Bookings API response:', response.data);

            let bookingsData = [];

            if (Array.isArray(response.data)) {
                bookingsData = response.data;
            } else if (response.data && response.data.results) {
                bookingsData = response.data.results;
            } else if (response.data && typeof response.data === 'object') {
                bookingsData = Object.values(response.data).filter(item => item.id && item.booking_reference);
            }

            console.log(`📊 Found ${bookingsData.length} bookings`);

            setBookings(bookingsData);
            setSelectedIds([]);
            calculateStats(bookingsData);

        } catch (error) {
            console.error('❌ Bookings error:', error);
            console.error('  Status:', error.response?.status);
            console.error('  Data:', error.response?.data);

            let errorMsg = 'Failed to load bookings';
            if (error.response?.data?.detail) {
                errorMsg = error.response.data.detail;
            } else if (error.response?.data?.error) {
                errorMsg = error.response.data.error;
            } else if (error.message) {
                errorMsg = error.message;
            }

            setError(errorMsg);
            toast.error(errorMsg);
        }
        setLoading(false);
    };

    const calculateStats = (bookingsData) => {
        const stats = {
            total: bookingsData.length,
            pending: bookingsData.filter(b => b.status === BOOKING_STATUS.PENDING).length,
            confirmed: bookingsData.filter(b => b.status === BOOKING_STATUS.CONFIRMED).length,
            completed: bookingsData.filter(b => b.status === BOOKING_STATUS.COMPLETED).length,
            cancelled: bookingsData.filter(b => b.status === BOOKING_STATUS.CANCELLED).length,
            refunded: bookingsData.filter(b => b.status === BOOKING_STATUS.REFUNDED).length,
        };
        setStats(stats);
    };

    useEffect(() => {
        loadBookings();
    }, []);

    const handleViewTickets = (bookingId) => {
        navigate(`/bookings/${bookingId}/tickets`);
    };

    const getTicketsForBooking = async (booking) => {
        try {
            const response = await api.get(`/bookings/${booking.id}/tickets/`);
            return response.data.tickets || [];
        } catch (error) {
            console.error('Error fetching tickets:', error);
            return [];
        }
    };

    const handleViewETicket = async (booking) => {
        try {
            console.log('🎫 View E-Ticket for booking:', booking.id);

            const tickets = await getTicketsForBooking(booking);
            console.log('🎫 Tickets found:', tickets.length);

            if (tickets.length === 0) {
                toast.warning('No tickets found for this booking');
                return;
            }

            const eventId = booking.event_id || booking.event?.id;
            if (!eventId) {
                toast.error('Event not found for this booking');
                return;
            }

            const eventRes = await api.get(`/events/${eventId}/`);

            setEticketData({
                tickets: tickets,
                booking: booking,
                event: eventRes.data,
            });
            setEticketOpen(true);
        } catch (error) {
            console.error('❌ Error loading ticket data:', error);
            toast.error(error.response?.data?.error || 'Failed to load e-ticket');
        }
    };

    // ============================================================
    // ✅ FIXED: handleSendEmailFromTable
    // ------------------------------------------------------------
    // SECURITY: The email recipient is determined SERVER-SIDE from
    // the booking record. We deliberately do NOT send `email` in the
    // request body — that would imply the endpoint trusts client
    // input for the recipient, which is a potential abuse vector if
    // the backend ever changed to read it.
    //
    // The backend's `resend_tickets` action reads `booking.customer_email`
    // and ignores any client-supplied email, so sending none is correct.
    // ============================================================
    const handleSendEmailFromTable = async (booking) => {
        try {
            console.log('📧 Resending tickets for booking:', booking.booking_reference);

            const response = await api.post(`/bookings/${booking.id}/resend_tickets/`);

            console.log('📧 Email response:', response.data);

            const formatInfo = response.data?.formats
                ? ` (${response.data.formats})`
                : '';
            const attachmentsInfo = response.data?.attachments
                ? ` — ${response.data.attachments} attachment(s)`
                : '';

            toast.success(
                `Tickets sent to ${booking.customer_email}${formatInfo}${attachmentsInfo}`
            );
        } catch (error) {
            console.error('❌ Send email error:', error);

            const errorMsg =
                error.response?.data?.error ||
                error.response?.data?.detail ||
                error.message ||
                'Failed to send ticket email';

            toast.error(errorMsg);
        }
    };

    // ============ ACTION HANDLERS ============
    const handleMarkPaymentReceived = async (bookingId) => {
        setConfirmDialog({
            open: true,
            title: '💰 Mark Payment Received',
            message: 'This will mark the payment as received but NOT generate QR codes yet. Continue?',
            action: 'mark_payment_received',
            bookingId: bookingId,
            bookingIds: []
        });
    };

    const handleConfirmPaymentAndIssue = async (bookingId) => {
        setConfirmDialog({
            open: true,
            title: '💰 Confirm Payment & Issue Tickets',
            message: 'This will mark the payment as received and generate QR codes for all tickets. Continue?',
            action: 'confirm_payment_and_issue_tickets',
            bookingId: bookingId,
            bookingIds: []
        });
    };

    const handleIssueTickets = async (bookingId) => {
        setConfirmDialog({
            open: true,
            title: '🎫 Issue Tickets',
            message: 'This will generate QR codes for all tickets in this booking. Continue?',
            action: 'issue_tickets',
            bookingId: bookingId,
            bookingIds: []
        });
    };

    const handleRegenerateQR = async (bookingId) => {
        setConfirmDialog({
            open: true,
            title: '🔄 Regenerate QR Codes',
            message: 'This will regenerate QR codes for all tickets. Existing QR codes will be replaced. Continue?',
            action: 'regenerate_ticket_qr',
            bookingId: bookingId,
            bookingIds: []
        });
    };

    const handleCancelBooking = async (bookingId) => {
        setConfirmDialog({
            open: true,
            title: '❌ Cancel Booking',
            message: 'Are you sure you want to cancel this booking? This action cannot be undone.',
            action: 'cancel_booking',
            bookingId: bookingId,
            bookingIds: []
        });
    };

    const handleRefundBooking = async (bookingId) => {
        setConfirmDialog({
            open: true,
            title: '💸 Refund Booking',
            message: 'Are you sure you want to refund this booking? This action cannot be undone.',
            action: 'refund_booking',
            bookingId: bookingId,
            bookingIds: []
        });
    };

    const executeAction = async () => {
        const { action, bookingId, bookingIds } = confirmDialog;
        setActionLoading(true);
        setConfirmDialog({ ...confirmDialog, open: false });

        try {
            let endpoint = '';
            let data = {};

            switch (action) {
                case 'mark_payment_received':
                    endpoint = `/bookings/${bookingId}/mark_payment_received/`;
                    data = {
                        payment_method: 'offline',
                        payment_reference: 'MANUAL-' + Date.now(),
                        notes: 'Payment marked as received by admin'
                    };
                    break;
                case 'confirm_payment_and_issue_tickets':
                    endpoint = `/bookings/${bookingId}/confirm_payment_and_issue_tickets/`;
                    data = {
                        payment_method: 'offline',
                        payment_reference: 'MANUAL-' + Date.now(),
                        notes: 'Payment confirmed and tickets issued by admin'
                    };
                    break;
                case 'issue_tickets':
                    endpoint = `/bookings/${bookingId}/issue_tickets/`;
                    data = {
                        notes: 'Tickets issued by admin'
                    };
                    break;
                case 'regenerate_ticket_qr':
                    endpoint = `/bookings/${bookingId}/regenerate_ticket_qr/`;
                    data = {
                        notes: 'QR codes regenerated by admin'
                    };
                    break;
                case 'cancel_booking':
                    endpoint = `/bookings/${bookingId}/cancel_booking/`;
                    data = {
                        notes: 'Booking cancelled by admin'
                    };
                    break;
                case 'refund_booking':
                    endpoint = `/bookings/${bookingId}/refund_booking/`;
                    data = {
                        notes: 'Booking refunded by admin'
                    };
                    break;
                case 'bulk':
                    endpoint = `/bookings/bulk_action/`;
                    const formattedIds = Array.isArray(bookingIds)
                        ? bookingIds.map(id => String(id))
                        : [String(bookingIds)];
                    data = {
                        action: bulkAction,
                        booking_ids: formattedIds
                    };
                    break;
                default:
                    return;
            }

            const response = await api.post(endpoint, data);

            if (action === 'bulk') {
                const result = response.data;

                if (result.status === 'completed') {
                    const { summary, results, errors } = result;

                    if (summary.successful > 0) {
                        toast.success(`✅ ${summary.successful} of ${summary.total_processed} bookings processed successfully`);
                    }

                    if (results && results.length > 0) {
                        results.forEach((bookingResult) => {
                            if (bookingResult.status === 'success') {
                                console.log(`✅ ${bookingResult.reference}: ${bookingResult.result.success || 'Success'}`);
                            } else if (bookingResult.status === 'failed') {
                                const errorMsg = bookingResult.result?.error || 'Unknown error';
                                toast.warning(`⚠️ ${bookingResult.reference}: ${errorMsg}`);
                            }
                        });
                    }

                    if (errors && errors.length > 0) {
                        errors.forEach((err) => {
                            toast.error(`❌ ${err.reference || 'Booking'}: ${err.error}`);
                        });
                    }

                    loadBookings();
                } else if (result.status === 'validation_failed') {
                    const invalidBookings = result.validation_results?.invalid || [];
                    toast.error(`❌ ${result.invalid_bookings} booking(s) are not eligible for this action`);

                    if (invalidBookings && invalidBookings.length > 0) {
                        invalidBookings.forEach((invalid) => {
                            const errors = invalid.errors.map(e => e.message).join('; ');
                            toast.warning(`⚠️ ${invalid.reference}: ${errors}`);
                        });
                    }
                } else {
                    toast.error(result.error || 'Bulk action failed');
                }
            } else {
                if (response.data.status === 'success' || response.data.success !== false) {
                    const message = response.data.message ||
                                response.data.status ||
                                'Action completed successfully';
                    toast.success(message);

                    if (response.data.email_sent !== undefined) {
                        if (response.data.email_sent) {
                            toast.info('📧 Notification email sent to customer');
                        } else {
                            toast.warning('⚠️ Email notification could not be sent');
                        }
                    }

                    loadBookings();
                } else {
                    toast.error(response.data.error || 'Action failed');
                }
            }
        } catch (error) {
            console.error('❌ Action error:', error);

            const errorData = error.response?.data;
            let errorMsg = 'Action failed';

            if (errorData) {
                if (errorData.error) {
                    errorMsg = errorData.error;
                } else if (errorData.detail) {
                    errorMsg = errorData.detail;
                } else if (errorData.message) {
                    errorMsg = errorData.message;
                } else if (errorData.non_field_errors) {
                    errorMsg = errorData.non_field_errors.join(', ');
                } else if (typeof errorData === 'object') {
                    const firstKey = Object.keys(errorData)[0];
                    if (firstKey && errorData[firstKey]) {
                        errorMsg = `${firstKey}: ${Array.isArray(errorData[firstKey]) ? errorData[firstKey][0] : errorData[firstKey]}`;
                    }
                }
            }

            toast.error(errorMsg);
        } finally {
            setActionLoading(false);
            setBulkAction('');
        }
    };

    // ============ BULK ACTIONS ============
    const handleBulkAction = async () => {
        if (!bulkAction || selectedIds.length === 0) {
            toast.warning('Please select bookings and an action');
            return;
        }

        const actionLabels = {
            'mark_payment_received': 'Mark Payment Received',
            'confirm_payment_and_issue_tickets': 'Confirm Payment & Issue Tickets',
            'issue_tickets': 'Issue Tickets',
            'regenerate_ticket_qr': 'Regenerate QR Codes',
            'cancel_booking': 'Cancel Bookings'
        };

        setConfirmDialog({
            open: true,
            title: actionLabels[bulkAction] || 'Bulk Action',
            message: `This will apply "${actionLabels[bulkAction]}" to ${selectedIds.length} booking(s). Continue?`,
            action: 'bulk',
            bookingId: null,
            bookingIds: selectedIds
        });
    };

    // ============ SELECTION HANDLERS ============
    const handleSelectAll = (event) => {
        if (event.target.checked) {
            setSelectedIds(bookings.map(b => b.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (event, id) => {
        if (event.target.checked) {
            setSelectedIds([...selectedIds, id]);
        } else {
            setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
        }
    };

    // Get action buttons based on user role
    const getAvailableActions = (booking) => {
        const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;
        const isCancelled = booking.status === BOOKING_STATUS.CANCELLED;
        const isRefunded = booking.status === BOOKING_STATUS.REFUNDED;
        const isReadonly = isCompleted || isCancelled || isRefunded;

        if (isRegularUser) {
            return {
                canView: true,
                canViewETicket: booking.status === BOOKING_STATUS.CONFIRMED ||
                               booking.status === BOOKING_STATUS.PAID ||
                               booking.status === BOOKING_STATUS.COMPLETED,
                canSendEmail: booking.status === BOOKING_STATUS.CONFIRMED ||
                             booking.status === BOOKING_STATUS.PAID ||
                             booking.status === BOOKING_STATUS.COMPLETED,
                canManage: false,
                isReadonly: isReadonly,
            };
        }

        return {
            canView: true,
            canViewETicket: booking.status === BOOKING_STATUS.CONFIRMED ||
                           booking.status === BOOKING_STATUS.PAID ||
                           booking.status === BOOKING_STATUS.COMPLETED,
            canSendEmail: booking.status === BOOKING_STATUS.CONFIRMED ||
                         booking.status === BOOKING_STATUS.PAID ||
                         booking.status === BOOKING_STATUS.COMPLETED,
            canMarkPayment: booking.status === BOOKING_STATUS.PENDING,
            canConfirmPayment: booking.status === BOOKING_STATUS.PENDING,
            canIssueTickets: booking.status === BOOKING_STATUS.PAID,
            canRegenerateQR: booking.status === BOOKING_STATUS.PAID ||
                           booking.status === BOOKING_STATUS.CONFIRMED,
            canCancel: !isReadonly && booking.status !== BOOKING_STATUS.CANCELLED,
            canRefund: booking.status === BOOKING_STATUS.PAID ||
                      booking.status === BOOKING_STATUS.CONFIRMED,
            canManage: true,
            isReadonly: isReadonly,
        };
    };

    const handleBookTickets = () => {
        navigate('/bookings/create');
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
                    <PageTitle variant="h4">
                        {isRegularUser ? 'My Bookings' : 'Bookings'}
                    </PageTitle>
                    <Typography
                        variant="body2"
                        sx={{
                            color: '#64748b',
                            ml: isMobile ? 0 : 2,
                            display: 'block',
                            width: isMobile ? '100%' : 'auto',
                        }}
                    >
                        {isRegularUser
                            ? 'View and manage your bookings'
                            : 'Manage all customer bookings'}
                    </Typography>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton variant="outlined" startIcon={<RefreshIcon />} onClick={loadBookings}>
                        Refresh
                    </OutlineButton>
                    <PrimaryButton variant="contained" startIcon={<ShoppingCartIcon />} onClick={handleBookTickets}>
                        Book Tickets
                    </PrimaryButton>
                </PageHeaderRight>
            </PageHeader>

            {/* ============================================ */}
            {/* STATS CARDS — Matches Dashboard styling */}
            {/* ============================================ */}
            <Grid container spacing={isMobile ? 1.5 : 2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={6} md={2}>
                    <StatCard
                        title="Total"
                        value={stats.total}
                        icon={<EventIcon sx={{ color: '#4f46e5', fontSize: isMobile ? 20 : 24 }} />}
                        color="#4f46e5"
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={2}>
                    <StatCard
                        title="Pending"
                        value={stats.pending}
                        icon={<PaymentIcon sx={{ color: '#f59e0b', fontSize: isMobile ? 20 : 24 }} />}
                        color="#f59e0b"
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={2}>
                    <StatCard
                        title="Confirmed"
                        value={stats.confirmed}
                        icon={<QrCodeIcon sx={{ color: '#22c55e', fontSize: isMobile ? 20 : 24 }} />}
                        color="#22c55e"
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={2}>
                    <StatCard
                        title="Completed"
                        value={stats.completed}
                        icon={<ReceiptIcon sx={{ color: '#10b981', fontSize: isMobile ? 20 : 24 }} />}
                        color="#10b981"
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={2}>
                    <StatCard
                        title="Cancelled"
                        value={stats.cancelled}
                        icon={<CancelIcon sx={{ color: '#ef4444', fontSize: isMobile ? 20 : 24 }} />}
                        color="#ef4444"
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={2}>
                    <StatCard
                        title="Refunded"
                        value={stats.refunded}
                        icon={<MoneyIcon sx={{ color: '#8b5cf6', fontSize: isMobile ? 20 : 24 }} />}
                        color="#8b5cf6"
                    />
                </Grid>
            </Grid>

            {/* Error Alert */}
            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                    <Button size="small" onClick={loadBookings} sx={{ ml: 2 }}>
                        Retry
                    </Button>
                </Alert>
            )}

            {/* Info Alert for Regular Users */}
            {isRegularUser && bookings.length === 0 && !error && (
                <Alert severity="info" sx={{ mb: 3 }}>
                    You don't have any bookings yet. Click "Book Tickets" to browse events and book your first ticket!
                </Alert>
            )}

            {/* Bulk Actions Bar */}
            {canManageAllBookings && selectedIds.length > 0 && (
                <BulkActionsBar>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', width: '100%' }}>
                        <Typography variant="body2" fontWeight="bold" sx={{ color: '#0f172a' }}>
                            {selectedIds.length} booking(s) selected
                        </Typography>
                        <FormControl size="small" sx={{ minWidth: 200, flex: isMobile ? 1 : 'unset' }}>
                            <InputLabel sx={{ color: '#64748b' }}>Bulk Action</InputLabel>
                            <Select
                                value={bulkAction}
                                onChange={(e) => setBulkAction(e.target.value)}
                                label="Bulk Action"
                                sx={{
                                    color: '#0f172a',
                                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#c7d2fe' }
                                }}
                            >
                                <MenuItem value="mark_payment_received">💰 Mark Payment Received</MenuItem>
                                <MenuItem value="confirm_payment_and_issue_tickets">💰 Confirm Payment & Issue Tickets</MenuItem>
                                <MenuItem value="issue_tickets">🎫 Issue Tickets</MenuItem>
                                <MenuItem value="regenerate_ticket_qr">🔄 Regenerate QR Codes</MenuItem>
                                <MenuItem value="cancel_booking">❌ Cancel Bookings</MenuItem>
                            </Select>
                        </FormControl>
                        <PrimaryButton
                            variant="contained"
                            onClick={handleBulkAction}
                            disabled={!bulkAction || actionLoading}
                            sx={isMobile ? { flex: 1 } : undefined}
                        >
                            {actionLoading ? <CircularProgress size={24} /> : 'Apply'}
                        </PrimaryButton>
                        <OutlineButton
                            variant="outlined"
                            color="error"
                            size="small"
                            onClick={() => setSelectedIds([])}
                            sx={{
                                borderColor: '#fecaca',
                                color: '#dc2626',
                                '&:hover': {
                                    borderColor: '#dc2626',
                                    backgroundColor: 'rgba(220, 38, 38, 0.04)'
                                }
                            }}
                        >
                            Clear
                        </OutlineButton>
                    </Box>
                </BulkActionsBar>
            )}

            {/* ==================== MOBILE VIEW ==================== */}
            {isMobile ? (
                bookings.length === 0 ? (
                    <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                        <Typography sx={{ color: '#94a3b8' }}>
                            {isRegularUser ? 'No bookings found. Book your first event!' : 'No bookings found'}
                        </Typography>
                    </Paper>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {bookings.map((booking) => {
                            const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;
                            const isCancelled = booking.status === BOOKING_STATUS.CANCELLED;
                            const isRefunded  = booking.status === BOOKING_STATUS.REFUNDED;
                            const isReadonly  = isCompleted || isCancelled || isRefunded;
                            const actions = getAvailableActions(booking);

                            return (
                                <MobileBookingCard
                                    key={booking.id}
                                    booking={booking}
                                    isSelected={selectedIds.includes(booking.id)}
                                    showCheckbox={canManageAllBookings}
                                    onToggleSelect={handleSelectOne}
                                    onClick={() => {
                                        setSelectedBooking(booking);
                                        setDetailsOpen(true);
                                    }}
                                    renderActions={(b) => (
                                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                            {actions.canViewETicket && (
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    startIcon={<ReceiptIcon />}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleViewETicket(b);
                                                    }}
                                                    disabled={actionLoading}
                                                    sx={{
                                                        flex: '1 1 45%',
                                                        borderColor: '#bbf7d0',
                                                        color: '#10b981',
                                                        textTransform: 'none',
                                                    }}
                                                >
                                                    E-Ticket
                                                </Button>
                                            )}
                                            {actions.canSendEmail && (
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    startIcon={<EmailIcon />}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSendEmailFromTable(b);
                                                    }}
                                                    disabled={actionLoading}
                                                    sx={{
                                                        flex: '1 1 45%',
                                                        borderColor: '#bfdbfe',
                                                        color: '#3b82f6',
                                                        textTransform: 'none',
                                                    }}
                                                >
                                                    Email
                                                </Button>
                                            )}
                                            {canManageAllBookings && !isReadonly && (
                                                <>
                                                    {actions.canMarkPayment && (
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            startIcon={<PaymentIcon />}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleMarkPaymentReceived(b.id);
                                                            }}
                                                            disabled={actionLoading}
                                                            sx={{ flex: '1 1 45%', borderColor: '#fde68a', color: '#f59e0b', textTransform: 'none' }}
                                                        >
                                                            Mark Paid
                                                        </Button>
                                                    )}
                                                    {actions.canConfirmPayment && (
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            startIcon={<QrCodeIcon />}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleConfirmPaymentAndIssue(b.id);
                                                            }}
                                                            disabled={actionLoading}
                                                            sx={{ flex: '1 1 45%', borderColor: '#bbf7d0', color: '#10b981', textTransform: 'none' }}
                                                        >
                                                            Confirm & Issue
                                                        </Button>
                                                    )}
                                                    {actions.canIssueTickets && (
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            startIcon={<QrCodeIcon />}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleIssueTickets(b.id);
                                                            }}
                                                            disabled={actionLoading}
                                                            sx={{ flex: '1 1 45%', borderColor: '#c7d2fe', color: '#4f46e5', textTransform: 'none' }}
                                                        >
                                                            Issue
                                                        </Button>
                                                    )}
                                                    {actions.canRegenerateQR && (
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            startIcon={<RefreshIcon2 />}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRegenerateQR(b.id);
                                                            }}
                                                            disabled={actionLoading}
                                                            sx={{ flex: '1 1 45%', borderColor: '#ddd6fe', color: '#7c3aed', textTransform: 'none' }}
                                                        >
                                                            Regen QR
                                                        </Button>
                                                    )}
                                                    {actions.canCancel && (
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            startIcon={<CancelIcon />}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleCancelBooking(b.id);
                                                            }}
                                                            disabled={actionLoading}
                                                            sx={{ flex: '1 1 45%', borderColor: '#fecaca', color: '#ef4444', textTransform: 'none' }}
                                                        >
                                                            Cancel
                                                        </Button>
                                                    )}
                                                    {actions.canRefund && (
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            startIcon={<PaymentIcon />}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRefundBooking(b.id);
                                                            }}
                                                            disabled={actionLoading}
                                                            sx={{ flex: '1 1 45%', borderColor: '#ddd6fe', color: '#8b5cf6', textTransform: 'none' }}
                                                        >
                                                            Refund
                                                        </Button>
                                                    )}
                                                </>
                                            )}
                                            <Button
                                                size="small"
                                                variant="contained"
                                                startIcon={<ViewIcon />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedBooking(b);
                                                    setDetailsOpen(true);
                                                }}
                                                sx={{
                                                    flex: '1 1 100%',
                                                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                                    textTransform: 'none',
                                                }}
                                            >
                                                View Details
                                            </Button>
                                        </Box>
                                    )}
                                />
                            );
                        })}
                    </Box>
                )
            ) : (
                /* ==================== DESKTOP VIEW ==================== */
                <StyledTableContainer>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    {canManageAllBookings && (
                                        <TableCell padding="checkbox" sx={{ borderBottom: '1px solid #e2e8f0' }}>
                                            <Checkbox
                                                indeterminate={selectedIds.length > 0 && selectedIds.length < bookings.length}
                                                checked={bookings.length > 0 && selectedIds.length === bookings.length}
                                                onChange={handleSelectAll}
                                                sx={{ color: '#94a3b8' }}
                                            />
                                        </TableCell>
                                    )}
                                    <TableCell sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Reference</TableCell>
                                    <TableCell sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Customer</TableCell>
                                    <TableCell sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Event</TableCell>
                                    <TableCell align="right" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Amount</TableCell>
                                    <TableCell align="center" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Tickets</TableCell>
                                    <TableCell align="center" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Status</TableCell>
                                    <TableCell align="center" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Date</TableCell>
                                    <TableCell align="center" sx={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {bookings.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={canManageAllBookings ? 9 : 8} align="center" sx={{ py: 4 }}>
                                            <Typography sx={{ color: '#94a3b8' }}>
                                                {isRegularUser ? 'No bookings found. Book your first event!' : 'No bookings found'}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    bookings.map((booking) => {
                                        const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;
                                        const isCancelled = booking.status === BOOKING_STATUS.CANCELLED;
                                        const isRefunded = booking.status === BOOKING_STATUS.REFUNDED;
                                        const isReadonly = isCompleted || isCancelled || isRefunded;
                                        const isTerminal = BookingStatusUtils.isTerminal(booking.status);
                                        const actions = getAvailableActions(booking);

                                        return (
                                            <TableRow
                                                key={booking.id}
                                                hover
                                                selected={selectedIds.includes(booking.id)}
                                                sx={{
                                                    '&:hover': { backgroundColor: '#f8fafc' },
                                                    '&.Mui-selected': { backgroundColor: '#eef2ff' },
                                                    opacity: isTerminal ? 0.7 : 1,
                                                }}
                                            >
                                                {canManageAllBookings && (
                                                    <TableCell padding="checkbox">
                                                        <Checkbox
                                                            checked={selectedIds.includes(booking.id)}
                                                            onChange={(e) => handleSelectOne(e, booking.id)}
                                                            sx={{ color: '#94a3b8' }}
                                                            disabled={isReadonly}
                                                        />
                                                    </TableCell>
                                                )}
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="bold" sx={{ color: '#0f172a' }}>
                                                        {booking.booking_reference}
                                                    </Typography>
                                                    {isCompleted && (
                                                        <Typography variant="caption" sx={{ color: '#10b981', display: 'block' }}>
                                                            ✅ All tickets used
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell sx={{ color: '#334155' }}>{booking.customer_name}</TableCell>
                                                <TableCell sx={{ color: '#334155' }}>{booking.event_title || booking.event?.title || 'N/A'}</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 600, color: '#0f172a' }}>
                                                    ₹{booking.total_amount}
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Chip
                                                        label={`${booking.ticket_count || 0} tickets`}
                                                        size="small"
                                                        color={isCompleted ? "success" : "primary"}
                                                        variant={isCompleted ? "filled" : "outlined"}
                                                        icon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
                                                        clickable={!isReadonly}
                                                        onClick={() => !isReadonly && handleViewTickets(booking.id)}
                                                        sx={{
                                                            borderColor: isCompleted ? '#10b981' : '#c7d2fe',
                                                            color: isCompleted ? '#fff' : '#4f46e5',
                                                            backgroundColor: isCompleted ? '#10b981' : 'transparent',
                                                            '&:hover': {
                                                                borderColor: '#4f46e5',
                                                                backgroundColor: isCompleted ? '#059669' : '#eef2ff'
                                                            }
                                                        }}
                                                    />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <StatusChip status={booking.status} type="booking" size="small" showIcon={true} variant="filled" />
                                                </TableCell>
                                                <TableCell align="center" sx={{ color: '#64748b' }}>
                                                    {booking.formatted_date || new Date(booking.created_at).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
                                                        {actions.canViewETicket && (
                                                            <Tooltip title="View E-Ticket">
                                                                <IconButton size="small" sx={{ color: '#10b981' }} onClick={() => handleViewETicket(booking)} disabled={actionLoading}>
                                                                    <ReceiptIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        {actions.canSendEmail && (
                                                            <Tooltip title="Send E-Ticket Email">
                                                                <IconButton size="small" sx={{ color: '#3b82f6' }} onClick={() => handleSendEmailFromTable(booking)} disabled={actionLoading}>
                                                                    <EmailIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        {canManageAllBookings && (
                                                            <>
                                                                {actions.canMarkPayment && (
                                                                    <Tooltip title="Mark Payment Received (No Tickets)">
                                                                        <IconButton size="small" sx={{ color: '#f59e0b' }} onClick={() => handleMarkPaymentReceived(booking.id)} disabled={actionLoading || isReadonly}>
                                                                            <PaymentIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                                {actions.canConfirmPayment && (
                                                                    <Tooltip title="Confirm Payment & Issue Tickets">
                                                                        <IconButton size="small" sx={{ color: '#10b981' }} onClick={() => handleConfirmPaymentAndIssue(booking.id)} disabled={actionLoading || isReadonly}>
                                                                            <QrCodeIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                                {actions.canIssueTickets && (
                                                                    <Tooltip title="Issue Tickets">
                                                                        <IconButton size="small" sx={{ color: '#4f46e5' }} onClick={() => handleIssueTickets(booking.id)} disabled={actionLoading || isReadonly}>
                                                                            <QrCodeIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                                {actions.canRegenerateQR && (
                                                                    <Tooltip title="Regenerate QR Codes">
                                                                        <IconButton size="small" sx={{ color: '#7c3aed' }} onClick={() => handleRegenerateQR(booking.id)} disabled={actionLoading || isReadonly}>
                                                                            <RefreshIcon2 fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                                {actions.canCancel && (
                                                                    <Tooltip title="Cancel Booking">
                                                                        <IconButton size="small" sx={{ color: '#ef4444' }} onClick={() => handleCancelBooking(booking.id)} disabled={actionLoading || isReadonly}>
                                                                            <CancelIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                                {actions.canRefund && (
                                                                    <Tooltip title="Refund Booking">
                                                                        <IconButton size="small" sx={{ color: '#8b5cf6' }} onClick={() => handleRefundBooking(booking.id)} disabled={actionLoading || isReadonly}>
                                                                            <PaymentIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                            </>
                                                        )}
                                                        <Tooltip title="View Details">
                                                            <IconButton
                                                                size="small"
                                                                sx={{ color: '#64748b' }}
                                                                onClick={() => {
                                                                    setSelectedBooking(booking);
                                                                    setDetailsOpen(true);
                                                                }}
                                                            >
                                                                <ViewIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </Box>
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

            {/* Confirmation Dialog */}
            <Dialog
                open={confirmDialog.open}
                onClose={() => setConfirmDialog({ ...confirmDialog, open: false })}
                PaperProps={{
                    sx: {
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.12)'
                    }
                }}
            >
                <DialogTitle sx={{ color: '#0f172a' }}>{confirmDialog.title}</DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: '#475569' }}>{confirmDialog.message}</Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <OutlineButton onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}>
                        Cancel
                    </OutlineButton>
                    <PrimaryButton onClick={executeAction} disabled={actionLoading}>
                        {actionLoading ? <CircularProgress size={24} /> : 'Confirm'}
                    </PrimaryButton>
                </DialogActions>
            </Dialog>

            {/* Details Dialog */}
            <Dialog
                open={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.12)'
                    }
                }}
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 600 }}>
                            Booking Details
                        </Typography>
                        {selectedBooking && (
                            <StatusChip status={selectedBooking.status} type="booking" size="small" showIcon={true} />
                        )}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {selectedBooking && (
                        <Box sx={{ mt: 2 }}>
                            <Grid container spacing={2}>
                                <Grid item xs={12} md={6}>
                                    <Paper sx={{ p: 2, bgcolor: '#f8fafc' }}>
                                        <Typography variant="subtitle2" sx={{ color: '#4f46e5', fontWeight: 600, mb: 1 }}>
                                            Customer Details
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#334155' }}>
                                            <strong>Name:</strong> {selectedBooking.customer_name}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#334155', wordBreak: 'break-word' }}>
                                            <strong>Email:</strong> {selectedBooking.customer_email}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#334155' }}>
                                            <strong>Phone:</strong> {selectedBooking.customer_phone}
                                        </Typography>
                                        {selectedBooking.whatsapp_number && (
                                            <Typography variant="body2" sx={{ color: '#334155' }}>
                                                <strong>WhatsApp:</strong> {selectedBooking.whatsapp_number}
                                            </Typography>
                                        )}
                                    </Paper>
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <Paper sx={{ p: 2, bgcolor: '#f8fafc' }}>
                                        <Typography variant="subtitle2" sx={{ color: '#4f46e5', fontWeight: 600, mb: 1 }}>
                                            Booking Details
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#334155' }}>
                                            <strong>Reference:</strong> {selectedBooking.booking_reference}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#334155' }}>
                                            <strong>Event:</strong> {selectedBooking.event_title || selectedBooking.event?.title || 'N/A'}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#334155' }}>
                                            <strong>Total:</strong> ₹{selectedBooking.total_amount}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#334155' }}>
                                            <strong>Status:</strong> {BookingStatusUtils.getLabel(selectedBooking.status)}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#334155' }}>
                                            <strong>Created:</strong> {new Date(selectedBooking.created_at).toLocaleString()}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            </Grid>
                            {selectedBooking.notes && (
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="subtitle2" sx={{ color: '#4f46e5', fontWeight: 600, mb: 1 }}>
                                        Notes
                                    </Typography>
                                    <Paper sx={{ p: 2, bgcolor: '#f8fafc' }}>
                                        <Typography variant="body2" sx={{ color: '#334155' }}>
                                            {selectedBooking.notes}
                                        </Typography>
                                    </Paper>
                                </Box>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
                    <OutlineButton onClick={() => setDetailsOpen(false)}>Close</OutlineButton>
                    {selectedBooking && (
                        <>
                            <OutlineButton
                                startIcon={<ReceiptIcon />}
                                onClick={() => {
                                    setDetailsOpen(false);
                                    handleViewETicket(selectedBooking);
                                }}
                            >
                                View E-Ticket
                            </OutlineButton>
                            {canManageAllBookings && (
                                <PrimaryButton
                                    startIcon={<QrCodeIcon />}
                                    onClick={() => {
                                        setDetailsOpen(false);
                                        handleViewTickets(selectedBooking.id);
                                    }}
                                >
                                    View All Tickets
                                </PrimaryButton>
                            )}
                        </>
                    )}
                </DialogActions>
            </Dialog>

            {/* E-Ticket Dialog */}
            <Dialog
                open={eticketOpen}
                onClose={() => setEticketOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'transparent',
                        boxShadow: 'none',
                    }
                }}
            >
                <DialogContent sx={{ p: 0 }}>
                    {eticketData.tickets && eticketData.tickets.length > 0 && eticketData.booking && eticketData.event && (
                        <Ticket
                            tickets={eticketData.tickets}
                            booking={eticketData.booking}
                            event={eticketData.event}
                            showActions={true}
                            showNavigation={true}
                            onDownload={(ticket) => {
                                console.log('📥 Downloading ticket:', ticket);
                                toast.success('Ticket downloaded!');
                            }}
                            onPrint={(ticket) => {
                                console.log('🖨️ Printing ticket:', ticket);
                                window.print();
                            }}
                            onEmail={() => {
                                console.log('📧 Email button clicked - using booking:', eticketData.booking);
                                handleSendEmailFromTable(eticketData.booking);
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </PageContainer>
    );
};

export default Bookings;