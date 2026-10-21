// frontend/src/pages/Events/components/TiersEditor.js
import React from 'react';
import { Grid, Box, Button, Divider, IconButton, Typography } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { StyledTextField, SectionTitle, TierPaper } from './styled';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

export const TiersEditor = ({
    tiers, onAdd, onRemove, onUpdate, label = 'Ticket Tiers',
}) => (
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
            </Box>
            <Divider sx={{ mt: 1, borderColor: C.borderLight }} />
        </Grid>

        {tiers.map((tier, index) => (
            <Grid item xs={12} key={index}>
                <TierPaper>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle1" sx={{ color: C.textPrimary, fontWeight: 600 }}>
                            {label === 'Registration Fees' ? 'Fee' : 'Tier'} #{index + 1}
                        </Typography>
                        <IconButton size="small" onClick={() => onRemove(index)} sx={{ color: C.error }}>
                            <DeleteIcon />
                        </IconButton>
                    </Box>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12} sm={4}>
                            <StyledTextField
                                fullWidth label="Name"
                                value={tier.name}
                                onChange={(e) => onUpdate(index, 'name', e.target.value)}
                                size="small"
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <StyledTextField
                                fullWidth label="Price (₹)" type="number"
                                value={tier.price}
                                onChange={(e) => onUpdate(index, 'price', parseFloat(e.target.value))}
                                size="small"
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <StyledTextField
                                fullWidth label="Quantity" type="number"
                                value={tier.quantity_total}
                                onChange={(e) => onUpdate(index, 'quantity_total', parseInt(e.target.value, 10))}
                                size="small"
                            />
                        </Grid>
                    </Grid>
                </TierPaper>
            </Grid>
        ))}
    </>
);