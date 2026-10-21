// frontend/src/pages/Events/components/TemplatesGrid.js
import React from 'react';
import { Grid, Box, Button, Alert, Typography, Divider } from '@mui/material';
import { Upload as UploadIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { TemplateCard, SectionTitle } from './styled';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

export const TemplatesGrid = ({ eventId, templates, templateTypes, onOpenUpload }) => {
    const handleCardClick = (typeValue, disabled) => {
        if (disabled) {
            toast.warning('Please save the event first before adding templates');
            return;
        }
        onOpenUpload(typeValue);
    };

    return (
        <>
            <Grid item xs={12}>
                <SectionTitle variant="h6">Event Templates</SectionTitle>
                <Divider sx={{ borderColor: C.borderLight }} />
                <Typography variant="body2" sx={{ color: C.textSecondary, mb: 2, mt: 1 }}>
                    Upload templates for different purposes (Announcement, Ticket, Flyer, etc.)
                </Typography>
                {!eventId && (
                    <Alert severity="info" sx={{ mt: 1, mb: 2 }}>
                        💡 Save the event first to enable template uploads.
                    </Alert>
                )}
            </Grid>

            <Grid item xs={12}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {templateTypes.map((type) => {
                        const typeTemplates = templates[type.label] || [];
                        const defaultTemplate = typeTemplates.find((t) => t.is_default);
                        const hasTemplates = typeTemplates.length > 0;
                        const isDisabled = !eventId;

                        return (
                            <TemplateCard
                                key={type.value}
                                disabled={isDisabled}
                                sx={{
                                    flex: '1 1 150px',
                                    minWidth: 150,
                                    maxWidth: 200,
                                    p: 2,
                                    position: 'relative',
                                }}
                                onClick={() => handleCardClick(type.value, isDisabled)}
                            >
                                <Box sx={{ textAlign: 'center' }}>
                                    <Typography variant="h2" sx={{ fontSize: 32 }}>
                                        {type.icon || '📄'}
                                    </Typography>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: C.textPrimary }}>
                                        {type.label}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: C.textSecondary, display: 'block' }}>
                                        {hasTemplates ? `${typeTemplates.length} template(s)` : 'No templates'}
                                        {defaultTemplate && ' ⭐'}
                                    </Typography>
                                    {isDisabled ? (
                                        <Button size="small" variant="outlined" disabled sx={{ mt: 1, opacity: 0.5 }}>
                                            Save Event First
                                        </Button>
                                    ) : (
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<UploadIcon />}
                                            sx={{ mt: 1 }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onOpenUpload(type.value);
                                            }}
                                        >
                                            {hasTemplates ? 'Add More' : 'Upload'}
                                        </Button>
                                    )}
                                </Box>
                            </TemplateCard>
                        );
                    })}
                </Box>
            </Grid>
        </>
    );
};