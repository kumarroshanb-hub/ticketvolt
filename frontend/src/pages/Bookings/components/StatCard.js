// frontend/src/pages/Bookings/components/StatCard.js
import React from 'react';
import { Box, Card, CardContent, Typography, useMediaQuery, useTheme } from '@mui/material';
import { theme as appTheme } from '../../../theme/tokens';

const C = appTheme.colors;

export const StatCard = ({ title, value, icon, color }) => {
    const theme = useTheme();
    const isSmall = useMediaQuery(theme.breakpoints.down('sm'));

    return (
        <Card sx={{ height: '100%', borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
            <CardContent sx={{ p: isSmall ? 1.5 : 2, '&:last-child': { pb: isSmall ? 1.5 : 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                            variant="caption"
                            sx={{
                                color: C.textSecondary,
                                fontWeight: 600,
                                letterSpacing: 0.5,
                                fontSize: isSmall ? '10px' : '12px',
                            }}
                        >
                            {title}
                        </Typography>
                        <Typography
                            variant="h4"
                            sx={{
                                fontWeight: 700,
                                color: C.textPrimary,
                                mt: 1,
                                fontSize: isSmall ? '1.25rem' : '2rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {value}
                        </Typography>
                    </Box>
                    <Box
                        sx={{
                            backgroundColor: `${color}15`,
                            borderRadius: '50%',
                            p: isSmall ? 0.75 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        {icon}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
};