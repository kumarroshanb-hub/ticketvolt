import React, { useEffect, useState } from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, Typography,
} from '@mui/material';
import { Download } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import {
    LoadingWrapper, PageContainer, PageHeader, PageTitle, PageSubtitle,
} from '../../components/Common';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const Security = () => {
    const { t } = useTranslation();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState(null);

    const load = async () => {
        try {
            const res = await api.get('/security/status/');
            setStatus(res.data);
        } catch (err) {
            setError(err.response?.data?.detail || err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const verify = async () => {
        setChecking(true);
        try {
            const res = await api.get('/audit-logs/verify/');
            setStatus((prev) => ({ ...prev, audit: { ...prev.audit, chain: res.data } }));
        } finally {
            setChecking(false);
        }
    };

    const exportAudit = async () => {
        const res = await api.get('/audit-logs/export/', { responseType: 'blob' });
        const url = URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'audit-log.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) return <LoadingWrapper><CircularProgress /></LoadingWrapper>;
    if (error) return <PageContainer><Alert severity="error">{error}</Alert></PageContainer>;

    return (
        <PageContainer>
            <PageHeader><div>
                <PageTitle variant="h4">{t('security.title', 'Security & compliance')}</PageTitle>
                <PageSubtitle>{t('security.subtitle', 'Evidence and controls for PCI DSS and platform security.')}</PageSubtitle>
            </div></PageHeader>

            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2, border: `1px solid ${C.borderLight}`, borderRadius: 2 }}>
                        <Typography variant="caption" sx={{ color: C.textSecondary }}>AUDIT CHAIN</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                            {status.audit.chain.valid ? t('security.valid', 'Valid') : t('security.tampered', 'Tampered')}
                        </Typography>
                        <Typography variant="caption">{status.audit.entries} {t('security.entries', 'entries')}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2, border: `1px solid ${C.borderLight}`, borderRadius: 2 }}>
                        <Typography variant="caption" sx={{ color: C.textSecondary }}>PAYMENT SECRET BACKEND</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>{status.secrets.payment_credential_backend}</Typography>
                        {!status.secrets.kms_configured && (
                            <Typography variant="caption" sx={{ color: C.warning }}>{t('security.configureKms', 'Configure KMS for production.')}</Typography>
                        )}
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2, border: `1px solid ${C.borderLight}`, borderRadius: 2 }}>
                        <Typography variant="caption" sx={{ color: C.textSecondary }}>MFA</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>{status.mfa.status}</Typography>
                        <Typography variant="caption">{t('security.mfaPending', 'Administrator MFA enforcement is pending.')}</Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Paper sx={{ p: 3, border: `1px solid ${C.borderLight}`, borderRadius: 2, mb: 3 }}>
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                    <Button variant="outlined" onClick={verify} disabled={checking}>{t('security.verifyChain', 'Verify audit chain')}</Button>
                    <Button variant="outlined" startIcon={<Download />} onClick={exportAudit}>{t('security.exportAudit', 'Export audit log')}</Button>
                </Stack>
                {status.audit.chain.failed_id && (
                    <Alert severity="error">{t('security.chainFailedAt', 'Chain failed at entry')} {status.audit.chain.failed_id}</Alert>
                )}
            </Paper>

            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>{t('security.checklist', 'Compliance checklist')}</Typography>
            <Paper sx={{ p: 2, border: `1px solid ${C.borderLight}`, borderRadius: 2 }}>
                {status.checklist.map((item) => (
                    <Box key={item.key} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: `1px solid ${C.borderLight}` }}>
                        <Typography variant="body2">{item.label}</Typography>
                        <Chip size="small" label={item.ok ? t('security.done', 'Ready') : t('security.pending', 'Pending')} color={item.ok ? 'success' : 'warning'} />
                    </Box>
                ))}
            </Paper>
        </PageContainer>
    );
};

export default Security;
