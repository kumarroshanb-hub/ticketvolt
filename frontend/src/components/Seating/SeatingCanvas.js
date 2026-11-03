import React, { useEffect, useRef, useState, useCallback } from 'react';
import Konva from 'konva';
import { Box, CircularProgress, Typography, IconButton, Stack, Paper } from '@mui/material';
import { ZoomIn, ZoomOut, FitScreen } from '@mui/icons-material';
import api from '../../services/api';

// TiketVault Branding Colors
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
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

const seatFill = (seat, isSelected) => {
  if (isSelected) return BRAND_COLORS.red;
  if (seat.status === 'booked' || seat.status === 'sold') return '#e0e0e0';
  if (seat.status === 'held') return BRAND_COLORS.warning;
  return '#ffffff';
};

const seatStroke = (seat, isSelected) => {
  if (isSelected) return BRAND_COLORS.charcoal;
  if (seat.status === 'booked' || seat.status === 'sold') return '#bdbdbd';
  return BRAND_COLORS.charcoal;
};

export default function SeatingCanvas({
  eventId,
  sessionId,
  selectedSeatIds = [],
  onSelectSeats,
  height = 600,
  readOnly = false,
  layoutData: externalLayoutData,
}) {
  const [layoutData, setLayoutData] = useState(externalLayoutData || null);
  const [loading, setLoading] = useState(!externalLayoutData);
  const [error, setError] = useState(null);
  
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const layerRef = useRef(null);
  const nodesRef = useRef(new Map());
  const seatsRef = useRef([]);
  const rowLabelsRef = useRef(new Map());

  const selectedRef = useRef(selectedSeatIds);
  const onSelectRef = useRef(onSelectSeats);
  const readOnlyRef = useRef(readOnly);

  const [size, setSize] = useState({ width: 800, height });
  const [zoomPct, setZoomPct] = useState(90); // ✅ Default to 90%

  useEffect(() => { selectedRef.current = selectedSeatIds; }, [selectedSeatIds]);
  useEffect(() => { onSelectRef.current = onSelectSeats; }, [onSelectSeats]);
  useEffect(() => { readOnlyRef.current = readOnly; }, [readOnly]);

  useEffect(() => {
    if (externalLayoutData) {
      setLayoutData(externalLayoutData);
      setLoading(false);
    }
  }, [externalLayoutData]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setSize({ width: Math.floor(w), height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  useEffect(() => {
    if (externalLayoutData) return;
    
    const fetchLayout = async () => {
      try {
        const res = await api.get(`/events/${eventId}/seat-map/`, { 
            params: sessionId ? { session: sessionId } : {} 
        });
        setLayoutData(res.data);
      } catch (err) {
        setError('Failed to load seating layout. Ensure the venue has a configured layout.');
      } finally {
        setLoading(false);
      }
    };
    if (eventId) fetchLayout();
  }, [eventId, sessionId, externalLayoutData]);

  useEffect(() => {
    if (!containerRef.current || !layoutData?.seats?.length) return;

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
    seatsRef.current = layoutData.seats;

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
    
    // ✅ FIX: Draw row labels aligned with actual seat positions
    sortedRows.forEach((row) => {
      const seatsInRow = rowsMap.get(row);
      // Calculate the center Y of this row based on actual seats
      const avgY = seatsInRow.reduce((sum, s) => sum + s.y_coord, 0) / seatsInRow.length;
      const rowY = avgY + SEAT_SIZE / 2;
      
      // Left label
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
      
      // Right label
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

    const selectedSet = new Set(selectedRef.current);

    // Draw seats
    layoutData.seats.forEach((seat) => {
      const isSelected = selectedSet.has(seat.id);
      const seatNumber = seat.seat_number || seat.id.substring(0, 4);
      
      const group = new Konva.Group({
        x: seat.x_coord,
        y: seat.y_coord,
      });

      const rect = new Konva.Rect({
        width: SEAT_SIZE,
        height: SEAT_SIZE,
        cornerRadius: 3,
        fill: seatFill(seat, isSelected),
        stroke: seatStroke(seat, isSelected),
        strokeWidth: isSelected ? 2.5 : 1.5,
        shadowColor: isSelected ? BRAND_COLORS.red : 'transparent',
        shadowBlur: isSelected ? 10 : 0,
        shadowOpacity: 0.5,
        perfectDrawEnabled: false,
        listening: seat.status === 'available',
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
        if (readOnlyRef.current || seat.status !== 'available') return;
        const current = selectedRef.current;
        const next = current.includes(seat.id)
          ? current.filter((id) => id !== seat.id)
          : [...current, seat.id];
        
        const nextSeats = layoutData.seats.filter(s => next.includes(s.id));
        onSelectRef.current?.(nextSeats);
      });

      group.on('mouseenter', () => {
        if (seat.status === 'available' && !isSelected) {
          stage.container().style.cursor = 'pointer';
          rect.fill('#fff5f5');
          layer.batchDraw();
        }
      });
      
      group.on('mouseleave', () => {
        stage.container().style.cursor = 'default';
        if (!isSelected) {
          rect.fill(seatFill(seat, false));
          layer.batchDraw();
        }
      });

      layer.add(group);
      nodesRef.current.set(seat.id, { group, rect, text });
    });

    // ✅ Auto-fit with 90% default zoom
    const pad = 100;
    const fit = Math.min(
      (size.width - pad) / (layoutData.canvas_width + 100),
      (size.height - pad) / (layoutData.canvas_height + 80)
    );
    
    // Default to 90% (0.9), but if the canvas is larger than the container, 
    // scale it down to fit so it doesn't overflow.
    const initial = Math.max(MIN_SCALE, Math.min(fit, 0.9));
    
    stage.scale({ x: initial, y: initial });
    
    // ✅ Perfect center alignment
    stage.position({
      x: (size.width - (layoutData.canvas_width + 100) * initial) / 2,
      y: (size.height - (layoutData.canvas_height + 80) * initial) / 2,
    });
    
    setZoomPct(Math.round(initial * 100));

    // Zoom with Ctrl/Cmd
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
      stage.batchDraw();
    });

    layer.batchDraw();

    return () => {
      stage.destroy();
      stageRef.current = null;
      layerRef.current = null;
      nodesRef.current.clear();
      rowLabelsRef.current.clear();
    };
  }, [layoutData, size.width, size.height]);

  // Update seat appearance on selection change
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const selectedSet = new Set(selectedSeatIds);
    
    layoutData.seats.forEach((seat) => {
      const node = nodesRef.current.get(seat.id);
      if (!node) return;
      const isSelected = selectedSet.has(seat.id);
      
      node.rect.fill(seatFill(seat, isSelected));
      node.rect.stroke(seatStroke(seat, isSelected));
      node.rect.strokeWidth(isSelected ? 2.5 : 1.5);
      node.rect.shadowColor(isSelected ? BRAND_COLORS.red : 'transparent');
      node.rect.shadowBlur(isSelected ? 10 : 0);
      node.rect.shadowOpacity(isSelected ? 0.5 : 0);
      node.text.fill(isSelected ? '#ffffff' : BRAND_COLORS.charcoal);
      node.text.fontStyle(isSelected ? 'bold' : 'normal');
    });
    
    layer.batchDraw();
  }, [selectedSeatIds, layoutData]);

  const zoomBy = useCallback((factor) => {
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * factor));
    const center = { x: stage.width() / 2, y: stage.height() / 2 };
    const pointTo = {
      x: (center.x - stage.x()) / oldScale,
      y: (center.y - stage.y()) / oldScale,
    };
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: center.x - pointTo.x * newScale,
      y: center.y - pointTo.y * newScale,
    });
    stage.batchDraw();
    setZoomPct(Math.round(newScale * 100));
  }, []);

  const handleFitToScreen = useCallback(() => {
    if (!stageRef.current || !layoutData) return;
    const stage = stageRef.current;
    
    const pad = 100;
    const fit = Math.min(
      (size.width - pad) / (layoutData.canvas_width + 100),
      (size.height - pad) / (layoutData.canvas_height + 80)
    );
    
    // Fit to screen uses the calculated fit ratio
    const initial = Math.max(MIN_SCALE, Math.min(fit, 1.2));
    
    stage.scale({ x: initial, y: initial });
    stage.position({
      x: (size.width - (layoutData.canvas_width + 100) * initial) / 2,
      y: (size.height - (layoutData.canvas_height + 80) * initial) / 2,
    });
    layerRef.current?.batchDraw();
    setZoomPct(Math.round(initial * 100));
  }, [layoutData, size]);

  if (loading) {
    return (
      <Paper sx={{ 
        p: 3, 
        borderRadius: 2, 
        border: `1px solid ${BRAND_COLORS.border}`,
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height,
        bgcolor: BRAND_COLORS.lightGray
      }}>
        <CircularProgress sx={{ color: BRAND_COLORS.red }} />
      </Paper>
    );
  }

  if (error || !layoutData?.seats?.length) {
    return (
      <Paper sx={{ 
        p: 4, 
        textAlign: 'center', 
        border: `1px solid ${BRAND_COLORS.border}`, 
        borderRadius: 2,
        bgcolor: BRAND_COLORS.lightGray
      }}>
        <Typography sx={{ color: BRAND_COLORS.darkGray }}>
          {error || 'No seating layout has been configured for this venue yet.'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ 
      p: 0, 
      borderRadius: 2, 
      border: `1px solid ${BRAND_COLORS.border}`,
      bgcolor: BRAND_COLORS.lightGray,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    }}>
      {/* Screen Indicator */}
      <Box sx={{ 
        bgcolor: BRAND_COLORS.charcoal, 
        color: 'white', 
        py: 2, 
        textAlign: 'center',
        fontSize: '16px',
        fontWeight: 700,
        letterSpacing: '3px',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
      }}>
        SCREEN
      </Box>

      <Box sx={{ position: 'relative', overflow: 'hidden', bgcolor: '#fafafa' }}>
        <div ref={containerRef} style={{ width: '100%', height }} />
        
        {/* Zoom Controls */}
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
          <IconButton size="small" onClick={() => zoomBy(1 / 1.25)} sx={{ width: 28, height: 28 }}>
            <ZoomOut fontSize="small" sx={{ color: BRAND_COLORS.charcoal }} />
          </IconButton>
          <IconButton size="small" onClick={handleFitToScreen} sx={{ width: 28, height: 28 }}>
            <FitScreen fontSize="small" sx={{ color: BRAND_COLORS.charcoal }} />
          </IconButton>
          <Typography variant="caption" sx={{ minWidth: 42, textAlign: 'center', fontWeight: 600, color: BRAND_COLORS.charcoal }}>
            {zoomPct}%
          </Typography>
          <IconButton size="small" onClick={() => zoomBy(1.25)} sx={{ width: 28, height: 28 }}>
            <ZoomIn fontSize="small" sx={{ color: BRAND_COLORS.charcoal }} />
          </IconButton>
        </Stack>
      </Box>

      {/* Legend */}
      <Box sx={{ 
        p: 2.5, 
        bgcolor: '#fff',
        borderTop: `1px solid ${BRAND_COLORS.border}`,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
      }}>
        <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ 
              width: 24, 
              height: 24, 
              border: `1.5px solid ${BRAND_COLORS.charcoal}`, 
              borderRadius: 1,
              bgcolor: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              color: BRAND_COLORS.charcoal,
              fontWeight: 600,
            }}>2</Box>
            <Typography variant="caption" sx={{ color: BRAND_COLORS.darkGray, fontWeight: 500 }}>Selectable</Typography>
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ 
              width: 24, 
              height: 24, 
              border: `1.5px solid ${BRAND_COLORS.charcoal}`, 
              borderRadius: 1,
              bgcolor: BRAND_COLORS.red,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              color: 'white',
              fontWeight: 700,
            }}>5</Box>
            <Typography variant="caption" sx={{ color: BRAND_COLORS.darkGray, fontWeight: 500 }}>Selected</Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ 
              width: 24, 
              height: 24, 
              border: `1px solid #bdbdbd`, 
              borderRadius: 1,
              bgcolor: '#e0e0e0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              color: '#9e9e9e',
              fontWeight: 300,
            }}>×</Box>
            <Typography variant="caption" sx={{ color: BRAND_COLORS.darkGray, fontWeight: 500 }}>Sold</Typography>
          </Box>

          <Typography variant="caption" sx={{ color: BRAND_COLORS.darkGray, ml: 'auto', fontWeight: 500 }}>
            Hold Ctrl/Cmd + Scroll to zoom • Drag to pan
          </Typography>
        </Stack>
      </Box>
    </Paper>
  );
}