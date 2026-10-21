// frontend/src/features/bookings/useBookingSelection.js
import { useCallback, useEffect, useState } from 'react';

export const useBookingSelection = (bookings) => {
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkAction, setBulkAction] = useState('');

    // Drop selections that are no longer present when the list changes.
    useEffect(() => {
        setSelectedIds((prev) => prev.filter((id) => bookings.some((b) => b.id === id)));
    }, [bookings]);

    const handleSelectAll = useCallback(
        (event) => {
            setSelectedIds(event.target.checked ? bookings.map((b) => b.id) : []);
        },
        [bookings]
    );

    const handleSelectOne = useCallback((event, id) => {
        setSelectedIds((prev) =>
            event.target.checked ? [...prev, id] : prev.filter((x) => x !== id)
        );
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedIds([]);
        setBulkAction('');
    }, []);

    return {
        selectedIds,
        bulkAction,
        setBulkAction,
        handleSelectAll,
        handleSelectOne,
        clearSelection,
    };
};