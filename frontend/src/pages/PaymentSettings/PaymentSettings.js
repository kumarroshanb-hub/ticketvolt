// frontend/src/pages/PaymentSettings/PaymentSettings.js
import React, { useEffect, useState } from 'react';
import {
    Alert, Box, CircularProgress, FormControlLabel, Grid,
    MenuItem, Paper, Switch, TextField,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import api from '../../services/api';
import { useOrg } from '../../context/OrgContext';
import {
    LoadingWrapper, PageContainer, PageHeader, PageHeaderLeft,
    PageSubtitle, PageTitle, PrimaryButton, PageHeaderRight, OrgFilterSelect,
} from '../../components/Common';
import usePlatformFilter from '../../hooks/usePlatformFilter';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const PaymentSettings = () => {
    const { t } = useTranslation();
    const { currentOrgId } = useOrg();
    const { isPlatformAdmin, orgFilter, setOrgFilter, organizations } = usePlatformFilter();
    const targetOrgId = isPlatformAdmin ? (orgFilter || currentOrgId) : currentOrgId;
    const [form, setForm] = useState({
        gateway: 'razorpay', mode: 'test', key_id: '', key_secret: '',
        webhook_secret: '', is_active: false,
    });
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!targetOrgId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        api.get('/organizations/payment-config/', { params: { organization_id: targetOrgId } })
            .then((res) => {
                setConfig(res.data);
                setForm((prev) => ({
                    ...prev,
                    gateway: res.data.gateway || 'razorpay',
                    mode: res.data.mode || 'test',
                    key_id: res.data.key_id || '',
                    is_active: !!res.data.is_active,
                }));
            })
            .catch((err) => toast.error(err.response?.data?.error || err.message))
            .finally(() => setLoading(false));
    }, [targetOrgId]);

    const save = async () => {
        setSaving(true);
        try {
            const res = await api.put('/organizations/payment-config/', {
                organization_id: targetOrgId,
                ...form,
            });
            setConfig(res.data);
            setForm((prev) => ({ ...prev, key_secret: '', webhook_secret: '' }));
            toast.success(t('paymentSettings.saved', 'Payment settings saved.'));
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.detail || err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <LoadingWrapper><CircularProgress /></LoadingWrapper>;

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <Box>
                        <PageTitle variant="h4">{t('paymentSettings.title', 'Payment settings')}</PageTitle>
                        <PageSubtitle>
                            {t('paymentSettings.subtitle', 'Use your own gateway account for ticket and membership payments.')}
                        </PageSubtitle>
                    </Box>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OrgFilterSelect
                        isPlatformAdmin={isPlatformAdmin}
                        organizations={organizations}
                        orgFilter={orgFilter}
                        setOrgFilter={setOrgFilter}
                    />
                </PageHeaderRight>
            </PageHeader>

            <Alert severity="warning" sx={{ mb: 2 }}>
                {t('paymentSettings.securityNote', 'Secrets are encrypted at rest. Use test mode until your account is verified.')}
            </Alert>

            <Paper sx={{ p: 3, border: `1px solid ${C.borderLight}`, borderRadius: 2, maxWidth: 760 }}>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                        <TextField select fullWidth label={t('paymentSettings.gateway', 'Gateway')} value={form.gateway} onChange={(e) => setForm({ ...form, gateway: e.target.value })}>
                            <MenuItem value="razorpay">Razorpay</MenuItem>
                            <MenuItem value="stripe">Stripe</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <TextField select fullWidth label={t('paymentSettings.mode', 'Mode')} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                            <MenuItem value="test">Test</MenuItem>
                            <MenuItem value="live">Live</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12}>
                        <TextField fullWidth label={form.gateway === 'stripe' ? t('paymentSettings.publishableKey', 'Publishable key') : t('paymentSettings.keyId', 'Key ID')} value={form.key_id} onChange={(e) => setForm({ ...form, key_id: e.target.value })} />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField fullWidth type="password" label={t('paymentSettings.keySecret', 'Key secret')} placeholder={config?.has_key_secret ? '••••••••' : ''} value={form.key_secret} onChange={(e) => setForm({ ...form, key_secret: e.target.value })} helperText={t('paymentSettings.secretHelper', 'Leave blank to keep the stored secret.')} />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField fullWidth type="password" label={t('paymentSettings.webhookSecret', 'Webhook secret')} placeholder={config?.has_webhook_secret ? '••••••••' : ''} value={form.webhook_secret} onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })} helperText={config?.webhook_url || ''} />
                    </Grid>
                    <Grid item xs={12}>
                        <FormControlLabel
                            control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
                            label={t('paymentSettings.active', 'Use these credentials for this organisation')}
                        />
                    </Grid>
                </Grid>
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                    <PrimaryButton onClick={save} disabled={saving}>
                        {saving ? t('common.loading') : t('common.save')}
                    </PrimaryButton>
                </Box>
            </Paper>
        </PageContainer>
    );
};

export default PaymentSettings;
