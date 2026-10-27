// frontend/src/pages/Events/components/EventSchedule.js
import React from 'react';
import {
    Grid, FormControl, InputLabel, Select, MenuItem, FormHelperText, Typography,
} from '@mui/material';
import { StyledTextField } from './styled';
import { getTimezoneLabel, getTimezoneGroups } from '../../../config/timezones';
import { EVENT_STATUS, EVENT_STATUS_LABELS } from '../../../constants';
import { useSettings } from '../../../context/SettingsContext';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

export const EventSchedule = ({ formData, onChange }) => {
    const { settings } = useSettings();

    // ✅ Platform-configured default timezone gets promoted to the top
    // of the list so the dropdown follows the deployment config.
    const timezoneGroups = getTimezoneGroups(settings?.default_timezone);

    return (
        <>
            <Grid item xs={12} sm={6}>
                <StyledTextField
                    fullWidth label="Start Date" name="start_date" type="datetime-local"
                    value={formData.start_date} onChange={onChange}
                    InputLabelProps={{ shrink: true }} required
                    helperText="Times are in your browser's local timezone"
                />
            </Grid>

            <Grid item xs={12} sm={6}>
                <StyledTextField
                    fullWidth label="End Date" name="end_date" type="datetime-local"
                    value={formData.end_date} onChange={onChange}
                    InputLabelProps={{ shrink: true }} required
                />
            </Grid>

            <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                    <InputLabel id="timezone-label">Timezone</InputLabel>
                    <Select
                        labelId="timezone-label" name="timezone"
                        // value is always seeded by useEventForm from
                        // settings.default_timezone (device → env → fallback).
                        value={formData.timezone || ''}
                        onChange={onChange}
                        label="Timezone"
                        MenuProps={{ PaperProps: { sx: { maxHeight: 400 } } }}
                        renderValue={(selected) => (
                            <Typography variant="body2" sx={{ color: C.textPrimary }}>
                                {getTimezoneLabel(selected) || 'Select timezone'}
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
                        Used for displaying event times correctly on all devices and in WhatsApp messages.
                    </FormHelperText>
                </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                    <InputLabel id="status-label">Status</InputLabel>
                    <Select
                        labelId="status-label" name="status"
                        value={formData.status} onChange={onChange} label="Status"
                    >
                        {Object.values(EVENT_STATUS).map((s) => (
                            <MenuItem key={s} value={s}>
                                {EVENT_STATUS_LABELS[s] || s}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Grid>
        </>
    );
};