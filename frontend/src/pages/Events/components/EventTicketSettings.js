// frontend/src/pages/Events/components/EventTicketSettings.js
import React from 'react';
import {
    Grid, FormControl, FormLabel, RadioGroup, Radio,
    FormControlLabel, Switch, FormHelperText, Divider, Typography,
    useMediaQuery, useTheme,
} from '@mui/material';
import { StyledTextField, SectionTitle } from './styled';
import { theme as appTheme } from '../../../theme/tokens';

const C = appTheme.colors;

export const EventTicketSettings = ({ formData, onChange }) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    return (
        <>
            <Grid item xs={12}>
                <SectionTitle variant="h6">Ticket Settings</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
            </Grid>

            <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                    <FormLabel sx={{ color: C.textPrimary, fontWeight: 600, mb: 1 }}>
                        Ticket Format
                    </FormLabel>
                    <RadioGroup
                        row={!isMobile}
                        name="ticket_format"
                        value={formData.ticket_format || 'pdf'}
                        onChange={onChange}
                    >
                        <FormControlLabel value="pdf" control={<Radio />} label={<Typography variant="body2">📄 PDF</Typography>} />
                        <FormControlLabel value="png" control={<Radio />} label={<Typography variant="body2">🖼️ PNG</Typography>} />
                        <FormControlLabel value="both" control={<Radio />} label={<Typography variant="body2">📄➕🖼️ Both</Typography>} />
                    </RadioGroup>
                    <FormHelperText>Choose the format for ticket delivery to customers</FormHelperText>
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
                    label="Combine tickets into single file"
                    sx={{ color: C.textSecondary }}
                />
                <FormHelperText>
                    Combine all tickets into one file instead of individual files
                </FormHelperText>
            </Grid>

            <Grid item xs={12} md={6}>
                <StyledTextField
                    fullWidth label="Tickets Per Page"
                    name="tickets_per_page" type="number"
                    value={formData.tickets_per_page || 4}
                    onChange={onChange}
                    InputProps={{ inputProps: { min: 1, max: 10 } }}
                    helperText="Number of tickets to show per page (for combined tickets)"
                    disabled={!formData.combine_tickets}
                />
            </Grid>
        </>
    );
};