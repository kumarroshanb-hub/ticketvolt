// frontend/src/pages/Bookings/components/BookingActionButtons.js
import React from 'react';
import { Box, Button } from '@mui/material';
import {
    Payment as PaymentIcon,
    QrCode as QrCodeIcon,
    Cancel as CancelIcon,
    Refresh as RefreshIcon,
    Receipt as ReceiptIcon,
    Email as EmailIcon,
    Visibility as ViewIcon,
} from '@mui/icons-material';
import { theme as appTheme } from '../../../theme/tokens';

const C = appTheme.colors;

/**
 * Reusable responsive action buttons for a booking.
 * Used by both MobileBookingCard (variant="mobile") and the desktop table row.
 */
export const BookingActionButtons = ({
    booking,
    actions,
    canManageAllBookings,
    onViewETicket,
    onSendEmail,
    onMarkPaid,
    onConfirmAndIssue,
    onIssue,
    onRegenQR,
    onCancel,
    onRefund,
    onViewDetails,
    loading,
    variant = 'mobile',
}) => {
    const stop = (handler) => (e) => {
        e.stopPropagation();
        handler(booking);
    };

    const isMobile = variant === 'mobile';
    const flexBasis = isMobile ? '1 1 45%' : undefined;

    const buttonSx = (color, lightColor) => ({
        flex: flexBasis,
        borderColor: lightColor,
        color,
        textTransform: 'none',
        minWidth: 0,
    });

    return (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            {actions.canViewETicket && (
                <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ReceiptIcon />}
                    onClick={stop(onViewETicket)}
                    disabled={loading}
                    sx={buttonSx(C.success, C.successLight)}
                >
                    E-Ticket
                </Button>
            )}
            {actions.canSendEmail && (
                <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EmailIcon />}
                    onClick={stop(onSendEmail)}
                    disabled={loading}
                    sx={buttonSx(C.info, C.infoLight)}
                >
                    Email
                </Button>
            )}
            {canManageAllBookings && !actions.isReadonly && (
                <>
                    {actions.canMarkPayment && (
                        <Button
                            size="small" variant="outlined" startIcon={<PaymentIcon />}
                            onClick={stop(onMarkPaid)} disabled={loading}
                            sx={buttonSx(C.warning, C.warningLight)}
                        >
                            Mark Paid
                        </Button>
                    )}
                    {actions.canConfirmPayment && (
                        <Button
                            size="small" variant="outlined" startIcon={<QrCodeIcon />}
                            onClick={stop(onConfirmAndIssue)} disabled={loading}
                            sx={buttonSx(C.success, C.successLight)}
                        >
                            Confirm & Issue
                        </Button>
                    )}
                    {actions.canIssueTickets && (
                        <Button
                            size="small" variant="outlined" startIcon={<QrCodeIcon />}
                            onClick={stop(onIssue)} disabled={loading}
                            sx={buttonSx(C.primary, C.primaryLight)}
                        >
                            Issue
                        </Button>
                    )}
                    {actions.canRegenerateQR && (
                        <Button
                            size="small" variant="outlined" startIcon={<RefreshIcon />}
                            onClick={stop(onRegenQR)} disabled={loading}
                            sx={buttonSx(C.secondary, C.secondaryLight)}
                        >
                            Regen QR
                        </Button>
                    )}
                    {actions.canCancel && (
                        <Button
                            size="small" variant="outlined" startIcon={<CancelIcon />}
                            onClick={stop(onCancel)} disabled={loading}
                            sx={buttonSx(C.error, C.errorLight)}
                        >
                            Cancel
                        </Button>
                    )}
                    {actions.canRefund && (
                        <Button
                            size="small" variant="outlined" startIcon={<PaymentIcon />}
                            onClick={stop(onRefund)} disabled={loading}
                            sx={buttonSx(C.secondary, C.secondaryLight)}
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
                onClick={stop(onViewDetails)}
                sx={{
                    flex: isMobile ? '1 1 100%' : undefined,
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
    );
};