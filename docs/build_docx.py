#!/usr/bin/env python3
"""Build TiketVault DOCX deliverables from the Markdown sources."""
import re
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor
from PIL import Image

ROOT = Path(__file__).resolve().parent
CHARCOAL = RGBColor(0x33, 0x33, 0x33)
RED = RGBColor(0xFF, 0x2A, 0x2A)
GREY = RGBColor(0x66, 0x66, 0x66)
LIGHT = RGBColor(0x99, 0x99, 0x99)


def set_cell_shading(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), hex_color)
    tcPr.append(shd)


def set_repeat_table_header(row):
    trPr = row._tr.get_or_add_trPr()
    tblHeader = OxmlElement('w:tblHeader')
    tblHeader.set(qn('w:val'), 'true')
    trPr.append(tblHeader)


def add_page_number(paragraph):
    run = paragraph.add_run()
    fldChar1 = OxmlElement('w:fldChar')
    fldChar1.set(qn('w:fldCharType'), 'begin')
    instrText = OxmlElement('w:instrText')
    instrText.set(qn('xml:space'), 'preserve')
    instrText.text = 'PAGE'
    fldChar2 = OxmlElement('w:fldChar')
    fldChar2.set(qn('w:fldCharType'), 'end')
    run._r.append(fldChar1)
    run._r.append(instrText)
    run._r.append(fldChar2)


def add_toc_field(document):
    paragraph = document.add_paragraph()
    run = paragraph.add_run()
    fldChar = OxmlElement('w:fldChar')
    fldChar.set(qn('w:fldCharType'), 'begin')
    instrText = OxmlElement('w:instrText')
    instrText.set(qn('xml:space'), 'preserve')
    instrText.text = 'TOC \\o "1-2" \\h \\z \\u'
    fldChar2 = OxmlElement('w:fldChar')
    fldChar2.set(qn('w:fldCharType'), 'separate')
    fldChar3 = OxmlElement('w:fldChar')
    fldChar3.set(qn('w:fldCharType'), 'end')
    run._r.append(fldChar)
    run._r.append(instrText)
    run._r.append(fldChar2)
    run._r.append(fldChar3)


def style_document(document):
    section = document.sections[0]
    section.page_height = Cm(29.7)
    section.page_width = Cm(21.0)
    section.top_margin = Cm(2.2)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.2)
    section.right_margin = Cm(2.2)

    styles = document.styles
    normal = styles['Normal']
    normal.font.name = 'Aptos'
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = CHARCOAL
    normal._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft JhengHei')
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.12

    for name, size, color, before, after in [
        ('Heading 1', 20, CHARCOAL, 18, 8),
        ('Heading 2', 14, CHARCOAL, 14, 5),
        ('Heading 3', 11.5, RED, 11, 4),
        ('Heading 4', 10.5, CHARCOAL, 8, 3),
    ]:
        st = styles[name]
        st.font.name = 'Aptos Display'
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = color
        st.paragraph_format.space_before = Pt(before)
        st.paragraph_format.space_after = Pt(after)
        st.paragraph_format.keep_with_next = True
        st._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft JhengHei')


def add_cover(document, title, subtitle, kicker, meta):
    for _ in range(4):
        document.add_paragraph()
    p = document.add_paragraph()
    r = p.add_run(kicker.upper())
    r.font.size = Pt(9)
    r.font.bold = True
    r.font.color.rgb = RED
    r.font.name = 'Aptos'

    p = document.add_paragraph()
    r = p.add_run(title)
    r.font.size = Pt(30)
    r.font.bold = True
    r.font.color.rgb = CHARCOAL
    r.font.name = 'Aptos Display'

    p = document.add_paragraph()
    r = p.add_run(subtitle)
    r.font.size = Pt(12)
    r.font.color.rgb = GREY

    p = document.add_paragraph()
    p.paragraph_format.space_before = Pt(25)
    r = p.add_run('TiketVault')
    r.font.size = Pt(11)
    r.font.bold = True
    r.font.color.rgb = RED
    r = p.add_run('  ·  Product documentation')
    r.font.size = Pt(11)
    r.font.color.rgb = GREY

    document.add_paragraph()
    table = document.add_table(rows=0, cols=2)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    for k, v in meta:
        row = table.add_row().cells
        row[0].text = k
        row[1].text = v
        for cell in row:
            for para in cell.paragraphs:
                for run in para.runs:
                    run.font.size = Pt(9)
                    run.font.color.rgb = CHARCOAL
        set_cell_shading(row[0], 'F2F2F2')
    document.add_paragraph()
    p = document.add_paragraph()
    r = p.add_run('CONFIDENTIAL — INTERNAL PRODUCT DOCUMENTATION')
    r.font.size = Pt(8)
    r.font.color.rgb = LIGHT
    r.font.bold = True


def add_header_footer(document, title):
    section = document.sections[0]
    header = section.header
    p = header.paragraphs[0]
    p.text = f'TiketVault  ·  {title}'
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for run in p.runs:
        run.font.size = Pt(8)
        run.font.color.rgb = GREY

    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_page_number(p)
    for run in p.runs:
        run.font.size = Pt(8)
        run.font.color.rgb = LIGHT


def add_inline(paragraph, text):
    tokens = re.split(r'(\*\*.*?\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))', text)
    for token in tokens:
        if not token:
            continue
        if token.startswith('**') and token.endswith('**'):
            run = paragraph.add_run(token[2:-2])
            run.bold = True
        elif token.startswith('`') and token.endswith('`'):
            run = paragraph.add_run(token[1:-1])
            run.font.name = 'Courier New'
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(0x99, 0x33, 0x33)
        elif token.startswith('['):
            m = re.match(r'\[([^\]]+)\]\(([^)]+)\)', token)
            if m:
                run = paragraph.add_run(f'{m.group(1)} ({m.group(2)})')
                run.font.color.rgb = RGBColor(0x1F, 0x4E, 0x79)
        else:
            paragraph.add_run(token)


def add_table(document, rows):
    if not rows:
        return
    cols = max(len(r) for r in rows)
    table = document.add_table(rows=0, cols=cols)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    for i, row_data in enumerate(rows):
        cells = table.add_row().cells
        for j in range(cols):
            value = row_data[j] if j < len(row_data) else ''
            cell = cells[j]
            cell.text = ''
            para = cell.paragraphs[0]
            add_inline(para, value)
            for run in para.runs:
                run.font.size = Pt(8.5)
            if i == 0:
                for run in para.runs:
                    run.bold = True
                    run.font.color.rgb = CHARCOAL
                set_cell_shading(cell, 'E8E8E8')
        trPr = table.rows[-1]._tr.get_or_add_trPr()
        cantSplit = OxmlElement('w:cantSplit')
        trPr.append(cantSplit)
        if i == 0:
            set_repeat_table_header(table.rows[0])
    document.add_paragraph().paragraph_format.space_after = Pt(4)


def add_picture(document, path, caption, figure_no):
    if not path.exists():
        document.add_paragraph(f'[Diagram unavailable: {path.name}]')
        return
    try:
        with Image.open(path) as img:
            w, h = img.size
    except Exception:
        w, h = 1600, 900

    # Very tall diagrams become unreadable when squeezed onto one page.
    # Split them into overlapping vertical slices, each rendered at full
    # text width, so the text remains legible in the DOCX.
    if h / w > 1.75:
        slice_h = int(w * 1.15)
        slices = []
        top = 0
        with Image.open(path).convert('RGB') as img:
            gray = img.convert('L')
            px = gray.load()
            while top < h:
                target = min(h, top + slice_h)
                bottom = target
                if target < h:
                    # Prefer a cut through near-white whitespace so nodes and
                    # connector labels are not sliced in half.
                    low = max(top + int(w * 0.85), top + 1)
                    high = min(h - 1, target + int(w * 0.25))
                    best = target
                    best_score = 1.0
                    for y in range(low, high + 1):
                        nonwhite = sum(1 for x in range(0, w, 4) if px[x, y] < 245)
                        score = nonwhite / max(1, len(range(0, w, 4)))
                        if score < best_score:
                            best_score = score
                            best = y
                            if score == 0:
                                break
                    bottom = best
                crop = img.crop((0, top, w, bottom))
                slice_dir = ROOT / 'assets' / 'diagrams' / '_slices'
                slice_dir.mkdir(exist_ok=True)
                sp = slice_dir / f'{path.stem}_part{len(slices) + 1}.png'
                crop.save(sp)
                slices.append(sp)
                if bottom >= h:
                    break
                top = bottom
        for idx, sp in enumerate(slices, 1):
            p = document.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run()
            run.add_picture(str(sp), width=Inches(6.5))
            cap = document.add_paragraph()
            cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
            suffix = f' (part {idx} of {len(slices)})' if len(slices) > 1 else ''
            r = cap.add_run(f'Figure {figure_no} — {caption}{suffix}')
            r.font.size = Pt(8)
            r.italic = True
            r.font.color.rgb = GREY
            if idx < len(slices):
                document.add_page_break()
        return

    max_w = 6.5
    max_h = 8.7
    width = max_w
    if h / w * width > max_h:
        width = max_h * w / h
    p = document.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    run.add_picture(str(path), width=Inches(width))
    cap = document.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = cap.add_run(f'Figure {figure_no} — {caption}')
    r.font.size = Pt(8)
    r.italic = True
    r.font.color.rgb = GREY


def add_code_block(document, lines):
    p = document.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.35)
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run('\n'.join(lines))
    r.font.name = 'Courier New'
    r.font.size = Pt(8)
    r.font.color.rgb = RGBColor(0x33, 0x33, 0x33)
    # light shading
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), 'F7F7F7')
    pPr.append(shd)


def build(source, out, title, subtitle, kicker, meta, diagram_prefix, include_subheadings=True):
    text = Path(source).read_text()
    lines = text.splitlines()
    document = Document()
    style_document(document)
    add_header_footer(document, title)
    add_cover(document, title, subtitle, kicker, meta)
    document.add_page_break()

    # Contents page — generated from the Markdown headings so it is
    # readable in every viewer without requiring a field update.
    document.add_heading('Contents', level=1)
    for hline in lines:
        if hline.startswith('## '):
            p = document.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.6)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(hline[3:].strip())
            r.font.size = Pt(9)
            r.font.color.rgb = CHARCOAL
            r.bold = True
        elif include_subheadings and hline.startswith('### '):
            p = document.add_paragraph()
            p.paragraph_format.left_indent = Cm(1.1)
            p.paragraph_format.space_after = Pt(1)
            r = p.add_run(hline[4:].strip())
            r.font.size = Pt(8.5)
            r.font.color.rgb = GREY
    document.add_page_break()

    figure_no = 0
    i = 0
    while i < len(lines):
        line = lines[i]

        if line.startswith('```'):
            lang = line.strip('`').strip()
            block = []
            i += 1
            while i < len(lines) and not lines[i].startswith('```'):
                block.append(lines[i])
                i += 1
            i += 1
            if lang == 'mermaid':
                figure_no += 1
                path = ROOT / 'assets' / 'diagrams' / f'{diagram_prefix}_{figure_no:02d}.png'
                add_picture(document, path, 'workflow / architecture diagram', figure_no)
            else:
                add_code_block(document, block)
            continue

        if line.startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s\-:|]+\|$', lines[i + 1].strip()):
            rows = []
            def split_row(row):
                parts = re.split(r'(?<!\\)\|', row.strip().strip('|'))
                return [c.strip().replace('\\|', '|') for c in parts]

            rows.append(split_row(line))
            i += 2
            while i < len(lines) and lines[i].startswith('|'):
                rows.append(split_row(lines[i]))
                i += 1
            add_table(document, rows)
            continue

        if line.startswith('#### '):
            document.add_heading(line[5:].strip(), level=4)
        elif line.startswith('### '):
            document.add_heading(line[4:].strip(), level=3)
        elif line.startswith('## '):
            document.add_heading(line[3:].strip(), level=2)
        elif line.startswith('# '):
            document.add_heading(line[2:].strip(), level=1)
        elif line.startswith('- ') or line.startswith('* '):
            p = document.add_paragraph(style='List Bullet')
            add_inline(p, line[2:].strip())
        elif re.match(r'^\d+\.\s+', line):
            p = document.add_paragraph(style='List Number')
            add_inline(p, re.sub(r'^\d+\.\s+', '', line))
        elif line.strip() == '---':
            p = document.add_paragraph()
            pPr = p._p.get_or_add_pPr()
            pBdr = OxmlElement('w:pBdr')
            bottom = OxmlElement('w:bottom')
            bottom.set(qn('w:val'), 'single')
            bottom.set(qn('w:sz'), '6')
            bottom.set(qn('w:space'), '1')
            bottom.set(qn('w:color'), 'CCCCCC')
            pBdr.append(bottom)
            pPr.append(pBdr)
        elif line.strip() == '':
            pass
        elif line.startswith('> '):
            p = document.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.5)
            add_inline(p, line[2:])
            for run in p.runs:
                run.font.color.rgb = GREY
                run.italic = True
        else:
            p = document.add_paragraph()
            add_inline(p, line)
        i += 1

    document.save(out)
    print(f'Wrote {out}')


if __name__ == '__main__':
    build(
        ROOT / 'ARCHITECTURE.md',
        ROOT / 'TiketVault_Architecture.docx',
        'Product Architecture',
        'System architecture, tenancy, domain design, security and deployment',
        'Architecture document',
        [
            ('Document', 'TiketVault Product Architecture'),
            ('Version', '1.0 — current state'),
            ('Date', '12 November 2026'),
            ('Audience', 'Engineering, product, security, operations'),
            ('Status', 'Current-state architecture'),
        ],
        'arch',
    )
    build(
        ROOT / 'FUNCTIONAL_SPEC.md',
        ROOT / 'TiketVault_Functional_Specification.docx',
        'Functional Specification',
        'Roles, modules, validation, APIs and complete field data dictionary',
        'Functional specification',
        [
            ('Document', 'TiketVault Functional Specification'),
            ('Version', '1.0 — current state'),
            ('Date', '12 November 2026'),
            ('Audience', 'Product, engineering, QA, support'),
            ('Scope', '43 models and all current product modules'),
        ],
        'spec',
        include_subheadings=False,
    )
    build(
        ROOT / 'WORKFLOWS.md',
        ROOT / 'TiketVault_Workflows.docx',
        'Workflow Diagrams',
        'End-to-end operational workflows starting with organisation creation',
        'Workflow documentation',
        [
            ('Document', 'TiketVault Workflow Diagrams'),
            ('Version', '1.0 — current state'),
            ('Date', '12 November 2026'),
            ('Audience', 'Product, operations, engineering'),
            ('Diagrams', '21 Mermaid workflows'),
        ],
        'work',
    )
