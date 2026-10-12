// src/components/Common/StatIcon.js
import React from 'react';
import { Box } from '@mui/material';
import { theme } from '../../theme/tokens';

const C = theme.colors;

/**
 * StatIcon - A wrapper component for statistics icons
 *
 * @param {ReactNode} children - The icon to display
 * @param {string} color - The color for the icon (defaults to primary brand charcoal)
 * @param {string|number} size - The size of the icon wrapper
 * @param {object} sx - Additional MUI styles
 */
const StatIcon = ({
    children,
    color = C.primary,
    size = 40,
    sx = {},
    ...props
}) => {
    return (
        <Box
            sx={{
                backgroundColor: `${color}15`,
                borderRadius: '50%',
                width: size,
                height: size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: color,
                flexShrink: 0,
                ...sx,
            }}
            {...props}
        >
            {children}
        </Box>
    );
};

export default StatIcon;