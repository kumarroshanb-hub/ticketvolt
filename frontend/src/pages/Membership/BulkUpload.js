// frontend/src/pages/Membership/BulkUpload.js
//
// Bulk-add members to the current organization from a CSV.
//
// The import creates users (if needed) + OrganizationMembership(role=member)
// + a PENDING_OFFLINE Membership row. It NEVER activates the paid
// membership: an owner/admin still reviews the queue on the Offline
// Requests page. Tenant STAFF can upload; activation remains admin-only.
import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert, Box, Button, Card, CardContent, CircularProgress, Divider,
    Grid, MenuItem, Table, TableBody, TableCell, TableHead, TableRow,
    TextField, Typography, Chip,
} from '@mui/material';
import {
    CloudUpload as UploadIcon,
    Download as DownloadIcon,
    ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import membershipService from '../../services/membershipService';
import { useOrg } from '../../context/OrgContext';
import {
    PageContainer,
    PageHeader,
    PageTitle,
    PageSubtitle,
    PageHeaderLeft,
    PageHeaderRight,
    PrimaryButton,
    OutlineButton,
    LoadingWrapper,
} from '../../components/Common';

const CSV_TEMPLATE = 'email,name,phone,amount,offline_reference\n';

const BulkUpload = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { currentOrg, currentOrgId, organizations } = useOrg();

    const [orgId, setOrgId] = useState(
        currentOrgId || organizations[0]?.id || null
    );

    useEffect(() => {
        if (!orgId) {
            const fallback = currentOrgId || organizations[0]?.id || null;
            if (fallback) setOrgId(fallback);
        }
    }, [currentOrgId, organizations, orgId]);

    const [tiers, setTiers] = useState([]);
    const [tierId, setTierId] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        if (!orgId) {
            setLoading(false);
            return undefined;
        }
        setLoading(true);
        membershipService.listOrgTiers(orgId)
            .then((rows) => {
                if (cancelled) return;
                setTiers(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (!cancelled) setTiers([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [orgId]);

    const selectedTier = useMemo(
        () => tiers.find((t) => String(t.id) === String(tierId)) || null,
        [tiers, tierId],
    );

    const downloadTemplate = () => {
        const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'membership-bulk-upload-template.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        setError('');
        setResult(null);

        if (!orgId) {
            setError(t('bulkUpload.organizationRequired'));
            return;
        }
        if (!tierId) {
            setError(t('bulkUpload.choosePlanError'));
            return;
        }
        if (!file) {
            setError(t('bulkUpload.chooseFileError'));
            return;
        }

        setUploading(true);
        try {
            const data = await membershipService.bulkUploadOffline({
                organizationId: orgId,
                tierId,
                file,
            });
            setResult(data);
            if (data.created_count > 0) {
                toast.success(t('bulkUpload.addedCount', { count: data.created_count }));
            } else {
                toast.info(t('bulkUpload.noNewMembers'));
            }
        } catch (err) {
            const data = err.response?.data;
            const msg = data?.error
                || data?.detail
                || (data && typeof data === 'object'
                    ? `${Object.keys(data)[0]}: ${Object.values(data)[0]}`
                    : err.message)
                || t('bulkUpload.uploadFailed');
            setError(String(msg));
            toast.error(String(msg));
        } finally {
            setUploading(false);
        }
    };

    if (loading) {
        return (
            <LoadingWrapper>
                <CircularProgress />
            </LoadingWrapper>
        );
    }

    return (
        <PageContainer>
            <PageHeader>
                <PageHeaderLeft>
                    <IconButtonBack onClick={() => navigate('/app/membership')} />
                    <Box>
                        <PageTitle variant="h5">{t('bulkUpload.title')}</PageTitle>
                        <PageSubtitle>
                            {t('bulkUpload.subtitle')}
                        </PageSubtitle>
                    </Box>
                </PageHeaderLeft>
                <PageHeaderRight>
                    <OutlineButton
                        startIcon={<DownloadIcon />}
                        onClick={downloadTemplate}
                        sx={{ textTransform: 'none' }}
                    >
                        {t('bulkUpload.template')}
                    </OutlineButton>
                </PageHeaderRight>
            </PageHeader>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {!orgId ? (
                <Alert severity="warning">
                    {t('bulkUpload.organizationRequired')}
                </Alert>
            ) : (
                <Grid container spacing={2}>
                    <Grid item xs={12} md={5}>
                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                                    {t('bulkUpload.uploadDetails')}
                                </Typography>

                                {organizations.length > 1 ? (
                                    <TextField
                                        fullWidth
                                        select
                                        size="small"
                                        label={t('bulkUpload.organization')}
                                        value={orgId || ''}
                                        onChange={(e) => {
                                            setOrgId(e.target.value);
                                            setTierId('');
                                            setFile(null);
                                            setResult(null);
                                        }}
                                        sx={{ mb: 2 }}
                                    >
                                        {organizations.map((org) => (
                                            <MenuItem key={org.id} value={org.id}>
                                                {org.name}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                ) : (
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label={t('bulkUpload.organization')}
                                        value={currentOrg?.name || ''}
                                        InputProps={{ readOnly: true }}
                                        sx={{ mb: 2 }}
                                    />
                                )}

                                <TextField
                                    fullWidth
                                    select
                                    size="small"
                                    label={t('bulkUpload.plan')}
                                    value={tierId}
                                    onChange={(e) => setTierId(e.target.value)}
                                    sx={{ mb: 2 }}
                                >
                                    {tiers.map((tier) => (
                                        <MenuItem key={tier.id} value={tier.id}>
                                            {tier.name} — {tier.currency_code || ''} {tier.price}
                                        </MenuItem>
                                    ))}
                                </TextField>

                                <Button
                                    component="label"
                                    variant="outlined"
                                    startIcon={<UploadIcon />}
                                    sx={{ textTransform: 'none', mb: 1 }}
                                >
                                    {file ? t('bulkUpload.replaceFile') : t('bulkUpload.chooseFile')}
                                    <input
                                        type="file"
                                        hidden
                                        accept=".csv,text/csv"
                                        onChange={(e) => {
                                            const picked = e.target.files?.[0] || null;
                                            if (picked && !/\.csv$/i.test(picked.name)) {
                                                toast.error(t('bulkUpload.chooseCsvError'));
                                                e.target.value = '';
                                                return;
                                            }
                                            setFile(picked);
                                        }}
                                    />
                                </Button>
                                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 2 }}>
                                    {file ? file.name : t('bulkUpload.columns')}
                                </Typography>

                                <Divider sx={{ mb: 2 }} />

                                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
                                    {t('bulkUpload.pendingNote')}
                                </Typography>
                                {selectedTier && (
                                    <Chip
                                        size="small"
                                        label={`${selectedTier.name} · ${t('bulkUpload.durationDays', { count: selectedTier.duration_days || 0 })}`}
                                        sx={{ mb: 2 }}
                                    />
                                )}

                                <PrimaryButton
                                    fullWidth
                                    onClick={handleUpload}
                                    disabled={uploading || !tiers.length}
                                    startIcon={uploading ? <CircularProgress size={18} /> : <UploadIcon />}
                                >
                                    {uploading ? t('bulkUpload.uploading') : t('bulkUpload.uploadMembers')}
                                </PrimaryButton>
                            </CardContent>
                        </Card>
                    </Grid>

                    <Grid item xs={12} md={7}>
                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                                    {t('bulkUpload.result')}
                                </Typography>

                                {!result ? (
                                    <Alert severity="info">
                                        {t('bulkUpload.resultHint')}
                                    </Alert>
                                ) : (
                                    <>
                                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                                            <Chip color="success" label={`${t('bulkUpload.created')}: ${result.created_count}`} />
                                            <Chip label={`${t('bulkUpload.skipped')}: ${result.skipped_count}`} />
                                            <Chip
                                                color={result.error_count ? 'error' : 'default'}
                                                label={`${t('bulkUpload.errors')}: ${result.error_count}`}
                                            />
                                            <Chip label={`${t('bulkUpload.newUsers')}: ${result.users_created}`} />
                                        </Box>

                                        {result.created?.length > 0 && (
                                            <>
                                                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                                    {t('bulkUpload.addedToQueue')}
                                                </Typography>
                                                <Box sx={{ maxHeight: 220, overflow: 'auto', mb: 2 }}>
                                                    <Table size="small">
                                                        <TableBody>
                                                            {result.created.map((row) => (
                                                                <TableRow key={row.membership_id}>
                                                                    <TableCell>{row.email}</TableCell>
                                                                    <TableCell>{row.name || '—'}</TableCell>
                                                                    <TableCell align="right">
                                                                        {row.user_created
                                                                            ? t('bulkUpload.newUser')
                                                                            : t('bulkUpload.existingUser')}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </Box>
                                            </>
                                        )}

                                        {result.errors?.length > 0 && (
                                            <>
                                                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                                    {t('bulkUpload.rowErrors')}
                                                </Typography>
                                                <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
                                                    <Table size="small">
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableCell>{t('bulkUpload.colRow')}</TableCell>
                                                                <TableCell>{t('bulkUpload.colEmail')}</TableCell>
                                                                <TableCell>{t('bulkUpload.colError')}</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {result.errors.map((row, idx) => (
                                                                <TableRow key={`${row.row}-${idx}`}>
                                                                    <TableCell>{row.row}</TableCell>
                                                                    <TableCell>{row.email || '—'}</TableCell>
                                                                    <TableCell>{row.error}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </Box>
                                            </>
                                        )}

                                        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
                                            <Button
                                                variant="outlined"
                                                onClick={() => navigate('/app/membership/review-offline')}
                                                sx={{ textTransform: 'none' }}
                                            >
                                                {t('bulkUpload.goToRequests')}
                                            </Button>
                                        </Box>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}
        </PageContainer>
    );
};

// Small local back button so this page does not need another import.
const IconButtonBack = ({ onClick }) => {
    const { t } = useTranslation();
    return (
        <Button
            onClick={onClick}
            size="small"
            sx={{ minWidth: 0, mr: 1, textTransform: 'none' }}
            startIcon={<ArrowBackIcon />}
        >
            {t('common.back')}
        </Button>
    );
};

export default BulkUpload;
