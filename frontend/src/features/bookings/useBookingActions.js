// frontend/src/features/bookings/useBookingActions.js
import { useCallback, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import {
    BOOKING_ACTIONS,
    BULK_ACTION_LABELS,
} from './bookingActions';

const emptyDialog = {
    open: false,
    title: '',
    message: '',
    action: null,
    bookingId: null,
    bookingIds: [],
};

const extractError = (err) => {
    const data = err.response?.data;
    if (!data) return err.message || 'Action failed';
    if (data.error) return data.error;
    if (data.detail) return data.detail;
    if (data.message) return data.message;
    if (data.non_field_errors) return data.non_field_errors.join(', ');
    if (typeof data === 'object') {
        const key = Object.keys(data)[0];
        if (key && data[key]) {
            return `${key}: ${
                Array.isArray(data[key]) ? data[key][0] : data[key]
            }`;
        }
    }
    return 'Action failed';
};

export const useBookingActions = ({ onSuccess }) => {
    const [confirmDialog, setConfirmDialog] = useState(emptyDialog);
    const [actionLoading, setActionLoading] = useState(false);

    const closeDialog = useCallback(() => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
    }, []);

    /** Prompt a single-booking action. */
    const promptAction = useCallback((actionKey, bookingId) => {
        const config = BOOKING_ACTIONS[actionKey];
        if (!config) return;
        setConfirmDialog({
            open: true,
            title: config.confirmTitle,
            message: config.confirmMessage,
            action: actionKey,
            bookingId,
            bookingIds: [],
        });
    }, []);

    /** Prompt a bulk action. */
    const promptBulkAction = useCallback((bulkAction, selectedIds) => {
        if (!bulkAction || selectedIds.length === 0) {
            toast.warning('Please select bookings and an action');
            return;
        }
        setConfirmDialog({
            open: true,
            title: BULK_ACTION_LABELS[bulkAction] || 'Bulk Action',
            message: `This will apply "${BULK_ACTION_LABELS[bulkAction]}" to ${
                selectedIds.length
            } booking(s). Continue?`,
            action: 'bulk',
            bookingId: null,
            bookingIds: selectedIds,
            bulkAction,
        });
    }, []);

    const executeAction = useCallback(async () => {
        const { action, bookingId, bookingIds, bulkAction } = confirmDialog;
        setActionLoading(true);
        closeDialog();

        try {
            if (action === 'bulk') {
                const formattedIds = (Array.isArray(bookingIds) ? bookingIds : [bookingIds]).map(
                    String
                );
                const response = await api.post('/bookings/bulk_action/', {
                    action: bulkAction,
                    booking_ids: formattedIds,
                });
                handleBulkResponse(response.data, onSuccess);
                return;
            }

            const config = BOOKING_ACTIONS[action];
            if (!config) return;

            const response = await api.post(
                config.endpoint(bookingId),
                config.payload()
            );

            const data = response.data;
            if (data.status === 'success' || data.success !== false) {
                toast.success(data.message || data.status || 'Action completed successfully');
                if (data.email_sent !== undefined) {
                    if (data.email_sent) toast.info('📧 Notification email sent to customer');
                    else toast.warning('⚠️ Email notification could not be sent');
                }
                onSuccess?.();
            } else {
                toast.error(data.error || 'Action failed');
            }
        } catch (err) {
            toast.error(extractError(err));
        } finally {
            setActionLoading(false);
        }
    }, [confirmDialog, closeDialog, onSuccess]);

    return {
        confirmDialog,
        actionLoading,
        promptAction,
        promptBulkAction,
        executeAction,
        closeDialog,
    };
};

// ---------- Bulk response handler ----------
function handleBulkResponse(result, onSuccess) {
    if (result.status === 'completed') {
        const { summary, results, errors } = result;
        if (summary.successful > 0) {
            toast.success(
                `✅ ${summary.successful} of ${summary.total_processed} bookings processed successfully`
            );
        }
        results?.forEach((r) => {
            if (r.status === 'failed') {
                toast.warning(
                    `⚠️ ${r.reference}: ${r.result?.error || 'Unknown error'}`
                );
            }
        });
        errors?.forEach((e) => {
            toast.error(`❌ ${e.reference || 'Booking'}: ${e.error}`);
        });
        onSuccess?.();
        return;
    }

    if (result.status === 'validation_failed') {
        toast.error(
            `❌ ${result.invalid_bookings} booking(s) are not eligible for this action`
        );
        result.validation_results?.invalid?.forEach((inv) => {
            const msg = inv.errors.map((e) => e.message).join('; ');
            toast.warning(`⚠️ ${inv.reference}: ${msg}`);
        });
        return;
    }

    toast.error(result.error || 'Bulk action failed');
}