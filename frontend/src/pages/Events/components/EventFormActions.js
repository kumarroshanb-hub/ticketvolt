// frontend/src/pages/Events/components/EventFormActions.js
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Grid, Box, CircularProgress, useMediaQuery, useTheme } from '@mui/material';
import { PrimaryButton, OutlineButton } from '../../../components/Common';
import { theme as appTheme } from '../../../theme/tokens';

const C = appTheme.colors;

export const EventFormActions = ({ isEdit, submitting, onCancel }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    return (
        <Grid item xs={12}>
            <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 2, mt: 2 }}>
                <PrimaryButton
                    variant="contained"
                    type="submit"
                    disabled={submitting}
                    size="large"
                    sx={isMobile ? { width: '100%' } : undefined}
                >
                    {submitting ? (
                        <CircularProgress size={24} sx={{ color: C.textInverse }} />
                    ) : isEdit ? (
                        t('events.formActionsUpdate')
                    ) : (
                        t('events.formActionsCreate')
                    )}
                </PrimaryButton>
                <OutlineButton
                    variant="outlined"
                    onClick={onCancel}
                    sx={isMobile ? { width: '100%' } : undefined}
                >
                    {t('events.formActionsCancel')}
                </OutlineButton>
            </Box>
        </Grid>
    );
};