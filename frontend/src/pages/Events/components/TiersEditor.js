// frontend/src/pages/Events/components/TiersEditor.js
import React from 'react';
import { Grid, Box, Button, Divider, IconButton, Typography, Alert } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { StyledTextField, SectionTitle, TierPaper } from './styled';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

export const TiersEditor = ({
    tiers, 
    onAdd, 
    onRemove, 
    onUpdate, 
    label = 'Ticket Tiers',
    hideActions = false, // ✅ NEW PROP
}) => {
    // Lock the inputs if the event is Free Registration (hideActions) AND there are sold tickets.
    const isLocked = hideActions && tiers.some((t) => (t.quantity_sold || 0) > 0);

    return (
        <>
            <Grid item xs={12}>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mt: 2,
                        flexWrap: 'wrap',
                        gap: 1,
                    }}
                >
                    <SectionTitle variant="h6" sx={{ mb: 0 }}>{label}</SectionTitle>
                    
                    {/* Only show Add button if not hidden */}
                    {!hideActions && (
                        <Button
                            startIcon={<AddIcon />}
                            variant="outlined"
                            onClick={onAdd}
                            size="small"
                            sx={{
                                borderColor: C.borderLight,
                                color: C.textSecondary,
                                '&:hover': {
                                    borderColor: C.primary,
                                    color: C.primary,
                                    backgroundColor: `${C.primary}0A`,
                                },
                            }}
                        >
                            Add {label === 'Registration Fees' ? 'Fee' : 'Tier'}
                        </Button>
                    )}
                </Box>
                <Divider sx={{ mt: 1, borderColor: C.borderLight }} />
            </Grid>

            {/* Show an informational banner if locked */}
            {isLocked && (
                <Grid item xs={12}>
                    <Alert severity="info" sx={{ mt: 1 }}>
                        This event has issued tickets. To change or delete these tiers, you must first cancel all associated bookings.
                    </Alert>
                </Grid>
            )}

            {tiers.map((tier, index) => (
                <Grid item xs={12} key={tier.id || index}>
                    <TierPaper>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="subtitle1" sx={{ color: C.textPrimary, fontWeight: 600 }}>
                                {label === 'Registration Fees' ? 'Fee' : 'Tier'} #{index + 1}
                                {tier.quantity_sold > 0 && (
                                    <Typography component="span" variant="caption" sx={{ ml: 2, color: C.success }}>
                                        ({tier.quantity_sold} sold)
                                    </Typography>
                                )}
                            </Typography>
                            
                            {/* Only show delete button if not hidden */}
                            {!hideActions && (
                                <IconButton size="small" onClick={() => onRemove(index)} sx={{ color: C.error }}>
                                    <DeleteIcon />
                                </IconButton>
                            )}
                        </Box>
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12} sm={4}>
                                <StyledTextField
                                    fullWidth label="Name"
                                    value={tier.name}
                                    onChange={(e) => onUpdate(index, 'name', e.target.value)}
                                    size="small"
                                    disabled={isLocked}
                                />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <StyledTextField
                                    fullWidth label="Price (₹)" type="number"
                                    value={tier.price}
                                    onChange={(e) => onUpdate(index, 'price', parseFloat(e.target.value))}
                                    size="small"
                                    disabled={isLocked || hideActions} // Disable price if free registration
                                />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <StyledTextField
                                    fullWidth label="Quantity" type="number"
                                    value={tier.quantity_total}
                                    onChange={(e) => onUpdate(index, 'quantity_total', parseInt(e.target.value, 10))}
                                    size="small"
                                    disabled={isLocked}
                                />
                            </Grid>
                        </Grid>
                    </TierPaper>
                </Grid>
            ))}
        </>
    );
};