// frontend/src/pages/Bookings/components/BookingsTable.js
import React from 'react';
import {
    Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Typography, IconButton, Checkbox, Chip, Tooltip,
} from '@mui/material';
import {
    Refresh as RefreshIcon,
    Visibility as ViewIcon,
    QrCode as QrCodeIcon,
    ArrowForward as ArrowForwardIcon,
    Payment as PaymentIcon,
    Cancel as CancelIcon,
    Receipt as ReceiptIcon,
    Email as EmailIcon,
} from '@mui/icons-material';
import { StatusChip, StyledTableContainer } from '../../../components/Common';
import { BookingStatusUtils, BOOKING_STATUS } from '../../../constants';
import { AmountDisplay } from './AmountDisplay';
import { getAvailableActions } from '../../../features/bookings/bookingActions';
import { theme as appTheme } from '../../../theme/tokens';

const C = appTheme.colors;

export const BookingsTable = ({
    bookings,
    canManageAllBookings,
    isRegularUser,
    selectedIds,
    onSelectAll,
    onSelectOne,
    onOpenDetails,
    onViewTickets,
    onViewETicket,
    onSendEmail,
    onPromptAction,
    actionLoading,
}) => {
    const headerSx = { color: C.textSecondary, fontWeight: 600, borderBottom: `1px solid ${C.borderLight}` };

    return (
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
                                        onChange={onSelectAll}
                                        sx={{ color: C.textLight }}
                                    />
                                </TableCell>
                            )}
                            <TableCell sx={headerSx}>Reference</TableCell>
                            <TableCell sx={headerSx}>Customer</TableCell>
                            <TableCell sx={headerSx}>Event</TableCell>
                            <TableCell align="right" sx={headerSx}>Amount</TableCell>
                            <TableCell align="center" sx={headerSx}>Tickets</TableCell>
                            <TableCell align="center" sx={headerSx}>Status</TableCell>
                            <TableCell align="center" sx={headerSx}>Date</TableCell>
                            <TableCell align="center" sx={headerSx}>Actions</TableCell>
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
                                const actions = getAvailableActions(booking, { isRegularUser });
                                const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;
                                const isTerminal = BookingStatusUtils.isTerminal(booking.status);

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
                                                    onChange={(e) => onSelectOne(e, booking.id)}
                                                    sx={{ color: C.textLight }}
                                                    disabled={actions.isReadonly}
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
                                        <TableCell sx={{ color: C.textPrimary }}>
                                            {booking.event_title || booking.event?.title || 'N/A'}
                                        </TableCell>
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
                                                clickable={!actions.isReadonly}
                                                onClick={() => !actions.isReadonly && onViewTickets(booking.id)}
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
                                                        <IconButton
                                                            size="small"
                                                            sx={{ color: C.success }}
                                                            onClick={() => onViewETicket(booking)}
                                                            disabled={actionLoading}
                                                        >
                                                            <ReceiptIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {actions.canSendEmail && (
                                                    <Tooltip title="Send E-Ticket Email">
                                                        <IconButton
                                                            size="small"
                                                            sx={{ color: C.info }}
                                                            onClick={() => onSendEmail(booking)}
                                                            disabled={actionLoading}
                                                        >
                                                            <EmailIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {canManageAllBookings && (
                                                    <>
                                                        {actions.canMarkPayment && (
                                                            <Tooltip title="Mark Payment Received (No Tickets)">
                                                                <IconButton
                                                                    size="small"
                                                                    sx={{ color: C.warning }}
                                                                    onClick={() => onPromptAction('mark_payment_received', booking.id)}
                                                                    disabled={actionLoading || actions.isReadonly}
                                                                >
                                                                    <PaymentIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        {actions.canConfirmPayment && (
                                                            <Tooltip title="Confirm Payment & Issue Tickets">
                                                                <IconButton
                                                                    size="small"
                                                                    sx={{ color: C.success }}
                                                                    onClick={() => onPromptAction('confirm_payment_and_issue_tickets', booking.id)}
                                                                    disabled={actionLoading || actions.isReadonly}
                                                                >
                                                                    <QrCodeIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        {actions.canIssueTickets && (
                                                            <Tooltip title="Issue Tickets">
                                                                <IconButton
                                                                    size="small"
                                                                    sx={{ color: C.primary }}
                                                                    onClick={() => onPromptAction('issue_tickets', booking.id)}
                                                                    disabled={actionLoading || actions.isReadonly}
                                                                >
                                                                    <QrCodeIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        {actions.canRegenerateQR && (
                                                            <Tooltip title="Regenerate QR Codes">
                                                                <IconButton
                                                                    size="small"
                                                                    sx={{ color: C.secondary }}
                                                                    onClick={() => onPromptAction('regenerate_ticket_qr', booking.id)}
                                                                    disabled={actionLoading || actions.isReadonly}
                                                                >
                                                                    <RefreshIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        {actions.canCancel && (
                                                            <Tooltip title="Cancel Booking">
                                                                <IconButton
                                                                    size="small"
                                                                    sx={{ color: C.error }}
                                                                    onClick={() => onPromptAction('cancel_booking', booking.id)}
                                                                    disabled={actionLoading || actions.isReadonly}
                                                                >
                                                                    <CancelIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        {actions.canRefund && (
                                                            <Tooltip title="Refund Booking">
                                                                <IconButton
                                                                    size="small"
                                                                    sx={{ color: C.secondary }}
                                                                    onClick={() => onPromptAction('refund_booking', booking.id)}
                                                                    disabled={actionLoading || actions.isReadonly}
                                                                >
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
                                                        onClick={() => onOpenDetails(booking)}
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
    );
};