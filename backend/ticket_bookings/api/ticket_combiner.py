# backend/ticket_bookings/api/ticket_combiner.py
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import logging
import os
from django.conf import settings

logger = logging.getLogger(__name__)


class TicketCombiner:
    """
    Combine multiple tickets into a single image with pagination
    """
    
    def __init__(self, tickets_per_row=2, padding=15, background_color='white'):
        self.tickets_per_row = tickets_per_row
        self.padding = padding
        self.background_color = background_color
        self.font_path = self._get_font_path()
    
    def _get_font_path(self):
        """Get path to a suitable font"""
        font_paths = [
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
            '/System/Library/Fonts/Helvetica.ttc',
            os.path.join(settings.BASE_DIR, 'fonts', 'arial.ttf'),
        ]
        
        for path in font_paths:
            if os.path.exists(path):
                return path
        return None
    
    def _get_font(self, size):
        """Get font for given size"""
        if self.font_path and os.path.exists(self.font_path):
            try:
                return ImageFont.truetype(self.font_path, size)
            except:
                pass
        return ImageFont.load_default()
    
    def combine_to_paginated_image(self, ticket_buffers, booking, tickets_per_page=4, output_format='PNG', quality=95):
        """
        Combine tickets into a single paginated image
        Each page shows up to 'tickets_per_page' tickets
        """
        try:
            if not ticket_buffers:
                return None
            
            # Load all ticket images
            images = []
            for buffer_data in ticket_buffers:
                buffer = buffer_data['buffer']
                buffer.seek(0)
                img = Image.open(buffer)
                images.append(img)
            
            if not images:
                return None
            
            num_tickets = len(images)
            num_pages = (num_tickets + tickets_per_page - 1) // tickets_per_page
            
            logger.info(f"📄 Creating {num_pages} pages for {num_tickets} tickets")
            
            # Get dimensions
            max_width = max(img.width for img in images)
            max_height = max(img.height for img in images)
            
            # Calculate page layout
            cols = min(self.tickets_per_row, tickets_per_page)
            rows = (tickets_per_page + cols - 1) // cols
            
            # Calculate page size
            page_width = (max_width * cols) + (self.padding * (cols + 1))
            page_height = (max_height * rows) + (self.padding * (rows + 1)) + 120
            
            # Create all pages
            page_images = []
            for page_num in range(num_pages):
                start_idx = page_num * tickets_per_page
                end_idx = min(start_idx + tickets_per_page, num_tickets)
                page_tickets = images[start_idx:end_idx]
                
                # Create page
                page = Image.new('RGB', (page_width, page_height), self.background_color)
                draw = ImageDraw.Draw(page)
                
                # Get fonts
                try:
                    header_font = self._get_font(22)
                    sub_font = self._get_font(14)
                except:
                    header_font = ImageFont.load_default()
                    sub_font = ImageFont.load_default()
                
                # Header background
                draw.rectangle([0, 0, page_width, 80], fill='#4f46e5')
                
                # Header text
                header_text = f"🎫 Your Tickets - {booking.booking_reference}"
                draw.text((20, 18), header_text, fill='white', font=header_font)
                
                # Subheader
                sub_text = f"Event: {booking.event.title if booking.event else 'N/A'} | Customer: {booking.customer_name}"
                draw.text((20, 48), sub_text, fill='rgba(255,255,255,200)', font=sub_font)
                
                # Page number
                page_text = f"Page {page_num + 1} of {num_pages}"
                draw.text((page_width - 150, 28), page_text, fill='rgba(255,255,255,180)', font=sub_font)
                
                # Tickets grid
                for idx, img in enumerate(page_tickets):
                    row = idx // cols
                    col = idx % cols
                    
                    x = self.padding + (col * (max_width + self.padding))
                    y = 80 + self.padding + (row * (max_height + self.padding))
                    
                    # Center the image
                    x_offset = (max_width - img.width) // 2
                    y_offset = (max_height - img.height) // 2
                    
                    # Add shadow
                    shadow = Image.new('RGB', (max_width + 6, max_height + 6), '#e2e8f0')
                    page.paste(shadow, (x + 3, y + 3))
                    
                    page.paste(img, (x + x_offset, y + y_offset))
                    
                    # Add border
                    draw.rectangle([x, y, x + max_width, y + max_height], outline='#e2e8f0', width=1)
                    
                    # Ticket number badge
                    ticket_num = start_idx + idx + 1
                    badge_x = x + 8
                    badge_y = y + 8
                    draw.ellipse([badge_x, badge_y, badge_x + 28, badge_y + 28], fill='#4f46e5')
                    draw.text((badge_x + 8, badge_y + 4), f"{ticket_num}", fill='white', font=sub_font)
                
                # Footer
                footer_y = page_height - 35
                footer_text = f"TicketVolt • Generated: {booking.created_at.strftime('%d %b %Y %H:%M')}"
                draw.text((20, footer_y), footer_text, fill='#a0aec0', font=sub_font)
                draw.text((page_width - 200, footer_y), "Scan QR at venue", fill='#a0aec0', font=sub_font)
                
                # Page separator
                draw.line([0, page_height - 45, page_width, page_height - 45], fill='#e2e8f0', width=1)
                
                page_images.append(page)
            
            # Combine all pages
            if len(page_images) == 1:
                buffer = BytesIO()
                page_images[0].save(buffer, format=output_format, quality=quality)
                buffer.seek(0)
                return buffer
            
            # Stack pages vertically with dividers
            total_height = sum(page.height for page in page_images) + (30 * (len(page_images) - 1))
            final_width = max(page.width for page in page_images)
            
            final_image = Image.new('RGB', (final_width, total_height), self.background_color)
            
            y_offset = 0
            for i, page in enumerate(page_images):
                final_image.paste(page, (0, y_offset))
                y_offset += page.height
                
                if i < len(page_images) - 1:
                    draw = ImageDraw.Draw(final_image)
                    divider_y = y_offset - 12
                    # Page break indicator
                    for j in range(0, final_width, 30):
                        draw.rectangle([j, divider_y, j + 15, divider_y + 2], fill='#cbd5e1')
                    draw.text((final_width//2 - 60, divider_y - 12), "— Page Break —", fill='#a0aec0')
                    y_offset += 30
            
            buffer = BytesIO()
            final_image.save(buffer, format=output_format, quality=quality)
            buffer.seek(0)
            
            logger.info(f"✅ Combined {num_tickets} tickets into {num_pages} pages")
            return buffer
            
        except Exception as e:
            logger.error(f"❌ Error combining tickets: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
    
    def combine_to_pdf(self, ticket_buffers, booking, tickets_per_page=4):
        """Combine tickets into a single PDF with pagination"""
        try:
            from reportlab.lib.pagesizes import letter, landscape
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib import colors
            from reportlab.lib.units import inch
            from reportlab.lib.utils import ImageReader
            
            buffer = BytesIO()
            doc = SimpleDocTemplate(
                buffer,
                pagesize=landscape(letter),
                rightMargin=30,
                leftMargin=30,
                topMargin=30,
                bottomMargin=30,
            )
            
            styles = getSampleStyleSheet()
            story = []
            
            num_pages = (len(ticket_buffers) + tickets_per_page - 1) // tickets_per_page
            
            for page_num in range(num_pages):
                if page_num > 0:
                    story.append(PageBreak())
                
                # Page header
                title_style = ParagraphStyle(
                    'Title',
                    parent=styles['Heading1'],
                    fontSize=18,
                    textColor=colors.HexColor('#2D3748'),
                    alignment=1,
                    spaceAfter=20,
                )
                story.append(Paragraph(
                    f"Your Tickets - {booking.booking_reference} - Page {page_num + 1} of {num_pages}",
                    title_style
                ))
                
                # Tickets for this page
                start_idx = page_num * tickets_per_page
                end_idx = min(start_idx + tickets_per_page, len(ticket_buffers))
                
                data = []
                row = []
                for i in range(start_idx, end_idx):
                    tb = ticket_buffers[i]
                    tb['buffer'].seek(0)
                    img = ImageReader(tb['buffer'])
                    cell = [
                        img,
                        Paragraph(f"Ticket: {tb['ticket'].unique_code}", styles['Normal']),
                        Paragraph(f"Attendee: {tb['ticket'].attendee_name or booking.customer_name}", styles['Normal']),
                    ]
                    row.append(cell)
                    if len(row) >= 2:
                        data.append(row)
                        row = []
                if row:
                    data.append(row)
                
                if data:
                    table = Table(data, colWidths=[4*inch, 4*inch], rowHeights=[3.5*inch, 0.4*inch, 0.3*inch])
                    table.setStyle(TableStyle([
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#E2E8F0')),
                        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#EDF2F7')),
                    ]))
                    story.append(table)
            
            doc.build(story)
            buffer.seek(0)
            return buffer
            
        except Exception as e:
            logger.error(f"❌ Error combining to PDF: {str(e)}")
            return None