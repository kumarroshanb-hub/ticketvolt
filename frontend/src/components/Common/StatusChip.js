// frontend/src/components/Common/StatusChip.js
import React from 'react';
import { Chip } from '@mui/material';
import {
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    Pending as PendingIcon,
    Payment as PaymentIcon,
    Receipt as ReceiptIcon,
    Refresh as RefreshIcon,
    Warning as WarningIcon,
    Event as EventIcon,
} from '@mui/icons-material';

import {
    BOOKING_STATUS,
    BookingStatusUtils,
    TICKET_STATUS,
    TicketStatusUtils,
    EVENT_STATUS,
    EventStatusUtils,
} from '../../constants';

import { theme } from '../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

// ============================================
// ICON MAPPINGS
// ============================================

const getBookingIcon = (status) => {
    const icons = {
        [BOOKING_STATUS.PENDING]: <PendingIcon fontSize="small" />,
        [BOOKING_STATUS.PROCESSING]: <RefreshIcon fontSize="small" />,
        [BOOKING_STATUS.PAID]: <PaymentIcon fontSize="small" />,
        [BOOKING_STATUS.CONFIRMED]: <CheckCircleIcon fontSize="small" />,
        [BOOKING_STATUS.COMPLETED]: <ReceiptIcon fontSize="small" />,
        [BOOKING_STATUS.CANCELLED]: <CancelIcon fontSize="small" />,
        [BOOKING_STATUS.REFUNDED]: <RefreshIcon fontSize="small" />,
    };
    return icons[status] || null;
};

const getTicketIcon = (status) => {
    const icons = {
        [TICKET_STATUS.ACTIVE]: <CheckCircleIcon fontSize="small" />,
        [TICKET_STATUS.USED]: <CancelIcon fontSize="small" />,
        [TICKET_STATUS.CANCELLED]: <CancelIcon fontSize="small" />,
        [TICKET_STATUS.REFUNDED]: <RefreshIcon fontSize="small" />,
        [TICKET_STATUS.EXPIRED]: <WarningIcon fontSize="small" />,
    };
    return icons[status] || null;
};

const getEventIcon = (status) => {
    const icons = {
        [EVENT_STATUS.DRAFT]: <PendingIcon fontSize="small" />,
        [EVENT_STATUS.PUBLISHED]: <EventIcon fontSize="small" />,
        [EVENT_STATUS.ACTIVE]: <CheckCircleIcon fontSize="small" />,
        [EVENT_STATUS.CANCELLED]: <CancelIcon fontSize="small" />,
        [EVENT_STATUS.COMPLETED]: <CheckCircleIcon fontSize="small" />,
        [EVENT_STATUS.SOLD_OUT]: <WarningIcon fontSize="small" />,
        [EVENT_STATUS.POSTPONED]: <PendingIcon fontSize="small" />,
    };
    return icons[status] || null;
};

// ============================================
// GET COLOR — returns MUI color name
// ============================================

const getStatusColor = (status, type) => {
    if (!status) return 'default';

    let color;
    switch (type) {
        case 'ticket':
            color = TicketStatusUtils.getColor(status);
            break;
        case 'event':
            color = EventStatusUtils.getColor(status);
            break;
        case 'booking':
        default:
            color = BookingStatusUtils.getColor(status);
            break;
    }

    const validColors = ['default', 'primary', 'secondary', 'error', 'info', 'success', 'warning'];
    return validColors.includes(color) ? color : 'default';
};

// ============================================
// GET LABEL
// ============================================

const getStatusLabel = (status, type) => {
    if (!status) return 'Unknown';

    let label;
    switch (type) {
        case 'ticket':
            label = TicketStatusUtils.getLabel(status);
            break;
        case 'event':
            label = EventStatusUtils.getLabel(status);
            break;
        case 'booking':
        default:
            label = BookingStatusUtils.getLabel(status);
            break;
    }

    return label || status || 'Unknown';
};

// ============================================
// GET ICON
// ============================================

const getStatusIcon = (status, type) => {
    if (!status) return null;

    switch (type) {
        case 'ticket':
            return getTicketIcon(status);
        case 'event':
            return getEventIcon(status);
        case 'booking':
        default:
            return getBookingIcon(status);
    }
};

// ============================================
// COLOR STYLES — derived from tokens
// ------------------------------------------------------------
// Each status uses the matching semantic token with a soft
// alpha background and a solid color for text/icon.
// ============================================

const colorStyles = {
    success: {
        backgroundColor: `${C.success}1A`,
        color: C.successDark,
    },
    error: {
        backgroundColor: `${C.error}1A`,
        color: C.errorDark,
    },
    warning: {
        backgroundColor: `${C.warning}1A`,
        color: C.warningDark,
    },
    info: {
        backgroundColor: `${C.info}1A`,
        color: C.infoDark,
    },
    secondary: {
        backgroundColor: `${C.secondary}1A`,
        color: C.secondaryDark,
    },
    primary: {
        backgroundColor: `${C.primary}1A`,
        color: C.primary,
    },
    default: {
        backgroundColor: C.bgInput,
        color: C.textSecondary,
    },
};

// ============================================
// MAIN COMPONENT
// ============================================

const StatusChip = ({
    status,
    type = 'booking',
    size = 'small',
    showIcon = true,
    variant = 'filled',
    clickable = false,
    onClick = null,
    className = '',
    ...props
}) => {
    const label = getStatusLabel(status, type);
    const color = getStatusColor(status, type);
    const icon = showIcon ? getStatusIcon(status, type) : undefined;

    const isCancelled = status === BOOKING_STATUS.CANCELLED;

    const customStyles = {
        fontWeight: 600,
        borderRadius: '20px',
        minWidth: '80px',
        fontFamily: F.family,
        ...(isCancelled && {
            textDecoration: 'line-through',
        }),
    };

    const selectedColorStyles = colorStyles[color] || colorStyles.default;

    return (
        <Chip
            label={label}
            size={size}
            color={color}
            icon={icon}
            variant={variant}
            clickable={clickable}
            onClick={onClick}
            className={className}
            sx={{
                ...customStyles,
                ...selectedColorStyles,
                '& .MuiChip-icon': {
                    color: selectedColorStyles.color,
                    fontSize: size === 'small' ? '16px' : '20px',
                },
                '& .MuiChip-label': {
                    fontWeight: 600,
                    letterSpacing: '0.3px',
                },
            }}
            {...props}
        />
    );
};

export default StatusChip;