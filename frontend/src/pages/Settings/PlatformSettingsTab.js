// frontend/src/pages/Settings/PlatformSettingsTab.js
import React, { useEffect, useMemo, useState } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, TextField,
    MenuItem, Divider, Alert, CircularProgress, Paper,
    Stack, InputAdornment, Switch, FormControlLabel
} from '@mui/material';
import {
    Save as SaveIcon,
    Refresh as RefreshIcon,
    Payment as PaymentIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { useSettings } from '../../context/SettingsContext';
import { useRole } from '../../context/RoleContext';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const INITIAL_FORM = {
    currency_code: 'HKD',
    currency_symbol: 'HK$',
    currency_locale: 'en-HK',
    country: 'Hong Kong',
    country_code: 'HK',
    default_timezone: 'Asia/Hong_Kong',
    org_name: 'TicketVolt',
    org_email: '',
    org_logo_url: '',
    email_from_name: '',
    payments_enabled: false, // Global payment toggle
};

const PlatformSettingsTab = () => {
    const { t } = useTranslation();
    const { formatMoney, refresh } = useSettings();
    const { isSuperAdmin } = useRole();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState([]);
    const [form, setForm] = useState(INITIAL_FORM);
    const [catalog, setCatalog] = useState({ countries: [], currency_codes: [], fallback: null });

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/settings/');
            setForm((prev) => ({
                ...prev,
                currency_code: data.currency_code ?? prev.currency_code,
                currency_symbol: data.currency_symbol ?? prev.currency_symbol,
                currency_locale: data.currency_locale ?? prev.currency_locale,
                country: data.country ?? prev.country,
                country_code: data.country_code ?? prev.country_code,
                default_timezone: data.default_timezone ?? prev.default_timezone,
                org_name: data.org_name ?? prev.org_name,
                org_email: data.org_email ?? prev.org_email,
                org_logo_url: data.org_logo_url ?? prev.org_logo_url,
                email_from_name: data.email_from_name ?? prev.email_from_name,
                payments_enabled: data.payments_enabled ?? prev.payments_enabled,
            }));
            if (data.catalog) {
                setCatalog({
                    countries: data.catalog.countries || [],
                    currency_codes: data.catalog.currency_codes || [],
                    fallback: data.catalog.fallback || null,
                });
            }
        } catch (err) {
            console.error('Failed to load platform settings', err);
            toast.error(err.response?.data?.detail || t('platformSettings.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const countryOptions = useMemo(() => {
        return (catalog.countries || []).map((c) => ({
            value: c.country_name || c.country_code,
            label: c.country_name ? `${c.country_name} (${c.country_code})` : c.country_code,
            raw: c,
        }));
    }, [catalog.countries]);

    const currencyOptions = useMemo(() => {
        return (catalog.currency_codes || []).map((c) => {
            if (typeof c === 'string') {
                return { value: c, label: c };
            }
            const code = c.code || c.currency_code;
            const name = c.name || c.currency_name || code;
            const sym = c.symbol ? `${c.symbol} ` : '';
            return { value: code, label: `${sym}${code} — ${name}` };
        });
    }, [catalog.currency_codes]);

    const handleChange = (field) => (e) => {
        // Handle Switch (boolean) vs TextField (string)
        const value = field === 'payments_enabled' ? e.target.checked : e.target.value;
        setForm((prev) => ({ ...prev, [field]: value }));

        if (field === 'country') {
            const match = countryOptions.find((c) => c.value === value)?.raw;
            if (match) {
                setForm((prev) => ({
                    ...prev,
                    country: match.country_name || match.country,
                    country_code: match.country_code,
                    default_timezone: match.timezone || match.default_timezone || prev.default_timezone,
                    currency_code: match.currency_code || prev.currency_code,
                    currency_symbol: match.symbol || prev.currency_symbol,
                    currency_locale: match.locale || prev.currency_locale,
                }));
            }
        }
    };

    const handleSubmit = async (e) => {
        e?.preventDefault?.();
        if (!isSuperAdmin) {
            toast.error(t('platformSettings.nonAdminToast'));
            return;
        }
        setSaving(true);
        setErrors([]);
        try {
            const payload = {
                currency_code: form.currency_code,
                currency_symbol: form.currency_symbol,
                currency_locale: form.currency_locale,
                country: form.country,
                default_timezone: form.default_timezone,
                org_name: form.org_name,
                org_email: form.org_email,
                org_logo_url: form.org_logo_url,
                email_from_name: form.email_from_name,
                payments_enabled: form.payments_enabled,
            };

            const { data } = await api.patch('/settings/', payload);
            toast.success(t('platformSettings.saved'));

            // Force global context refresh so ALL pages re-render with new currency
            if (typeof refresh === 'function') {
                await refresh();
            }

            if (data?.catalog) {
                setCatalog({
                    countries: data.catalog.countries || [],
                    currency_codes: data.catalog.currency_codes || [],
                    fallback: data.catalog.fallback || null,
                });
            }
        } catch (err) {
            console.error('Save platform settings error', err);
            const d = err.response?.data;
            const msgs =
                d && typeof d === 'object'
                    ? Object.entries(d).flatMap(([k, v]) =>
                          Array.isArray(v) ? v.map((m) => `${k}: ${m}`) : [`${k}: ${v}`]
                      )
                    : [t('platformSettings.saveFailed')];
            setErrors(msgs);
            toast.error(msgs[0]);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            {!isSuperAdmin && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    {t('platformSettings.nonAdminNotice')}
                </Alert>
            )}

            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                spacing={1}
                sx={{ mb: 2 }}
            >
                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {t('platformSettings.title')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {t('platformSettings.subtitle')}
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                    <Box
                        component="button"
                        type="button"
                        onClick={load}
                        disabled={saving}
                        sx={{
                            px: 2, py: 1, border: `1px solid ${C.borderLight}`, borderRadius: 2,
                            background: C.white, cursor: 'pointer', display: 'flex',
                            alignItems: 'center', gap: 1, fontSize: 14,
                            '&:hover': { borderColor: C.textLight },
                            '&:disabled': { opacity: 0.6, cursor: 'not-allowed' },
                        }}
                    >
                        <RefreshIcon fontSize="small" /> {t('platformSettings.reload')}
                    </Box>
                    <Box
                        component="button"
                        type="button"
                        onClick={handleSubmit}
                        disabled={saving || !isSuperAdmin}
                        sx={{
                            px: 2, py: 1, border: 'none', borderRadius: 2,
                            background: `linear-gradient(135deg, ${C.primaryDark} 0%, ${C.primaryLight} 100%)`,
                            color: C.textInverse,
                            cursor: saving || !isSuperAdmin ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 1,
                            fontSize: 14, fontWeight: 600,
                            '&:disabled': { opacity: 0.6, cursor: 'not-allowed' },
                        }}
                    >
                        {saving
                            ? <CircularProgress size={16} sx={{ color: C.textInverse }} />
                            : <SaveIcon fontSize="small" />}
                        {saving ? t('platformSettings.saving') : t('platformSettings.save')}
                    </Box>
                </Stack>
            </Stack>

            {errors.length > 0 && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    <Box component="ul" sx={{ m: 0, pl: 2 }}>
                        {errors.map((m, i) => <li key={i}>{m}</li>)}
                    </Box>
                </Alert>
            )}

            <Grid container spacing={3}>
                {/* Global Payment Gateways Toggle */}
                <Grid item xs={12}>
                    <Card sx={{ border: '2px solid', borderColor: form.payments_enabled ? 'success.main' : 'divider' }}>
                        <CardContent>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <PaymentIcon sx={{ color: form.payments_enabled ? 'success.main' : 'text.secondary', fontSize: 36 }} />
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                                        {t('platformSettings.paymentsTitle')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                        {t('platformSettings.paymentsDescription')}
                                    </Typography>
                                </Box>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={Boolean(form.payments_enabled)}
                                            onChange={handleChange('payments_enabled')}
                                            color="success"
                                            disabled={!isSuperAdmin || saving}
                                            size="large"
                                        />
                                    }
                                    label={
                                        <Typography variant="body1" sx={{ fontWeight: 700, color: form.payments_enabled ? 'success.main' : 'text.secondary' }}>
                                            {form.payments_enabled ? t('platformSettings.paymentsEnabled') : t('platformSettings.paymentsDisabled')}
                                        </Typography>
                                    }
                                    labelPlacement="start"
                                    sx={{ ml: 0, mr: 0 }}
                                />
                            </Stack>
                            {form.payments_enabled && (
                                <Alert severity="success" sx={{ mt: 2 }}>
                                    {t('platformSettings.paymentsEnabledAlert')}
                                </Alert>
                            )}
                            {!form.payments_enabled && (
                                <Alert severity="warning" sx={{ mt: 2 }}>
                                    {t('platformSettings.paymentsDisabledAlert')}
                                </Alert>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                                {t('platformSettings.regionCurrencyTitle')}
                            </Typography>

                            <TextField
                                select fullWidth label={t('platformSettings.countryLabel')}
                                value={form.country || ''}
                                onChange={handleChange('country')}
                                disabled={!isSuperAdmin}
                                helperText={t('platformSettings.countryHelper')}
                                sx={{ mb: 2 }}
                            >
                                {countryOptions.map((c) => (
                                    <MenuItem key={c.value} value={c.value}>
                                        {c.label}
                                    </MenuItem>
                                ))}
                            </TextField>

                            <TextField
                                select fullWidth label={t('platformSettings.currencyLabel')}
                                value={form.currency_code || ''}
                                onChange={handleChange('currency_code')}
                                disabled={!isSuperAdmin}
                                sx={{ mb: 2 }}
                            >
                                {currencyOptions.map((c) => (
                                    <MenuItem key={c.value} value={c.value}>
                                        {c.label}
                                    </MenuItem>
                                ))}
                            </TextField>

                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <TextField
                                        fullWidth label={t('platformSettings.symbolLabel')}
                                        value={form.currency_symbol}
                                        onChange={handleChange('currency_symbol')}
                                        disabled={!isSuperAdmin}
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">#</InputAdornment>
                                            ),
                                        }}
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField
                                        fullWidth label={t('platformSettings.localeLabel')}
                                        value={form.currency_locale}
                                        onChange={handleChange('currency_locale')}
                                        disabled={!isSuperAdmin}
                                        helperText={t('platformSettings.localeHelper')}
                                    />
                                </Grid>
                            </Grid>

                            <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: 'background.default' }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    {t('platformSettings.previewLabel')}
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                    {formatMoney(1234.5)}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    {t('platformSettings.previewHint')}
                                </Typography>
                            </Paper>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                                {t('platformSettings.timezoneBrandingTitle')}
                            </Typography>

                            <TextField
                                fullWidth label={t('platformSettings.defaultTimezoneLabel')}
                                value={form.default_timezone}
                                onChange={handleChange('default_timezone')}
                                disabled={!isSuperAdmin}
                                helperText={t('platformSettings.defaultTimezoneHelper')}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth label={t('platformSettings.orgNameLabel')}
                                value={form.org_name}
                                onChange={handleChange('org_name')}
                                disabled={!isSuperAdmin}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth label={t('platformSettings.orgEmailLabel')} type="email"
                                value={form.org_email}
                                onChange={handleChange('org_email')}
                                disabled={!isSuperAdmin}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth label={t('platformSettings.emailFromNameLabel')}
                                value={form.email_from_name}
                                onChange={handleChange('email_from_name')}
                                disabled={!isSuperAdmin}
                                helperText={t('platformSettings.emailFromNameHelper')}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth label={t('platformSettings.logoUrlLabel')}
                                value={form.org_logo_url}
                                onChange={handleChange('org_logo_url')}
                                disabled={!isSuperAdmin}
                                helperText={t('platformSettings.logoUrlHelper')}
                            />

                            {form.org_logo_url && (
                                <>
                                    <Divider sx={{ my: 2 }} />
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        {t('platformSettings.logoPreviewLabel')}
                                    </Typography>
                                    <Box
                                        component="img"
                                        src={form.org_logo_url}
                                        alt={t('platformSettings.logoAlt')}
                                        sx={{
                                            display: 'block', maxHeight: 64, maxWidth: 200,
                                            mt: 1, borderRadius: 1, border: `1px solid ${C.borderLight}`,
                                            p: 1, bgcolor: C.textInverse,
                                        }}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                </>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};

export default PlatformSettingsTab;