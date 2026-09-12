// src/components/Common/BookingStatusBadge.js
import React from 'react';
import { Chip } from '@mui/material';
import { BOOKING_STATUS, BOOKING_STATUS_LABELS } from '../../constants';

const BookingStatusBadge = ({ status, size = 'small', showIcon = true, variant = 'filled' }) => {
    const label = BOOKING_STATUS_LABELS[status] || status || 'UNKNOWN';
    
    const getColor = (status) => {
        switch (status) {
            case BOOKING_STATUS.PENDING:
                return 'warning';
            case BOOKING_STATUS.PROCESSING:
                return 'info';
            case BOOKING_STATUS.PAID:
                return 'info';
            case BOOKING_STATUS.CONFIRMED:
                return 'success';
            case BOOKING_STATUS.COMPLETED:
                return 'success';
            case BOOKING_STATUS.CANCELLED:
                return 'error';
            case BOOKING_STATUS.REFUNDED:
                return 'secondary';
            default:
                return 'default';
        }
    };
    
    const color = getColor(status);
    const icon = {
        [BOOKING_STATUS.PENDING]: '⏳',
        [BOOKING_STATUS.PROCESSING]: '🔄',
        [BOOKING_STATUS.PAID]: '💰',
        [BOOKING_STATUS.CONFIRMED]: '✅',
        [BOOKING_STATUS.COMPLETED]: '🎯',
        [BOOKING_STATUS.CANCELLED]: '❌',
        [BOOKING_STATUS.REFUNDED]: '💸',
    }[status] || '';
    
    const displayLabel = showIcon ? `${icon} ${label}` : label;
    
    return (
        <Chip
            label={displayLabel}
            size={size}
            color={color}
            variant={variant}
            sx={{
                fontWeight: 600,
                '& .MuiChip-label': {
                    fontSize: size === 'small' ? '0.7rem' : '0.8rem',
                }
            }}
        />
    );
};

export default BookingStatusBadge;