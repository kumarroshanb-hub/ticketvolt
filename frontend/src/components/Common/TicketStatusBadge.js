// src/components/Common/TicketStatusBadge.js
import React from 'react';
import { Chip } from '@mui/material';
import { TICKET_STATUS, TICKET_STATUS_LABELS, TicketStatusUtils } from '../../constants';

const TicketStatusBadge = ({ status, size = 'small', showIcon = true, variant = 'filled' }) => {
    const label = TICKET_STATUS_LABELS[status] || status || 'UNKNOWN';
    
    const getColor = (status) => {
        switch (status) {
            case TICKET_STATUS.ACTIVE:
                return 'success';
            case TICKET_STATUS.USED:
                return 'error';
            case TICKET_STATUS.CANCELLED:
                return 'default';
            case TICKET_STATUS.REFUNDED:
                return 'secondary';
            case TICKET_STATUS.EXPIRED:
                return 'warning';
            default:
                return 'default';
        }
    };
    
    const color = getColor(status);
    const icon = {
        [TICKET_STATUS.ACTIVE]: '🎫',
        [TICKET_STATUS.USED]: '✅',
        [TICKET_STATUS.CANCELLED]: '❌',
        [TICKET_STATUS.REFUNDED]: '💳',
        [TICKET_STATUS.EXPIRED]: '⏰',
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

export default TicketStatusBadge;