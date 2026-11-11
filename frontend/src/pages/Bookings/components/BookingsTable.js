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
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
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
                            <TableCell sx={headerSx}>{t('booking.reference')}</TableCell>
                            <TableCell sx={headerSx}>{t('booking.customer')}</TableCell>
                            <TableCell sx={headerSx}>{t('booking.event')}</TableCell>
                            <TableCell align="right" sx={headerSx}>{t('booking.amount')}</TableCell>
                            <TableCell align="center" sx={headerSx}>{t('booking.tickets')}</TableCell>
                            <TableCell align="center" sx={headerSx}>{t('booking.status')}</TableCell>
                            <TableCell align="center" sx={headerSx}>{t('booking.date')}</TableCell>
                            <TableCell align="center" sx={headerSx}>{t('common.actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {bookings.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={canManageAllBookings ? 9 : 8} align="center" sx={{ py: 4 }}>
                                    <Typography sx={{ color: C.textLight }}>
                                        {isRegularUser ? t('booking.noBookingsUserHint') : t('booking.noBookings')}
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
                                                    ✅ {t('booking.allTicketsUsed')}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell sx={{ color: C.textPrimary }}>{booking.customer_name}</TableCell>
                                        <TableCell sx={{ color: C.textPrimary }}>
                                            {booking.event_title || booking.event?.title || t('common.nA')}
                                        </TableCell>
                                        <TableCell align="right">
                                            <AmountDisplay booking={booking} align="right" size="body2" />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Chip
                                                label={t('booking.ticketCount', { count: booking.ticket_count || 0 })}
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
                                                    <Tooltip title={t('booking.actionViewETicket')}>
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
                                                    <Tooltip title={t('booking.actionSendEmail')}>
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
                                                            <Tooltip title={t('booking.actionMarkPayment')}>
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
                                                            <Tooltip title={t('booking.actionConfirmPayment')}>
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
                                                            <Tooltip title={t('booking.actionIssueTickets')}>
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
                                                            <Tooltip title={t('booking.actionRegenerateQr')}>
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
                                                            <Tooltip title={t('booking.actionCancelBooking')}>
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
                                                            <Tooltip title={t('booking.actionRefundBooking')}>
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
                                                <Tooltip title={t('booking.actionViewDetails')}>
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