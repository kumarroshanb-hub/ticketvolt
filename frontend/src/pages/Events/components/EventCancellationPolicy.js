// frontend/src/pages/Events/components/EventCancellationPolicy.js
import React from 'react';
import {
    Grid, FormControl, InputLabel, Select, MenuItem, FormHelperText, Divider, Link,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { StyledTextField, SectionTitle } from './styled';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

export const EventCancellationPolicy = ({ formData, onChange, policies }) => (
    <>
        <Grid item xs={12}>
            <SectionTitle variant="h6">Cancellation Policy</SectionTitle>
            <Divider sx={{ borderColor: C.borderLight }} />
        </Grid>

        <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
                <InputLabel id="cancellation-policy-label">Refund Policy</InputLabel>
                <Select
                    labelId="cancellation-policy-label"
                    name="cancellation_policy_id"
                    value={formData.cancellation_policy_id || ''}
                    onChange={onChange}
                    label="Refund Policy"
                >
                    <MenuItem value="">
                        <em>No policy (no refunds offered)</em>
                    </MenuItem>
                    {policies.map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                            {p.name}
                            {p.is_default ? ' (default)' : ''}
                        </MenuItem>
                    ))}
                </Select>
                <FormHelperText>
                    Customers will be able to cancel under these rules.{' '}
                    <Link
                        component={RouterLink}
                        to="/app/cancellation-policies"
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ color: C.primary, fontWeight: 600 }}
                    >
                        Manage policies →
                    </Link>
                </FormHelperText>
            </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
            <StyledTextField
                fullWidth label="Additional Cancellation Notes"
                name="cancellation_policy_text"
                value={formData.cancellation_policy_text}
                onChange={onChange}
                multiline rows={2}
                helperText="Free-text terms. Does not affect refund calculations."
            />
        </Grid>
    </>
);