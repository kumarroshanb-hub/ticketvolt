// frontend/src/pages/Events/components/OrganizerSelector.js
import React from 'react';
import {
    Grid, FormControl, InputLabel, Select, MenuItem,
    FormHelperText, Chip, Box, Typography, Divider,
} from '@mui/material';
import { SectionTitle } from './styled';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

/**
 * Admin-only picker that lets an admin tag an event to a specific
 * organizer. Organizers never see this — the backend auto-links
 * their events to their own account.
 *
 * Value semantics:
 *   • ''            → "Myself (current admin user)"
 *   • '<uuid>'      → assign to that organizer
 */
export const OrganizerSelector = ({
    value,
    onChange,
    organizers,
    loading = false,
    currentUserName = '',
}) => (
    <>
        <Grid item xs={12}>
            <SectionTitle variant="h6">Organizer Assignment</SectionTitle>
            <Divider sx={{ borderColor: C.borderLight }} />
            <Typography variant="body2" sx={{ color: C.textSecondary, mt: 1 }}>
                Assign this event to an organizer. That organizer will own
                the event, its bookings, check-ins, and analytics from this
                point forward. Leaving it as "Myself" keeps the event under
                your own account.
            </Typography>
        </Grid>

        <Grid item xs={12} md={6}>
            <FormControl fullWidth>
                <InputLabel id="organizer-select-label">Assign to Organizer</InputLabel>
                <Select
                    labelId="organizer-select-label"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    label="Assign to Organizer"
                    disabled={loading}
                    MenuProps={{ PaperProps: { sx: { maxHeight: 400 } } }}
                >
                    <MenuItem value="">
                        <em>Myself{currentUserName ? ` (${currentUserName})` : ''}</em>
                    </MenuItem>
                    {organizers.map((org) => {
                        const displayName = org.name || org.username || 'Unnamed';
                        const roleLabel =
                            org.role === 'super_admin' ? 'Super Admin'
                            : org.role === 'admin' ? 'Admin'
                            : 'Organizer';
                        return (
                            <MenuItem key={org.id} value={org.id}>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        width: '100%',
                                    }}
                                >
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography
                                            variant="body2"
                                            sx={{ color: C.textPrimary, fontWeight: 500 }}
                                        >
                                            {displayName}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            sx={{ color: C.textSecondary, display: 'block' }}
                                        >
                                            {org.email}
                                        </Typography>
                                    </Box>
                                    <Chip
                                        size="small"
                                        label={roleLabel}
                                        sx={{ fontSize: '10px', height: '20px' }}
                                    />
                                </Box>
                            </MenuItem>
                        );
                    })}
                </Select>
                <FormHelperText>
                    Only administrators see this picker. Organizers are
                    automatically attached to the events they create.
                </FormHelperText>
            </FormControl>
        </Grid>
    </>
);