// frontend/src/pages/Events/components/EventSchedule.js
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Grid, FormControl, InputLabel, Select, MenuItem, FormHelperText, Typography,
} from '@mui/material';
import { StyledTextField } from './styled';
import { getTimezoneLabel, getTimezoneGroups } from '../../../config/timezones';
import { useSettings } from '../../../context/SettingsContext';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

export const EventSchedule = ({ formData, onChange }) => {
    const { t } = useTranslation();
    const { settings } = useSettings();

    // ✅ Platform-configured default timezone gets promoted to the top
    // of the list so the dropdown follows the deployment config.
    const timezoneGroups = getTimezoneGroups(settings?.default_timezone);

    return (
        <>
            <Grid item xs={12} sm={6}>
                <StyledTextField
                    fullWidth label={t('events.startDateLabel')} name="start_date" type="datetime-local"
                    value={formData.start_date} onChange={onChange}
                    InputLabelProps={{ shrink: true }} required
                    helperText={t('eventWizard.localTimezoneHelper')}
                />
            </Grid>

            <Grid item xs={12} sm={6}>
                <StyledTextField
                    fullWidth label={t('events.endDateLabel')} name="end_date" type="datetime-local"
                    value={formData.end_date} onChange={onChange}
                    InputLabelProps={{ shrink: true }} required
                />
            </Grid>

            <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                    <InputLabel id="timezone-label">{t('events.timezoneLabel')}</InputLabel>
                    <Select
                        labelId="timezone-label" name="timezone"
                        // value is always seeded by useEventForm from
                        // settings.default_timezone (device → env → fallback).
                        value={formData.timezone || ''}
                        onChange={onChange}
                        label={t('events.timezoneLabel')}
                        MenuProps={{ PaperProps: { sx: { maxHeight: 400 } } }}
                        renderValue={(selected) => (
                            <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                {getTimezoneLabel(selected) || t('eventWizard.selectTimezone')}
                            </Typography>
                        )}
                    >
                        {timezoneGroups.map((group) => [
                            <MenuItem
                                key={`header-${group.region}`}
                                disabled
                                sx={{
                                    fontWeight: 700, fontSize: '11px',
                                    textTransform: 'uppercase', color: C.primary,
                                    bgcolor: C.bgPrimary, opacity: '1 !important',
                                    borderTop: `1px solid ${C.borderLight}`,
                                }}
                            >
                                {group.region}
                            </MenuItem>,
                            ...group.timezones.map((tz) => (
                                <MenuItem key={tz.value} value={tz.value} sx={{ pl: 3 }}>
                                    {tz.label}
                                </MenuItem>
                            )),
                        ])}
                    </Select>
                    <FormHelperText>
                        {t('events.timezoneHelper')}
                    </FormHelperText>
                </FormControl>
            </Grid>

        </>
    );
};