// frontend/src/pages/Billing/Billing.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Grid,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Tab,
    Tabs,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    Download as DownloadIcon,
    Email as EmailIcon,
    Search as SearchIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';

import api from '../../services/api';
import { useSettings } from '../../context/SettingsContext';
import usePlatformFilter from '../../hooks/usePlatformFilter';
import {
    LoadingWrapper,
    OrgFilterSelect,
    PageContainer,
    PageHeader,
    PageHeaderLeft,
    PageHeaderRight,
    PageSubtitle,
    PageTitle,
    OutlineButton,
    StatusChip,
} from '../../components/Common';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const SUMMARY_CARDS = [
    { key: 'gross_revenue', labelKey: 'billing.grossRevenue', label: 'Gross Revenue', color: C.primary },
    { key: 'ticket_revenue', labelKey: 'billing.ticketRevenue', label: 'Ticket Revenue', color: C.info },
    { key: 'donations', labelKey: 'billing.donations', label: 'Donations', color: C.secondary },
    { key: 'tax_receipts_issued', labelKey: 'billing.taxReceiptsIssued', label: 'Tax Receipts Issued', color: C.success, integer: true },
    { key: 'refunds', labelKey: 'billing.refunds', label: 'Refunds', color: C.warning },
    { key: 'pending_bookings', labelKey: 'billing.pendingBookings', label: 'Pending Bookings', color: C.textSecondary, integer: true },
];

const Billing = () => {
    const { t } = useTranslation();
    const { formatMoney } = useSettings();
    const {
        params, isPlatformAdmin, orgFilter, setOrgFilter, organizations, resetPage,
    } = usePlatformFilter();

    const [tab, setTab] = useState('transactions');
    const [summary, setSummary] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState([]);
    const [emailing, setEmailing] = useState(false);
    const [confirmEmailIds, setConfirmEmailIds] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const common = {
                ...params,
                ...(tab === 'donations' ? { donations: 1 } : {}),
                ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
                ...(search.trim() ? { search: search.trim() } : {}),
                page,
            };
            const [summaryRes, txRes] = await Promise.all([
                api.get('/billing/summary/', { params }),
                api.get('/billing/transactions/', { params: common }),
            ]);
            setSummary(summaryRes.data);
            setTransactions(txRes.data?.results || []);
            setCount(txRes.data?.count || 0);
        } catch (err) {
            setError(
                err.response?.data?.detail
                || err.response?.data?.error
                || err.message
                || t('billing.loadFailed', 'Failed to load billing data.'),
            );
        } finally {
            setLoading(false);
        }
    }, [params, tab, statusFilter, search, page, t]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        setPage(1);
        setSelectedIds([]);
    }, [orgFilter, tab, statusFilter, search]);

    const downloadReceipt = async (booking) => {
        try {
            const res = await api.get(
                `/bookings/${booking.id}/donation-tax-receipt/`,
                { responseType: 'blob' },
            );
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `donation-receipt-${booking.booking_reference}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(
                err.response?.data?.error
                || err.message
                || t('billing.receiptFailed', 'Could not generate the tax receipt.'),
            );
        }
    };

    const toggleSelected = (id) => {
        setSelectedIds((prev) => (
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        ));
    };

    const toggleAll = () => {
        setSelectedIds((prev) => (
            prev.length === transactions.length
                ? []
                : transactions.map((tx) => tx.id)
        ));
    };

    const sendReceipts = async (ids) => {
        if (!ids.length) return;
        setEmailing(true);
        try {
            const res = await api.post('/billing/send-email/', { booking_ids: ids });
            const sent = res.data?.sent || 0;
            const failed = res.data?.failed || 0;
            if (sent > 0) {
                toast.success(t('billing.emailSent', { count: sent, defaultValue: '{{count}} email(s) sent.' }));
            }
            if (failed > 0) {
                toast.warning(t('billing.emailFailedCount', { count: failed, defaultValue: '{{count}} email(s) failed.' }));
            }
            setSelectedIds([]);
            setConfirmEmailIds(null);
            await load();
        } catch (err) {
            toast.error(
                err.response?.data?.error
                || err.message
                || t('billing.emailFailed', 'Could not send billing emails.'),
            );
        } finally {
            setEmailing(false);
        }
    };

    const cards = useMemo(() => SUMMARY_CARDS.map((card) => ({
        ...card,
        value: summary?.[card.key] ?? 0,
    })), [summary]);

    if (loading && !summary) {
        return <LoadingWrapper><CircularProgress /></LoadingWrapper>;
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <Box>
                        <PageTitle variant="h4">{t('billing.title', 'Billing')}</PageTitle>
                        <PageSubtitle>
                            {t('billing.subtitle', 'Payments, donations and tax receipts for your organization')}
                        </PageSubtitle>
                    </Box>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OrgFilterSelect
                        isPlatformAdmin={isPlatformAdmin}
                        organizations={organizations}
                        orgFilter={orgFilter}
                        setOrgFilter={setOrgFilter}
                        onPageReset={resetPage}
                    />
                    <OutlineButton onClick={load}>{t('common.refresh')}</OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Grid container spacing={2} sx={{ mb: 3 }}>
                {cards.map((card) => (
                    <Grid item xs={12} sm={6} lg={2} key={card.key}>
                        <Paper sx={{ p: 2, border: `1px solid ${C.borderLight}`, bgcolor: C.bgCard }}>
                            <Typography variant="caption" sx={{ color: C.textSecondary, fontWeight: 600 }}>
                                {t(card.labelKey, card.label)}
                            </Typography>
                            <Typography variant="h5" sx={{ color: card.color, fontWeight: 800, mt: 0.5 }}>
                                {card.integer ? card.value : formatMoney(card.value)}
                            </Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Paper sx={{ border: `1px solid ${C.borderLight}`, bgcolor: C.bgCard }}>
                <Tabs
                    value={tab}
                    onChange={(_, value) => setTab(value)}
                    sx={{ px: 2, borderBottom: `1px solid ${C.borderLight}` }}
                >
                    <Tab value="transactions" label={t('billing.transactionsTab', 'Transactions')} />
                    <Tab value="donations" label={t('billing.donationsTab', 'Donations & Tax Receipts')} />
                </Tabs>

                <Box sx={{ p: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <TextField
                        size="small"
                        placeholder={t('billing.searchPlaceholder', 'Search reference, customer or event')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        sx={{ minWidth: 300, flex: 1 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" />
                                </InputAdornment>
                            ),
                        }}
                    />
                    <TextField
                        select
                        size="small"
                        label={t('billing.statusFilter', 'Status')}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        sx={{ minWidth: 180 }}
                    >
                        <MenuItem value="all">{t('common.all')}</MenuItem>
                        <MenuItem value="pending">Pending</MenuItem>
                        <MenuItem value="paid">Paid</MenuItem>
                        <MenuItem value="confirmed">Confirmed</MenuItem>
                        <MenuItem value="completed">Completed</MenuItem>
                        <MenuItem value="cancelled">Cancelled</MenuItem>
                        <MenuItem value="refunded">Refunded</MenuItem>
                    </TextField>
                    <Typography variant="caption" sx={{ color: C.textSecondary }}>
                        {t('billing.recordCount', { count, defaultValue: '{{count}} records' })}
                    </Typography>
                    <OutlineButton
                        size="small"
                        startIcon={<EmailIcon />}
                        disabled={selectedIds.length === 0 || emailing}
                        onClick={() => setConfirmEmailIds(selectedIds)}
                    >
                        {t('billing.emailSelected', { count: selectedIds.length })}
                    </OutlineButton>
                </Box>

                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        size="small"
                                        checked={transactions.length > 0 && selectedIds.length === transactions.length}
                                        indeterminate={selectedIds.length > 0 && selectedIds.length < transactions.length}
                                        onChange={toggleAll}
                                    />
                                </TableCell>
                                <TableCell>{t('billing.reference', 'Reference')}</TableCell>
                                <TableCell>{t('billing.customer', 'Customer')}</TableCell>
                                <TableCell>{t('billing.event', 'Event')}</TableCell>
                                <TableCell align="right">{t('billing.total', 'Total')}</TableCell>
                                <TableCell align="right">{t('billing.donation', 'Donation')}</TableCell>
                                <TableCell>{t('billing.status', 'Status')}</TableCell>
                                <TableCell>{t('billing.issued', 'Issued')}</TableCell>
                                <TableCell align="right">{t('billing.receipt', 'Receipt')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {transactions.map((tx) => (
                                <TableRow key={tx.id} hover selected={selectedIds.includes(tx.id)}>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            size="small"
                                            checked={selectedIds.includes(tx.id)}
                                            onChange={() => toggleSelected(tx.id)}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: theme.fonts.familyMono, fontSize: 12 }}>
                                        {tx.booking_reference}
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">{tx.customer_name}</Typography>
                                        <Typography variant="caption" sx={{ color: C.textSecondary }}>
                                            {tx.customer_email}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{tx.event_title}</TableCell>
                                    <TableCell align="right">{formatMoney(tx.total_amount)}</TableCell>
                                    <TableCell align="right" sx={{ color: Number(tx.donation_amount) > 0 ? C.secondary : C.textSecondary }}>
                                        {Number(tx.donation_amount) > 0 ? formatMoney(tx.donation_amount) : '—'}
                                    </TableCell>
                                    <TableCell><StatusChip status={tx.status} type="booking" size="small" /></TableCell>
                                    <TableCell>
                                        {tx.donation_tax_receipt_number ? (
                                            <Chip size="small" label={t('billing.issuedStatus', 'Issued')} color="success" variant="outlined" />
                                        ) : tx.donation_tax_eligible ? (
                                            <Chip size="small" label={t('billing.eligibleStatus', 'Eligible')} color="warning" variant="outlined" />
                                        ) : (
                                            <Typography variant="caption" sx={{ color: C.textSecondary }}>—</Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                                            {tx.donation_tax_eligible || tx.donation_tax_receipt_number ? (
                                                <OutlineButton
                                                    size="small"
                                                    startIcon={<DownloadIcon />}
                                                    onClick={() => downloadReceipt(tx)}
                                                >
                                                    {t('billing.pdf', 'PDF')}
                                                </OutlineButton>
                                            ) : null}
                                            <Tooltip title={t('billing.emailReceipt', 'Email receipt')}>
                                                <span>
                                                    <IconButton
                                                        size="small"
                                                        disabled={emailing}
                                                        onClick={() => setConfirmEmailIds([tx.id])}
                                                    >
                                                        <EmailIcon fontSize="small" />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {transactions.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={9} align="center" sx={{ py: 4, color: C.textSecondary }}>
                                        {t('billing.noRecords', 'No billing records found.')}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                <Divider />
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: C.textSecondary }}>
                        {t('billing.showingCount', { shown: transactions.length, total: count, defaultValue: 'Showing {{shown}} of {{total}}' })}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <OutlineButton size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                            {t('common.back')}
                        </OutlineButton>
                        <OutlineButton size="small" disabled={transactions.length < 50} onClick={() => setPage((p) => p + 1)}>
                            {t('common.next')}
                        </OutlineButton>
                    </Box>
                </Box>
            </Paper>

            {loading && summary && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                    <CircularProgress size={22} />
                </Box>
            )}

            <Dialog open={Boolean(confirmEmailIds)} onClose={() => setConfirmEmailIds(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('billing.confirmEmailTitle', 'Send billing receipts?')}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {t('billing.confirmEmailBody', {
                            count: confirmEmailIds?.length || 0,
                            defaultValue: 'Send a billing receipt with tax-receipt details to {{count}} customer(s)?',
                        })}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <OutlineButton onClick={() => setConfirmEmailIds(null)} disabled={emailing}>
                        {t('common.cancel')}
                    </OutlineButton>
                    <OutlineButton onClick={() => sendReceipts(confirmEmailIds || [])} disabled={emailing}>
                        {emailing ? t('billing.sending', 'Sending…') : t('billing.send', 'Send')}
                    </OutlineButton>
                </DialogActions>
            </Dialog>
        </PageContainer>
    );
};

export default Billing;
