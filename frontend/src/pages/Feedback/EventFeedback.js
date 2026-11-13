import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    Alert, Box, Button, Card, CardContent, CircularProgress, MenuItem,
    Stack, TextField, Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import Logo from '../../components/Logo';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const EventFeedback = () => {
    const { token } = useParams();
    const { t } = useTranslation();
    const [form, setForm] = useState(null);
    const [answers, setAnswers] = useState({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    useEffect(() => {
        api.get(`/feedback/${token}/`)
            .then((res) => {
                setForm(res.data);
                setDone(Boolean(res.data.already_submitted));
            })
            .catch((err) => setError(err.response?.data?.error || err.message))
            .finally(() => setLoading(false));
    }, [token]);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        try {
            await api.post(`/feedback/${token}/`, { answers });
            setDone(true);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: C.bgPrimary }}><CircularProgress sx={{ color: C.secondary }} /></Box>;

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: C.bgPrimary, py: { xs: 2, md: 6 }, px: 2 }}>
            <Box sx={{ maxWidth: 680, mx: 'auto' }}>
                <Box sx={{ mb: 3 }}><Logo height={44} /></Box>
                <Card sx={{ borderRadius: 3, border: `1px solid ${C.borderLight}`, boxShadow: '0 18px 44px rgba(51,51,51,.08)' }}>
                    <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        {!form ? null : done ? (
                            <Box sx={{ textAlign: 'center', py: 4 }}>
                                <Typography variant="h4" sx={{ fontWeight: 800 }}>{t('feedback.thankYou', 'Thank you for your feedback')}</Typography>
                                <Typography sx={{ color: C.textSecondary, mt: 1 }}>
                                    {t('feedback.thankYouBody', 'Your response has been shared with the organizer.')}
                                </Typography>
                            </Box>
                        ) : (
                            <form onSubmit={submit}>
                                <Typography variant="overline" sx={{ color: C.secondary, fontWeight: 800 }}>{form.event_title}</Typography>
                                <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5 }}>{form.title || t('feedback.title', 'Share your feedback')}</Typography>
                                {form.intro && <Typography sx={{ color: C.textSecondary, mt: 1.5, mb: 3, whiteSpace: 'pre-line' }}>{form.intro}</Typography>}
                                <Stack spacing={3} sx={{ mt: 3 }}>
                                    {(form.questions || []).map((q) => (
                                        <Box key={q.id}>
                                            <Typography sx={{ fontWeight: 700, mb: 1 }}>
                                                {q.label}{q.required ? ' *' : ''}
                                            </Typography>
                                            {q.type === 'rating' && (
                                                <Stack direction="row" spacing={1}>
                                                    {[1, 2, 3, 4, 5].map((value) => (
                                                        <Button
                                                            key={value}
                                                            type="button"
                                                            variant={Number(answers[q.id]) === value ? 'contained' : 'outlined'}
                                                            onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
                                                            sx={{ minWidth: 44, color: Number(answers[q.id]) === value ? '#fff' : C.textPrimary }}
                                                        >
                                                            {value}
                                                        </Button>
                                                    ))}
                                                </Stack>
                                            )}
                                            {q.type === 'text' && (
                                                <TextField
                                                    fullWidth multiline minRows={3}
                                                    value={answers[q.id] || ''}
                                                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                                                />
                                            )}
                                            {q.type === 'select' && (
                                                <TextField
                                                    select fullWidth
                                                    value={answers[q.id] || ''}
                                                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                                                >
                                                    {(q.options || []).map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
                                                </TextField>
                                            )}
                                        </Box>
                                    ))}
                                </Stack>
                                <Button type="submit" variant="contained" color="secondary" size="large" disabled={submitting} sx={{ mt: 4, minHeight: 50 }}>
                                    {submitting ? t('common.loading') : t('feedback.submit', 'Submit feedback')}
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </Box>
        </Box>
    );
};

export default EventFeedback;
