// frontend/src/pages/Events/components/EventFlowSelector.js
import React from 'react';
import {
    Grid, FormControl, FormLabel, RadioGroup,
    FormControlLabel, Radio, Typography, Box, Divider,
} from '@mui/material';
import { SectionTitle } from './styled';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

const FLOWS = [
    {
        value: 'ticketed',
        icon: '🎫',
        title: 'Ticketed Event',
        description: 'Concerts, shows, conferences. Per-seat pricing, individual tickets.',
    },
    {
        value: 'free_registration',
        icon: '📝',
        title: 'Free Registration',
        description: 'Medical camps, RSVPs, free workshops. No payment, one pass per person.',
    },
    {
        value: 'paid_registration',
        icon: '💳',
        title: 'Paid Registration',
        description: 'Paid workshops, masterclasses. Flat fee, one pass per booking.',
    },
];

export const EventFlowSelector = ({ value, onChange }) => (
    <>
        <Grid item xs={12}>
            <SectionTitle variant="h6">Event Type</SectionTitle>
            <Divider sx={{ borderColor: C.borderLight }} />
            <Typography variant="body2" sx={{ color: C.textSecondary, mt: 1 }}>
                This determines how attendees pay and receive their pass.
                It cannot be changed after bookings exist.
            </Typography>
        </Grid>

        <Grid item xs={12}>
            <FormControl component="fieldset" fullWidth>
                <RadioGroup
                    value={value || 'ticketed'}
                    onChange={(e) => onChange(e.target.value)}
                >
                    <Grid container spacing={2}>
                        {FLOWS.map((flow) => (
                            <Grid item xs={12} md={4} key={flow.value}>
                                <Box
                                    sx={{
                                        p: 2,
                                        border: value === flow.value
                                            ? `2px solid ${C.primary}`
                                            : `1px solid ${C.borderLight}`,
                                        borderRadius: 2,
                                        cursor: 'pointer',
                                        height: '100%',
                                        transition: 'all 0.15s ease',
                                        '&:hover': {
                                            borderColor: C.primary,
                                            bgcolor: C.bgPrimary,
                                        },
                                    }}
                                    onClick={() => onChange(flow.value)}
                                >
                                    <FormControlLabel
                                        value={flow.value}
                                        control={<Radio />}
                                        label={
                                            <Box>
                                                <Typography
                                                    variant="subtitle2"
                                                    sx={{ fontWeight: 700 }}
                                                >
                                                    {flow.icon} {flow.title}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color: C.textSecondary,
                                                        display: 'block',
                                                        mt: 0.5,
                                                    }}
                                                >
                                                    {flow.description}
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                </Box>
                            </Grid>
                        ))}
                    </Grid>
                </RadioGroup>
            </FormControl>
        </Grid>
    </>
);