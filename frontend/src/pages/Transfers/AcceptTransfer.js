import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, CircularProgress } from '@mui/material';
import api from '../../services/api';
import { PageContainer, PageTitle, PageSubtitle } from '../../components/Common';

const AcceptTransfer = () => {
    const { token } = useParams();
    const [status, setStatus] = useState('loading');
    const [message, setMessage] = useState('');

    useEffect(() => {
        api.post(`/ticket-transfers/${token}/accept/`)
            .then(() => { setStatus('ok'); setMessage('Ticket transferred to your account.'); })
            .catch((err) => {
                setStatus('error');
                setMessage(err.response?.data?.error || err.message);
            });
    }, [token]);

    return (
        <PageContainer>
            <PageTitle variant="h4">Ticket transfer</PageTitle>
            <PageSubtitle>Accept a ticket sent to your email.</PageSubtitle>
            <Box sx={{ mt: 3 }}>
                {status === 'loading' && <CircularProgress />}
                {status === 'ok' && <Alert severity="success">{message}</Alert>}
                {status === 'error' && <Alert severity="error">{message}</Alert>}
            </Box>
        </PageContainer>
    );
};

export default AcceptTransfer;
