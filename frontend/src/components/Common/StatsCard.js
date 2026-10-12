// src/components/Common/StatsCard.js
import React from 'react';
import { Card, CardContent, Box, Typography } from '@mui/material';
import { theme } from '../../theme/tokens';

const C = theme.colors;

/**
 * StatsCard - A card component for displaying statistics/metrics
 *
 * @param {string} title - The title of the stat
 * @param {string|number} value - The value to display
 * @param {ReactNode} icon - The icon to display
 * @param {string} color - The color for the icon background (defaults to primary brand charcoal)
 * @param {string} subtitle - Optional subtitle
 * @param {ReactNode} children - Optional children (overrides default layout)
 */
const StatsCard = ({ title, value, icon, color = C.primary, subtitle, children }) => {
    // If children are provided, use them instead of the default layout
    if (children) {
        return (
            <Card
                sx={{
                    height: '100%',
                    borderRadius: 2,
                    border: `1px solid ${C.borderLight}`,
                    boxShadow: theme.shadows.card,
                }}
            >
                <CardContent>{children}</CardContent>
            </Card>
        );
    }

    // Default stats card layout
    return (
        <Card
            sx={{
                height: '100%',
                borderRadius: 2,
                border: `1px solid ${C.borderLight}`,
                boxShadow: theme.shadows.card,
            }}
        >
            <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                        <Typography
                            variant="caption"
                            sx={{ color: C.textSecondary, fontWeight: 600, letterSpacing: 0.5 }}
                        >
                            {title}
                        </Typography>
                        <Typography
                            variant="h4"
                            sx={{ fontWeight: 700, color: C.textPrimary, mt: 1 }}
                        >
                            {value}
                        </Typography>
                        {subtitle && (
                            <Typography variant="caption" sx={{ color: C.textSecondary }}>
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                    <Box
                        sx={{
                            backgroundColor: `${color}15`,
                            borderRadius: '50%',
                            p: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {icon}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
};

export default StatsCard;