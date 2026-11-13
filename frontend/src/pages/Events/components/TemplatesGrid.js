// frontend/src/pages/Events/components/TemplatesGrid.js
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Grid, Box, Button, Alert, Typography, Divider, IconButton, Tooltip } from '@mui/material';
import { Upload as UploadIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { TemplateCard, SectionTitle } from './styled';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

// ✅ Added onDeleteTemplate to props
export const TemplatesGrid = ({ eventId, templates, templateTypes, onOpenUpload, onDeleteTemplate }) => {
    const { t } = useTranslation();

    const handleCardClick = (typeValue, disabled) => {
        if (disabled) {
            toast.warning(t('events.templateSaveFirstToast'));
            return;
        }
        onOpenUpload(typeValue);
    };

    return (
        <>
            <Grid item xs={12}>
                <SectionTitle variant="h6">{t('events.templatesTitle')}</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
                <Typography variant="body2" sx={{ color: C.textSecondary, mb: 2, mt: 1 }}>
                    {t('events.templatesHint')}
                </Typography>
                <Alert severity="info" sx={{ mt: 1, mb: 2 }}>
                    {t('events.ticketTemplateSpecs', 'Ticket template: 550 × 138 px (4:1), PNG or JPG, under 5 MB. Keep important text away from the edges.')}
                </Alert>
                {!eventId && (
                    <Alert severity="info" sx={{ mt: 1, mb: 2 }}>
                        💡 {t('events.templatesSaveFirst')}
                    </Alert>
                )}
            </Grid>

            <Grid item xs={12}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {templateTypes.map((type) => {
                        // ✅ FIX: Look up by type.value (slug) instead of type.label
                        const typeTemplates = templates[type.value]?.templates || [];
                        const defaultTemplate = typeTemplates.find((t) => t.is_default);
                        const hasTemplates = typeTemplates.length > 0;
                        const isDisabled = !eventId;

                        return (
                            <TemplateCard
                                key={type.value}
                                disabled={isDisabled}
                                sx={{
                                    flex: '1 1 200px', // Slightly wider to accommodate the list
                                    minWidth: 200,
                                    maxWidth: 250,
                                    p: 2,
                                    position: 'relative',
                                }}
                            >
                                <Box sx={{ textAlign: 'center', mb: hasTemplates ? 2 : 0 }}>
                                    <Typography variant="h2" sx={{ fontSize: 32 }}>
                                        {type.icon || '📄'}
                                    </Typography>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: C.textPrimary }}>
                                        {t(`templateType.${type.value}`, { defaultValue: type.label })}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: C.textSecondary, display: 'block' }}>
                                        {hasTemplates ? t('events.templateCount', { count: typeTemplates.length }) : t('events.templateNoTemplates')}
                                        {defaultTemplate && ' ⭐'}
                                    </Typography>
                                </Box>

                                {/* ✅ NEW: Display existing templates and delete buttons */}
                                {hasTemplates && (
                                    <Box sx={{ mt: 1, pt: 1, borderTop: `1px dashed ${C.borderLight}` }}>
                                        {typeTemplates.map((tpl) => (
                                            <Box 
                                                key={tpl.id} 
                                                sx={{ 
                                                    display: 'flex', 
                                                    justifyContent: 'space-between', 
                                                    alignItems: 'center', 
                                                    mb: 0.5 
                                                }}
                                            >
                                                <Typography 
                                                    variant="caption" 
                                                    title={tpl.name}
                                                    sx={{ 
                                                        color: C.textPrimary, 
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        maxWidth: '140px' 
                                                    }}
                                                >
                                                    {tpl.name} {tpl.is_default && '⭐'}
                                                </Typography>
                                                <Tooltip title={t('eventWizard.deleteTemplate')}>
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => onDeleteTemplate(tpl.id, tpl.name)}
                                                        sx={{ p: 0.5 }}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        ))}
                                    </Box>
                                )}

                                <Button
                                    size="small"
                                    variant="outlined"
                                    fullWidth
                                    startIcon={<UploadIcon />}
                                    disabled={isDisabled}
                                    sx={{ mt: 2 }}
                                    onClick={() => handleCardClick(type.value, isDisabled)}
                                >
                                    {hasTemplates ? t('events.templateAddMore') : t('events.templateUpload')}
                                </Button>
                            </TemplateCard>
                        );
                    })}
                </Box>
            </Grid>
        </>
    );
};