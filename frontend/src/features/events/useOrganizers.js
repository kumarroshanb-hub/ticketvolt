// frontend/src/features/events/useOrganizers.js
//
// Fetch the list of users who can own events (organizers + admins +
// superadmins). Used by the event form's "Assign to Organizer"
// picker. Only meaningful for admins — organizers never call this
// because their event is auto-linked to themselves by the backend.
import { useEffect, useState } from 'react';
import api from '../../services/api';

const pickResults = (res) => {
    const data = res?.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
};

export const useOrganizers = (enabled = true) => {
    const [organizers, setOrganizers] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setOrganizers([]);
            return undefined;
        }
        let cancelled = false;

        (async () => {
            setLoading(true);
            try {
                // The backend's `?role=organizer` filter already includes
                // staff users (they can own events), so a single request
                // is enough.
                const res = await api.get('/users/', {
                    params: { role: 'organizer' },
                });
                const merged = pickResults(res);

                // De-dup by id and sort by display name.
                const seen = new Set();
                const unique = merged
                    .filter((u) => {
                        if (!u?.id || seen.has(u.id)) return false;
                        seen.add(u.id);
                        return true;
                    })
                    .sort((a, b) => {
                        const an = (a.name || a.username || '').toLowerCase();
                        const bn = (b.name || b.username || '').toLowerCase();
                        return an.localeCompare(bn);
                    });

                if (!cancelled) setOrganizers(unique);
            } catch (err) {
                console.warn('Failed to load organizers:', err?.message);
                if (!cancelled) setOrganizers([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [enabled]);

    return { organizers, loading };
};