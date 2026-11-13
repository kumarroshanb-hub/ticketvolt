// frontend/src/pages/Reports/Reports.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert, Box, Button, CircularProgress, Grid, Paper,
    Tab, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { Download as DownloadIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import api from '../../services/api';
import { useSettings } from '../../context/SettingsContext';
import usePlatformFilter from '../../hooks/usePlatformFilter';
import { useOrg } from '../../context/OrgContext';
import { OrgFilterSelect } from '../../components/Common';
import {
    LoadingWrapper, OutlineButton, PageContainer, PageHeader,
    PageHeaderLeft, PageHeaderRight, PageSubtitle, PageTitle,
} from '../../components/Common';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const isoDate = (date) => date.toISOString().slice(0, 10);
const defaultEnd = () => isoDate(new Date());
const defaultStart = () => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return isoDate(d);
};

const StatCard = ({ label, value, hint }) => (
    <Paper sx={{ p: 2, border: `1px solid ${C.borderLight}`, borderRadius: 2, height: '100%' }}>
        <Typography variant="caption" sx={{ color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {label}
        </Typography>
        <Typography variant="h5" sx={{ color: C.textPrimary, fontWeight: 700, mt: 0.5 }}>
            {value}
        </Typography>
        {hint && (
            <Typography variant="caption" sx={{ color: C.textMuted }}>
                {hint}
            </Typography>
        )}
    </Paper>
);

const DataTable = ({ columns, rows, empty }) => (
    <TableContainer component={Paper} sx={{ border: `1px solid ${C.borderLight}`, borderRadius: 2 }}>
        <Table size="small">
            <TableHead>
                <TableRow>
                    {columns.map((col) => (
                        <TableCell key={col.key} sx={{ fontWeight: 700, color: C.textSecondary }}>
                            {col.label}
                        </TableCell>
                    ))}
                </TableRow>
            </TableHead>
            <TableBody>
                {rows.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={columns.length} sx={{ color: C.textMuted, py: 4, textAlign: 'center' }}>
                            {empty}
                        </TableCell>
                    </TableRow>
                ) : rows.map((row, index) => (
                    <TableRow key={row.id || row.code || row.date || index} hover>
                        {columns.map((col) => (
                            <TableCell key={col.key} sx={{ color: C.textPrimary }}>
                                {col.render ? col.render(row) : row[col.key]}
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </TableContainer>
);

const Reports = () => {
    const { t } = useTranslation();
    const { formatMoney } = useSettings();
    const { currentOrgId } = useOrg();
    const {
        params, isPlatformAdmin, orgFilter, setOrgFilter, organizations,
    } = usePlatformFilter();
    const statementOrgId = orgFilter || currentOrgId;
    const [statementYear, setStatementYear] = useState(String(new Date().getFullYear()));

    const [start, setStart] = useState(defaultStart);
    const [end, setEnd] = useState(defaultEnd);
    const [tab, setTab] = useState(0);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/reports/', {
                params: { ...params, start, end },
            });
            setData(res.data);
        } catch (err) {
            const msg = err.response?.data?.detail
                || err.response?.data?.error
                || err.message
                || t('reports.loadFailed', 'Failed to load reports');
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }, [params, start, end, t]);

    useEffect(() => { load(); }, [load]);

    const summary = data?.summary || {};

    const salesRows = data?.sales_by_event || [];
    const attendanceRows = data?.attendance_by_event || [];
    const donationRows = data?.donations_by_event || [];
    const pendingRows = data?.pending_bookings || [];
    const discountRows = data?.discount_usage || [];
    const dayRows = data?.sales_by_day || [];
    const tierRows = data?.memberships?.by_tier || [];

    const salesColumns = useMemo(() => [
        { key: 'event', label: t('reports.event', 'Event') },
        { key: 'bookings', label: t('reports.bookings', 'Bookings') },
        { key: 'gross', label: t('reports.gross', 'Gross'), render: (r) => formatMoney(r.gross) },
        { key: 'discounts', label: t('reports.discounts', 'Discounts'), render: (r) => formatMoney(r.discounts) },
        { key: 'refunds', label: t('reports.refunds', 'Refunds'), render: (r) => formatMoney(r.refunds) },
        { key: 'donations', label: t('reports.donations', 'Donations'), render: (r) => formatMoney(r.donations) },
        { key: 'net', label: t('reports.net', 'Net'), render: (r) => formatMoney(r.net) },
    ], [t, formatMoney]);

    const attendanceColumns = useMemo(() => [
        { key: 'event', label: t('reports.event', 'Event') },
        { key: 'issued', label: t('reports.issued', 'Issued') },
        { key: 'used', label: t('reports.used', 'Checked in') },
        { key: 'rate', label: t('reports.rate', 'Rate'), render: (r) => `${r.rate}%` },
    ], [t]);

    const donationColumns = useMemo(() => [
        { key: 'event', label: t('reports.event', 'Event') },
        { key: 'donations', label: t('reports.donationCount', 'Donations') },
        { key: 'total', label: t('reports.total', 'Total'), render: (r) => formatMoney(r.total) },
        { key: 'eligible', label: t('reports.taxEligible', 'Tax eligible') },
        { key: 'receipts', label: t('reports.receipts', 'Receipts issued') },
    ], [t, formatMoney]);

    const pendingColumns = useMemo(() => [
        { key: 'reference', label: t('reports.reference', 'Reference') },
        { key: 'customer', label: t('reports.customer', 'Customer') },
        { key: 'event', label: t('reports.event', 'Event') },
        { key: 'status', label: t('reports.status', 'Status') },
        { key: 'amount', label: t('reports.amount', 'Amount'), render: (r) => formatMoney(r.amount) },
        { key: 'created_at', label: t('reports.created', 'Created'), render: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—' },
    ], [t, formatMoney]);

    const exportCsv = (filename, columns, rows) => {
        const header = columns.map((c) => c.label).join(',');
        const body = rows.map((row) => columns.map((col) => {
            const raw = col.render ? col.render(row) : row[col.key];
            return `"${String(raw ?? '').replace(/"/g, '""')}"`;
        }).join(','));
        const blob = new Blob([`${header}\n${body.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadReceiptExport = async () => {
        if (isPlatformAdmin && !orgFilter) {
            toast.error(t('reports.selectOrganizationFirst', 'Select one organisation to download its annual statement.'));
            return;
        }
        try {
            const res = await api.get('/donations/receipts/export/', {
                params: { organization_id: statementOrgId, year: statementYear },
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `donation-receipts-${statementYear}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    const downloadExportPack = async () => {
        if (isPlatformAdmin && !orgFilter) {
            toast.error(t('reports.selectOrganizationFirst', 'Select one organisation to download its annual statement.'));
            return;
        }
        try {
            const res = await api.get('/reports/export-pack/', {
                params: { organization_id: statementOrgId, start, end },
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `export-pack-${statementOrgId}.zip`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    const downloadPatrons = async () => {
        if (isPlatformAdmin && !orgFilter) {
            toast.error(t('reports.selectOrganizationFirst', 'Select one organisation to download its annual statement.'));
            return;
        }
        try {
            const res = await api.get('/bookings/patrons-export/', {
                params: { organization_id: statementOrgId, since: start },
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `patrons-${start}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    const downloadAnnualStatement = async () => {
        if (isPlatformAdmin && !orgFilter) {
            toast.error(t('reports.selectOrganizationFirst', 'Select one organisation to download its annual statement.'));
            return;
        }
        try {
            const res = await api.get('/donations/annual-statement/', {
                params: { organization_id: statementOrgId, year: statementYear },
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `donation-statement-${statementYear}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    const currentExport = () => {
        switch (tab) {
            case 1: return exportCsv('sales-by-event.csv', salesColumns, salesRows);
            case 2: return exportCsv('attendance-by-event.csv', attendanceColumns, attendanceRows);
            case 3: return exportCsv('membership-by-tier.csv', [{ key: 'tier', label: 'Tier' }, { key: 'count', label: 'Members' }, { key: 'revenue', label: 'Revenue' }], tierRows);
            case 4: return exportCsv('donations-by-event.csv', donationColumns, donationRows);
            case 5: return exportCsv('pending-bookings.csv', pendingColumns, pendingRows);
            default: return exportCsv('sales-by-day.csv', [{ key: 'date', label: 'Date' }, { key: 'bookings', label: 'Bookings' }, { key: 'gross', label: 'Gross' }], dayRows);
        }
    };

    if (loading && !data) {
        return <LoadingWrapper><CircularProgress /></LoadingWrapper>;
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <Box>
                        <PageTitle variant="h4">{t('reports.title', 'Reports')}</PageTitle>
                        <PageSubtitle>
                            {t('reports.subtitle', 'Sales, attendance, membership and donation reporting')}
                        </PageSubtitle>
                    </Box>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OrgFilterSelect
                        isPlatformAdmin={isPlatformAdmin}
                        organizations={organizations}
                        orgFilter={orgFilter}
                        setOrgFilter={setOrgFilter}
                        onPageReset={() => {}}
                    />
                    <TextField
                        size="small" type="date" label={t('reports.from', 'From')}
                        value={start} onChange={(e) => setStart(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                        size="small" type="date" label={t('reports.to', 'To')}
                        value={end} onChange={(e) => setEnd(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                    />
                    <OutlineButton startIcon={<RefreshIcon />} onClick={load}>
                        {t('common.refresh')}
                    </OutlineButton>
                    <Button
                        variant="outlined" startIcon={<DownloadIcon />}
                        onClick={downloadPatrons}
                        sx={{ textTransform: 'none' }}
                    >
                        {t('reports.patronsExport', 'Patrons CSV')}
                    </Button>
                    <Button
                        variant="outlined" startIcon={<DownloadIcon />}
                        onClick={downloadExportPack}
                        sx={{ textTransform: 'none' }}
                    >
                        {t('reports.exportPack', 'Export pack')}
                    </Button>
                    <Button
                        variant="contained" startIcon={<DownloadIcon />}
                        onClick={currentExport}
                        sx={{ textTransform: 'none' }}
                    >
                        {t('reports.exportCsv', 'Export CSV')}
                    </Button>
                </PageHeaderRight>
            </PageHeader>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Paper sx={{ mb: 2 }}>
                <Tabs
                    value={tab}
                    onChange={(_, value) => setTab(value)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ px: 1 }}
                >
                    <Tab label={t('reports.overview', 'Overview')} />
                    <Tab label={t('reports.sales', 'Sales')} />
                    <Tab label={t('reports.attendance', 'Attendance')} />
                    <Tab label={t('reports.memberships', 'Memberships')} />
                    <Tab label={t('reports.donationsTab', 'Donations')} />
                    <Tab label={t('reports.pending', 'Pending payments')} />
                </Tabs>
            </Paper>

            {tab === 0 && (
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}><StatCard label={t('reports.grossRevenue', 'Gross revenue')} value={formatMoney(summary.gross_revenue || 0)} /></Grid>
                    <Grid item xs={12} sm={6} md={3}><StatCard label={t('reports.netRevenue', 'Net revenue')} value={formatMoney(summary.net_revenue || 0)} hint={`${t('reports.refunds', 'Refunds')}: ${formatMoney(summary.refunds || 0)}`} /></Grid>
                    <Grid item xs={12} sm={6} md={3}><StatCard label={t('reports.ticketsSold', 'Tickets sold')} value={summary.tickets_sold || 0} hint={`${t('reports.bookings', 'Bookings')}: ${summary.bookings || 0}`} /></Grid>
                    <Grid item xs={12} sm={6} md={3}><StatCard label={t('reports.attendanceRate', 'Attendance rate')} value={`${summary.attendance_rate || 0}%`} hint={`${summary.attended || 0} / ${summary.tickets_sold || 0}`} /></Grid>
                    <Grid item xs={12} sm={6} md={3}><StatCard label={t('reports.donations', 'Donations')} value={formatMoney(summary.donations || 0)} /></Grid>
                    <Grid item xs={12} sm={6} md={3}><StatCard label={t('reports.discounts', 'Discounts')} value={formatMoney(summary.discounts || 0)} /></Grid>
                    <Grid item xs={12} sm={6} md={3}><StatCard label={t('reports.pendingBookings', 'Pending bookings')} value={summary.pending_bookings || 0} /></Grid>
                    <Grid item xs={12} sm={6} md={3}><StatCard label={t('reports.checkins', 'Successful check-ins')} value={summary.checkins || 0} /></Grid>
                    <Grid item xs={12}>
                        <Typography variant="h6" sx={{ color: C.textPrimary, mt: 1, mb: 1 }}>
                            {t('reports.dailySales', 'Daily sales')}
                        </Typography>
                        <DataTable
                            columns={[
                                { key: 'date', label: t('reports.date', 'Date') },
                                { key: 'bookings', label: t('reports.bookings', 'Bookings') },
                                { key: 'gross', label: t('reports.gross', 'Gross'), render: (r) => formatMoney(r.gross) },
                                { key: 'donations', label: t('reports.donations', 'Donations'), render: (r) => formatMoney(r.donations) },
                            ]}
                            rows={dayRows}
                            empty={t('reports.noData', 'No data for this period.')}
                        />
                    </Grid>
                </Grid>
            )}

            {tab === 1 && (
                <DataTable columns={salesColumns} rows={salesRows} empty={t('reports.noData', 'No data for this period.')} />
            )}

            {tab === 2 && (
                <DataTable columns={attendanceColumns} rows={attendanceRows} empty={t('reports.noData', 'No data for this period.')} />
            )}

            {tab === 3 && (
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}><StatCard label={t('reports.activeMembers', 'Active members')} value={data?.memberships?.active || 0} /></Grid>
                    <Grid item xs={12} sm={4}><StatCard label={t('reports.memberRevenue', 'Membership revenue')} value={formatMoney(data?.memberships?.revenue || 0)} /></Grid>
                    <Grid item xs={12} sm={4}><StatCard label={t('reports.expiring', 'Expiring in 30 days')} value={data?.memberships?.expiring_30d || 0} /></Grid>
                    <Grid item xs={12}>
                        <DataTable
                            columns={[
                                { key: 'tier', label: t('reports.tier', 'Tier') },
                                { key: 'count', label: t('reports.members', 'Members') },
                                { key: 'revenue', label: t('reports.revenue', 'Revenue'), render: (r) => formatMoney(r.revenue) },
                            ]}
                            rows={tierRows}
                            empty={t('reports.noData', 'No data for this period.')}
                        />
                    </Grid>
                </Grid>
            )}

            {tab === 4 && (
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 1.5 }}>
                        <TextField
                            size="small" type="number" label={t('reports.year', 'Year')}
                            value={statementYear}
                            onChange={(e) => setStatementYear(e.target.value)}
                            sx={{ width: 120 }}
                        />
                        <Button variant="outlined" onClick={downloadAnnualStatement}>
                            {t('reports.annualStatement', 'Annual statement')}
                        </Button>
                        <Button variant="outlined" onClick={downloadReceiptExport}>
                            {t('reports.receiptExport', 'Receipts CSV')}
                        </Button>
                    </Box>
                    <DataTable columns={donationColumns} rows={donationRows} empty={t('reports.noData', 'No data for this period.')} />
                </Box>
            )}

            {tab === 5 && (
                <Grid container spacing={2}>
                    <Grid item xs={12}>
                        <DataTable columns={pendingColumns} rows={pendingRows} empty={t('reports.noData', 'No data for this period.')} />
                    </Grid>
                    <Grid item xs={12}>
                        <Typography variant="h6" sx={{ color: C.textPrimary, mt: 1, mb: 1 }}>
                            {t('reports.discountUsage', 'Discount usage')}
                        </Typography>
                        <DataTable
                            columns={[
                                { key: 'code', label: t('reports.code', 'Code') },
                                { key: 'count', label: t('reports.uses', 'Uses') },
                                { key: 'total', label: t('reports.total', 'Total'), render: (r) => formatMoney(r.total) },
                            ]}
                            rows={discountRows}
                            empty={t('reports.noData', 'No data for this period.')}
                        />
                    </Grid>
                </Grid>
            )}
        </PageContainer>
    );
};

export default Reports;
