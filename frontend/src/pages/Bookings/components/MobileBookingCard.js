// frontend/src/pages/Bookings/components/MobileBookingCard.js
import React from 'react';
import {
    Box, Card, CardContent, Checkbox, Divider, Typography,
} from '@mui/material';
import { StatusChip } from '../../../components/Common';
import { BOOKING_STATUS } from '../../../constants';
import { theme as appTheme } from '../../../theme/tokens';
import { AmountDisplay } from './AmountDisplay';

const C = appTheme.colors;
const F = appTheme.fonts;

export const MobileBookingCard = ({
    booking,
    onClick,
    renderActions,
    isSelected,
    showCheckbox,
    onToggleSelect,
}) => {
    const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;

    return (
        <Card
            sx={{
                borderRadius: 2,
                border: isSelected ? `2px solid ${C.primary}` : `1px solid ${C.borderLight}`,
                opacity: isCompleted ? 0.75 : 1,
                overflow: 'hidden',
                transition: 'all 0.2s ease',
            }}
        >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
                    {showCheckbox && (
                        <Checkbox
                            checked={isSelected}
                            onChange={(e) => onToggleSelect && onToggleSelect(e, booking.id)}
                            disabled={isCompleted}
                            sx={{ color: C.textLight, p: 0.5, mt: -0.5 }}
                            size="small"
                        />
                    )}
                    <Box
                        onClick={onClick}
                        sx={{ cursor: 'pointer', flex: 1, minWidth: 0, '&:active': { opacity: 0.7 } }}
                    >
                        <Typography
                            variant="subtitle1"
                            sx={{
                                fontFamily: F.familyMono,
                                fontWeight: 700,
                                color: C.textPrimary,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {booking.booking_reference}
                        </Typography>
                        <Typography variant="caption" sx={{ color: C.textSecondary, display: 'block' }}>
                            {booking.formatted_date || new Date(booking.created_at).toLocaleDateString()}
                        </Typography>
                    </Box>
                    <StatusChip status={booking.status} type="booking" size="small" showIcon variant="filled" />
                </Box>

                <Divider sx={{ mb: 1.5 }} />

                <Box onClick={onClick} sx={{ cursor: 'pointer', '&:active': { opacity: 0.7 } }}>
                    <Box sx={{ mb: 1 }}>
                        <Typography
                            variant="caption"
                            sx={{
                                color: C.textLight,
                                textTransform: 'uppercase',
                                fontSize: '10px',
                                fontWeight: 600,
                                letterSpacing: 0.5,
                            }}
                        >
                            Customer
                        </Typography>
                        <Typography variant="body2" sx={{ color: C.textPrimary, fontWeight: 500 }}>
                            {booking.customer_name || 'N/A'}
                        </Typography>
                    </Box>

                    <Box sx={{ mb: 1.5 }}>
                        <Typography
                            variant="caption"
                            sx={{
                                color: C.textLight,
                                textTransform: 'uppercase',
                                fontSize: '10px',
                                fontWeight: 600,
                                letterSpacing: 0.5,
                            }}
                        >
                            Event
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{
                                color: C.textPrimary,
                                fontWeight: 500,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {booking.event_title || booking.event?.title || 'N/A'}
                        </Typography>
                    </Box>

                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-end',
                            pt: 1.5,
                            borderTop: `1px dashed ${C.borderLight}`,
                        }}
                    >
                        <AmountDisplay booking={booking} align="left" size="h6" />
                        <Typography variant="caption" sx={{ color: C.textSecondary, fontWeight: 600 }}>
                            {booking.ticket_count || 0} ticket
                            {(booking.ticket_count || 0) !== 1 ? 's' : ''}
                        </Typography>
                    </Box>

                    {isCompleted && (
                        <Typography
                            variant="caption"
                            sx={{ color: C.success, display: 'block', mt: 1, fontWeight: 600 }}
                        >
                            ✅ All tickets used
                        </Typography>
                    )}
                </Box>

                {renderActions && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${C.bgInput}` }}>
                        {renderActions(booking)}
                    </Box>
                )}
            </CardContent>
        </Card>
    );
};