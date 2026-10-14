// frontend/src/pages/Bookings/components/ConfirmActionDialog.js
import React from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Typography, CircularProgress,
} from '@mui/material';
import { PrimaryButton, OutlineButton } from '../../../components/Common';
import { theme as appTheme } from '../../../theme/tokens';

const C = appTheme.colors;

export const ConfirmActionDialog = ({ dialog, onConfirm, onClose, loading }) => (
    <Dialog
        open={dialog.open}
        onClose={onClose}
        PaperProps={{
            sx: {
                background: C.bgCard,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '16px',
                boxShadow: appTheme.shadows.modal,
            },
        }}
    >
        <DialogTitle sx={{ color: C.textPrimary }}>{dialog.title}</DialogTitle>
        <DialogContent>
            <Typography sx={{ color: C.textSecondary }}>{dialog.message}</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
            <OutlineButton onClick={onClose}>Cancel</OutlineButton>
            <PrimaryButton onClick={onConfirm} disabled={loading}>
                {loading ? <CircularProgress size={24} /> : 'Confirm'}
            </PrimaryButton>
        </DialogActions>
    </Dialog>
);