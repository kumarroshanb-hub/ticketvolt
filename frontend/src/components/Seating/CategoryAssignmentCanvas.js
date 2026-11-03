import React, { useEffect, useRef, useState, useCallback } from 'react';
import Konva from 'konva';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Stack,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  Palette as PaletteIcon,
  Clear as ClearIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  FitScreen as FitScreenIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../../services/api';

// Branding colors from TiketVault
const BRAND_COLORS = {
  charcoal: '#333333',
  red: '#FF2A2A',
  darkGray: '#555555',
  lightGray: '#f4f4f4',
  border: '#e2e8f0',
  success: '#22c55e',
  warning: '#f59e0b',
  info: '#3b82f6',
};

const SEAT_SIZE = 24;
const SEAT_GAP = 4;
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

const CategoryAssignmentCanvas = ({ venueId, layoutData, onCategoryChange, canvasHeight = 650 }) => {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const layerRef = useRef(null);
  const nodesRef = useRef(new Map());
  const rowLabelsRef = useRef(new Map());
  
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', hex_color: '#FF2A2A', price: 0 });
  const [size, setSize] = useState({ width: 800, height: canvasHeight });
  const [zoomPct, setZoomPct] = useState(100);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api.get(`/venues/${venueId}/categories/`);
        setCategories(res.data);
      } catch (err) {
        console.error('Failed to load categories', err);
        toast.error('Failed to load seat categories');
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
      const h = entries[0]?.contentRect?.height;
      if (w && h) {
        setSize({ width: Math.floor(w), height: Math.floor(h) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build Konva stage
  useEffect(() => {
    if (!containerRef.current || !layoutData?.seats?.length) return;

    // Destroy old stage
    if (stageRef.current) {
      stageRef.current.destroy();
      nodesRef.current.clear();
      rowLabelsRef.current.clear();
    }

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

    // Group seats by row
    const rowsMap = new Map();
    layoutData.seats.forEach(seat => {
      const row = seat.row_label || 'A';
      if (!rowsMap.has(row)) {
        rowsMap.set(row, []);
      }
      rowsMap.get(row).push(seat);
    });

    // Sort rows
    const sortedRows = Array.from(rowsMap.keys()).sort();
    const selectedSet = new Set(selectedSeatIds);

    // Draw row labels aligned with actual seat positions
    sortedRows.forEach((row) => {
      const seatsInRow = rowsMap.get(row);
      const avgY = seatsInRow.reduce((sum, s) => sum + s.y_coord, 0) / seatsInRow.length;
      const rowY = avgY + SEAT_SIZE / 2;
      
      const leftLabel = new Konva.Text({
        x: 15,
        y: rowY - 6,
        text: row,
        fontSize: 12,
        fill: BRAND_COLORS.darkGray,
        width: 25,
        align: 'right',
        fontStyle: 'bold',
      });
      
      const rightLabel = new Konva.Text({
        x: size.width - 40,
        y: rowY - 6,
        text: row,
        fontSize: 12,
        fill: BRAND_COLORS.darkGray,
        width: 25,
        align: 'left',
        fontStyle: 'bold',
      });

      layer.add(leftLabel);
      layer.add(rightLabel);
      rowLabelsRef.current.set(row, { left: leftLabel, right: rightLabel });
    });

    // Draw seats with Group, Rect, and Text (matching SeatingCanvas exactly)
    layoutData.seats.forEach((seat) => {
      const isSelected = selectedSet.has(seat.id);
      const seatCategory = categories.find(c => c.id === seat.category_id);
      const categoryColor = seatCategory?.hex_color || '#94a3b8';
      const seatNumber = seat.seat_number || seat.id.substring(0, 4);

      const group = new Konva.Group({
        x: seat.x_coord,
        y: seat.y_coord,
      });

      const rect = new Konva.Rect({
        width: SEAT_SIZE,
        height: SEAT_SIZE,
        cornerRadius: 3,
        fill: isSelected ? BRAND_COLORS.red : categoryColor,
        stroke: isSelected ? BRAND_COLORS.charcoal : BRAND_COLORS.charcoal,
        strokeWidth: isSelected ? 2.5 : 1.5,
        shadowColor: isSelected ? BRAND_COLORS.red : 'transparent',
        shadowBlur: isSelected ? 10 : 0,
        shadowOpacity: 0.5,
        perfectDrawEnabled: false,
      });

      const text = new Konva.Text({
        text: seatNumber,
        fontSize: 9,
        fill: isSelected ? '#ffffff' : BRAND_COLORS.charcoal,
        width: SEAT_SIZE,
        align: 'center',
        y: 6,
        fontStyle: isSelected ? 'bold' : 'normal',
      });

      group.add(rect);
      group.add(text);

      group.on('click tap', () => {
        setSelectedSeatIds((prev) => {
          if (prev.includes(seat.id)) {
            return prev.filter((id) => id !== seat.id);
          } else {
            return [...prev, seat.id];
          }
        });
      });

      group.on('mouseenter', () => {
        if (!isSelected) {
          stage.container().style.cursor = 'pointer';
          rect.fill(categoryColor + '40');
          layer.batchDraw();
        }
      });

      group.on('mouseleave', () => {
        stage.container().style.cursor = 'default';
        if (!isSelected) {
          rect.fill(categoryColor);
          layer.batchDraw();
        }
      });

      layer.add(group);
      nodesRef.current.set(seat.id, { group, rect, text });
    });

    // Auto-fit
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    layoutData.seats.forEach(seat => {
      minX = Math.min(minX, seat.x_coord);
      maxX = Math.max(maxX, seat.x_coord);
      minY = Math.min(minY, seat.y_coord);
      maxY = Math.max(maxY, seat.y_coord);
    });

    const contentWidth = maxX - minX + SEAT_SIZE;
    const contentHeight = maxY - minY + SEAT_SIZE;
    const pad = 100;
    const fit = Math.min(
      (size.width - pad) / (contentWidth + 100),
      (size.height - pad) / (contentHeight + 80)
    );
    const initial = Math.max(MIN_SCALE, Math.min(fit, 1.2));
    stage.scale({ x: initial, y: initial });
    stage.position({
      x: (size.width - (contentWidth + 100) * initial) / 2,
      y: (size.height - (contentHeight + 80) * initial) / 2,
    });
    setZoomPct(Math.round(initial * 100));

    // Zoom with Ctrl/Cmd + Scroll
    stage.on('wheel', (e) => {
      if (!e.evt.ctrlKey && !e.evt.metaKey) return;
      e.evt.preventDefault();
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const factor = e.evt.deltaY > 0 ? 1 / 1.15 : 1.15;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * factor));
      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      };
      stage.scale({ x: newScale, y: newScale });
      stage.position({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
      setZoomPct(Math.round(newScale * 100));
      layer.batchDraw();
    });

    layer.batchDraw();

    return () => {
      if (stageRef.current) {
        stageRef.current.destroy();
        stageRef.current = null;
      }
    };
  }, [layoutData, size, categories, selectedSeatIds]);

  // Update seat appearance on selection change
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !layoutData?.seats) return;
    
    const selectedSet = new Set(selectedSeatIds);
    layoutData.seats.forEach((seat) => {
      const node = nodesRef.current.get(seat.id);
      if (!node) return;
      
      const isSelected = selectedSet.has(seat.id);
      const seatCategory = categories.find(c => c.id === seat.category_id);
      const categoryColor = seatCategory?.hex_color || '#94a3b8';
      
      node.rect.fill(isSelected ? BRAND_COLORS.red : categoryColor);
      node.rect.stroke(isSelected ? BRAND_COLORS.charcoal : BRAND_COLORS.charcoal);
      node.rect.strokeWidth(isSelected ? 2.5 : 1.5);
      node.rect.shadowColor(isSelected ? BRAND_COLORS.red : 'transparent');
      node.rect.shadowBlur(isSelected ? 10 : 0);
      node.rect.shadowOpacity(isSelected ? 0.5 : 0);
      node.text.fill(isSelected ? '#ffffff' : BRAND_COLORS.charcoal);
      node.text.fontStyle(isSelected ? 'bold' : 'normal');
    });
    layer.batchDraw();
  }, [selectedSeatIds, layoutData, categories]);

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      const res = await api.post(`/venues/${venueId}/categories/`, newCategory);
      setCategories((prev) => [...prev, res.data]);
      setCreateDialogOpen(false);
      setNewCategory({ name: '', hex_color: '#FF2A2A', price: 0 });
      toast.success(`Category "${res.data.name}" created successfully`);
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

    setIsSaving(true);
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
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearCategory = async () => {
    if (selectedSeatIds.length === 0) {
      toast.warning('Please select seats first');
      return;
    }

    setIsSaving(true);
    try {
      const res = await api.post(`/venues/${venueId}/categories/clear/`, {
        seat_ids: selectedSeatIds,
      });
      toast.success(res.data.message);
      setSelectedSeatIds([]);
      onCategoryChange?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to clear category');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFitToScreen = useCallback(() => {
    if (!stageRef.current || !layoutData) return;
    const stage = stageRef.current;
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    layoutData.seats.forEach(seat => {
      minX = Math.min(minX, seat.x_coord);
      maxX = Math.max(maxX, seat.x_coord);
      minY = Math.min(minY, seat.y_coord);
      maxY = Math.max(maxY, seat.y_coord);
    });

    const contentWidth = maxX - minX + SEAT_SIZE;
    const contentHeight = maxY - minY + SEAT_SIZE;
    const pad = 100;
    const fit = Math.min(
      (size.width - pad) / (contentWidth + 100),
      (size.height - pad) / (contentHeight + 80)
    );
    const initial = Math.max(MIN_SCALE, Math.min(fit, 1.2));
    
    stage.scale({ x: initial, y: initial });
    stage.position({
      x: (size.width - (contentWidth + 100) * initial) / 2,
      y: (size.height - (contentHeight + 80) * initial) / 2,
    });
    layerRef.current?.batchDraw();
    setZoomPct(Math.round(initial * 100));
  }, [layoutData, size]);

  const handleZoomIn = useCallback(() => {
    if (!stageRef.current) return;
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const newScale = Math.min(MAX_SCALE, oldScale * 1.25);
    stage.scale({ x: newScale, y: newScale });
    setZoomPct(Math.round(newScale * 100));
    layerRef.current?.batchDraw();
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!stageRef.current) return;
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const newScale = Math.max(MIN_SCALE, oldScale / 1.25);
    stage.scale({ x: newScale, y: newScale });
    setZoomPct(Math.round(newScale * 100));
    layerRef.current?.batchDraw();
  }, []);

  return (
    <Box sx={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 2,
      bgcolor: BRAND_COLORS.lightGray,
      p: 2,
      borderRadius: 2,
    }}>
      <Alert 
        severity="info" 
        sx={{ 
          fontSize: '0.85rem', 
          flexShrink: 0,
          bgcolor: '#eff6ff',
          border: `1px solid ${BRAND_COLORS.info}`,
          color: BRAND_COLORS.charcoal,
        }}
      >
        💡 <strong>How to assign:</strong> Select seats on the map, choose a category, then click "Assign Category"
      </Alert>

      <Paper sx={{ 
        p: 2.5, 
        flexShrink: 0,
        border: `1px solid ${BRAND_COLORS.border}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        <Typography variant="h6" sx={{ 
          mb: 2, 
          fontWeight: 700,
          color: BRAND_COLORS.charcoal,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <PaletteIcon sx={{ color: BRAND_COLORS.red }} />
          Seat Categories
        </Typography>
        
        <Stack direction="row" spacing={1} sx={{ mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              label={`${cat.name} (${cat.seat_count || 0})`}
              onClick={() => setSelectedCategory(cat)}
              sx={{
                bgcolor: selectedCategory?.id === cat.id ? cat.hex_color : `${cat.hex_color}20`,
                color: selectedCategory?.id === cat.id ? '#fff' : cat.hex_color,
                fontWeight: 600,
                border: selectedCategory?.id === cat.id ? `2px solid ${BRAND_COLORS.charcoal}` : `1px solid ${cat.hex_color}`,
                cursor: 'pointer',
                '&:hover': {
                  bgcolor: `${cat.hex_color}40`,
                },
                transition: 'all 0.2s',
              }}
            />
          ))}
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            variant="outlined"
            sx={{
              borderColor: BRAND_COLORS.charcoal,
              color: BRAND_COLORS.charcoal,
              '&:hover': {
                borderColor: BRAND_COLORS.red,
                color: BRAND_COLORS.red,
                bgcolor: '#fff',
              },
            }}
          >
            New Category
          </Button>
        </Stack>

        {selectedSeatIds.length > 0 && (
          <Paper sx={{ 
            p: 2, 
            bgcolor: '#eff6ff',
            border: `1px solid ${BRAND_COLORS.info}`,
            borderRadius: 2,
          }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: BRAND_COLORS.charcoal }}>
              {selectedSeatIds.length} seat{selectedSeatIds.length !== 1 ? 's' : ''} selected
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" gap={1}>
              <Button
                variant="contained"
                onClick={handleAssignCategory}
                disabled={!selectedCategory || isSaving}
                startIcon={isSaving ? <CheckCircleIcon /> : null}
                sx={{ 
                  bgcolor: selectedCategory?.hex_color || BRAND_COLORS.darkGray,
                  '&:hover': {
                    bgcolor: selectedCategory?.hex_color || BRAND_COLORS.charcoal,
                  },
                  '&:disabled': {
                    bgcolor: '#cbd5e1',
                  },
                }}
              >
                {isSaving ? 'Saving...' : `Assign to ${selectedCategory?.name || 'Category'}`}
              </Button>
              <Button 
                variant="outlined" 
                color="error" 
                onClick={handleClearCategory} 
                disabled={isSaving}
                startIcon={<ClearIcon />}
                sx={{
                  borderColor: '#ef4444',
                  color: '#ef4444',
                  '&:hover': {
                    borderColor: '#dc2626',
                    bgcolor: '#fef2f2',
                  },
                }}
              >
                Clear
              </Button>
              <Button 
                variant="text" 
                onClick={() => setSelectedSeatIds([])}
                sx={{
                  color: BRAND_COLORS.darkGray,
                  '&:hover': {
                    color: BRAND_COLORS.charcoal,
                    bgcolor: 'rgba(0,0,0,0.04)',
                  },
                }}
              >
                Deselect All
              </Button>
            </Stack>
          </Paper>
        )}
      </Paper>

      <Paper sx={{ 
        p: 0,
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${BRAND_COLORS.border}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
      }}>
        {/* SCREEN Header - matching SeatingCanvas */}
        <Box sx={{ 
          bgcolor: BRAND_COLORS.charcoal, 
          color: 'white', 
          py: 2, 
          textAlign: 'center',
          fontSize: '16px',
          fontWeight: 700,
          letterSpacing: '3px',
        }}>
          SCREEN
        </Box>

        <Box sx={{ 
          flexGrow: 1, 
          position: 'relative',
          bgcolor: '#fafafa',
          overflow: 'hidden',
          minHeight: 400,
        }}>
          <div 
            ref={containerRef} 
            style={{ width: '100%', height: '100%' }} 
          />
          
          {/* Zoom Controls - matching SeatingCanvas */}
          <Stack
            direction="row"
            spacing={0.5}
            alignItems="center"
            sx={{ 
              position: 'absolute', 
              bottom: 12, 
              right: 12, 
              bgcolor: 'white', 
              borderRadius: 1, 
              px: 1, 
              py: 0.5,
              boxShadow: 2,
              border: `1px solid ${BRAND_COLORS.border}`
            }}
          >
            <IconButton size="small" onClick={handleZoomOut} sx={{ width: 28, height: 28 }}>
              <ZoomOutIcon fontSize="small" sx={{ color: BRAND_COLORS.charcoal }} />
            </IconButton>
            <IconButton size="small" onClick={handleFitToScreen} sx={{ width: 28, height: 28 }}>
              <FitScreenIcon fontSize="small" sx={{ color: BRAND_COLORS.charcoal }} />
            </IconButton>
            <Typography variant="caption" sx={{ minWidth: 42, textAlign: 'center', fontWeight: 600, color: BRAND_COLORS.charcoal }}>
              {zoomPct}%
            </Typography>
            <IconButton size="small" onClick={handleZoomIn} sx={{ width: 28, height: 28 }}>
              <ZoomInIcon fontSize="small" sx={{ color: BRAND_COLORS.charcoal }} />
            </IconButton>
          </Stack>
        </Box>

        {/* Legend - Cleaned up (removed hardcoded numbers) */}
        <Box sx={{ 
          p: 2.5, 
          bgcolor: '#fff',
          borderTop: `1px solid ${BRAND_COLORS.border}`,
        }}>
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ 
                width: 24, 
                height: 24, 
                border: `1.5px solid ${BRAND_COLORS.charcoal}`, 
                borderRadius: 1,
                bgcolor: 'white',
              }} />
              <Typography variant="caption" sx={{ color: BRAND_COLORS.darkGray, fontWeight: 500 }}>Available</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ 
                width: 24, 
                height: 24, 
                border: `1.5px solid ${BRAND_COLORS.charcoal}`, 
                borderRadius: 1,
                bgcolor: BRAND_COLORS.red,
              }} />
              <Typography variant="caption" sx={{ color: BRAND_COLORS.darkGray, fontWeight: 500 }}>Selected</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ 
                width: 24, 
                height: 24, 
                border: `1px solid #bdbdbd`, 
                borderRadius: 1,
                bgcolor: '#e0e0e0',
              }} />
              <Typography variant="caption" sx={{ color: BRAND_COLORS.darkGray, fontWeight: 500 }}>Assigned/Sold</Typography>
            </Box>
            <Typography variant="caption" sx={{ color: BRAND_COLORS.darkGray, ml: 'auto', fontWeight: 500 }}>
              Hold Ctrl/Cmd + Scroll to zoom • Drag to pan
            </Typography>
          </Stack>
        </Box>
      </Paper>

      {/* Create Category Dialog */}
      <Dialog 
        open={createDialogOpen} 
        onClose={() => setCreateDialogOpen(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            border: `1px solid ${BRAND_COLORS.border}`,
          }
        }}
      >
        <DialogTitle sx={{ 
          fontWeight: 700, 
          color: BRAND_COLORS.charcoal,
          borderBottom: `1px solid ${BRAND_COLORS.border}`,
          pb: 2,
        }}>
          Create New Category
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <TextField
            autoFocus
            margin="dense"
            label="Category Name"
            fullWidth
            value={newCategory.name}
            onChange={(e) => setNewCategory((prev) => ({ ...prev, name: e.target.value }))}
            sx={{ 
              mb: 2.5,
              '& .MuiOutlinedInput-root': {
                '&:hover fieldset': {
                  borderColor: BRAND_COLORS.red,
                },
                '&.Mui-focused fieldset': {
                  borderColor: BRAND_COLORS.red,
                },
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: BRAND_COLORS.red,
              },
            }}
          />
          <TextField
            margin="dense"
            label="Color"
            type="color"
            fullWidth
            value={newCategory.hex_color}
            onChange={(e) => setNewCategory((prev) => ({ ...prev, hex_color: e.target.value }))}
            sx={{ 
              mb: 2.5,
              '& input[type="color"]': {
                height: '48px',
                padding: '4px',
                cursor: 'pointer',
              },
            }}
          />
          <TextField
            margin="dense"
            label="Price"
            type="number"
            fullWidth
            value={newCategory.price}
            onChange={(e) => setNewCategory((prev) => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
            InputProps={{
              startAdornment: <span style={{ marginRight: 8, color: BRAND_COLORS.darkGray }}>₹</span>,
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                '&:hover fieldset': {
                  borderColor: BRAND_COLORS.red,
                },
                '&.Mui-focused fieldset': {
                  borderColor: BRAND_COLORS.red,
                },
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: BRAND_COLORS.red,
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ 
          p: 2.5, 
          borderTop: `1px solid ${BRAND_COLORS.border}`,
          gap: 1,
        }}>
          <Button 
            onClick={() => setCreateDialogOpen(false)}
            sx={{
              color: BRAND_COLORS.darkGray,
              '&:hover': {
                color: BRAND_COLORS.charcoal,
                bgcolor: 'rgba(0,0,0,0.04)',
              },
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleCreateCategory} 
            variant="contained"
            sx={{
              bgcolor: BRAND_COLORS.red,
              '&:hover': {
                bgcolor: '#e62626',
              },
            }}
          >
            Create Category
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CategoryAssignmentCanvas;