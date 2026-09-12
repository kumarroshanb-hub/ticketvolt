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

// ✅ Import from constants
import {
    BOOKING_STATUS,
    BookingStatusUtils,
    TICKET_STATUS,
    TicketStatusUtils,
    EVENT_STATUS,
    EventStatusUtils,
} from '../../constants';

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
// GET COLOR - Returns MUI color name
// ============================================

const getStatusColor = (status, type) => {
    if (!status) {
        return 'default';
    }

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
    
    // ✅ Valid MUI colors
    const validColors = ['default', 'primary', 'secondary', 'error', 'info', 'success', 'warning'];
    return validColors.includes(color) ? color : 'default';
};

// ============================================
// GET LABEL
// ============================================

const getStatusLabel = (status, type) => {
    if (!status) {
        return 'Unknown';
    }

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
    if (!status) {
        return null;
    }

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
// MAIN COMPONENT - Using inline styles instead of styled-components
// ============================================

const StatusChip = ({ 
    status, 
    type = 'booking', // 'booking', 'ticket', 'event'
    size = 'small', 
    showIcon = true,
    variant = 'filled',
    clickable = false,
    onClick = null,
    className = '',
    ...props 
}) => {
    // Get label, color, and icon
    const label = getStatusLabel(status, type);
    const color = getStatusColor(status, type);
    const icon = showIcon ? getStatusIcon(status, type) : undefined;
    
    // Check if cancelled for line-through
    const isCancelled = status === BOOKING_STATUS.CANCELLED;

    // Custom styles based on color
    const customStyles = {
        fontWeight: 600,
        borderRadius: '20px',
        minWidth: '80px',
        ...(isCancelled && {
            textDecoration: 'line-through',
        }),
    };

    // Add color-specific styles
    const colorStyles = {
        success: {
            backgroundColor: '#dcfce7',
            color: '#16a34a',
        },
        error: {
            backgroundColor: '#fee2e2',
            color: '#dc2626',
        },
        warning: {
            backgroundColor: '#fef3c7',
            color: '#d97706',
        },
        info: {
            backgroundColor: '#dbeafe',
            color: '#2563eb',
        },
        secondary: {
            backgroundColor: '#f3e8ff',
            color: '#7c3aed',
        },
        default: {
            backgroundColor: '#f1f5f9',
            color: '#64748b',
        },
    };
    console.log(`🔵 StatusChip: status="${status}", type="${type}", color="${color}", label="${label}"`);
    const selectedColorStyles = colorStyles[color] || colorStyles.default;

    return (
        <Chip
            label={label}
            size={size}
            color={color}  // Pass MUI color
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