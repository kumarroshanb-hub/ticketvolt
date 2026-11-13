import React, { useCallback, useEffect, useState } from 'react';
import { Alert, CircularProgress, Paper, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { useTranslation } from 'react-i18next';

import api from '../../services/api';
import usePlatformFilter from '../../hooks/usePlatformFilter';
import { LoadingWrapper, PageContainer, PageHeader, PageTitle, PageSubtitle, OrgFilterSelect } from '../../components/Common';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const AuditLogs = () => {
    const { t } = useTranslation();
    const { params, isPlatformAdmin, orgFilter, setOrgFilter, organizations } = usePlatformFilter();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/audit-logs/', { params });
            setRows(res.data?.results || res.data || []);
        } catch (err) {
            setError(err.response?.data?.detail || err.message);
        } finally {
            setLoading(false);
        }
    }, [params]);

    useEffect(() => { load(); }, [load]);
    if (loading) return <LoadingWrapper><CircularProgress /></LoadingWrapper>;

    return (
        <PageContainer>
            <PageHeader>
                <div>
                    <PageTitle variant="h4">{t('audit.title', 'Audit logs')}</PageTitle>
                    <PageSubtitle>{t('audit.subtitle', 'Security-relevant actions in your organisation.')}</PageSubtitle>
                </div>
                <OrgFilterSelect
                    isPlatformAdmin={isPlatformAdmin}
                    organizations={organizations}
                    orgFilter={orgFilter}
                    setOrgFilter={setOrgFilter}
                    onPageReset={() => {}}
                />
            </PageHeader>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Paper sx={{ border: `1px solid ${C.borderLight}`, borderRadius: 2 }}>
                <Table size="small">
                    <TableHead><TableRow>
                        <TableCell>{t('audit.when', 'When')}</TableCell>
                        <TableCell>{t('audit.actor', 'Actor')}</TableCell>
                        <TableCell>{t('audit.action', 'Action')}</TableCell>
                        <TableCell>{t('audit.path', 'Path')}</TableCell>
                        <TableCell>{t('audit.status', 'Status')}</TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                                <TableCell>{row.actor_name || '—'}</TableCell>
                                <TableCell>{row.method}</TableCell>
                                <TableCell>{row.path}</TableCell>
                                <TableCell>{row.status_code}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
        </PageContainer>
    );
};

export default AuditLogs;
