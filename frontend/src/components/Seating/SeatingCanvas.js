import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Konva from 'konva';
import { Box, CircularProgress, Typography, IconButton, Stack, Paper } from '@mui/material';
import { ZoomIn, ZoomOut, FitScreen } from '@mui/icons-material';
import api from '../../services/api';

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
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

// Safe area constants
const PADDING_TOP = 20;
const PADDING_BOTTOM = 80; 
const PADDING_SIDE = 40;

const getSeatColor = (seat, isSelected) => {
  if (isSelected) return BRAND_COLORS.red; 
  if (seat.status === 'booked' || seat.status === 'sold') return '#e0e0e0'; 
  if (seat.status === 'held') return BRAND_COLORS.warning; 
  return seat.category_color || '#94a3b8';
};

const getSeatStroke = (seat, isSelected) => {
  if (isSelected) return BRAND_COLORS.charcoal;
  if (seat.status === 'booked' || seat.status === 'sold') return '#bdbdbd';
  return BRAND_COLORS.charcoal;
};

export default function SeatingCanvas({
  eventId,
  sessionId,
  selectedSeatIds = [],
  onSelectSeats,
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
  
  const selectedRef = useRef(selectedSeatIds);
  const onSelectRef = useRef(onSelectSeats);
  const readOnlyRef = useRef(readOnly);

  const [zoomPct, setZoomPct] = useState(100);
  const [isStageReady, setIsStageReady] = useState(false);

  useEffect(() => { selectedRef.current = selectedSeatIds; }, [selectedSeatIds]);
  useEffect(() => { onSelectRef.current = onSelectSeats; }, [onSelectSeats]);
  useEffect(() => { readOnlyRef.current = readOnly; }, [readOnly]);

  useEffect(() => {
    if (externalLayoutData) {
      setLayoutData(externalLayoutData);
      setLoading(false);
    }
  }, [externalLayoutData]);

  // Fetch Layout
  useEffect(() => {
    if (externalLayoutData) return;
    
    const fetchLayout = async () => {
      try {
        const res = await api.get(`/events/${eventId}/seat-map/`, { 
            params: sessionId ? { session: sessionId } : {} 
        });
        setLayoutData(res.data);
      } catch (err) {
        console.error(err);
        setError('Failed to load seating layout.');
      } finally {
        setLoading(false);
      }
    };
    if (eventId) fetchLayout();
  }, [eventId, sessionId, externalLayoutData]);

  // DYNAMIC LEGEND
  const legendStats = useMemo(() => {
    if (!layoutData?.seats) return [];
    const stats = {};
    layoutData.seats.forEach(seat => {
      let groupName = 'General';
      let groupColor = '#94a3b8';
      
      if (seat.status === 'sold' || seat.status === 'booked') {
        groupName = 'Sold / Unavailable';
        groupColor = '#e0e0e0';
      } else if (seat.status === 'held') {
        groupName = 'Held';
        groupColor = BRAND_COLORS.warning;
      } else if (seat.category_name) {
        groupName = seat.category_name;
        groupColor = seat.category_color || '#94a3b8';
      }

      if (!stats[groupName]) stats[groupName] = { name: groupName, color: groupColor, count: 0 };
      stats[groupName].count++;
    });

    return Object.values(stats).sort((a, b) => {
      const isSpecialA = a.name.includes('Sold') || a.name.includes('Held');
      const isSpecialB = b.name.includes('Sold') || b.name.includes('Held');
      if (isSpecialA && !isSpecialB) return 1;
      if (!isSpecialA && isSpecialB) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [layoutData]);

  // =========================================================================
  // ✅ BUILD STAGE (Safely waits for layout to settle)
  // =========================================================================
  useEffect(() => {
    if (!containerRef.current || !layoutData?.seats?.length) return;

    const el = containerRef.current;
    let stage = null;
    let layer = null;
    let animationFrameId = null;
    let isDestroyed = false;

    const initKonva = () => {
      if (isDestroyed) return;

      // Measure the actual painted DOM element
      const w = el.clientWidth;
      const h = el.clientHeight;

      // If still zero, wait for the next frame (flexbox layout settling)
      if (w === 0 || h === 0) {
        animationFrameId = requestAnimationFrame(initKonva);
        return;
      }

      // Destroy old stage if it exists
      if (stageRef.current) {
        stageRef.current.destroy();
        nodesRef.current.clear();
      }

      stage = new Konva.Stage({
        container: el,
        width: w,
        height: h,
        draggable: true,
      });
      layer = new Konva.Layer();
      stage.add(layer);
      stageRef.current = stage;
      layerRef.current = layer;

      const selectedSet = new Set(selectedRef.current);

      // Draw Seats
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
          fill: getSeatColor(seat, isSelected),
          stroke: getSeatStroke(seat, isSelected),
          strokeWidth: isSelected ? 2.5 : 1.5,
          shadowColor: isSelected ? BRAND_COLORS.red : 'transparent',
          shadowBlur: isSelected ? 10 : 0,
          shadowOpacity: 0.5,
          perfectDrawEnabled: false,
          listening: seat.status === 'available' && !readOnly,
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
          const next = current.includes(seat.id) ? current.filter((id) => id !== seat.id) : [...current, seat.id];
          const nextSeats = layoutData.seats.filter(s => next.includes(s.id));
          onSelectRef.current?.(nextSeats);
        });

        group.on('mouseenter', () => {
          if (seat.status === 'available' && !isSelected && !readOnly) {
            stage.container().style.cursor = 'pointer';
            rect.fill(getSeatColor(seat, false) + 'CC'); 
            layer.batchDraw();
          }
        });
        
        group.on('mouseleave', () => {
          stage.container().style.cursor = 'default';
          if (!isSelected) {
            rect.fill(getSeatColor(seat, false));
            layer.batchDraw();
          }
        });

        layer.add(group);
        nodesRef.current.set(seat.id, { group, rect, text });
      });

      // Calculate Bounding Box
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      layoutData.seats.forEach(seat => {
        minX = Math.min(minX, seat.x_coord);
        maxX = Math.max(maxX, seat.x_coord + SEAT_SIZE); 
        minY = Math.min(minY, seat.y_coord);
        maxY = Math.max(maxY, seat.y_coord + SEAT_SIZE); 
      });

      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;
      
      const availW = Math.max(100, w - (PADDING_SIDE * 2));
      const availH = Math.max(100, h - (PADDING_TOP + PADDING_BOTTOM));
      
      const scaleX = availW / contentWidth;
      const scaleY = availH / contentHeight;
      const initialScale = Math.max(MIN_SCALE, Math.min(scaleX, scaleY, 1.5));
      
      stage.scale({ x: initialScale, y: initialScale });
      
      const centerX = (w - (contentWidth * initialScale)) / 2;
      const centerY = (h - (contentHeight * initialScale)) / 2;
      
      stage.position({
        x: centerX - (minX * initialScale),
        y: centerY - (minY * initialScale),
      });
      
      setZoomPct(Math.round(initialScale * 100));
      setIsStageReady(true);

      // Zoom Handler
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
    };

    // Start the measurement loop
    animationFrameId = requestAnimationFrame(initKonva);

    return () => {
      isDestroyed = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (stage) stage.destroy();
      stageRef.current = null;
      layerRef.current = null;
      nodesRef.current.clear();
      setIsStageReady(false);
    };
  }, [layoutData, readOnly]); 

  // Update Appearance on Selection Change
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !layoutData) return;
    const selectedSet = new Set(selectedSeatIds);
    
    layoutData.seats.forEach((seat) => {
      const node = nodesRef.current.get(seat.id);
      if (!node) return;
      const isSelected = selectedSet.has(seat.id);
      
      node.rect.fill(getSeatColor(seat, isSelected));
      node.rect.stroke(getSeatStroke(seat, isSelected));
      node.rect.strokeWidth(isSelected ? 2.5 : 1.5);
      node.rect.shadowColor(isSelected ? BRAND_COLORS.red : 'transparent');
      node.rect.shadowBlur(isSelected ? 10 : 0);
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
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    layoutData.seats.forEach(seat => {
      minX = Math.min(minX, seat.x_coord);
      maxX = Math.max(maxX, seat.x_coord + SEAT_SIZE); 
      minY = Math.min(minY, seat.y_coord);
      maxY = Math.max(maxY, seat.y_coord + SEAT_SIZE); 
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    const availW = Math.max(100, stage.width() - (PADDING_SIDE * 2));
    const availH = Math.max(100, stage.height() - (PADDING_TOP + PADDING_BOTTOM));
    
    const scaleX = availW / contentWidth;
    const scaleY = availH / contentHeight;
    const newScale = Math.max(MIN_SCALE, Math.min(scaleX, scaleY, 1.5));
    
    stage.scale({ x: newScale, y: newScale });
    
    const centerX = (stage.width() - (contentWidth * newScale)) / 2;
    const centerY = (stage.height() - (contentHeight * newScale)) / 2;
    
    stage.position({
      x: centerX - (minX * newScale),
      y: centerY - (minY * newScale),
    });
    
    layerRef.current?.batchDraw();
    setZoomPct(Math.round(newScale * 100));
  }, [layoutData]);

  if (loading) {
    return (
      <Paper sx={{ p: 3, borderRadius: 2, border: `1px solid ${BRAND_COLORS.border}`, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 400, bgcolor: BRAND_COLORS.lightGray }}>
        <CircularProgress sx={{ color: BRAND_COLORS.red }} />
      </Paper>
    );
  }

  if (error || !layoutData?.seats?.length) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center', border: `1px solid ${BRAND_COLORS.border}`, borderRadius: 2, height: '100%', minHeight: 400, bgcolor: BRAND_COLORS.lightGray }}>
        <Typography sx={{ color: BRAND_COLORS.darkGray }}>
          {error || 'No seating layout has been configured for this venue yet.'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ 
      width: '100%',
      height: '100%',
      display: 'flex', 
      flexDirection: 'column', 
      border: `1px solid ${BRAND_COLORS.border}`,
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      overflow: 'hidden',
      position: 'relative',
      bgcolor: '#fafafa',
      borderRadius: 2,
    }}>
      <Box sx={{ 
        flexShrink: 0,
        bgcolor: BRAND_COLORS.charcoal, 
        color: 'white', 
        py: 1.5, 
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: 700,
        letterSpacing: '4px',
        zIndex: 10,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        SCREEN
      </Box>

      <Box sx={{ flexGrow: 1, position: 'relative', minHeight: 300, overflow: 'hidden' }}>
        
        {!isStageReady && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 5 }}>
            <CircularProgress size={24} sx={{ color: BRAND_COLORS.red }} />
          </Box>
        )}

        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          sx={{ 
            position: 'absolute', 
            bottom: 16, 
            right: 16, 
            bgcolor: 'rgba(255, 255, 255, 0.95)', 
            backdropFilter: 'blur(4px)',
            borderRadius: 2, 
            px: 1, 
            py: 0.5,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            border: `1px solid ${BRAND_COLORS.border}`,
            zIndex: 30
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

        <Box sx={{ 
          position: 'absolute', 
          bottom: 16, 
          left: 16, 
          bgcolor: 'rgba(255, 255, 255, 0.95)', 
          backdropFilter: 'blur(4px)',
          borderRadius: 2, 
          px: 2, 
          py: 1,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          border: `1px solid ${BRAND_COLORS.border}`,
          zIndex: 30,
          display: 'flex',
          gap: 1.5,
          alignItems: 'center',
          flexWrap: 'wrap',
          maxWidth: 'calc(100% - 160px)' 
        }}>
          {legendStats.map((stat) => (
            <Box key={stat.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ 
                width: 12, 
                height: 12, 
                border: `1px solid ${BRAND_COLORS.charcoal}`, 
                borderRadius: 0.5, 
                bgcolor: stat.color 
              }} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: BRAND_COLORS.darkGray }}>
                {stat.name}: {stat.count}
              </Typography>
            </Box>
          ))}
          
          {selectedSeatIds.length > 0 && (
             <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1, pl: 1, borderLeft: `1px solid ${BRAND_COLORS.border}` }}>
               <Box sx={{ width: 12, height: 12, border: `1px solid ${BRAND_COLORS.charcoal}`, borderRadius: 0.5, bgcolor: BRAND_COLORS.red }} />
               <Typography variant="caption" sx={{ fontWeight: 700, color: BRAND_COLORS.red }}>
                 Selected: {selectedSeatIds.length}
               </Typography>
             </Box>
          )}
        </Box>
      </Box>
    </Paper>
  );
}