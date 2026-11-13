// frontend/src/pages/Events/components/VenueMasterPicker.js
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box, Card, CardContent, Typography, TextField, InputAdornment,
    Chip, CircularProgress, Grid, Alert, Button,
} from '@mui/material';
import { Search as SearchIcon, Chair as SeatIcon, Add as AddIcon } from '@mui/icons-material';
import venueMasterService from '../../../services/venueMasterService';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

export const VenueMasterPicker = ({ value, onSelect, onCreateVenue }) => {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            setLoading(true);
            // ✅ `listLatest` dedupes to one row per venue (latest version).
            // The catalog is cross-tenant on purpose: a tenant can reuse
            // another tenant's venue instead of recreating it.
            venueMasterService.listLatest({ search })
                .then((list) => {
                    if (!cancelled) setItems(Array.isArray(list) ? list : []);
                })
                .catch(() => { if (!cancelled) setItems([]); })
                .finally(() => { if (!cancelled) setLoading(false); });
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [search]);

    return (
        <Box>
            <TextField
                fullWidth
                size="small"
                placeholder={t('eventWizard.searchVenuePlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon sx={{ color: C.textMuted }} />
                        </InputAdornment>
                    ),
                }}
                sx={{ mb: 2 }}
            />

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : items.length === 0 ? (
                <Alert
                    severity="info"
                    action={
                        onCreateVenue ? (
                            <Button
                                color="inherit"
                                size="small"
                                startIcon={<AddIcon />}
                                onClick={onCreateVenue}
                            >
                                {t('venues.createButton')}
                            </Button>
                        ) : null
                    }
                >
                    {t('eventWizard.noVenuesInCatalog')}
                </Alert>
            ) : (
                <Grid container spacing={1.5}>
                    {items.map((m) => {
                        const selected = value?.id === m.id;
                        return (
                            <Grid item xs={12} sm={6} key={m.id}>
                                <Card
                                    onClick={() => onSelect(m)}
                                    sx={{
                                        cursor: 'pointer',
                                        border: selected
                                            ? `2px solid ${C.primary}`
                                            : `1px solid ${C.borderLight}`,
                                        transition: 'all 0.15s ease',
                                        '&:hover': { borderColor: C.primary },
                                    }}
                                >
                                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                                {m.name}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: C.textMuted }}>
                                                v{m.version}
                                            </Typography>
                                        </Box>
                                        <Typography variant="caption" sx={{ color: C.textSecondary, display: 'block', mt: 0.5 }}>
                                            {[m.city, m.country].filter(Boolean).join(', ')}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                                            {m.has_reserved_seating && (
                                                <Chip size="small" icon={<SeatIcon />} label={t('eventWizard.reservedShort')} variant="outlined" />
                                            )}
                                            <Chip size="small" label={t('venues.seatCount', { count: m.seat_count || 0 })} variant="outlined" />
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
            )}
        </Box>
    );
};