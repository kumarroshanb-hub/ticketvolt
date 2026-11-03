import xml.etree.ElementTree as ET
import re
from collections import defaultdict
from ..models_seating import Seat, SeatLayout

def ingest_svg_layout(layout_id, svg_file):
    """
    Reads an SVG file, extracts seat coordinates, and programmatically 
    assigns Row/Seat numbers based on spatial proximity (Y then X).
    """
    layout = SeatLayout.objects.get(id=layout_id)
    
    # Clear existing seats if re-uploading
    Seat.objects.filter(layout=layout).delete()
    
    tree = ET.parse(svg_file)
    root = tree.getroot()
    
    # Handle SVG namespaces
    ns = ''
    match = re.match(r'\{.*\}', root.tag)
    if match:
        ns = match.group(0)
        
    raw_seats = []
    
    # Extract all circles and rectangles (standard seat shapes)
    for elem in root.iter():
        if elem.tag == f'{ns}circle':
            raw_seats.append({
                'x': float(elem.get('cx', 0)),
                'y': float(elem.get('cy', 0))
            })
        elif elem.tag == f'{ns}rect':
            raw_seats.append({
                'x': float(elem.get('x', 0)),
                'y': float(elem.get('y', 0))
            })

    # --- AUTOMATION LOGIC: Grid Snapping & Row/Seat Assignment ---
    # 1. Snap Y coordinates to rows (allowing a 5px tolerance)
    rows = defaultdict(list)
    tolerance = 5.0 
    
    for seat in raw_seats:
        placed = False
        for row_y in rows.keys():
            if abs(seat['y'] - row_y) <= tolerance:
                rows[row_y].append(seat)
                placed = True
                break
        if not placed:
            rows[seat['y']].append(seat)

    # 2. Sort rows top-to-bottom, and seats left-to-right
    sorted_row_ys = sorted(rows.keys())
    seats_to_bulk_create = []
    
    for row_idx, row_y in enumerate(sorted_row_ys):
        row_label = chr(65 + row_idx) if row_idx < 26 else f"R{row_idx+1}" # A, B, C...
        sorted_seats_in_row = sorted(rows[row_y], key=lambda s: s['x'])
        
        for seat_idx, seat_data in enumerate(sorted_seats_in_row, start=1):
            seats_to_bulk_create.append(
                Seat(
                    layout=layout,
                    row_label=row_label,
                    seat_number=str(seat_idx),
                    x_coord=seat_data['x'],
                    y_coord=seat_data['y'],
                    is_active=True
                )
            )

    # Bulk create for performance (handles 5,000+ seats easily)
    Seat.objects.bulk_create(seats_to_bulk_create)
    return len(seats_to_bulk_create)