// frontend/src/pages/Bookings/components/AmountDisplay.js
import React from 'react';
import { Box, Typography } from '@mui/material';
import { theme as appTheme } from '../../../theme/tokens';
import {
    getNetAmount,
    getGrossAmount,
    getDiscountAmount,
    formatMoney,
} from '../../../utils/money';

const C = appTheme.colors;

export const AmountDisplay = ({ booking, align = 'right', size = 'body2' }) => {
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