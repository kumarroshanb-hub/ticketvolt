// frontend/src/components/Seating/SeatingCanvas.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Konva from 'konva';
import { Box, CircularProgress, Typography, Chip, IconButton, Stack } from '@mui/material';
import api from '../../services/api';
import { theme as appTheme } from '../../theme/tokens';

const C = appTheme.colors;
const SEAT_SIZE = 16;
const MIN_SCALE = 0.15;
const MAX_SCALE = 6;

const seatFill = (seat, isSelected) => {
  if (isSelected) return C.primary;
  if (seat.status === 'booked') return '#9e9e9e';
  if (seat.status === 'held') return C.warning;
  return seat.category_color || C.success;
};

export default function SeatingCanvas({
  eventId,
  sessionId,
  selectedSeatIds = [],
  onSelectSeats,
  height = 520,
  readOnly = false,
}) {
  const [layoutData, setLayoutData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const layerRef = useRef(null);
  const nodesRef = useRef(new Map());
  const seatsRef = useRef([]);

  const selectedRef = useRef(selectedSeatIds);
  const onSelectRef = useRef(onSelectSeats);
  const readOnlyRef = useRef(readOnly);

  const [size, setSize] = useState({ width: 800, height });
  const [zoomPct, setZoomPct] = useState(100);

  useEffect(() => { selectedRef.current = selectedSeatIds; }, [selectedSeatIds]);
  useEffect(() => { onSelectRef.current = onSelectSeats; }, [onSelectSeats]);
  useEffect(() => { readOnlyRef.current = readOnly; }, [readOnly]);

  // Responsive container width
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

  // Fetch layout data
  useEffect(() => {
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
  }, [eventId, sessionId]);

  // Build Konva Stage
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

    if (layoutData.background_image) {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const bg = new Konva.Image({
          image: img,
          width: layoutData.canvas_width,
          height: layoutData.canvas_height,
          opacity: 0.35,
          listening: false,
        });
        layer.add(bg);
        bg.moveToBottom();
        layer.batchDraw();
      };
      img.src = layoutData.background_image;
    }

    const selectedSet = new Set(selectedRef.current);

    layoutData.seats.forEach((seat) => {
      const isSelected = selectedSet.has(seat.id);
      const rect = new Konva.Rect({
        x: seat.x_coord,
        y: seat.y_coord,
        width: SEAT_SIZE,
        height: SEAT_SIZE,
        cornerRadius: 3,
        fill: seatFill(seat, isSelected),
        stroke: isSelected ? '#ffffff' : undefined,
        strokeWidth: isSelected ? 2 : 0,
        perfectDrawEnabled: false,
        shadowForStrokeEnabled: false,
        listening: seat.status === 'available',
      });

      rect.on('click tap', () => {
        if (readOnlyRef.current || seat.status !== 'available') return;
        const current = selectedRef.current;
        const next = current.includes(seat.id)
          ? current.filter((id) => id !== seat.id)
          : [...current, seat.id];
        
        // Pass full seat objects back to parent for payload building
        const nextSeats = layoutData.seats.filter(s => next.includes(s.id));
        onSelectRef.current?.(nextSeats);
      });

      rect.on('mouseenter', () => {
        if (seat.status === 'available') stage.container().style.cursor = 'pointer';
      });
      rect.on('mouseleave', () => { stage.container().style.cursor = 'default'; });

      layer.add(rect);
      nodesRef.current.set(seat.id, rect);
    });

    // Auto-fit to viewport on first render
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
    setZoomPct(Math.round(initial * 100));

    // Zoom toward pointer
    stage.on('wheel', (e) => {
      e.evt.preventDefault();
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const factor = e.evt.deltaY > 0 ? 1 / 1.12 : 1.12;
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
    };
  }, [layoutData, size.width, size.height]);

  // Cheap repaint on selection change (no stage rebuild)
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const selectedSet = new Set(selectedSeatIds);
    seatsRef.current.forEach((seat) => {
      const node = nodesRef.current.get(seat.id);
      if (!node) return;
      const isSelected = selectedSet.has(seat.id);
      node.fill(seatFill(seat, isSelected));
      node.stroke(isSelected ? '#ffffff' : undefined);
      node.strokeWidth(isSelected ? 2 : 0);
    });
    layer.batchDraw();
  }, [selectedSeatIds]);

// Add this inside the SeatingCanvas component, after the existing useEffects

// WebSocket connection for real-time seat updates
useEffect(() => {
  if (!eventId || readOnly) return;
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/events/${eventId}/seats/`;
  
  const ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('✅ WebSocket connected for seat map');
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'seat_held') {
      // Update the seat status in the canvas
      const seat = seatsRef.current.find(s => s.id === data.seat_id);
      if (seat && seat.status === 'available') {
        seat.status = 'held';
        const node = nodesRef.current.get(data.seat_id);
        if (node) {
          node.fill('#FF9800'); // Held color
          layerRef.current?.batchDraw();
        }
      }
    }
    
    if (data.type === 'seat_released') {
      const seat = seatsRef.current.find(s => s.id === data.seat_id);
      if (seat && seat.status === 'held') {
        seat.status = 'available';
        const node = nodesRef.current.get(data.seat_id);
        if (node) {
          node.fill(seat.category_color || '#4CAF50');
          layerRef.current?.batchDraw();
        }
      }
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected');
  };
  
  return () => {
    ws.close();
  };
}, [eventId, readOnly]);

// Send hold/release messages when user selects/deselects seats
useEffect(() => {
  if (!eventId || readOnly) return;
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/events/${eventId}/seats/`;
  
  // This is a simplified version - in production, you'd want to maintain a single WebSocket connection
  // and reuse it. For now, this demonstrates the concept.
  const ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    selectedSeatIds.forEach((seatId) => {
      ws.send(JSON.stringify({
        action: 'hold_seat',
        seat_id: seatId,
        session_id: sessionId,
        user_id: 'current_user_id', // Replace with actual user ID from auth context
      }));
    });
  };
  
  return () => {
    // Release seats when component unmounts or selection changes
    selectedSeatIds.forEach((seatId) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          action: 'release_seat',
          seat_id: seatId,
          session_id: sessionId,
        }));
      }
    });
    ws.close();
  };
}, [selectedSeatIds, eventId, sessionId, readOnly]);
  
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height, border: `1px solid ${C.borderLight}`, borderRadius: 2 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !layoutData?.seats?.length) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', border: `1px solid ${C.borderLight}`, borderRadius: 2 }}>
        <Typography sx={{ color: C.textMuted }}>
          {error || 'No seating layout has been configured for this venue yet.'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ position: 'relative', border: `1px solid ${C.borderLight}`, borderRadius: 2, overflow: 'hidden', bgcolor: C.bgPrimary }}>
        <div ref={containerRef} style={{ width: '100%', height }} />
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(255,255,255,0.92)', borderRadius: 1, px: 0.5, boxShadow: 1 }}
        >
          <IconButton size="small" onClick={() => zoomBy(1 / 1.25)}>−</IconButton>
          <Typography variant="caption" sx={{ minWidth: 42, textAlign: 'center' }}>{zoomPct}%</Typography>
          <IconButton size="small" onClick={() => zoomBy(1.25)}>+</IconButton>
        </Stack>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
        <Chip size="small" label="Available" sx={{ bgcolor: C.success, color: '#fff' }} />
        <Chip size="small" label="Selected" sx={{ bgcolor: C.primary, color: '#fff' }} />
        <Chip size="small" label="Held" sx={{ bgcolor: C.warning, color: '#fff' }} />
        <Chip size="small" label="Booked" sx={{ bgcolor: '#9e9e9e', color: '#fff' }} />
        <Typography variant="caption" sx={{ color: C.textMuted, alignSelf: 'center', ml: 'auto' }}>
          Scroll to zoom · drag to pan
        </Typography>
      </Box>
    </Box>
  );
}