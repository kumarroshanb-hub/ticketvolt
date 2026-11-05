import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import Konva from 'konva';
import { Box, CircularProgress, Typography } from '@mui/material';
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

const PADDING_TOP = 20;
const PADDING_BOTTOM = 80; 
const PADDING_SIDE = 40;

const getSeatColor = (seat, isSelected) => {
  if (isSelected) return '#333333'; 
  if (seat.status === 'booked' || seat.status === 'sold') return '#e0e0e0'; 
  if (seat.status === 'held') return BRAND_COLORS.warning; 
  return seat.category_color || '#94a3b8';
};

const getSeatStroke = (seat, isSelected) => {
  if (isSelected) return '#000000'; 
  if (seat.status === 'booked' || seat.status === 'sold') return '#bdbdbd';
  return BRAND_COLORS.charcoal;
};

const SeatingCanvas = forwardRef(({
  eventId,
  sessionId,
  selectedSeatIds = [],
  onSelectSeats,
  readOnly = false,
  layoutData: externalLayoutData,
}, ref) => {
  const [layoutData, setLayoutData] = useState(externalLayoutData || null);
  const [loading, setLoading] = useState(!externalLayoutData);
  const [error, setError] = useState(null);
  
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const layerRef = useRef(null);
  const nodesRef = useRef(new Map());
  
  const onSelectRef = useRef(onSelectSeats);
  const readOnlyRef = useRef(readOnly);
  const activeSelectionRef = useRef(new Set(selectedSeatIds.map(s => s.id || s)));

  const [zoomPct, setZoomPct] = useState(100);
  const [isStageReady, setIsStageReady] = useState(false);

  useEffect(() => { onSelectRef.current = onSelectSeats; }, [onSelectSeats]);
  useEffect(() => { readOnlyRef.current = readOnly; }, [readOnly]);

  useEffect(() => {
    if (externalLayoutData) {
      setLayoutData(externalLayoutData);
      setLoading(false);
      return;
    }
    
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

  const fitToContainer = useCallback((stage, container, animate = false) => {
    if (!stage || !container || !layoutData?.seats?.length) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    layoutData.seats.forEach(seat => {
      minX = Math.min(minX, seat.x_coord);
      maxX = Math.max(maxX, seat.x_coord + SEAT_SIZE); 
      minY = Math.min(minY, seat.y_coord);
      maxY = Math.max(maxY, seat.y_coord + SEAT_SIZE); 
    });

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    const w = container.clientWidth;
    const h = container.clientHeight;
    const dynamicBottomPadding = h < 350 ? 20 : PADDING_BOTTOM; 

    const availW = Math.max(100, w - (PADDING_SIDE * 2));
    const availH = Math.max(100, h - (PADDING_TOP + dynamicBottomPadding));
    
    const scaleX = availW / contentWidth;
    const scaleY = availH / contentHeight;
    const newScale = Math.max(MIN_SCALE, Math.min(scaleX, scaleY, 1.5));
    
    const centerX = (w - (contentWidth * newScale)) / 2;
    const centerY = (h - (contentHeight * newScale)) / 2;
    
    const targetPos = {
      x: centerX - (minX * newScale),
      y: centerY - (minY * newScale),
    };

    if (animate) {
      stage.to({ ...targetPos, scaleX: newScale, scaleY: newScale, duration: 0.2, onFinish: () => setZoomPct(Math.round(newScale * 100)) });
    } else {
      stage.scale({ x: newScale, y: newScale });
      stage.position(targetPos);
      setZoomPct(Math.round(newScale * 100));
    }
  }, [layoutData]);

  useLayoutEffect(() => {
    if (!containerRef.current || !layoutData?.seats?.length) return;
    if (stageRef.current) return; 

    const el = containerRef.current;
    let stage = null;
    let layer = null;
    let animationFrameId = null;

    const initKonva = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;

      if (w === 0 || h === 0) {
        animationFrameId = requestAnimationFrame(initKonva);
        return;
      }

      stage = new Konva.Stage({ container: el, width: w, height: h, draggable: true });
      layer = new Konva.Layer();
      stage.add(layer);
      stageRef.current = stage;
      layerRef.current = layer;

      layoutData.seats.forEach((seat) => {
        const isSelected = activeSelectionRef.current.has(seat.id);
        const seatNumber = seat.seat_number || seat.id.substring(0, 4);
        
        const group = new Konva.Group({ x: seat.x_coord, y: seat.y_coord });

        const rect = new Konva.Rect({
          width: SEAT_SIZE,
          height: SEAT_SIZE,
          cornerRadius: 3,
          fill: getSeatColor(seat, isSelected),
          stroke: getSeatStroke(seat, isSelected),
          strokeWidth: isSelected ? 2.5 : 1.5,
          shadowColor: isSelected ? '#000000' : 'transparent',
          shadowBlur: isSelected ? 10 : 0,
          shadowOpacity: 0.5,
          perfectDrawEnabled: false,
          listening: seat.status === 'available' && !readOnlyRef.current,
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
          
          const nextSet = new Set(activeSelectionRef.current);
          if (nextSet.has(seat.id)) nextSet.delete(seat.id);
          else nextSet.add(seat.id);
          activeSelectionRef.current = nextSet;

          const newIsSelected = nextSet.has(seat.id);
          rect.fill(getSeatColor(seat, newIsSelected));
          rect.stroke(getSeatStroke(seat, newIsSelected));
          rect.strokeWidth(newIsSelected ? 2.5 : 1.5);
          rect.shadowColor(newIsSelected ? '#000000' : 'transparent');
          rect.shadowBlur(newIsSelected ? 10 : 0);
          text.fill(newIsSelected ? '#ffffff' : BRAND_COLORS.charcoal);
          text.fontStyle(newIsSelected ? 'bold' : 'normal');
          layer.batchDraw();

          const nextSeats = layoutData.seats.filter(s => nextSet.has(s.id));
          if (onSelectRef.current) onSelectRef.current(nextSeats);
        });

        group.on('mouseenter', () => {
          if (seat.status === 'available' && !activeSelectionRef.current.has(seat.id) && !readOnlyRef.current) {
            stage.container().style.cursor = 'pointer';
            rect.fill(getSeatColor(seat, false) + 'CC'); 
            layer.batchDraw();
          }
        });
        
        group.on('mouseleave', () => {
          stage.container().style.cursor = 'default';
          if (!activeSelectionRef.current.has(seat.id)) {
            rect.fill(getSeatColor(seat, false));
            layer.batchDraw();
          }
        });

        layer.add(group);
        nodesRef.current.set(seat.id, { group, rect, text });
      });

      fitToContainer(stage, el, false);
      setIsStageReady(true);

      stage.on('wheel', (e) => {
        if (!e.evt.ctrlKey && !e.evt.metaKey) return;
        e.evt.preventDefault();
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const factor = e.evt.deltaY > 0 ? 1 / 1.15 : 1.15;
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * factor));
        const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
        stage.scale({ x: newScale, y: newScale });
        stage.position({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
        setZoomPct(Math.round(newScale * 100));
        layer.batchDraw();
      });

      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && stage) {
          stage.width(width);
          stage.height(height);
          fitToContainer(stage, el, false); 
          layer.batchDraw();
        }
      });
      ro.observe(el);
      stage._ro = ro;
      layer.batchDraw();
    };

    animationFrameId = requestAnimationFrame(initKonva);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (stage) {
        if (stage._ro) stage._ro.disconnect();
        stage.destroy();
      }
      stageRef.current = null;
      layerRef.current = null;
      nodesRef.current.clear();
      setIsStageReady(false);
    };
  }, [layoutData, fitToContainer]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !layoutData) return;
    const parentIds = new Set(selectedSeatIds.map(s => s.id || s));
    activeSelectionRef.current = parentIds;

    layoutData.seats.forEach((seat) => {
      const node = nodesRef.current.get(seat.id);
      if (!node) return;
      const isSelected = parentIds.has(seat.id);
      node.rect.fill(getSeatColor(seat, isSelected));
      node.rect.stroke(getSeatStroke(seat, isSelected));
      node.rect.strokeWidth(isSelected ? 2.5 : 1.5);
      node.rect.shadowColor(isSelected ? '#000000' : 'transparent');
      node.rect.shadowBlur(isSelected ? 10 : 0);
      node.text.fill(isSelected ? '#ffffff' : BRAND_COLORS.charcoal);
      node.text.fontStyle(isSelected ? 'bold' : 'normal');
    });
    layer.batchDraw();
  }, [selectedSeatIds, layoutData]);

  // ✅ Expose methods and state to parent via ref
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const stage = stageRef.current;
      if (!stage) return;
      const oldScale = stage.scaleX();
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * 1.25));
      const center = { x: stage.width() / 2, y: stage.height() / 2 };
      const pointTo = { x: (center.x - stage.x()) / oldScale, y: (center.y - stage.y()) / oldScale };
      stage.scale({ x: newScale, y: newScale });
      stage.position({ x: center.x - pointTo.x * newScale, y: center.y - pointTo.y * newScale });
      stage.batchDraw();
      setZoomPct(Math.round(newScale * 100));
    },
    zoomOut: () => {
      const stage = stageRef.current;
      if (!stage) return;
      const oldScale = stage.scaleX();
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale / 1.25));
      const center = { x: stage.width() / 2, y: stage.height() / 2 };
      const pointTo = { x: (center.x - stage.x()) / oldScale, y: (center.y - stage.y()) / oldScale };
      stage.scale({ x: newScale, y: newScale });
      stage.position({ x: center.x - pointTo.x * newScale, y: center.y - pointTo.y * newScale });
      stage.batchDraw();
      setZoomPct(Math.round(newScale * 100));
    },
    fitToScreen: () => {
      if (!stageRef.current || !containerRef.current) return;
      fitToContainer(stageRef.current, containerRef.current, true);
    },
    zoomPct,
    legendStats
  }), [zoomPct, legendStats, fitToContainer]);

  if (loading) {
    return (
      <Box sx={{ p: 3, border: `1px solid ${BRAND_COLORS.border}`, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 400, bgcolor: BRAND_COLORS.lightGray }}>
        <CircularProgress sx={{ color: BRAND_COLORS.red }} />
      </Box>
    );
  }

  if (error || !layoutData?.seats?.length) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', border: `1px solid ${BRAND_COLORS.border}`, height: '100%', minHeight: 400, bgcolor: BRAND_COLORS.lightGray }}>
        <Typography sx={{ color: BRAND_COLORS.darkGray }}>
          {error || 'No seating layout has been configured for this venue yet.'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      width: '100%',
      height: '100%',
      display: 'flex', 
      flexDirection: 'column', 
      overflow: 'hidden',
      position: 'relative',
      bgcolor: '#fafafa',
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

      <Box sx={{ flexGrow: 1, position: 'relative', minHeight: 300 }}>
        
        {!isStageReady && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 5 }}>
            <CircularProgress size={24} sx={{ color: BRAND_COLORS.red }} />
          </Box>
        )}

        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </Box>
    </Box>
  );
});

export default SeatingCanvas;