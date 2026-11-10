// frontend/src/pages/Events/components/EventVenuePlanEditor.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box, Alert, CircularProgress, Typography, Divider, TextField,
    Button, Chip, Stack, Tooltip,
} from '@mui/material';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Clear as ClearIcon,
    CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import SeatingCanvas from '../../../components/Seating/SeatingCanvas';
import venueMasterService from '../../../services/venueMasterService';
import eventVenuePlanService from '../../../services/eventVenuePlanService';
import { theme } from '../../../theme/tokens';

const C = theme.colors;
const EMPTY_NEW = { name: '', hex_color: '#4CAF50', price: 0 };

// ---------------------------------------------------------------------------
// Layout extraction helpers (unchanged — shared with Create.js)
// ---------------------------------------------------------------------------
export const parseMaybeJson = (value) => {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    try { return JSON.parse(trimmed); } catch { return null; }
};

const normalizeSeats = (layout) => {
    if (!layout) return [];
    let seats = parseMaybeJson(layout.seats);
    if (Array.isArray(seats)) return seats;
    if (seats && typeof seats === 'object') {
        return Object.entries(seats).map(([id, seat]) => (
            seat && typeof seat === 'object'
                ? { id: seat.id ?? id, ...seat }
                : { id, ...(seat || {}) }
        ));
    }
    return [];
};

const coerceLayout = (candidate) => {
    const parsed = parseMaybeJson(candidate);
    if (!parsed || typeof parsed !== 'object') return null;
    const directSeats = normalizeSeats(parsed);
    if (directSeats.length > 0) {
        return {
            canvas_width: parsed.canvas_width,
            canvas_height: parsed.canvas_height,
            background_image: parsed.background_image,
            seats: directSeats,
        };
    }
    const inner =
        parseMaybeJson(parsed.layout)
        || parseMaybeJson(parsed.layout_data)
        || parseMaybeJson(parsed.snapshot?.layout)
        || parseMaybeJson(parsed.snapshot?.layout_data)
        || parseMaybeJson(parsed.snapshot);
    if (inner && inner !== parsed) return coerceLayout(inner);
    return null;
};

export const extractLayoutFromMaster = (master) => {
    if (!master) return { layout: null, source: null };
    const parsedMaster = parseMaybeJson(master);
    if (!parsedMaster || typeof parsedMaster !== 'object') {
        return { layout: null, source: null };
    }
    const snapshot = parseMaybeJson(parsedMaster.snapshot);
    const candidates = [
        ['master.snapshot.layout', snapshot?.layout],
        ['master.snapshot.layout_data', snapshot?.layout_data],
        ['master.snapshot', snapshot],
        ['master.layout', parsedMaster.layout],
        ['master.layout_data', parsedMaster.layout_data],
        ['master', parsedMaster],
    ];
    for (const [source, candidate] of candidates) {
        const layout = coerceLayout(candidate);
        if (layout) return { layout, source };
    }
    return { layout: null, source: null };
};

export const extractLayoutFromPlan = (plan) => {
    if (!plan) return { layout: null, source: null };
    const published = parseMaybeJson(plan.published_snapshot);
    const candidates = [
        ['plan.published_snapshot.layout', published?.layout],
        ['plan.published_snapshot.layout_data', published?.layout_data],
        ['plan.published_snapshot', published],
        ['plan.layout', plan.layout],
        ['plan.layout_data', plan.layout_data],
    ];
    for (const [source, candidate] of candidates) {
        const layout = coerceLayout(candidate);
        if (layout) return { layout, source };
    }
    return { layout: null, source: null };
};

const resolveLayout = ({ plan, master }) => {
    const fromPlan = extractLayoutFromPlan(plan);
    if (fromPlan.layout) return fromPlan;
    const fromMaster = extractLayoutFromMaster(master);
    if (fromMaster.layout) return fromMaster;
    return { layout: null, source: null };
};

const resolveMasterId = ({ masterId, plan, existingPlan }) => {
    const candidates = [
        masterId,
        plan?.venue_master_id,
        plan?.venue_master?.id,
        typeof plan?.venue_master === 'number' || typeof plan?.venue_master === 'string'
            ? plan.venue_master : null,
        existingPlan?.venue_master_id,
        existingPlan?.venue_master?.id,
        typeof existingPlan?.venue_master === 'number' || typeof existingPlan?.venue_master === 'string'
            ? existingPlan.venue_master : null,
    ];
    for (const c of candidates) {
        if (c !== null && c !== undefined && c !== '' && typeof c !== 'object') return c;
    }
    return null;
};

const toKey = (id) => (id == null ? '' : String(id));

const resolveCategory = (rawValue, categories) => {
    if (rawValue == null || rawValue === '') return null;

    if (typeof rawValue === 'object') {
        const id = rawValue.id ?? rawValue.category_id ?? rawValue.categoryId;
        const name = rawValue.name ?? rawValue.category_name;
        if (id != null) {
            const byId = categories.find((c) => toKey(c.id) === toKey(id));
            if (byId) return byId;
        }
        if (name != null) {
            const byName = categories.find((c) => c.name === name);
            if (byName) return byName;
        }
        return null;
    }

    const byId = categories.find((c) => toKey(c.id) === toKey(rawValue));
    if (byId) return byId;
    const byName = categories.find((c) => c.name === rawValue);
    if (byName) return byName;
    return null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const EventVenuePlanEditor = ({
    eventId,
    masterId,
    existingPlan,
    onPlanChange,
    onAssignmentsChange,
}) => {
    const [loading, setLoading] = useState(true);
    const [masterSnapshot, setMasterSnapshot] = useState(null);
    const [plan, setPlan] = useState(existingPlan || null);

    const [draftCategories, setDraftCategories] = useState([]);
    const [draftAssignments, setDraftAssignments] = useState({});

    const [selectedCategoryId, setSelectedCategoryId] = useState(null);
    const [selectedSeatIds, setSelectedSeatIds] = useState([]);

    // ✅ Canvas revision — bumped whenever the *rendered seat colors* change,
    // so SeatingCanvas is forced to rebuild its scene from fresh layoutData.
    // This is what stops the "previous seat keeps showing selected color"
    // bug: every color change remounts the canvas with authoritative data.
    const [canvasRevision, setCanvasRevision] = useState(0);

    const [newCat, setNewCat] = useState(EMPTY_NEW);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [layoutDebug, setLayoutDebug] = useState({ source: null, seatCount: 0 });

    const onPlanChangeRef = useRef(onPlanChange);
    useEffect(() => { onPlanChangeRef.current = onPlanChange; }, [onPlanChange]);
    const onAssignmentsChangeRef = useRef(onAssignmentsChange);
    useEffect(() => { onAssignmentsChangeRef.current = onAssignmentsChange; }, [onAssignmentsChange]);

    // ---- Bootstrap ----
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');

        (async () => {
            try {
                const resolvedMasterId = resolveMasterId({ masterId, plan, existingPlan });
                let fetchedPlan = plan || existingPlan || null;

                if (eventId && !fetchedPlan) {
                    try { fetchedPlan = await eventVenuePlanService.get(eventId); }
                    catch { fetchedPlan = null; }
                    if (cancelled) return;
                    if (fetchedPlan) {
                        setPlan(fetchedPlan);
                        onPlanChangeRef.current?.(fetchedPlan);
                    }
                }

                let master = null;
                if (resolvedMasterId) {
                    try {
                        master = await venueMasterService.get(resolvedMasterId);
                        if (cancelled) return;
                        setMasterSnapshot(master?.snapshot ?? master ?? null);
                    } catch (err) {
                        console.warn('Could not load venue master:', err?.message);
                        if (!cancelled) setMasterSnapshot(null);
                    }
                }

                if (!eventId) {
                    const snapshot = master?.snapshot || master || null;
                    if (snapshot) {
                        const palette = snapshot.category_palette || [];
                        setDraftCategories(palette.map((p) => ({
                            name: p.name,
                            hex_color: p.hex_color || '#4CAF50',
                            price: p.default_price || 0,
                            source_palette_category_id: p.id,
                        })));
                        setDraftAssignments({});
                    } else if (fetchedPlan?.categories?.length) {
                        setDraftCategories(fetchedPlan.categories.map((c) => ({
                            name: c.name,
                            hex_color: c.hex_color || '#4CAF50',
                            price: Number(c.price) || 0,
                            source_palette_category_id: c.source_palette_category_id || '',
                        })));
                        setDraftAssignments({ ...(fetchedPlan.seat_assignments || {}) });
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err?.response?.data?.detail || err?.message || 'Failed to load venue plan.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId, masterId]);

    // ---- Categories view ----
    const categories = useMemo(() => {
        if (eventId && plan) {
            return (plan.categories || []).map((c) => ({
                id: c.id,
                name: c.name,
                hex_color: c.hex_color,
                price: Number(c.price),
            }));
        }
        return draftCategories.map((c) => ({
            id: c.name,
            name: c.name,
            hex_color: c.hex_color,
            price: Number(c.price),
        }));
    }, [eventId, plan, draftCategories]);

    const assignments = eventId && plan
        ? (plan.seat_assignments || {})
        : draftAssignments;

    const selectedCategory = categories.find(
        (c) => toKey(c.id) === toKey(selectedCategoryId),
    ) || null;

    // ---- Layout ----
    const { layout: resolvedLayout, source: layoutSource } = useMemo(
        () => resolveLayout({ plan, master: masterSnapshot }),
        [plan, masterSnapshot],
    );

    useEffect(() => {
        setLayoutDebug({
            source: layoutSource,
            seatCount: resolvedLayout?.seats?.length || 0,
        });
    }, [layoutSource, resolvedLayout]);

    const assignmentLookup = useMemo(() => {
        const map = new Map();
        Object.entries(assignments || {}).forEach(([k, v]) => {
            map.set(toKey(k), v);
        });
        return map;
    }, [assignments]);

    // ---- Build layoutData for SeatingCanvas ----
    const layoutData = useMemo(() => {
        if (!resolvedLayout) return null;
        const seats = (resolvedLayout.seats || []).map((s) => {
            const raw = assignmentLookup.get(toKey(s.id));
            const cat = resolveCategory(raw, categories);
            return {
                id: s.id,
                x_coord: s.x_coord,
                y_coord: s.y_coord,
                row_label: s.row_label,
                seat_number: s.seat_number,
                status: 'available',
                category_id: cat?.id ?? null,
                category_name: cat?.name,
                category_color: cat?.hex_color,
                category_price: cat?.price,
            };
        });
        return {
            canvas_width: resolvedLayout.canvas_width,
            canvas_height: resolvedLayout.canvas_height,
            background_image: resolvedLayout.background_image,
            seats,
        };
    }, [resolvedLayout, categories, assignmentLookup]);

    // ✅ Color-signature guard. Whenever the *rendered* seat colors change
    // (after any write, optimistic update, or fresh GET reconciliation),
    // bump canvasRevision so SeatingCanvas remounts and repaints every
    // seat — not just the ones whose selection state changed.
    const colorSignature = useMemo(() => {
        if (!layoutData?.seats) return '';
        return layoutData.seats
            .map((s) => `${s.id}:${s.category_id ?? ''}:${s.category_color ?? ''}`)
            .join('|');
    }, [layoutData]);

    useEffect(() => {
        setCanvasRevision((r) => r + 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [colorSignature]);

    // ---- Category create ----
    const handleAddCategory = async () => {
        const name = newCat.name.trim();
        if (!name) { setError('Category name is required.'); return; }
        if (categories.some((c) => c.name === name)) {
            setError('A category with this name already exists.');
            return;
        }
        setError('');
        setSaving(true);
        try {
            if (eventId) {
                const created = await eventVenuePlanService.createCategory(eventId, {
                    name,
                    hex_color: newCat.hex_color,
                    price: Number(newCat.price) || 0,
                });
                setPlan((prev) => prev ? {
                    ...prev,
                    categories: [...(prev.categories || []), created],
                } : prev);
                try {
                    const fresh = await eventVenuePlanService.get(eventId);
                    setPlan(fresh);
                    onPlanChangeRef.current?.(fresh);
                } catch { /* keep optimistic state */ }
                setSelectedCategoryId(created.id);
            } else {
                setDraftCategories((prev) => [...prev, {
                    name,
                    hex_color: newCat.hex_color,
                    price: Number(newCat.price) || 0,
                    source_palette_category_id: '',
                }]);
                setSelectedCategoryId(name);
            }
            setNewCat(EMPTY_NEW);
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to create category.');
        } finally {
            setSaving(false);
        }
    };

    // ---- Category delete ----
    const handleDeleteCategory = async (cat) => {
        setSaving(true);
        setError('');
        try {
            if (eventId) {
                await eventVenuePlanService.deleteCategory(eventId, cat.id);
                try {
                    const fresh = await eventVenuePlanService.get(eventId);
                    setPlan(fresh);
                    onPlanChangeRef.current?.(fresh);
                } catch {
                    setPlan((prev) => {
                        if (!prev) return prev;
                        const remaining = (prev.categories || []).filter(
                            (c) => toKey(c.id) !== toKey(cat.id),
                        );
                        const nextAssignments = {};
                        Object.entries(prev.seat_assignments || {}).forEach(([sid, raw]) => {
                            const resolved = resolveCategory(raw, remaining);
                            if (resolved) nextAssignments[sid] = raw;
                        });
                        return {
                            ...prev,
                            categories: remaining,
                            seat_assignments: nextAssignments,
                        };
                    });
                }
            } else {
                setDraftCategories((prev) => prev.filter((c) => c.name !== cat.name));
                setDraftAssignments((prev) => {
                    const next = { ...prev };
                    Object.keys(next).forEach((sid) => {
                        if (next[sid] === cat.name) delete next[sid];
                    });
                    return next;
                });
            }
            setSelectedCategoryId(null);
            setSelectedSeatIds([]);
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to delete category.');
        } finally {
            setSaving(false);
        }
    };

    // ---- Assign ----
    const handleAssignSelected = async () => {
        if (!selectedCategory) { setError('Select a category first.'); return; }
        if (selectedSeatIds.length === 0) { setError('Select one or more seats on the canvas first.'); return; }

        const seatsToAssign = [...selectedSeatIds];
        const categoryToAssign = selectedCategory;

        setSaving(true);
        setError('');
        try {
            if (eventId) {
                const resp = await eventVenuePlanService.bulkAssign(
                    eventId, categoryToAssign.id, seatsToAssign,
                );

                // ✅ Optimistic write — seat recolors immediately.
                setPlan((prev) => {
                    if (!prev) return prev;
                    const next = { ...(prev.seat_assignments || {}) };
                    seatsToAssign.forEach((sid) => {
                        next[toKey(sid)] = categoryToAssign.id;
                    });
                    return { ...prev, seat_assignments: next };
                });
                setSelectedSeatIds([]);

                // ✅ Reconcile: prefer the write response's assignments if
                // the backend returns them; otherwise GET and **merge**
                // (never clobber our just-written keys with an empty map).
                let reconciled = null;
                const fromWrite =
                    resp?.seat_assignments
                    ?? resp?.data?.seat_assignments
                    ?? null;
                if (fromWrite && typeof fromWrite === 'object') {
                    reconciled = fromWrite;
                } else {
                    try {
                        const fresh = await eventVenuePlanService.get(eventId);
                        const freshAssignments = fresh?.seat_assignments || {};
                        const merged = { ...(freshAssignments) };
                        seatsToAssign.forEach((sid) => {
                            const k = toKey(sid);
                            if (!(k in merged)) merged[k] = categoryToAssign.id;
                        });
                        reconciled = merged;
                        if (fresh) {
                            setPlan({ ...fresh, seat_assignments: merged });
                            onPlanChangeRef.current?.({
                                ...fresh, seat_assignments: merged,
                            });
                        }
                    } catch { /* keep optimistic state */ }
                }

                if (reconciled) {
                    onAssignmentsChangeRef.current?.(
                        reconciled, categories,
                    );
                }
            } else {
                const nextAssignments = { ...draftAssignments };
                seatsToAssign.forEach((sid) => {
                    nextAssignments[toKey(sid)] = categoryToAssign.name;
                });
                setDraftAssignments(nextAssignments);
                onAssignmentsChangeRef.current?.(nextAssignments, draftCategories);
                setSelectedSeatIds([]);
            }
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to assign seats.');
        } finally {
            setSaving(false);
        }
    };

    // ---- Clear selected seats ----
    const handleUnassignSelected = async () => {
        if (selectedSeatIds.length === 0) { setError('Select seats to clear first.'); return; }

        const seatsToClear = [...selectedSeatIds];
        setSaving(true);
        setError('');
        try {
            if (eventId) {
                await eventVenuePlanService.bulkUnassign(eventId, seatsToClear);
                setPlan((prev) => {
                    if (!prev) return prev;
                    const next = { ...(prev.seat_assignments || {}) };
                    seatsToClear.forEach((sid) => delete next[toKey(sid)]);
                    return { ...prev, seat_assignments: next };
                });
                setSelectedSeatIds([]);
                try {
                    const fresh = await eventVenuePlanService.get(eventId);
                    if (fresh) {
                        // Merge: keep backend truth, but our just-cleared
                        // keys must stay absent even if the GET is stale.
                        const merged = { ...(fresh.seat_assignments || {}) };
                        seatsToClear.forEach((sid) => delete merged[toKey(sid)]);
                        setPlan({ ...fresh, seat_assignments: merged });
                        onPlanChangeRef.current?.({
                            ...fresh, seat_assignments: merged,
                        });
                        onAssignmentsChangeRef.current?.(
                            merged, fresh.categories,
                        );
                    }
                } catch { /* keep optimistic state */ }
            } else {
                const nextAssignments = { ...draftAssignments };
                seatsToClear.forEach((sid) => delete nextAssignments[toKey(sid)]);
                setDraftAssignments(nextAssignments);
                onAssignmentsChangeRef.current?.(nextAssignments, draftCategories);
                setSelectedSeatIds([]);
            }
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to unassign seats.');
        } finally {
            setSaving(false);
        }
    };

    // ---- Clear ALL assignments ----
    const handleClearAllAssignments = async () => {
        const allAssignedSeatIds = (layoutData?.seats || [])
            .filter((s) => assignmentLookup.has(toKey(s.id)))
            .map((s) => s.id);
        if (allAssignedSeatIds.length === 0) return;

        setSaving(true);
        setError('');
        try {
            if (eventId) {
                await eventVenuePlanService.bulkUnassign(eventId, allAssignedSeatIds);
                setPlan((prev) => prev ? { ...prev, seat_assignments: {} } : prev);
                setSelectedSeatIds([]);
                try {
                    const fresh = await eventVenuePlanService.get(eventId);
                    if (fresh) {
                        setPlan({ ...fresh, seat_assignments: {} });
                        onPlanChangeRef.current?.({
                            ...fresh, seat_assignments: {},
                        });
                        onAssignmentsChangeRef.current?.({}, fresh.categories);
                    }
                } catch { /* keep optimistic state */ }
            } else {
                setDraftAssignments({});
                onAssignmentsChangeRef.current?.({}, draftCategories);
                setSelectedSeatIds([]);
            }
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to clear assignments.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error && !layoutData) return <Alert severity="error">{error}</Alert>;

    if (isFrozenPlan(eventId, plan)) {
        return (
            <Alert severity="info">
                This event has been published. Its venue plan is frozen and can no
                longer be edited here.
            </Alert>
        );
    }

    if (!layoutData) {
        return (
            <Alert severity="warning">
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                    This venue master has no seat layout.
                </Typography>
                <Typography variant="body2">
                    The venue is marked as reserved seating, but the master
                    snapshot contains no seats. Open the venue in{' '}
                    <strong>Venues → Layout</strong>, upload an SVG layout, and
                    re-open this event.
                </Typography>
                {layoutDebug.source && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: C.textMuted }}>
                        Diagnostic: resolved source = <code>{layoutDebug.source}</code>,
                        seats = {layoutDebug.seatCount}.
                    </Typography>
                )}
            </Alert>
        );
    }

    const assignedCount = assignmentLookup.size;
    const totalSeats = layoutData?.seats?.length || 0;

    return (
        <Box>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                Categories
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                {categories.map((c) => (
                    <Chip
                        key={c.id}
                        label={`${c.name} · ${Number(c.price).toFixed(2)}`}
                        onClick={() => setSelectedCategoryId(c.id)}
                        onDelete={() => handleDeleteCategory(c)}
                        deleteIcon={<DeleteIcon fontSize="small" />}
                        sx={{
                            bgcolor: toKey(selectedCategoryId) === toKey(c.id) ? c.hex_color : `${c.hex_color}22`,
                            color: toKey(selectedCategoryId) === toKey(c.id) ? '#fff' : C.textPrimary,
                            fontWeight: 600,
                            border: `1px solid ${c.hex_color}`,
                        }}
                    />
                ))}
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
                <TextField
                    size="small" label="New category name"
                    value={newCat.name}
                    onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                />
                <TextField
                    size="small" type="color" label="Colour"
                    value={newCat.hex_color}
                    onChange={(e) => setNewCat({ ...newCat, hex_color: e.target.value })}
                    sx={{ width: 100 }}
                />
                <TextField
                    size="small" type="number" label="Price"
                    value={newCat.price}
                    onChange={(e) => setNewCat({ ...newCat, price: e.target.value })}
                    inputProps={{ min: 0, step: '0.01' }}
                />
                <Button
                    startIcon={<AddIcon />}
                    variant="outlined"
                    onClick={handleAddCategory}
                    disabled={saving || !newCat.name.trim()}
                >
                    Add
                </Button>
            </Stack>

            <Divider sx={{ mb: 2 }} />

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Seat Assignment
                    {selectedCategory ? (
                        <Typography component="span" sx={{ ml: 1, color: C.textSecondary, fontWeight: 500 }}>
                            — assigning to <strong>{selectedCategory.name}</strong>
                        </Typography>
                    ) : (
                        <Typography component="span" sx={{ ml: 1, color: C.textMuted, fontWeight: 500 }}>
                            — select a category above, then click seats
                        </Typography>
                    )}
                </Typography>
                {selectedSeatIds.length > 0 && (
                    <Chip
                        size="small"
                        label={`${selectedSeatIds.length} selected`}
                        color="primary"
                        variant="outlined"
                    />
                )}
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                <Button
                    variant="contained"
                    size="small"
                    startIcon={<CheckCircleIcon />}
                    onClick={handleAssignSelected}
                    disabled={saving || !selectedCategory || selectedSeatIds.length === 0}
                    sx={{
                        bgcolor: selectedCategory?.hex_color || C.primary,
                        '&:hover': { bgcolor: selectedCategory?.hex_color || C.primary },
                    }}
                >
                    {saving ? 'Saving…' : `Assign to ${selectedCategory?.name || '…'}`}
                </Button>
                <Tooltip title="Remove the category assignment from the selected seats">
                    <span>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<ClearIcon />}
                            onClick={handleUnassignSelected}
                            disabled={saving || selectedSeatIds.length === 0}
                        >
                            Clear selected
                        </Button>
                    </span>
                </Tooltip>
                <Tooltip title="Remove ALL category assignments from every seat">
                    <span>
                        <Button
                            variant="outlined"
                            size="small"
                            color="error"
                            onClick={handleClearAllAssignments}
                            disabled={saving || assignedCount === 0}
                        >
                            Clear all assignments
                        </Button>
                    </span>
                </Tooltip>
            </Stack>

            <Box sx={{ height: 520, position: 'relative' }}>
                <SeatingCanvas
                    key={`seating-canvas-${canvasRevision}`}
                    layoutData={layoutData}
                    selectedSeatIds={selectedSeatIds}
                    onSelectSeats={(seats) => {
                        setSelectedSeatIds((seats || []).map((s) => s.id));
                    }}
                />
            </Box>

            <Stack direction="row" spacing={1} sx={{ mt: 2 }} alignItems="center">
                <Typography variant="caption" sx={{ color: C.textSecondary }}>
                    {assignedCount} of {totalSeats} seats assigned
                </Typography>
            </Stack>
        </Box>
    );
};

function isFrozenPlan(eventId, plan) {
    return Boolean(eventId && plan && (plan.is_frozen || plan.published_at));
}

export default EventVenuePlanEditor;