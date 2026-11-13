// frontend/src/pages/Events/components/EventPublicDetails.js
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box, Button, Divider, FormControlLabel, Grid, IconButton,
    Switch, Typography, MenuItem, TextField,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { StyledTextField, SectionTitle } from './styled';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

const updateFaq = (formData, setFormData, index, field, value) => {
    const faqs = [...(formData.faqs || [])];
    faqs[index] = { ...faqs[index], [field]: value };
    setFormData((prev) => ({ ...prev, faqs }));
};

export const EventPublicDetails = ({ formData, onChange, setFormData }) => {
    const { t } = useTranslation();
    const faqs = formData.faqs || [];

    return (
        <Grid item xs={12}>
            <Grid container spacing={2.5}>
            <Grid item xs={12}>
                <SectionTitle variant="h6">{t('events.pageContent', 'Event page content')}</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
            </Grid>

            <Grid item xs={12} sm={6}>
                <StyledTextField
                    fullWidth
                    type="number"
                    label={t('events.checkinOpensLabel', 'Check-in opens (minutes before start)')}
                    name="checkin_opens_minutes_before"
                    value={formData.checkin_opens_minutes_before ?? 30}
                    onChange={onChange}
                    inputProps={{ min: 0, max: 1440, step: 5 }}
                    helperText={t('events.checkinOpensHelper', 'Choose how early attendees can check in. Check-in still closes 15 minutes after the event ends.')}
                />
            </Grid>

            <Grid item xs={12}>
                <FormControlLabel
                    control={<Switch checked={formData.show_bilingual_content === true} onChange={onChange} name="show_bilingual_content" />}
                    label={t('events.showBilingual', 'Show English and Chinese together on the event page')}
                />
                <Typography variant="caption" sx={{ display: 'block', color: C.textSecondary }}>
                    {t('events.autoTranslateHint', 'English content is translated and saved automatically when you save the event.')}
                </Typography>
            </Grid>

            <Grid item xs={12}>
                <SectionTitle variant="h6">{t('events.goodToKnow', 'Good to know')}</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
            </Grid>
            <Grid item xs={12} sm={3}>
                <StyledTextField fullWidth label={t('events.ageInfo', 'Age information')} name="age_info" value={formData.age_info || ''} onChange={onChange} />
            </Grid>
            <Grid item xs={12} sm={6}>
                <StyledTextField fullWidth multiline minRows={2} label={t('events.parkingInfo', 'Parking information')} name="parking_info" value={formData.parking_info || ''} onChange={onChange} />
            </Grid>
            <Grid item xs={12}>
                <StyledTextField fullWidth multiline minRows={2} label={t('events.accessibilityInfo', 'Accessibility information')} name="accessibility_info" value={formData.accessibility_info || ''} onChange={onChange} />
            </Grid>

            <Grid item xs={12}>
                <SectionTitle variant="h6">{t('events.faqs', 'Frequently asked questions')}</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
                <Typography variant="body2" sx={{ color: C.textSecondary, mt: 1, mb: 2 }}>
                    {t('events.faqHint', 'Add the questions your attendees will ask. Each question can have its own answer.')}
                </Typography>
            </Grid>

            {faqs.map((faq, index) => (
                <Grid item xs={12} key={index}>
                    <Box sx={{ p: 2, border: `1px solid ${C.borderLight}`, borderRadius: 2, bgcolor: C.bgPrimary }}>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={5}>
                                <StyledTextField fullWidth label={t('events.faqQuestion', 'Question')} value={faq.question || ''} onChange={(e) => updateFaq(formData, setFormData, index, 'question', e.target.value)} />
                            </Grid>
                            <Grid item xs={12} sm={5}>
                                <StyledTextField fullWidth label={t('events.faqAnswer', 'Answer')} value={faq.answer || ''} onChange={(e) => updateFaq(formData, setFormData, index, 'answer', e.target.value)} />
                            </Grid>
                            <Grid item xs={12} sm={2} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                <IconButton color="error" onClick={() => setFormData((prev) => ({ ...prev, faqs: (prev.faqs || []).filter((_, i) => i !== index) }))} aria-label={t('common.delete')}>
                                    <DeleteIcon />
                                </IconButton>
                            </Grid>
                        </Grid>
                    </Box>
                </Grid>
            ))}

            <Grid item xs={12}>
                <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setFormData((prev) => ({ ...prev, faqs: [...(prev.faqs || []), { question: '', answer: '' }] }))}>
                    {t('events.addFaq', 'Add question')}
                </Button>
            </Grid>

            <Grid item xs={12}>
                <SectionTitle variant="h6">{t('events.feedbackForm', 'Post-event feedback')}</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
                <Typography variant="body2" sx={{ color: C.textSecondary, mt: 1, mb: 2 }}>
                    {t('events.feedbackHint', 'Ask attendees for feedback after the event. You can email the form to everyone who checked in.')}
                </Typography>
                <FormControlLabel
                    control={<Switch checked={formData.feedback_enabled === true} onChange={onChange} name="feedback_enabled" />}
                    label={t('events.feedbackEnabled', 'Enable feedback form')}
                />
            </Grid>

            {formData.feedback_enabled && (
                <>
                    <Grid item xs={12} sm={6}>
                        <StyledTextField fullWidth label={t('events.feedbackTitle', 'Feedback form title')} name="feedback_title" value={formData.feedback_title || ''} onChange={onChange} />
                    </Grid>
                    <Grid item xs={12}>
                        <StyledTextField fullWidth multiline minRows={2} label={t('events.feedbackIntro', 'Intro text')} name="feedback_intro" value={formData.feedback_intro || ''} onChange={onChange} />
                    </Grid>
                    {(formData.feedback_questions || []).map((question, index) => (
                        <Grid item xs={12} key={question.id || index}>
                            <Box sx={{ p: 2, border: `1px solid ${C.borderLight}`, borderRadius: 2, bgcolor: C.bgPrimary }}>
                                <Grid container spacing={1.5}>
                                    <Grid item xs={12} sm={4}>
                                        <TextField fullWidth label={t('events.feedbackQuestion', 'Question')} value={question.label || ''} onChange={(e) => {
                                            const questions = [...(formData.feedback_questions || [])];
                                            questions[index] = { ...questions[index], label: e.target.value };
                                            setFormData((prev) => ({ ...prev, feedback_questions: questions }));
                                        }} />
                                    </Grid>
                                    <Grid item xs={12} sm={3}>
                                        <TextField select fullWidth label={t('events.feedbackType', 'Answer type')} value={question.type || 'rating'} onChange={(e) => {
                                            const questions = [...(formData.feedback_questions || [])];
                                            questions[index] = { ...questions[index], type: e.target.value };
                                            setFormData((prev) => ({ ...prev, feedback_questions: questions }));
                                        }}>
                                            <MenuItem value="rating">{t('events.feedbackRating', 'Rating (1–5)')}</MenuItem>
                                            <MenuItem value="text">{t('events.feedbackText', 'Text answer')}</MenuItem>
                                            <MenuItem value="select">{t('events.feedbackSelect', 'Multiple choice')}</MenuItem>
                                        </TextField>
                                    </Grid>
                                    <Grid item xs={12} sm={3}>
                                        <TextField fullWidth label={t('events.feedbackOptions', 'Options (comma-separated)')} value={(question.options || []).join(', ')} disabled={question.type !== 'select'} onChange={(e) => {
                                            const questions = [...(formData.feedback_questions || [])];
                                            questions[index] = { ...questions[index], options: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) };
                                            setFormData((prev) => ({ ...prev, feedback_questions: questions }));
                                        }} />
                                    </Grid>
                                    <Grid item xs={12} sm={1} sx={{ display: 'flex', alignItems: 'center' }}>
                                        <FormControlLabel control={<Switch checked={question.required === true} onChange={(e) => {
                                            const questions = [...(formData.feedback_questions || [])];
                                            questions[index] = { ...questions[index], required: e.target.checked };
                                            setFormData((prev) => ({ ...prev, feedback_questions: questions }));
                                        }} />} label={t('events.feedbackRequired', 'Required')} />
                                    </Grid>
                                    <Grid item xs={12} sm={1} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                        <IconButton color="error" onClick={() => setFormData((prev) => ({ ...prev, feedback_questions: (prev.feedback_questions || []).filter((_, i) => i !== index) }))}><DeleteIcon /></IconButton>
                                    </Grid>
                                </Grid>
                            </Box>
                        </Grid>
                    ))}
                    <Grid item xs={12}>
                        <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setFormData((prev) => ({
                            ...prev,
                            feedback_questions: [...(prev.feedback_questions || []), {
                                id: (window.crypto?.randomUUID?.() || `q-${Date.now()}`),
                                label: '', type: 'rating', required: false, options: [],
                            }],
                        }))}>
                            {t('events.addFeedbackQuestion', 'Add feedback question')}
                        </Button>
                    </Grid>
                </>
            )}

            <Grid item xs={12}>
                <SectionTitle variant="h6">{t('events.checkoutOptions', 'Checkout options')}</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
            </Grid>
            <Grid item xs={12} sm={6}>
                <FormControlLabel control={<Switch checked={formData.donations_enabled === true} onChange={onChange} name="donations_enabled" />} label={t('events.donationsEnabled')} />
            </Grid>
            <Grid item xs={12} sm={6}>
                <FormControlLabel control={<Switch checked={formData.marketing_opt_in_enabled === true} onChange={onChange} name="marketing_opt_in_enabled" />} label={t('events.marketingOptIn', 'Allow marketing opt-in')} />
            </Grid>
            <Grid item xs={12} sm={6}>
                <StyledTextField fullWidth label={t('events.donationPresets', 'Donation quick picks (comma-separated)')} value={(formData.donation_presets || []).join(', ')} onChange={(e) => setFormData((prev) => ({ ...prev, donation_presets: e.target.value.split(',').map((v) => Number(v.trim())).filter((v) => v > 0) }))} />
            </Grid>
            <Grid item xs={12}>
                <StyledTextField fullWidth multiline minRows={2} label={t('events.privacyNotice', 'Checkout privacy notice (PDPO)')} name="privacy_notice_text" value={formData.privacy_notice_text || ''} onChange={onChange} helperText={t('events.privacyNoticeHelper', 'Shown to buyers before they confirm; leave blank to hide.')} />
            </Grid>
            </Grid>
        </Grid>
    );
};
