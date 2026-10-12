// admin-frontend/src/components/Common/StatLabel.js
import React from 'react';
import { Typography } from '@mui/material';

const StatLabel = ({ children }) => (
    <Typography 
        variant="caption" 
        sx={{ 
            color: 'text.secondary', 
            textTransform: 'uppercase', 
            letterSpacing: 0.5,
            fontWeight: 600,
        }}
    >
        {children}
    </Typography>
);

export default StatLabel;