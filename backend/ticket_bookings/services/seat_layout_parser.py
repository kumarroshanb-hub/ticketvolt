import xml.etree.ElementTree as ET
import re
from collections import defaultdict
from ..models_seating import Seat, SeatLayout
from .venue_versioning import suppress_bumps
import logging

logger = logging.getLogger(__name__)

def ingest_svg_layout(layout_id, svg_file):
    """
    Reads an SVG file, extracts seat coordinates, and programmatically
    assigns Row/Seat numbers based on spatial proximity (Y then X).
    """
    layout = SeatLayout.objects.get(id=layout_id)
    
    # Clear existing seats if re-uploading.
    # Suppress per-seat post_delete bumps — otherwise a 5,000-seat
    # re-upload writes ~5,000 VenueMaster rows before the new seats are
    # even created. The caller bumps once after the new seats commit.
    with suppress_bumps():
        Seat.objects.filter(layout=layout).delete()
    
    # 1. Safely read the file content into memory
    try:
        if hasattr(svg_file, 'read'):
            content = svg_file.read()
            # Reset file pointer in case it's used elsewhere
            if hasattr(svg_file, 'seek'):
                svg_file.seek(0)
        else:
            content = svg_file
            
        if isinstance(content, bytes):
            # Remove UTF-8 BOM if present (common cause of "line 1, column 0" errors)
            if content.startswith(b'\xef\xbb\xbf'):
                content = content[3:]
            # Remove UTF-16 BOM if present
            if content.startswith(b'\xff\xfe') or content.startswith(b'\xfe\xff'):
                content = content[2:]
                
            # Decode to string, ignoring undecodable binary garbage
            svg_string = content.decode('utf-8', errors='ignore')
        else:
            svg_string = str(content)
            
        if not svg_string.strip():
            raise ValueError("The uploaded SVG file is completely empty.")
            
    except Exception as e:
        logger.error(f"Error reading SVG file: {e}")
        raise ValueError(f"Could not read the uploaded file: {str(e)}")

    # 2. Parse the XML safely
    root = None
    try:
        root = ET.fromstring(svg_string)
    except ET.ParseError as e:
        logger.warning(f"Initial SVG Parse Error: {e}. Attempting to extract <svg> tag...")
        # Fallback: Sometimes SVGs are wrapped in HTML or have garbage at the top.
        # Try to extract just the <svg> ... </svg> block.
        svg_match = re.search(r'(<svg[\s\S]*?</svg>)', svg_string, re.IGNORECASE)
        if svg_match:
            try:
                root = ET.fromstring(svg_match.group(1))
            except ET.ParseError as e2:
                raise ValueError(f"Failed to parse extracted SVG content: {e2}. Please ensure the file is a valid, clean SVG.")
        else:
            raise ValueError(f"Invalid SVG file format: {e}. The file might be corrupted, empty, or not a true XML/SVG file.")
            
    if root is None:
        raise ValueError("Could not parse the SVG root element.")

    # Handle SVG namespaces (e.g., {http://www.w3.org/2000/svg}rect)
    ns = ''
    match = re.match(r'\{.*\}', root.tag)
    if match:
        ns = match.group(0)
        
    raw_seats = []
    
    # 3. Extract all circles and rectangles (standard seat shapes)
    for elem in root.iter():
        # Strip namespace from tag for easier matching
        tag = elem.tag.replace(ns, '') if ns and elem.tag.startswith(ns) else elem.tag
        
        if tag == 'circle':
            cx = elem.get('cx')
            cy = elem.get('cy')
            if cx is not None and cy is not None:
                try:
                    raw_seats.append({
                        'x': float(cx),
                        'y': float(cy)
                    })
                except ValueError:
                    continue
                    
        elif tag == 'rect':
            x = elem.get('x')
            y = elem.get('y')
            width = elem.get('width', '0')
            height = elem.get('height', '0')
            if x is not None and y is not None:
                try:
                    # ✅ FIX: Calculate center of the rectangle for accurate row snapping
                    # (Previously it used top-left X/Y which offset the grid)
                    center_x = float(x) + float(width) / 2
                    center_y = float(y) + float(height) / 2
                    raw_seats.append({
                        'x': center_x,
                        'y': center_y
                    })
                except ValueError:
                    continue

    if not raw_seats:
        raise ValueError(
            "No seats found in the SVG. Please ensure your SVG contains "
            "<circle> or <rect> elements representing the seats. "
            "(Note: Groups <g> or Paths <path> are not automatically parsed yet)."
        )

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
    if seats_to_bulk_create:
        Seat.objects.bulk_create(seats_to_bulk_create)
        
    return len(seats_to_bulk_create)