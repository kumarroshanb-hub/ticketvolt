// frontend/src/pages/Events/components/TemplateUploadDialog.js
import React from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Box, FormControl, InputLabel, Select, MenuItem,
    TextField, FormControlLabel, Switch, Button, CircularProgress, Typography,
    useMediaQuery, useTheme,
} from '@mui/material';
import { Upload as UploadIcon } from '@mui/icons-material';
import { theme as appTheme } from '../../../theme/tokens';

const C = appTheme.colors;

export const TemplateUploadDialog = ({
    open, eventId, templateTypes, form, setForm, uploading, onClose, onUpload,
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    background: C.bgCard,
                    border: `1px solid ${C.borderLight}`,
                    borderRadius: '16px',
                    boxShadow: appTheme.shadows.modal,
                },
            }}
        >
            <DialogTitle sx={{ color: C.textPrimary, fontWeight: 700 }}>
                Upload Template
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mt: 2 }}>
                    <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>Template Type</InputLabel>
                        <Select
                            value={form.template_type_id}
                            onChange={(e) => setForm({ ...form, template_type_id: e.target.value })}
                            label="Template Type"
                        >
                            {templateTypes.map((type) => (
                                <MenuItem key={type.value} value={type.value}>
                                    {type.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <TextField
                        fullWidth label="Template Name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        sx={{ mb: 2 }}
                    />

                    <TextField
                        fullWidth label="Description"
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        multiline rows={2}
                        sx={{ mb: 2 }}
                    />

                    <Box
                        sx={{
                            border: `2px dashed ${C.borderLight}`,
                            borderRadius: 2,
                            p: isMobile ? 2 : 3,
                            textAlign: 'center',
                            cursor: 'pointer',
                            '&:hover': { borderColor: C.primary },
                        }}
                        onClick={() => document.getElementById('template-file-input').click()}
                    >
                        <input
                            id="template-file-input"
                            type="file"
                            accept="image/png,image/jpeg,image/jpg"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                if (e.target.files[0]) {
                                    setForm({ ...form, image: e.target.files[0] });
                                }
                            }}
                        />
                        {form.image ? (
                            <Box>
                                <img
                                    src={URL.createObjectURL(form.image)}
                                    alt="Preview"
                                    style={{ maxWidth: '100%', maxHeight: 150, objectFit: 'contain' }}
                                />
                                <Typography variant="caption" sx={{ color: C.textLight, display: 'block', mt: 1 }}>
                                    {form.image.name}
                                </Typography>
                            </Box>
                        ) : (
                            <>
                                <UploadIcon sx={{ fontSize: 40, color: C.textLight }} />
                                <Typography variant="body1" sx={{ color: C.textSecondary }}>
                                    Click to select template image
                                </Typography>
                                <Typography variant="caption" sx={{ color: C.textLight }}>
                                    PNG or JPG • Max 5MB
                                </Typography>
                            </>
                        )}
                    </Box>

                    <FormControlLabel
                        control={
                            <Switch
                                checked={form.is_default}
                                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                            />
                        }
                        label="Set as default template"
                        sx={{ mt: 2 }}
                    />
                </Box>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={onUpload}
                    disabled={uploading || !eventId}
                    startIcon={uploading ? <CircularProgress size={20} /> : <UploadIcon />}
                    sx={{
                        background: C.primary,
                        color: C.textInverse,
                        '&:hover': { background: C.primaryDark },
                        '&:disabled': { opacity: 0.5 },
                    }}
                >
                    {uploading ? 'Uploading...' : 'Upload'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};