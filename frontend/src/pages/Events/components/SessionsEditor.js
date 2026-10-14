// frontend/src/pages/Events/components/SessionsEditor.js
import React from 'react';
import { Grid, Box, Button, Divider, IconButton, Typography } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { StyledTextField, SectionTitle, SessionPaper } from './styled';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

export const SessionsEditor = ({ sessions, onAdd, onRemove, onUpdate }) => (
    <>
        <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, flexWrap: 'wrap', gap: 1 }}>
                <SectionTitle variant="h6" sx={{ mb: 0 }}>Sessions</SectionTitle>
                <Button
                    startIcon={<AddIcon />} variant="outlined" onClick={onAdd} size="small"
                    sx={{
                        borderColor: C.borderLight, color: C.textSecondary,
                        '&:hover': {
                            borderColor: C.primary, color: C.primary,
                            backgroundColor: `${C.primary}0A`,
                        },
                    }}
                >
                    Add Session
                </Button>
            </Box>
            <Divider sx={{ mt: 1, borderColor: C.borderLight }} />
        </Grid>

        {sessions.map((session, index) => (
            <Grid item xs={12} key={index}>
                <SessionPaper>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle1" sx={{ color: C.textPrimary, fontWeight: 600 }}>
                            Session #{index + 1}
                        </Typography>
                        <IconButton size="small" onClick={() => onRemove(index)} sx={{ color: C.error }}>
                            <DeleteIcon />
                        </IconButton>
                    </Box>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12} sm={4}>
                            <StyledTextField
                                fullWidth label="Start Time" type="datetime-local"
                                value={session.start_time}
                                onChange={(e) => onUpdate(index, 'start_time', e.target.value)}
                                InputLabelProps={{ shrink: true }} size="small"
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <StyledTextField
                                fullWidth label="End Time" type="datetime-local"
                                value={session.end_time}
                                onChange={(e) => onUpdate(index, 'end_time', e.target.value)}
                                InputLabelProps={{ shrink: true }} size="small"
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <StyledTextField
                                fullWidth label="Capacity" type="number"
                                value={session.capacity}
                                onChange={(e) => onUpdate(index, 'capacity', parseInt(e.target.value, 10))}
                                size="small"
                            />
                        </Grid>
                    </Grid>
                </SessionPaper>
            </Grid>
        ))}
    </>
);