// frontend/src/pages/Events/components/EventTicketSettings.js
import React from 'react';
import {
    Grid, FormControl, FormLabel, RadioGroup, Radio,
    FormControlLabel, Switch, FormHelperText, Divider, Typography,
    useMediaQuery, useTheme,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { StyledTextField, SectionTitle } from './styled';
import { theme as appTheme } from '../../../theme/tokens';

const C = appTheme.colors;

export const EventTicketSettings = ({ formData, onChange }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    return (
        <>
            <Grid item xs={12}>
                <SectionTitle variant="h6">{t('events.visibility')}</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
            </Grid>

            <Grid item xs={12} md={6}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={formData.is_public !== false}
                            onChange={onChange}
                            name="is_public"
                            sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': { color: C.primary },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                    backgroundColor: C.primary,
                                },
                            }}
                        />
                    }
                    label={t('events.publicEvent')}
                    sx={{ color: C.textSecondary }}
                />
                <FormHelperText>
                    {t('events.publicEventHelper')}
                </FormHelperText>
            </Grid>

            <Grid item xs={12} md={6}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={formData.donations_enabled === true}
                            onChange={onChange}
                            name="donations_enabled"
                            sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': { color: C.primary },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                    backgroundColor: C.primary,
                                },
                            }}
                        />
                    }
                    label={t('events.donationsEnabled')}
                    sx={{ color: C.textSecondary }}
                />
                <FormHelperText>
                    {t('events.donationsHelper')}
                </FormHelperText>
            </Grid>

            <Grid item xs={12}>
                <SectionTitle variant="h6">{t('events.ticketSettingsTitle')}</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
            </Grid>

            <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                    <FormLabel sx={{ color: C.textPrimary, fontWeight: 600, mb: 1 }}>
                        {t('events.ticketFormatLabel')}
                    </FormLabel>
                    <RadioGroup
                        row={!isMobile}
                        name="ticket_format"
                        value={formData.ticket_format || 'pdf'}
                        onChange={onChange}
                    >
                        <FormControlLabel value="pdf" control={<Radio />} label={<Typography variant="body2">📄 {t('events.ticketFormatPdf')}</Typography>} />
                        <FormControlLabel value="png" control={<Radio />} label={<Typography variant="body2">🖼️ {t('events.ticketFormatPng')}</Typography>} />
                        <FormControlLabel value="both" control={<Radio />} label={<Typography variant="body2">📄➕🖼️ {t('events.ticketFormatBoth')}</Typography>} />
                    </RadioGroup>
                    <FormHelperText>{t('events.ticketFormatHelper')}</FormHelperText>
                </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={formData.combine_tickets || false}
                            onChange={onChange}
                            name="combine_tickets"
                            sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': { color: C.primary },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                    backgroundColor: C.primary,
                                },
                            }}
                        />
                    }
                    label={t('events.combineTicketsLabel')}
                    sx={{ color: C.textSecondary }}
                />
                <FormHelperText>
                    {t('events.combineTicketsHelper')}
                </FormHelperText>
            </Grid>

            <Grid item xs={12} md={6}>
                <StyledTextField
                    fullWidth label={t('events.ticketsPerPageLabel')}
                    name="tickets_per_page" type="number"
                    value={formData.tickets_per_page || 4}
                    onChange={onChange}
                    InputProps={{ inputProps: { min: 1, max: 10 } }}
                    helperText={t('events.ticketsPerPageHelper')}
                    disabled={!formData.combine_tickets}
                />
            </Grid>
        </>
    );
};