// admin-frontend/src/components/Common/StatsCard.js
import React from 'react';
import { Card, CardContent, Box, Typography } from '@mui/material';

/**
 * StatsCard - A card component for displaying statistics/metrics
 * 
 * @param {string} title - The title of the stat
 * @param {string|number} value - The value to display
 * @param {ReactNode} icon - The icon to display
 * @param {string} color - The color for the icon background
 * @param {string} subtitle - Optional subtitle
 * @param {ReactNode} children - Optional children (overrides default layout)
 */
const StatsCard = ({ title, value, icon, color = '#4f46e5', subtitle, children }) => {
    // If children are provided, use them instead of the default layout
    if (children) {
        return (
            <Card sx={{ 
                height: '100%', 
                borderRadius: 2, 
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
            }}>
                <CardContent>{children}</CardContent>
            </Card>
        );
    }

    // Default stats card layout
    return (
        <Card sx={{ 
            height: '100%', 
            borderRadius: 2, 
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
            <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, letterSpacing: 0.5 }}>
                            {title}
                        </Typography>
                        <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a', mt: 1 }}>
                            {value}
                        </Typography>
                        {subtitle && (
                            <Typography variant="caption" sx={{ color: '#64748b' }}>
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