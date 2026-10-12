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

import {
    PageContainer, PageHeader, PageTitle, PageHeaderLeft, PageHeaderRight,
    PrimaryButton, OutlineButton, StatusChip, StyledTableContainer,
    BulkActionsBar, LoadingWrapper,
} from '../../components/Common';

import { BOOKING_STATUS, BookingStatusUtils, ROLES } from '../../constants';

import Ticket from '../../components/Ticket/E-Ticket';

import { theme as appTheme } from '../../theme/tokens';

const C = appTheme.colors;
const F = appTheme.fonts;

// ============================================
// MONEY HELPERS
// ============================================
const getNetAmount = (booking) => {
    if (!booking) return 0;
    if (booking.net_amount !== undefined && booking.net_amount !== null) {
        return Number(booking.net_amount);
    }
    return Number(booking.total_amount || 0) - Number(booking.discount_applied || 0);
};

const getGrossAmount = (booking) => Number(booking?.total_amount || 0);
const getDiscountAmount = (booking) => Number(booking?.discount_applied || 0);
const formatMoney = (value) => `₹${Number(value || 0).toFixed(2)}`;

// ============================================
// STAT CARD
// ============================================
const StatCard = ({ title, value, icon, color }) => {
    const theme = useTheme();
    const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

    return (
        <Card sx={{ height: '100%', borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
            <CardContent sx={{ p: isSmall ? 1.5 : 2, '&:last-child': { pb: isSmall ? 1.5 : 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                            variant="caption"
                            sx={{
                                color: C.textSecondary,
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
                                color: C.textPrimary,
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
// AMOUNT DISPLAY
// ============================================
const AmountDisplay = ({ booking, align = 'right', size = 'body2' }) => {
    const net = getNetAmount(booking);
    const gross = getGrossAmount(booking);
    const discount = getDiscountAmount(booking);
    const hasDiscount = discount > 0;

    return (
        <Box sx={{ textAlign: align === 'right' ? 'right' : 'left' }}>
            <Typography variant={size} sx={{ fontWeight: 700, color: C.textPrimary, lineHeight: 1.2 }}>
                {formatMoney(net)}
            </Typography>

            {hasDiscount && (
                <>
                    <Typography
                        variant="caption"
                        sx={{
                            color: C.textLight,
                            textDecoration: 'line-through',
                            display: 'block',
                            mt: 0.25,
                        }}
                    >
                        {formatMoney(gross)}
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{ color: C.success, fontWeight: 600, display: 'block', fontSize: '10px' }}
                    >
                        −{formatMoney(discount)}
                        {booking.discount_code ? ` (${booking.discount_code})` : ''}
                    </Typography>
                </>
            )}
        </Box>
    );
};

// ============================================
// MOBILE BOOKING CARD
// ============================================
const MobileBookingCard = ({ booking, onClick, renderActions, isSelected, showCheckbox, onToggleSelect }) => {
    const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;

    return (
        <Card
            sx={{
                borderRadius: 2,
                border: isSelected ? `2px solid ${C.primary}` : `1px solid ${C.borderLight}`,
                opacity: isCompleted ? 0.75 : 1,
                overflow: 'hidden',
                transition: 'all 0.2s ease',
            }}
        >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
                    {showCheckbox && (
                        <Checkbox
                            checked={isSelected}
                            onChange={(e) => onToggleSelect && onToggleSelect(e, booking.id)}
                            disabled={isCompleted}
                            sx={{ color: C.textLight, p: 0.5, mt: -0.5 }}
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
                                fontFamily: F.familyMono,
                                fontWeight: 700,
                                color: C.textPrimary,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {booking.booking_reference}
                        </Typography>
                        <Typography variant="caption" sx={{ color: C.textSecondary, display: 'block' }}>
                            {booking.formatted_date || new Date(booking.created_at).toLocaleDateString()}
                        </Typography>
                    </Box>
                    <StatusChip status={booking.status} type="booking" size="small" showIcon variant="filled" />
                </Box>

                <Divider sx={{ mb: 1.5 }} />

                <Box onClick={onClick} sx={{ cursor: 'pointer', '&:active': { opacity: 0.7 } }}>
                    <Box sx={{ mb: 1 }}>
                        <Typography
                            variant="caption"
                            sx={{
                                color: C.textLight,
                                textTransform: 'uppercase',
                                fontSize: '10px',
                                fontWeight: 600,
                                letterSpacing: 0.5,
                            }}
                        >
                            Customer
                        </Typography>
                        <Typography variant="body2" sx={{ color: C.textPrimary, fontWeight: 500 }}>
                            {booking.customer_name || 'N/A'}
                        </Typography>
                    </Box>

                    <Box sx={{ mb: 1.5 }}>
                        <Typography
                            variant="caption"
                            sx={{
                                color: C.textLight,
                                textTransform: 'uppercase',
                                fontSize: '10px',
                                fontWeight: 600,
                                letterSpacing: 0.5,
                            }}
                        >
                            Event
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{
                                color: C.textPrimary,
                                fontWeight: 500,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {booking.event_title || booking.event?.title || 'N/A'}
                        </Typography>
                    </Box>

                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-end',
                            pt: 1.5,
                            borderTop: `1px dashed ${C.borderLight}`,
                        }}
                    >
                        <AmountDisplay booking={booking} align="left" size="h6" />
                        <Typography variant="caption" sx={{ color: C.textSecondary, fontWeight: 600 }}>
                            {booking.ticket_count || 0} ticket{(booking.ticket_count || 0) !== 1 ? 's' : ''}
                        </Typography>
                    </Box>

                    {isCompleted && (
                        <Typography variant="caption" sx={{ color: C.success, display: 'block', mt: 1, fontWeight: 600 }}>
                            ✅ All tickets used
                        </Typography>
                    )}
                </Box>

                {renderActions && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${C.bgInput}` }}>
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
        open: false, title: '', message: '', action: null, bookingId: null, bookingIds: [],
    });
    const [eticketOpen, setEticketOpen] = useState(false);
    const [eticketData, setEticketData] = useState({ tickets: [], booking: null, event: null });
    const [stats, setStats] = useState({
        total: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0, refunded: 0,
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                tickets,
                booking,
                event: eventRes.data,
            });
            setEticketOpen(true);
        } catch (error) {
            console.error('❌ Error loading ticket data:', error);
            toast.error(error.response?.data?.error || 'Failed to load e-ticket');
        }
    };

    const handleSendEmailFromTable = async (booking) => {
        try {
            console.log('📧 Resending tickets for booking:', booking.booking_reference);

            const response = await api.post(`/bookings/${booking.id}/resend_tickets/`);

            console.log('📧 Email response:', response.data);

            const formatInfo = response.data?.formats ? ` (${response.data.formats})` : '';
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

    const handleMarkPaymentReceived = async (bookingId) => {
        setConfirmDialog({
            open: true,
            title: '💰 Mark Payment Received',
            message: 'This will mark the payment as received but NOT generate QR codes yet. Continue?',
            action: 'mark_payment_received',
            bookingId,
            bookingIds: [],
        });
    };

    const handleConfirmPaymentAndIssue = async (bookingId) => {
        setConfirmDialog({
            open: true,
            title: '💰 Confirm Payment & Issue Tickets',
            message: 'This will mark the payment as received and generate QR codes for all tickets. Continue?',
            action: 'confirm_payment_and_issue_tickets',
            bookingId,
            bookingIds: [],
        });
    };

    const handleIssueTickets = async (bookingId) => {
        setConfirmDialog({
            open: true,
            title: '🎫 Issue Tickets',
            message: 'This will generate QR codes for all tickets in this booking. Continue?',
            action: 'issue_tickets',
            bookingId,
            bookingIds: [],
        });
    };

    const handleRegenerateQR = async (bookingId) => {
        setConfirmDialog({
            open: true,
            title: '🔄 Regenerate QR Codes',
            message: 'This will regenerate QR codes for all tickets. Existing QR codes will be replaced. Continue?',
            action: 'regenerate_ticket_qr',
            bookingId,
            bookingIds: [],
        });
    };

    const handleCancelBooking = async (bookingId) => {
        setConfirmDialog({
            open: true,
            title: '❌ Cancel Booking',
            message: 'Are you sure you want to cancel this booking? This action cannot be undone.',
            action: 'cancel_booking',
            bookingId,
            bookingIds: [],
        });
    };

    const handleRefundBooking = async (bookingId) => {
        setConfirmDialog({
            open: true,
            title: '💸 Refund Booking',
            message: 'Are you sure you want to refund this booking? This action cannot be undone.',
            action: 'refund_booking',
            bookingId,
            bookingIds: [],
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
                        notes: 'Payment marked as received by admin',
                    };
                    break;
                case 'confirm_payment_and_issue_tickets':
                    endpoint = `/bookings/${bookingId}/confirm_payment_and_issue_tickets/`;
                    data = {
                        payment_method: 'offline',
                        payment_reference: 'MANUAL-' + Date.now(),
                        notes: 'Payment confirmed and tickets issued by admin',
                    };
                    break;
                case 'issue_tickets':
                    endpoint = `/bookings/${bookingId}/issue_tickets/`;
                    data = { notes: 'Tickets issued by admin' };
                    break;
                case 'regenerate_ticket_qr':
                    endpoint = `/bookings/${bookingId}/regenerate_ticket_qr/`;
                    data = { notes: 'QR codes regenerated by admin' };
                    break;
                case 'cancel_booking':
                    endpoint = `/bookings/${bookingId}/cancel_booking/`;
                    data = { notes: 'Booking cancelled by admin' };
                    break;
                case 'refund_booking':
                    endpoint = `/bookings/${bookingId}/refund_booking/`;
                    data = { notes: 'Booking refunded by admin' };
                    break;
                case 'bulk':
                    endpoint = `/bookings/bulk_action/`;
                    const formattedIds = Array.isArray(bookingIds)
                        ? bookingIds.map(id => String(id))
                        : [String(bookingIds)];
                    data = { action: bulkAction, booking_ids: formattedIds };
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
                    const message = response.data.message || response.data.status || 'Action completed successfully';
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

    const handleBulkAction = async () => {
        if (!bulkAction || selectedIds.length === 0) {
            toast.warning('Please select bookings and an action');
            return;
        }

        const actionLabels = {
            mark_payment_received: 'Mark Payment Received',
            confirm_payment_and_issue_tickets: 'Confirm Payment & Issue Tickets',
            issue_tickets: 'Issue Tickets',
            regenerate_ticket_qr: 'Regenerate QR Codes',
            cancel_booking: 'Cancel Bookings',
        };

        setConfirmDialog({
            open: true,
            title: actionLabels[bulkAction] || 'Bulk Action',
            message: `This will apply "${actionLabels[bulkAction]}" to ${selectedIds.length} booking(s). Continue?`,
            action: 'bulk',
            bookingId: null,
            bookingIds: selectedIds,
        });
    };

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

    const getAvailableActions = (booking) => {
        const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;
        const isCancelled = booking.status === BOOKING_STATUS.CANCELLED;
        const isRefunded = booking.status === BOOKING_STATUS.REFUNDED;
        const isReadonly = isCompleted || isCancelled || isRefunded;

        if (isRegularUser) {
            return {
                canView: true,
                canViewETicket:
                    booking.status === BOOKING_STATUS.CONFIRMED ||
                    booking.status === BOOKING_STATUS.PAID ||
                    booking.status === BOOKING_STATUS.COMPLETED,
                canSendEmail:
                    booking.status === BOOKING_STATUS.CONFIRMED ||
                    booking.status === BOOKING_STATUS.PAID ||
                    booking.status === BOOKING_STATUS.COMPLETED,
                canManage: false,
                isReadonly,
            };
        }

        return {
            canView: true,
            canViewETicket:
                booking.status === BOOKING_STATUS.CONFIRMED ||
                booking.status === BOOKING_STATUS.PAID ||
                booking.status === BOOKING_STATUS.COMPLETED,
            canSendEmail:
                booking.status === BOOKING_STATUS.CONFIRMED ||
                booking.status === BOOKING_STATUS.PAID ||
                booking.status === BOOKING_STATUS.COMPLETED,
            canMarkPayment: booking.status === BOOKING_STATUS.PENDING,
            canConfirmPayment: booking.status === BOOKING_STATUS.PENDING,
            canIssueTickets: booking.status === BOOKING_STATUS.PAID,
            canRegenerateQR:
                booking.status === BOOKING_STATUS.PAID ||
                booking.status === BOOKING_STATUS.CONFIRMED,
            canCancel: !isReadonly && booking.status !== BOOKING_STATUS.CANCELLED,
            canRefund:
                booking.status === BOOKING_STATUS.PAID ||
                booking.status === BOOKING_STATUS.CONFIRMED,
            canManage: true,
            isReadonly,
        };
    };

    const handleBookTickets = () => {
        navigate('/bookings/create');
    };

    if (loading) {
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
                    <PageTitle variant="h4">
                        {isRegularUser ? 'My Bookings' : 'Bookings'}
                    </PageTitle>
                    <Typography
                        variant="body2"
                        sx={{
                            color: C.textSecondary,
                            ml: isMobile ? 0 : 2,
                            display: 'block',
                            width: isMobile ? '100%' : 'auto',
                        }}
                    >
                        {isRegularUser ? 'View and manage your bookings' : 'Manage all customer bookings'}
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

            <Grid container spacing={isMobile ? 1.5 : 2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={6} md={2}>
                    <StatCard
                        title="Total"
                        value={stats.total}
                        icon={<EventIcon sx={{ color: C.primary, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.primary}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={2}>
                    <StatCard
                        title="Pending"
                        value={stats.pending}
                        icon={<PaymentIcon sx={{ color: C.warning, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.warning}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={2}>
                    <StatCard
                        title="Confirmed"
                        value={stats.confirmed}
                        icon={<QrCodeIcon sx={{ color: C.success, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.success}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={2}>
                    <StatCard
                        title="Completed"
                        value={stats.completed}
                        icon={<ReceiptIcon sx={{ color: C.successDark, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.successDark}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={2}>
                    <StatCard
                        title="Cancelled"
                        value={stats.cancelled}
                        icon={<CancelIcon sx={{ color: C.error, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.error}
                    />
                </Grid>
                <Grid item xs={6} sm={6} md={2}>
                    <StatCard
                        title="Refunded"
                        value={stats.refunded}
                        icon={<MoneyIcon sx={{ color: C.secondary, fontSize: isMobile ? 20 : 24 }} />}
                        color={C.secondary}
                    />
                </Grid>
            </Grid>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                    <Button size="small" onClick={loadBookings} sx={{ ml: 2 }}>
                        Retry
                    </Button>
                </Alert>
            )}

            {isRegularUser && bookings.length === 0 && !error && (
                <Alert severity="info" sx={{ mb: 3 }}>
                    You don't have any bookings yet. Click "Book Tickets" to browse events and book your first ticket!
                </Alert>
            )}

            {canManageAllBookings && selectedIds.length > 0 && (
                <BulkActionsBar>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', width: '100%' }}>
                        <Typography variant="body2" fontWeight="bold" sx={{ color: C.textPrimary }}>
                            {selectedIds.length} booking(s) selected
                        </Typography>
                        <FormControl size="small" sx={{ minWidth: 200, flex: isMobile ? 1 : 'unset' }}>
                            <InputLabel sx={{ color: C.textSecondary }}>Bulk Action</InputLabel>
                            <Select
                                value={bulkAction}
                                onChange={(e) => setBulkAction(e.target.value)}
                                label="Bulk Action"
                                sx={{
                                    color: C.textPrimary,
                                    '& .MuiOutlinedInput-notchedOutline': { borderColor: C.borderLight },
                                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: C.primary },
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
                                borderColor: C.errorLight,
                                color: C.errorDark,
                                '&:hover': {
                                    borderColor: C.errorDark,
                                    backgroundColor: 'rgba(220, 38, 38, 0.04)',
                                },
                            }}
                        >
                            Clear
                        </OutlineButton>
                    </Box>
                </BulkActionsBar>
            )}

            {isMobile ? (
                bookings.length === 0 ? (
                    <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
                        <Typography sx={{ color: C.textLight }}>
                            {isRegularUser ? 'No bookings found. Book your first event!' : 'No bookings found'}
                        </Typography>
                    </Paper>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {bookings.map((booking) => {
                            const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;
                            const isCancelled = booking.status === BOOKING_STATUS.CANCELLED;
                            const isRefunded = booking.status === BOOKING_STATUS.REFUNDED;
                            const isReadonly = isCompleted || isCancelled || isRefunded;
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
                                                        borderColor: C.successLight,
                                                        color: C.success,
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
                                                        borderColor: C.infoLight,
                                                        color: C.info,
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
                                                            sx={{ flex: '1 1 45%', borderColor: C.warningLight, color: C.warning, textTransform: 'none' }}
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
                                                            sx={{ flex: '1 1 45%', borderColor: C.successLight, color: C.success, textTransform: 'none' }}
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
                                                            sx={{ flex: '1 1 45%', borderColor: C.primaryLight, color: C.primary, textTransform: 'none' }}
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
                                                            sx={{ flex: '1 1 45%', borderColor: C.secondaryLight, color: C.secondary, textTransform: 'none' }}
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
                                                            sx={{ flex: '1 1 45%', borderColor: C.errorLight, color: C.error, textTransform: 'none' }}
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
                                                            sx={{ flex: '1 1 45%', borderColor: C.secondaryLight, color: C.secondary, textTransform: 'none' }}
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
                                                    background: C.primaryGradient,
                                                    color: C.textInverse,
                                                    textTransform: 'none',
                                                    '&:hover': {
                                                        background: `linear-gradient(135deg, ${C.primaryDark} 0%, ${C.primaryLight} 100%)`,
                                                    },
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
                <StyledTableContainer>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    {canManageAllBookings && (
                                        <TableCell padding="checkbox" sx={{ borderBottom: `1px solid ${C.borderLight}` }}>
                                            <Checkbox
                                                indeterminate={selectedIds.length > 0 && selectedIds.length < bookings.length}
                                                checked={bookings.length > 0 && selectedIds.length === bookings.length}
                                                onChange={handleSelectAll}
                                                sx={{ color: C.textLight }}
                                            />
                                        </TableCell>
                                    )}
                                    <TableCell sx={{ color: C.textSecondary, fontWeight: 600, borderBottom: `1px solid ${C.borderLight}` }}>Reference</TableCell>
                                    <TableCell sx={{ color: C.textSecondary, fontWeight: 600, borderBottom: `1px solid ${C.borderLight}` }}>Customer</TableCell>
                                    <TableCell sx={{ color: C.textSecondary, fontWeight: 600, borderBottom: `1px solid ${C.borderLight}` }}>Event</TableCell>
                                    <TableCell align="right" sx={{ color: C.textSecondary, fontWeight: 600, borderBottom: `1px solid ${C.borderLight}` }}>Amount</TableCell>
                                    <TableCell align="center" sx={{ color: C.textSecondary, fontWeight: 600, borderBottom: `1px solid ${C.borderLight}` }}>Tickets</TableCell>
                                    <TableCell align="center" sx={{ color: C.textSecondary, fontWeight: 600, borderBottom: `1px solid ${C.borderLight}` }}>Status</TableCell>
                                    <TableCell align="center" sx={{ color: C.textSecondary, fontWeight: 600, borderBottom: `1px solid ${C.borderLight}` }}>Date</TableCell>
                                    <TableCell align="center" sx={{ color: C.textSecondary, fontWeight: 600, borderBottom: `1px solid ${C.borderLight}` }}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {bookings.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={canManageAllBookings ? 9 : 8} align="center" sx={{ py: 4 }}>
                                            <Typography sx={{ color: C.textLight }}>
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
                                                    '&:hover': { backgroundColor: C.bgPrimary },
                                                    '&.Mui-selected': { backgroundColor: C.bgInput },
                                                    opacity: isTerminal ? 0.7 : 1,
                                                }}
                                            >
                                                {canManageAllBookings && (
                                                    <TableCell padding="checkbox">
                                                        <Checkbox
                                                            checked={selectedIds.includes(booking.id)}
                                                            onChange={(e) => handleSelectOne(e, booking.id)}
                                                            sx={{ color: C.textLight }}
                                                            disabled={isReadonly}
                                                        />
                                                    </TableCell>
                                                )}
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="bold" sx={{ color: C.textPrimary }}>
                                                        {booking.booking_reference}
                                                    </Typography>
                                                    {isCompleted && (
                                                        <Typography variant="caption" sx={{ color: C.success, display: 'block' }}>
                                                            ✅ All tickets used
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell sx={{ color: C.textPrimary }}>{booking.customer_name}</TableCell>
                                                <TableCell sx={{ color: C.textPrimary }}>{booking.event_title || booking.event?.title || 'N/A'}</TableCell>
                                                <TableCell align="right">
                                                    <AmountDisplay booking={booking} align="right" size="body2" />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Chip
                                                        label={`${booking.ticket_count || 0} tickets`}
                                                        size="small"
                                                        color={isCompleted ? 'success' : 'primary'}
                                                        variant={isCompleted ? 'filled' : 'outlined'}
                                                        icon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
                                                        clickable={!isReadonly}
                                                        onClick={() => !isReadonly && handleViewTickets(booking.id)}
                                                        sx={{
                                                            borderColor: isCompleted ? C.success : C.primaryLight,
                                                            color: isCompleted ? C.textInverse : C.primary,
                                                            backgroundColor: isCompleted ? C.success : 'transparent',
                                                            '&:hover': {
                                                                borderColor: C.primary,
                                                                backgroundColor: isCompleted ? C.successDark : C.bgInput,
                                                            },
                                                        }}
                                                    />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <StatusChip status={booking.status} type="booking" size="small" showIcon variant="filled" />
                                                </TableCell>
                                                <TableCell align="center" sx={{ color: C.textSecondary }}>
                                                    {booking.formatted_date || new Date(booking.created_at).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
                                                        {actions.canViewETicket && (
                                                            <Tooltip title="View E-Ticket">
                                                                <IconButton size="small" sx={{ color: C.success }} onClick={() => handleViewETicket(booking)} disabled={actionLoading}>
                                                                    <ReceiptIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        {actions.canSendEmail && (
                                                            <Tooltip title="Send E-Ticket Email">
                                                                <IconButton size="small" sx={{ color: C.info }} onClick={() => handleSendEmailFromTable(booking)} disabled={actionLoading}>
                                                                    <EmailIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        {canManageAllBookings && (
                                                            <>
                                                                {actions.canMarkPayment && (
                                                                    <Tooltip title="Mark Payment Received (No Tickets)">
                                                                        <IconButton size="small" sx={{ color: C.warning }} onClick={() => handleMarkPaymentReceived(booking.id)} disabled={actionLoading || isReadonly}>
                                                                            <PaymentIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                                {actions.canConfirmPayment && (
                                                                    <Tooltip title="Confirm Payment & Issue Tickets">
                                                                        <IconButton size="small" sx={{ color: C.success }} onClick={() => handleConfirmPaymentAndIssue(booking.id)} disabled={actionLoading || isReadonly}>
                                                                            <QrCodeIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                                {actions.canIssueTickets && (
                                                                    <Tooltip title="Issue Tickets">
                                                                        <IconButton size="small" sx={{ color: C.primary }} onClick={() => handleIssueTickets(booking.id)} disabled={actionLoading || isReadonly}>
                                                                            <QrCodeIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                                {actions.canRegenerateQR && (
                                                                    <Tooltip title="Regenerate QR Codes">
                                                                        <IconButton size="small" sx={{ color: C.secondary }} onClick={() => handleRegenerateQR(booking.id)} disabled={actionLoading || isReadonly}>
                                                                            <RefreshIcon2 fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                                {actions.canCancel && (
                                                                    <Tooltip title="Cancel Booking">
                                                                        <IconButton size="small" sx={{ color: C.error }} onClick={() => handleCancelBooking(booking.id)} disabled={actionLoading || isReadonly}>
                                                                            <CancelIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                                {actions.canRefund && (
                                                                    <Tooltip title="Refund Booking">
                                                                        <IconButton size="small" sx={{ color: C.secondary }} onClick={() => handleRefundBooking(booking.id)} disabled={actionLoading || isReadonly}>
                                                                            <PaymentIcon fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                )}
                                                            </>
                                                        )}
                                                        <Tooltip title="View Details">
                                                            <IconButton
                                                                size="small"
                                                                sx={{ color: C.textSecondary }}
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

            <Dialog
                open={confirmDialog.open}
                onClose={() => setConfirmDialog({ ...confirmDialog, open: false })}
                PaperProps={{
                    sx: {
                        background: C.bgCard,
                        border: `1px solid ${C.borderLight}`,
                        borderRadius: '16px',
                        boxShadow: appTheme.shadows.modal,
                    },
                }}
            >
                <DialogTitle sx={{ color: C.textPrimary }}>{confirmDialog.title}</DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: C.textSecondary }}>{confirmDialog.message}</Typography>
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

            <Dialog
                open={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        background: C.bgCard,
                        border: `1px solid ${C.borderLight}`,
                        borderRadius: '16px',
                        boxShadow: appTheme.shadows.modal,
                    },
                }}
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6" sx={{ color: C.textPrimary, fontWeight: 600 }}>
                            Booking Details
                        </Typography>
                        {selectedBooking && (
                            <StatusChip status={selectedBooking.status} type="booking" size="small" showIcon />
                        )}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {selectedBooking && (
                        <Box sx={{ mt: 2 }}>
                            <Grid container spacing={2}>
                                <Grid item xs={12} md={6}>
                                    <Paper sx={{ p: 2, bgcolor: C.bgPrimary }}>
                                        <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 1 }}>
                                            Customer Details
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                            <strong>Name:</strong> {selectedBooking.customer_name}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: C.textPrimary, wordBreak: 'break-word' }}>
                                            <strong>Email:</strong> {selectedBooking.customer_email}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                            <strong>Phone:</strong> {selectedBooking.customer_phone}
                                        </Typography>
                                        {selectedBooking.whatsapp_number && (
                                            <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                                <strong>WhatsApp:</strong> {selectedBooking.whatsapp_number}
                                            </Typography>
                                        )}
                                    </Paper>
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <Paper sx={{ p: 2, bgcolor: C.bgPrimary }}>
                                        <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 1 }}>
                                            Booking Details
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                            <strong>Reference:</strong> {selectedBooking.booking_reference}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                            <strong>Event:</strong> {selectedBooking.event_title || selectedBooking.event?.title || 'N/A'}
                                        </Typography>

                                        <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                            <strong>Subtotal:</strong> {formatMoney(getGrossAmount(selectedBooking))}
                                        </Typography>

                                        {getDiscountAmount(selectedBooking) > 0 && (
                                            <Typography variant="body2" sx={{ color: C.success, fontWeight: 600 }}>
                                                <strong>Discount:</strong> −{formatMoney(getDiscountAmount(selectedBooking))}
                                                {selectedBooking.discount_code ? ` (${selectedBooking.discount_code})` : ''}
                                            </Typography>
                                        )}

                                        <Typography variant="body2" sx={{ color: C.textPrimary, fontWeight: 700 }}>
                                            <strong>Net Paid:</strong> {formatMoney(getNetAmount(selectedBooking))}
                                        </Typography>

                                        <Typography variant="body2" sx={{ color: C.textPrimary, mt: 0.5 }}>
                                            <strong>Status:</strong> {BookingStatusUtils.getLabel(selectedBooking.status)}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                            <strong>Created:</strong> {new Date(selectedBooking.created_at).toLocaleString()}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            </Grid>
                            {selectedBooking.notes && (
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 1 }}>
                                        Notes
                                    </Typography>
                                    <Paper sx={{ p: 2, bgcolor: C.bgPrimary }}>
                                        <Typography variant="body2" sx={{ color: C.textPrimary }}>
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

            <Dialog
                open={eticketOpen}
                onClose={() => setEticketOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: { background: 'transparent', boxShadow: 'none' },
                }}
            >
                <DialogContent sx={{ p: 0 }}>
                    {eticketData.tickets && eticketData.tickets.length > 0 && eticketData.booking && eticketData.event && (
                        <Ticket
                            tickets={eticketData.tickets}
                            booking={eticketData.booking}
                            event={eticketData.event}
                            showActions
                            showNavigation
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