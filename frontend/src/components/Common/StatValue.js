// admin-frontend/src/components/Common/StatValue.js
import React from 'react';
import { Typography } from '@mui/material';

const StatValue = ({ children, variant = 'h4', sx = {}, ...props }) => (
    <Typography 
        variant={variant} 
        sx={{ 
            fontWeight: 700, 
            color: '#0f172a', 
            ...sx 
        }}
        {...props}
    >
        {children}
    </Typography>
);

export default StatValue;