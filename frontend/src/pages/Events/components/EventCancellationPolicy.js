// frontend/src/pages/Events/components/EventCancellationPolicy.js
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Grid, FormControl, InputLabel, Select, MenuItem, FormHelperText, Divider, Link,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { StyledTextField, SectionTitle } from './styled';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

export const EventCancellationPolicy = ({ formData, onChange, policies }) => {
    const { t } = useTranslation();

    return (
    <>
        <Grid item xs={12}>
            <SectionTitle variant="h6">{t('events.cancellationPolicyTitle')}</SectionTitle>
            <Divider sx={{ borderColor: C.borderLight }} />
        </Grid>

        <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
                <InputLabel id="cancellation-policy-label">{t('events.refundPolicyLabel')}</InputLabel>
                <Select
                    labelId="cancellation-policy-label"
                    name="cancellation_policy_id"
                    value={formData.cancellation_policy_id || ''}
                    onChange={onChange}
                    label={t('events.refundPolicyLabel')}
                >
                    <MenuItem value="">
                        <em>{t('events.noPolicyOption')}</em>
                    </MenuItem>
                    {policies.map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                            {p.name}
                            {p.is_default ? t('eventWizard.defaultSuffix') : ''}
                        </MenuItem>
                    ))}
                </Select>
                <FormHelperText>
                    {t('events.cancellationPolicyHelper')}{' '}
                    <Link
                        component={RouterLink}
                        to="/app/cancellation-policies"
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ color: C.primary, fontWeight: 600 }}
                    >
                        {t('events.managePoliciesLink')}
                    </Link>
                </FormHelperText>
            </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
            <StyledTextField
                fullWidth label={t('events.cancellationNotesLabel')}
                name="cancellation_policy_text"
                value={formData.cancellation_policy_text}
                onChange={onChange}
                multiline rows={2}
                helperText={t('events.cancellationNotesHelper')}
            />
        </Grid>
    </>
    );
};
