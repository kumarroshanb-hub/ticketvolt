import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, TextField } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { PageContainer, PageHeader, PageTitle, PageSubtitle } from '../../components/Common';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const ChangePassword = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [form, setForm] = useState({ current: '', next: '', confirm: '' });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        if (form.next !== form.confirm) {
            setMessage({ error: true, text: t('settings.passwordsMismatch') });
            return;
        }
        setSaving(true);
        setMessage(null);
        try {
            await api.put('/settings/password/', {
                current_password: form.current,
                new_password: form.next,
            });
            setForm({ current: '', next: '', confirm: '' });
            setMessage({ error: false, text: t('settings.passwordUpdated') });
        } catch (err) {
            setMessage({ error: true, text: err.response?.data?.detail || t('settings.passwordUpdateFailed') });
        } finally {
            setSaving(false);
        }
    };

    return (
        <PageContainer>
            <PageHeader>
                <div>
                    <PageTitle variant="h4">{t('profile.changePassword', 'Change password')}</PageTitle>
                    <PageSubtitle>{t('profile.changePasswordHint', 'Update the password used to sign in with email.')}</PageSubtitle>
                </div>
            </PageHeader>
            <Paper component="form" onSubmit={submit} sx={{ p: 3, maxWidth: 520, border: `1px solid ${C.borderLight}`, borderRadius: 2 }}>
                {message && <Alert severity={message.error ? 'error' : 'success'} sx={{ mb: 2 }}>{message.text}</Alert>}
                <TextField
                    fullWidth type="password" autoComplete="current-password"
                    label={t('settings.currentPasswordLabel')}
                    value={form.current}
                    onChange={(e) => setForm((prev) => ({ ...prev, current: e.target.value }))}
                    required sx={{ mb: 2 }}
                />
                <TextField
                    fullWidth type="password" autoComplete="new-password"
                    label={t('settings.newPasswordLabel')}
                    value={form.next}
                    onChange={(e) => setForm((prev) => ({ ...prev, next: e.target.value }))}
                    required sx={{ mb: 2 }}
                />
                <TextField
                    fullWidth type="password" autoComplete="new-password"
                    label={t('settings.confirmPasswordLabel')}
                    value={form.confirm}
                    onChange={(e) => setForm((prev) => ({ ...prev, confirm: e.target.value }))}
                    required sx={{ mb: 3 }}
                />
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Button type="submit" variant="contained" disabled={saving}>
                        {saving ? <CircularProgress size={20} /> : t('settings.updatePassword')}
                    </Button>
                    <Button onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
                </Box>
            </Paper>
        </PageContainer>
    );
};

export default ChangePassword;
