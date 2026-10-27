// frontend/src/pages/Settings/PlatformSettingsTab.js
import React, { useEffect, useMemo, useState } from 'react';
import {
    Box, Grid, Card, CardContent, Typography, TextField,
    MenuItem, Divider, Alert, CircularProgress, Paper,
    Stack, InputAdornment,
} from '@mui/material';
import { Save as SaveIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../constants';

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
};

const PlatformSettingsTab = () => {
    const { formatMoney, refresh } = useSettings();
    const { user } = useAuth();
    const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;

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
            toast.error(err.response?.data?.detail || 'Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

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
        const value = e.target.value;
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
            toast.error('Only a super admin can change platform settings.');
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
            };
            
            const { data } = await api.patch('/settings/', payload);
            toast.success('Platform settings saved');
            
            // ✅ Force global context refresh so ALL pages re-render with new currency
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
                    : ['Failed to save settings'];
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
                    Platform settings are managed by a super admin. You can view them but not modify them.
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
                        Platform Settings
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Currency, region, and branding defaults. Applies to every user.
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                    <Box
                        component="button"
                        type="button"
                        onClick={load}
                        disabled={saving}
                        sx={{
                            px: 2, py: 1, border: '1px solid #e2e8f0', borderRadius: 2,
                            background: '#fff', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', gap: 1, fontSize: 14,
                            '&:hover': { borderColor: '#94a3b8' },
                            '&:disabled': { opacity: 0.6, cursor: 'not-allowed' },
                        }}
                    >
                        <RefreshIcon fontSize="small" /> Reload
                    </Box>
                    <Box
                        component="button"
                        type="button"
                        onClick={handleSubmit}
                        disabled={saving || !isSuperAdmin}
                        sx={{
                            px: 2, py: 1, border: 'none', borderRadius: 2,
                            background: 'linear-gradient(135deg,#0f172a 0%,#334155 100%)',
                            color: '#fff',
                            cursor: saving || !isSuperAdmin ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 1,
                            fontSize: 14, fontWeight: 600,
                            '&:disabled': { opacity: 0.6, cursor: 'not-allowed' },
                        }}
                    >
                        {saving
                            ? <CircularProgress size={16} sx={{ color: '#fff' }} />
                            : <SaveIcon fontSize="small" />}
                        {saving ? 'Saving…' : 'Save Settings'}
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
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                                Region &amp; Currency
                            </Typography>

                            <TextField
                                select fullWidth label="Country"
                                value={form.country || ''}
                                onChange={handleChange('country')}
                                disabled={!isSuperAdmin}
                                helperText="Changing the country auto-syncs currency and timezone."
                                sx={{ mb: 2 }}
                            >
                                {countryOptions.map((c) => (
                                    <MenuItem key={c.value} value={c.value}>
                                        {c.label}
                                    </MenuItem>
                                ))}
                            </TextField>

                            <TextField
                                select fullWidth label="Currency"
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
                                        fullWidth label="Symbol"
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
                                        fullWidth label="Locale"
                                        value={form.currency_locale}
                                        onChange={handleChange('currency_locale')}
                                        disabled={!isSuperAdmin}
                                        helperText="e.g. en-HK"
                                    />
                                </Grid>
                            </Grid>

                            <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: 'background.default' }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    Preview
                                </Typography>
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                    {formatMoney(1234.5)}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    How a price renders on events, tickets and refunds.
                                </Typography>
                            </Paper>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                                Timezone &amp; Branding
                            </Typography>

                            <TextField
                                fullWidth label="Default timezone"
                                value={form.default_timezone}
                                onChange={handleChange('default_timezone')}
                                disabled={!isSuperAdmin}
                                helperText="IANA timezone, e.g. Asia/Hong_Kong"
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth label="Organisation name"
                                value={form.org_name}
                                onChange={handleChange('org_name')}
                                disabled={!isSuperAdmin}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth label="Organisation email" type="email"
                                value={form.org_email}
                                onChange={handleChange('org_email')}
                                disabled={!isSuperAdmin}
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth label="Email 'from' name"
                                value={form.email_from_name}
                                onChange={handleChange('email_from_name')}
                                disabled={!isSuperAdmin}
                                helperText="Displayed as the sender name on outgoing emails."
                                sx={{ mb: 2 }}
                            />
                            <TextField
                                fullWidth label="Logo URL"
                                value={form.org_logo_url}
                                onChange={handleChange('org_logo_url')}
                                disabled={!isSuperAdmin}
                                helperText="Used in emails and PDFs. Must be a public URL."
                            />

                            {form.org_logo_url && (
                                <>
                                    <Divider sx={{ my: 2 }} />
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        Logo preview
                                    </Typography>
                                    <Box
                                        component="img"
                                        src={form.org_logo_url}
                                        alt="Organisation logo"
                                        sx={{
                                            display: 'block', maxHeight: 64, maxWidth: 200,
                                            mt: 1, borderRadius: 1, border: '1px solid #e2e8f0',
                                            p: 1, bgcolor: '#fff',
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