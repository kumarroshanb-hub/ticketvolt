import React, { useCallback, useEffect, useState } from 'react';
import {
    Box, Button, CircularProgress, Grid, Paper, Table,
    TableBody, TableCell, TableHead, TableRow, TextField,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import api from '../../services/api';
import { useOrg } from '../../context/OrgContext';
import { useSettings } from '../../context/SettingsContext';
import usePlatformFilter from '../../hooks/usePlatformFilter';
import { OrgFilterSelect } from '../../components/Common';
import {
    LoadingWrapper, PageContainer, PageHeader, PageHeaderLeft,
    PageHeaderRight, PageSubtitle, PageTitle, PrimaryButton,
} from '../../components/Common';
import { theme } from '../../theme/tokens';

const C = theme.colors;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
};

const Payouts = () => {
    const { t } = useTranslation();
    const { formatMoney } = useSettings();
    const { currentOrgId } = useOrg();
    const { params, isPlatformAdmin, orgFilter, setOrgFilter, organizations } = usePlatformFilter();
    const targetOrgId = orgFilter || currentOrgId;
    const [rows, setRows] = useState([]);
    const [start, setStart] = useState(monthStart);
    const [end, setEnd] = useState(today);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/payouts/', { params });
            setRows(res.data?.results || res.data || []);
        } catch (err) {
            toast.error(err.response?.data?.detail || err.message);
        } finally {
            setLoading(false);
        }
    }, [params]);

    useEffect(() => { load(); }, [load]);

    const generate = async () => {
        setCreating(true);
        try {
            await api.post('/payouts/', {
                organization_id: targetOrgId,
                period_start: start,
                period_end: end,
            });
            toast.success(t('payouts.created', 'Payout calculated.'));
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setCreating(false);
        }
    };

    const markPaid = async (row) => {
        try {
            await api.post(`/payouts/${row.id}/mark-paid/`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    if (loading && rows.length === 0) return <LoadingWrapper><CircularProgress /></LoadingWrapper>;

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <Box>
                        <PageTitle variant="h4">{t('payouts.title', 'Payouts & settlements')}</PageTitle>
                        <PageSubtitle>{t('payouts.subtitle', 'Platform fees, refunds and organizer settlements.')}</PageSubtitle>
                    </Box>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OrgFilterSelect
                        isPlatformAdmin={isPlatformAdmin} organizations={organizations}
                        orgFilter={orgFilter} setOrgFilter={setOrgFilter}
                        onPageReset={() => {}}
                    />
                </PageHeaderRight>
            </PageHeader>

            <Paper sx={{ p: 2, mb: 2, border: `1px solid ${C.borderLight}`, borderRadius: 2 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={3}><TextField fullWidth size="small" type="date" label={t('payouts.from', 'From')} value={start} onChange={(e) => setStart(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                    <Grid item xs={12} sm={3}><TextField fullWidth size="small" type="date" label={t('payouts.to', 'To')} value={end} onChange={(e) => setEnd(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                    <Grid item xs={12} sm={4}>
                        <PrimaryButton onClick={generate} disabled={creating || !targetOrgId}>
                            {creating ? t('common.loading') : t('payouts.generate', 'Calculate payout')}
                        </PrimaryButton>
                    </Grid>
                </Grid>
            </Paper>

            <Paper sx={{ border: `1px solid ${C.borderLight}`, borderRadius: 2 }}>
                <Table size="small">
                    <TableHead><TableRow>
                        <TableCell>{t('payouts.period', 'Period')}</TableCell>
                        <TableCell>{t('payouts.gross', 'Gross')}</TableCell>
                        <TableCell>{t('payouts.refunds', 'Refunds')}</TableCell>
                        <TableCell>{t('payouts.fee', 'Platform fee')}</TableCell>
                        <TableCell>{t('payouts.net', 'Net payout')}</TableCell>
                        <TableCell>{t('payouts.status', 'Status')}</TableCell>
                        <TableCell />
                    </TableRow></TableHead>
                    <TableBody>
                        {rows.length === 0 ? (
                            <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', py: 4, color: C.textMuted }}>{t('payouts.none', 'No payouts yet.')}</TableCell></TableRow>
                        ) : rows.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>{row.period_start} → {row.period_end}</TableCell>
                                <TableCell>{formatMoney(row.gross_sales)}</TableCell>
                                <TableCell>{formatMoney(row.refunds)}</TableCell>
                                <TableCell>{formatMoney(row.platform_fee)}</TableCell>
                                <TableCell>{formatMoney(row.net_payout)}</TableCell>
                                <TableCell>{row.status}</TableCell>
                                <TableCell>
                                    {row.status !== 'paid' && <Button size="small" onClick={() => markPaid(row)}>{t('payouts.markPaid', 'Mark paid')}</Button>}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
        </PageContainer>
    );
};

export default Payouts;
