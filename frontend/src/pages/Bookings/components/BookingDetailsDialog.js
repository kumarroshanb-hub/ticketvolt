// frontend/src/pages/Bookings/components/BookingDetailsDialog.js
import React from 'react';
import {
    Box, Dialog, DialogTitle, DialogContent, DialogActions,
    Typography, Grid, Paper,
} from '@mui/material';
import { QrCode as QrCodeIcon, Receipt as ReceiptIcon } from '@mui/icons-material';
import { StatusChip, PrimaryButton, OutlineButton } from '../../../components/Common';
import { BookingStatusUtils } from '../../../constants';
import {
    getNetAmount,
    getGrossAmount,
    getDiscountAmount,
    formatMoney,
} from '../../../utils/money';
import { theme as appTheme } from '../../../theme/tokens';

const C = appTheme.colors;

export const BookingDetailsDialog = ({
    open,
    booking,
    canManageAllBookings,
    onClose,
    onViewETicket,
    onViewAllTickets,
}) => (
    <Dialog
        open={open}
        onClose={onClose}
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
                {booking && (
                    <StatusChip status={booking.status} type="booking" size="small" showIcon />
                )}
            </Box>
        </DialogTitle>
        <DialogContent>
            {booking && (
                <Box sx={{ mt: 2 }}>
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 2, bgcolor: C.bgPrimary }}>
                                <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 1 }}>
                                    Customer Details
                                </Typography>
                                <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                    <strong>Name:</strong> {booking.customer_name}
                                </Typography>
                                <Typography variant="body2" sx={{ color: C.textPrimary, wordBreak: 'break-word' }}>
                                    <strong>Email:</strong> {booking.customer_email}
                                </Typography>
                                <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                    <strong>Phone:</strong> {booking.customer_phone}
                                </Typography>
                                {booking.whatsapp_number && (
                                    <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                        <strong>WhatsApp:</strong> {booking.whatsapp_number}
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
                                    <strong>Reference:</strong> {booking.booking_reference}
                                </Typography>
                                <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                    <strong>Event:</strong>{' '}
                                    {booking.event_title || booking.event?.title || 'N/A'}
                                </Typography>
                                <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                    <strong>Subtotal:</strong> {formatMoney(getGrossAmount(booking))}
                                </Typography>
                                {getDiscountAmount(booking) > 0 && (
                                    <Typography variant="body2" sx={{ color: C.success, fontWeight: 600 }}>
                                        <strong>Discount:</strong> −{formatMoney(getDiscountAmount(booking))}
                                        {booking.discount_code ? ` (${booking.discount_code})` : ''}
                                    </Typography>
                                )}
                                <Typography variant="body2" sx={{ color: C.textPrimary, fontWeight: 700 }}>
                                    <strong>Net Paid:</strong> {formatMoney(getNetAmount(booking))}
                                </Typography>
                                <Typography variant="body2" sx={{ color: C.textPrimary, mt: 0.5 }}>
                                    <strong>Status:</strong> {BookingStatusUtils.getLabel(booking.status)}
                                </Typography>
                                <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                    <strong>Created:</strong> {new Date(booking.created_at).toLocaleString()}
                                </Typography>
                            </Paper>
                        </Grid>
                    </Grid>
                    {booking.notes && (
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 1 }}>
                                Notes
                            </Typography>
                            <Paper sx={{ p: 2, bgcolor: C.bgPrimary }}>
                                <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                    {booking.notes}
                                </Typography>
                            </Paper>
                        </Box>
                    )}
                </Box>
            )}
        </DialogContent>
        <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
            <OutlineButton onClick={onClose}>Close</OutlineButton>
            {booking && (
                <>
                    <OutlineButton
                        startIcon={<ReceiptIcon />}
                        onClick={() => onViewETicket(booking)}
                    >
                        View E-Ticket
                    </OutlineButton>
                    {canManageAllBookings && (
                        <PrimaryButton
                            startIcon={<QrCodeIcon />}
                            onClick={() => onViewAllTickets(booking.id)}
                        >
                            View All Tickets
                        </PrimaryButton>
                    )}
                </>
            )}
        </DialogActions>
    </Dialog>
);