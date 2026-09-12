// frontend/src/pages/Unauthorized.js
import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { Lock as LockIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const Unauthorized = () => {
    const navigate = useNavigate();

    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                bgcolor: '#f8fafc',
            }}
        >
            <Paper
                sx={{
                    p: 6,
                    maxWidth: 500,
                    textAlign: 'center',
                    borderRadius: 3,
                }}
            >
                <LockIcon sx={{ fontSize: 64, color: '#ef4444', mb: 2 }} />
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', mb: 1 }}>
                    Access Denied
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748b', mb: 4 }}>
                    You don't have permission to access this page. Please contact your administrator if you believe this is a mistake.
                </Typography>
                <Button
                    variant="contained"
                    onClick={() => navigate('/dashboard')}
                    sx={{
                        bgcolor: '#4f46e5',
                        '&:hover': { bgcolor: '#4338ca' },
                    }}
                >
                    Go to Dashboard
                </Button>
            </Paper>
        </Box>
    );
};

export default Unauthorized;