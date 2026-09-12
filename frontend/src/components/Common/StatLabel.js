// admin-frontend/src/components/Common/StatLabel.js
import React from 'react';
import { Typography } from '@mui/material';

const StatLabel = ({ children }) => (
    <Typography 
        variant="caption" 
        sx={{ 
            color: '#64748b', 
            textTransform: 'uppercase', 
            letterSpacing: 0.5,
            fontWeight: 600,
        }}
    >
        {children}
    </Typography>
);

export default StatLabel;