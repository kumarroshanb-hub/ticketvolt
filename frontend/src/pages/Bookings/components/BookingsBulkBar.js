// frontend/src/pages/Bookings/components/BookingsBulkBar.js
import React from 'react';
import {
    Box, Typography, MenuItem, Select, FormControl, InputLabel,
    CircularProgress, useMediaQuery, useTheme,
} from '@mui/material';
import { BulkActionsBar, PrimaryButton, OutlineButton } from '../../../components/Common';
import { useTranslation } from 'react-i18next';
import { theme as appTheme } from '../../../theme/tokens';

const C = appTheme.colors;

const BULK_OPTIONS = [
    { value: 'mark_payment_received',              labelKey: 'booking.actionMarkPayment' },
    { value: 'confirm_payment_and_issue_tickets',  labelKey: 'booking.actionConfirmPayment' },
    { value: 'issue_tickets',                      labelKey: 'booking.actionIssueTickets' },
    { value: 'regenerate_ticket_qr',               labelKey: 'booking.actionRegenerateQr' },
    { value: 'cancel_booking',                     labelKey: 'booking.actionCancelBookings' },
];

export const BookingsBulkBar = ({
    selectedCount,
    bulkAction,
    onBulkActionChange,
    onApply,
    onClear,
    loading,
}) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    return (
        <BulkActionsBar>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', width: '100%' }}>
                <Typography variant="body2" fontWeight="bold" sx={{ color: C.textPrimary }}>
                    {t('booking.selectedCount', { count: selectedCount })}
                </Typography>
                <FormControl size="small" sx={{ minWidth: 200, flex: isMobile ? 1 : 'unset' }}>
                    <InputLabel sx={{ color: C.textSecondary }}>{t('bookings.bulkActionLabel')}</InputLabel>
                    <Select
                        value={bulkAction}
                        onChange={(e) => onBulkActionChange(e.target.value)}
                        label={t('bookings.bulkActionLabel')}
                        sx={{
                            color: C.textPrimary,
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: C.borderLight },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: C.primary },
                        }}
                    >
                        {BULK_OPTIONS.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value}>
                                {t(opt.labelKey)}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <PrimaryButton
                    variant="contained"
                    onClick={onApply}
                    disabled={!bulkAction || loading}
                    sx={isMobile ? { flex: 1 } : undefined}
                >
                    {loading ? <CircularProgress size={24} /> : t('common.apply')}
                </PrimaryButton>
                <OutlineButton
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={onClear}
                    sx={{
                        borderColor: C.errorLight,
                        color: C.errorDark,
                        '&:hover': {
                            borderColor: C.errorDark,
                            backgroundColor: 'rgba(220, 38, 38, 0.04)',
                        },
                    }}
                >
                    {t('common.clear')}
                </OutlineButton>
            </Box>
        </BulkActionsBar>
    );
};