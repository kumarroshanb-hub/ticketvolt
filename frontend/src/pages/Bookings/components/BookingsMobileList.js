// frontend/src/pages/Bookings/components/BookingsMobileList.js
import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { MobileBookingCard } from './MobileBookingCard';
import { BookingActionButtons } from './BookingActionButtons';
import { getAvailableActions } from '../../../features/bookings/bookingActions';
import { theme as appTheme } from '../../../theme/tokens';

const C = appTheme.colors;

export const BookingsMobileList = ({
    bookings,
    canManageAllBookings,
    isRegularUser,
    selectedIds,
    onSelectOne,
    onOpenDetails,
    handlers,
    actionLoading,
}) => {
    if (bookings.length === 0) {
        return (
            <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
                <Typography sx={{ color: C.textLight }}>
                    {isRegularUser ? 'No bookings found. Book your first event!' : 'No bookings found'}
                </Typography>
            </Paper>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {bookings.map((booking) => {
                const actions = getAvailableActions(booking, { isRegularUser });
                return (
                    <MobileBookingCard
                        key={booking.id}
                        booking={booking}
                        isSelected={selectedIds.includes(booking.id)}
                        showCheckbox={canManageAllBookings}
                        onToggleSelect={onSelectOne}
                        onClick={() => onOpenDetails(booking)}
                        renderActions={(b) => (
                            <BookingActionButtons
                                booking={b}
                                actions={actions}
                                canManageAllBookings={canManageAllBookings}
                                variant="mobile"
                                loading={actionLoading}
                                onViewETicket={handlers.onViewETicket}
                                onSendEmail={handlers.onSendEmail}
                                onMarkPaid={(bk) => handlers.onPromptAction('mark_payment_received', bk.id)}
                                onConfirmAndIssue={(bk) =>
                                    handlers.onPromptAction('confirm_payment_and_issue_tickets', bk.id)
                                }
                                onIssue={(bk) => handlers.onPromptAction('issue_tickets', bk.id)}
                                onRegenQR={(bk) => handlers.onPromptAction('regenerate_ticket_qr', bk.id)}
                                onCancel={(bk) => handlers.onPromptAction('cancel_booking', bk.id)}
                                onRefund={(bk) => handlers.onPromptAction('refund_booking', bk.id)}
                                onViewDetails={(bk) => onOpenDetails(bk)}
                            />
                        )}
                    />
                );
            })}
        </Box>
    );
};