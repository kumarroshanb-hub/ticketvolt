// frontend/src/components/Seating/InteractiveSeatMap.js
import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { Box, CircularProgress, Typography, Chip } from '@mui/material';
import { theme } from '../../theme/tokens'; // Adjust path based on your exact folder structure

const C = theme.colors;
const SEAT_SIZE = 16;
const SEAT_GAP = 4;

/**
 * InteractiveSeatMap
 * Renders a venue layout using HTML5 Canvas (via Konva) for high performance.
 * Fetches seat data and handles selection state.
 */
const InteractiveSeatMap = ({ eventId, sessionId, selectedSeatIds = [], onSelectSeats }) => {
  const [layoutData, setLayoutData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backgroundImage] = useImage(layoutData?.background_image);
  const stageRef = useRef(null);

  // Fetch Layout & Availability
  useEffect(() => {
    const fetchLayout = async () => {
      try {
        // TODO: Replace with your actual API service call
        // const res = await api.get(`/events/${eventId}/seat-map/`, { params: { session: sessionId } });
        // setLayoutData(res.data);
        
        // MOCK DATA FOR TESTING (Remove when backend is connected)
        setTimeout(() => {
          setLayoutData({
            canvas_width: 800,
            canvas_height: 600,
            background_image: null,
            seats: Array.from({ length: 50 }, (_, i) => ({
              id: `seat_${i}`,
              x_coord: (i % 10) * (SEAT_SIZE + SEAT_GAP) + 50,
              y_coord: Math.floor(i / 10) * (SEAT_SIZE + SEAT_GAP) + 50,
              status: i % 7 === 0 ? 'booked' : 'available',
              category_color: i % 3 === 0 ? C.warning : C.success,
              row_label: String.fromCharCode(65 + Math.floor(i / 10)),
              seat_number: (i % 10) + 1
            }))
          });
          setLoading(false);
        }, 500);

      } catch (err) {
        setError('Failed to load seating layout.');
        setLoading(false);
      }
    };

    if (eventId) fetchLayout();
  }, [eventId, sessionId]);

  const handleSeatClick = (seat) => {
    if (seat.status !== 'available') return;
    
    const newSelection = selectedSeatIds.includes(seat.id)
      ? selectedSeatIds.filter(id => id !== seat.id)
      : [...selectedSeatIds, seat.id];
      
    onSelectSeats(newSelection);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400, bgcolor: C.bgCard, borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
        <CircularProgress sx={{ color: C.primary }} />
      </Box>
    );
  }

  if (error || !layoutData) {
    return (
      <Box sx={{ p: 3, textAlign: 'center', bgcolor: C.bgCard, borderRadius: 2, border: `1px solid ${C.borderLight}` }}>
        <Typography sx={{ color: C.textMuted }}>{error || 'No seating layout available for this venue.'}</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ 
        width: '100%', 
        height: 500, 
        border: `1px solid ${C.borderLight}`, 
        borderRadius: 2, 
        overflow: 'hidden', 
        bgcolor: C.bgPrimary 
      }}>
        <Stage
          width={800} // Make dynamic based on container width if needed
          height={500}
          ref={stageRef}
          draggable
        >
          <Layer>
            {/* Background Map */}
            {backgroundImage && (
              <KonvaImage 
                image={backgroundImage} 
                width={layoutData.canvas_width} 
                height={layoutData.canvas_height} 
                opacity={0.3} 
              />
            )}
            
            {/* Render Seats */}
            {layoutData.seats.map((seat) => {
              const isSelected = selectedSeatIds.includes(seat.id);
              let fillColor = seat.category_color || C.success; // Default available
              
              if (seat.status === 'booked') fillColor = C.textDisabled;
              else if (seat.status === 'held') fillColor = C.warning;
              
              if (isSelected) fillColor = C.primary; // Selected overrides everything

              return (
                <Rect
                  key={seat.id}
                  x={seat.x_coord}
                  y={seat.y_coord}
                  width={SEAT_SIZE}
                  height={SEAT_SIZE}
                  cornerRadius={3}
                  fill={fillColor}
                  stroke={isSelected ? '#fff' : 'transparent'}
                  strokeWidth={2}
                  onClick={() => handleSeatClick(seat)}
                  onMouseEnter={(e) => {
                    if (seat.status === 'available') {
                      const container = e.target.getStage().container();
                      container.style.cursor = 'pointer';
                    }
                  }}
                  onMouseLeave={(e) => {
                    const container = e.target.getStage().container();
                    container.style.cursor = 'default';
                  }}
                />
              );
            })}
          </Layer>
        </Stage>
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
        <Chip size="small" label="Available" sx={{ bgcolor: C.success, color: '#fff', fontWeight: 600 }} />
        <Chip size="small" label="Selected" sx={{ bgcolor: C.primary, color: '#fff', fontWeight: 600 }} />
        <Chip size="small" label="Booked" sx={{ bgcolor: C.textDisabled, color: C.textPrimary, fontWeight: 600 }} />
        <Chip size="small" label="Held" sx={{ bgcolor: C.warning, color: '#fff', fontWeight: 600 }} />
      </Box>
    </Box>
  );
};

export default InteractiveSeatMap;