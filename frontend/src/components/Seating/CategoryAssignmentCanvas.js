// frontend/src/components/Seating/CategoryAssignmentCanvas.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Konva from 'konva';
import { Box, Typography, Paper, Button, Chip, Stack, IconButton, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Palette as PaletteIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';

const SEAT_SIZE = 16;
const MIN_SCALE = 0.15;
const MAX_SCALE = 6;

const CategoryAssignmentCanvas = ({ venueId, layoutData, onCategoryChange }) => {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const layerRef = useRef(null);
  const nodesRef = useRef(new Map());
  const seatsRef = useRef([]);
  
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', hex_color: '#4CAF50', price: 0 });
  const [size, setSize] = useState({ width: 800, height: 500 });

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api.get(`/venues/${venueId}/categories/`);
        setCategories(res.data);
      } catch (err) {
        console.error('Failed to load categories', err);
      }
    };
    if (venueId) fetchCategories();
  }, [venueId]);

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setSize({ width: Math.floor(w), height: 500 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build Konva stage
  useEffect(() => {
    if (!containerRef.current || !layoutData?.seats?.length) return;

    const stage = new Konva.Stage({
      container: containerRef.current,
      width: size.width,
      height: size.height,
      draggable: true,
    });
    const layer = new Konva.Layer();
    stage.add(layer);
    stageRef.current = stage;
    layerRef.current = layer;
    nodesRef.current.clear();
    seatsRef.current = layoutData.seats;

    layoutData.seats.forEach((seat) => {
      const rect = new Konva.Rect({
        x: seat.x_coord,
        y: seat.y_coord,
        width: SEAT_SIZE,
        height: SEAT_SIZE,
        cornerRadius: 3,
        fill: seat.category_color || '#4CAF50',
        stroke: 'transparent',
        strokeWidth: 0,
      });

      rect.on('click tap', () => {
        setSelectedSeatIds((prev) => {
          if (prev.includes(seat.id)) {
            return prev.filter((id) => id !== seat.id);
          } else {
            return [...prev, seat.id];
          }
        });
      });

      layer.add(rect);
      nodesRef.current.set(seat.id, rect);
    });

    // Auto-fit
    const pad = 40;
    const fit = Math.min(
      (size.width - pad) / (layoutData.canvas_width || 1),
      (size.height - pad) / (layoutData.canvas_height || 1)
    );
    const initial = Math.max(MIN_SCALE, Math.min(fit, 1.5));
    stage.scale({ x: initial, y: initial });
    stage.position({
      x: (size.width - (layoutData.canvas_width || 0) * initial) / 2,
      y: (size.height - (layoutData.canvas_height || 0) * initial) / 2,
    });

    layer.batchDraw();

    return () => {
      stage.destroy();
    };
  }, [layoutData, size]);

  // Update seat colors when selection changes
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    
    const selectedSet = new Set(selectedSeatIds);
    seatsRef.current.forEach((seat) => {
      const node = nodesRef.current.get(seat.id);
      if (!node) return;
      
      const isSelected = selectedSet.has(seat.id);
      node.fill(isSelected ? '#2196F3' : (seat.category_color || '#4CAF50'));
      node.stroke(isSelected ? '#fff' : 'transparent');
      node.strokeWidth(isSelected ? 2 : 0);
    });
    layer.batchDraw();
  }, [selectedSeatIds]);

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    
    try {
      const res = await api.post(`/venues/${venueId}/categories/`, newCategory);
      setCategories((prev) => [...prev, res.data]);
      setCreateDialogOpen(false);
      setNewCategory({ name: '', hex_color: '#4CAF50', price: 0 });
      toast.success(`Category "${res.data.name}" created`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create category');
    }
  };

  const handleAssignCategory = async () => {
    if (!selectedCategory) {
      toast.warning('Please select a category first');
      return;
    }
    if (selectedSeatIds.length === 0) {
      toast.warning('Please select seats on the map first');
      return;
    }

    try {
      const res = await api.post(`/venues/${venueId}/categories/assign/`, {
        category_id: selectedCategory.id,
        seat_ids: selectedSeatIds,
      });
      toast.success(res.data.message);
      setSelectedSeatIds([]);
      onCategoryChange?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to assign category');
    }
  };

  const handleClearCategory = async () => {
    if (selectedSeatIds.length === 0) {
      toast.warning('Please select seats first');
      return;
    }

    try {
      const res = await api.post(`/venues/${venueId}/categories/clear/`, {
        seat_ids: selectedSeatIds,
      });
      toast.success(res.data.message);
      setSelectedSeatIds([]);
      onCategoryChange?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to clear category');
    }
  };

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          <PaletteIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Seat Categories
        </Typography>
        
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              label={`${cat.name} (${cat.seat_count})`}
              onClick={() => setSelectedCategory(cat)}
              sx={{
                bgcolor: selectedCategory?.id === cat.id ? cat.hex_color : `${cat.hex_color}40`,
                color: selectedCategory?.id === cat.id ? '#fff' : cat.hex_color,
                fontWeight: 600,
                border: selectedCategory?.id === cat.id ? '2px solid #fff' : 'none',
              }}
            />
          ))}
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            variant="outlined"
          >
            New Category
          </Button>
        </Stack>

        {selectedSeatIds.length > 0 && (
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={handleAssignCategory}
              disabled={!selectedCategory}
              sx={{ bgcolor: selectedCategory?.hex_color || '#ccc' }}
            >
              Assign {selectedSeatIds.length} seats to {selectedCategory?.name || 'category'}
            </Button>
            <Button variant="outlined" color="error" onClick={handleClearCategory}>
              Clear Category
            </Button>
            <Button variant="text" onClick={() => setSelectedSeatIds([])}>
              Clear Selection
            </Button>
          </Stack>
        )}
      </Paper>

      <Box sx={{ position: 'relative', border: '1px solid #e0e0e0', borderRadius: 2, overflow: 'hidden', bgcolor: '#f8f9fa' }}>
        <div ref={containerRef} style={{ width: '100%', height: 500 }} />
        <Typography variant="caption" sx={{ position: 'absolute', bottom: 8, left: 8, bgcolor: 'rgba(255,255,255,0.9)', px: 1, borderRadius: 1 }}>
          Click seats to select • Drag to pan • Scroll to zoom
        </Typography>
      </Box>

      {/* Create Category Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Category</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Category Name"
            fullWidth
            value={newCategory.name}
            onChange={(e) => setNewCategory((prev) => ({ ...prev, name: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Hex Color"
            type="color"
            fullWidth
            value={newCategory.hex_color}
            onChange={(e) => setNewCategory((prev) => ({ ...prev, hex_color: e.target.value }))}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Price"
            type="number"
            fullWidth
            value={newCategory.price}
            onChange={(e) => setNewCategory((prev) => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateCategory} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CategoryAssignmentCanvas;