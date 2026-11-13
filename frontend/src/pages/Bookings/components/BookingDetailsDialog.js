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
} from '../../../utils/money';
import { useSettings } from '../../../context/SettingsContext';
import { useTranslation } from 'react-i18next';
import { theme as appTheme } from '../../../theme/tokens';

const C = appTheme.colors;

export const BookingDetailsDialog = ({
    open,
    booking,
    canManageAllBookings,
    onClose,
    onViewETicket,
    onViewAllTickets,
    onDownloadTaxReceipt,
    onMarkPatronContacted,
}) => {
    const { formatMoney } = useSettings();
    const { t } = useTranslation();

    return (
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
                        {t('booking.bookingDetails')}
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
                                        {t('booking.customerDetails')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                        <strong>{t('bookings.labelName')}:</strong> {booking.customer_name}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: C.textPrimary, wordBreak: 'break-word' }}>
                                        <strong>{t('bookings.labelEmail')}:</strong> {booking.customer_email}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                        <strong>{t('bookings.labelPhone')}:</strong> {booking.customer_phone}
                                    </Typography>
                                    {booking.whatsapp_number && (
                                        <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                            <strong>{t('bookings.labelWhatsApp')}:</strong> {booking.whatsapp_number}
                                        </Typography>
                                    )}
                                </Paper>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: 2, bgcolor: C.bgPrimary }}>
                                    <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 1 }}>
                                        {t('booking.bookingDetails')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                        <strong>{t('booking.reference')}:</strong> {booking.booking_reference}
                                    </Typography>
                                    {booking.invoice_number && (
                                        <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                            <strong>{t('booking.invoiceNumber', 'Invoice')}:</strong> {booking.invoice_number}
                                        </Typography>
                                    )}
                                    <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                        <strong>{t('booking.event')}:</strong>{' '}
                                        {booking.event_title || booking.event?.title || t('common.nA')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                        <strong>{t('booking.subtotal')}:</strong> {formatMoney(getGrossAmount(booking))}
                                    </Typography>
                                    {Number(booking.donation_amount) > 0 && (
                                        <Typography variant="body2" sx={{ color: C.secondary, fontWeight: 600 }}>
                                            <strong>{t('booking.donationLine')}:</strong>{' '}
                                            {formatMoney(Number(booking.donation_amount))}
                                            {booking.donation_tax_eligible ? ` · ${t('booking.donationTaxReceiptNote')}` : ''}
                                        </Typography>
                                    )}
                                    {getDiscountAmount(booking) > 0 && (
                                        <Typography variant="body2" sx={{ color: C.success, fontWeight: 600 }}>
                                            <strong>{t('booking.discount')}:</strong> −{formatMoney(getDiscountAmount(booking))}
                                            {booking.discount_code ? ` (${booking.discount_code})` : ''}
                                        </Typography>
                                    )}
                                    <Typography variant="body2" sx={{ color: C.textPrimary, fontWeight: 700 }}>
                                        <strong>{t('booking.netPaid')}:</strong> {formatMoney(getNetAmount(booking))}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: C.textPrimary, mt: 0.5 }}>
                                        <strong>{t('booking.status')}:</strong> {BookingStatusUtils.getLabel(booking.status)}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                        <strong>{t('booking.created')}:</strong> {new Date(booking.created_at).toLocaleString()}
                                    </Typography>
                                </Paper>
                            </Grid>
                        </Grid>
                        {booking.notes && (
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="subtitle2" sx={{ color: C.primary, fontWeight: 600, mb: 1 }}>
                                    {t('booking.notes')}
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
                <OutlineButton onClick={onClose}>{t('common.close')}</OutlineButton>
                {booking && (
                    <>
                        <OutlineButton
                            startIcon={<ReceiptIcon />}
                            onClick={() => onViewETicket(booking)}
                        >
                            {t('booking.actionViewETicket')}
                        </OutlineButton>
                        {booking.donation_tax_eligible && onDownloadTaxReceipt && (
                            <OutlineButton
                                startIcon={<ReceiptIcon />}
                                onClick={() => onDownloadTaxReceipt(booking)}
                            >
                                {t('booking.donationTaxReceipt')}
                            </OutlineButton>
                        )}
                        {canManageAllBookings && onMarkPatronContacted && (
                            <OutlineButton onClick={() => onMarkPatronContacted(booking)}>
                                {t('booking.markPatronContacted', 'Mark patron contacted')}
                            </OutlineButton>
                        )}
                        {canManageAllBookings && (
                            <PrimaryButton
                                startIcon={<QrCodeIcon />}
                                onClick={() => onViewAllTickets(booking.id)}
                            >
                                {t('booking.actionViewAllTickets')}
                            </PrimaryButton>
                        )}
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
};