// frontend/src/pages/Unauthorized/Unauthorized.js
import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { Lock as LockIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { theme as appTheme } from '../../theme/tokens';

const C = appTheme.colors;
const F = appTheme.fonts;

const Unauthorized = () => {
    const navigate = useNavigate();

    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                bgcolor: 'background.default',
                fontFamily: F.family,
            }}
        >
            <Paper
                sx={{
                    p: 6,
                    maxWidth: 500,
                    textAlign: 'center',
                    borderRadius: 3,
                    bgcolor: 'background.paper',
                    border: `1px solid ${C.borderLight}`,
                }}
            >
                <LockIcon sx={{ fontSize: 64, color: C.error, mb: 2 }} />
                <Typography
                    variant="h5"
                    sx={{ fontWeight: 700, color: C.textPrimary, mb: 1, fontFamily: F.family }}
                >
                    Access Denied
                </Typography>
                <Typography variant="body2" sx={{ color: C.textSecondary, mb: 4 }}>
                    You don't have permission to access this page. Please contact your administrator if you believe this is a mistake.
                </Typography>
                <Button
                    variant="contained"
                    onClick={() => navigate('/app/dashboard')}
                    sx={{
                        background: C.primaryGradient,
                        color: C.textInverse,
                        textTransform: 'none',
                        fontWeight: 600,
                        minHeight: 44,
                        '&:hover': {
                            background: `linear-gradient(135deg, ${C.primaryDark} 0%, ${C.primaryLight} 100%)`,
                        },
                    }}
                >
                    Go to Dashboard
                </Button>
            </Paper>
        </Box>
    );
};

export default Unauthorized;