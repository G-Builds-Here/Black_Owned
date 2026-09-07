#!/usr/bin/env python3
"""Render C4 architecture diagrams as interactive HTML.

Follows the C4 model specification (https://c4model.com/):
- 3-line element boxes: Name, Description, [Technology]
- Correct shapes: Person, Software System, Container, Component, Database, Queue
- Diagram titles: "{Type} diagram for {SystemName}"
- Legend showing all notation
- Interactive click-through navigation

Usage:
    python c4-render.py <c4_data.json> -o architecture.html
    python c4-render.py <c4_data.json> --baseline baseline.json -o delta.html

Output:
    Single self-contained HTML file with embedded CSS/JS/SVG.
"""

import argparse
import json
import os
import sys
from pathlib import Path


def sanitize_id(name):
    """Convert name to valid HTML/CSS ID."""
    return name.lower().replace(' ', '-').replace('.', '-').replace('_', '-').replace('/', '-')


def wrap_text(text, max_chars):
    """Split text into lines of at most max_chars. Breaks on spaces; hard-splits long tokens on dots."""
    # Normalise em dashes to plain hyphen so SVG doesn't render diamonds
    text = text.replace('—', ' - ').replace('–', ' - ')
    words = []
    for word in text.split():
        # Hard-split on dots for long dotted names (e.g. Procare.Pay.Something.Long)
        if len(word) > max_chars and '.' in word:
            parts = word.split('.')
            chunk = ''
            for p in parts:
                candidate = chunk + ('.' if chunk else '') + p
                if len(candidate) > max_chars and chunk:
                    words.append(chunk)
                    chunk = p
                else:
                    chunk = candidate
            if chunk:
                words.append(chunk)
        else:
            words.append(word)

    lines, current = [], ''
    for word in words:
        if current and len(current) + 1 + len(word) > max_chars:
            lines.append(current)
            current = word
        else:
            current = (current + ' ' + word).strip()
    if current:
        lines.append(current)
    return lines


def _per_item_deltas(curr_list, base_list):
    curr = {x['id']: x for x in curr_list}
    base = {x['id']: x for x in base_list}
    return {
        'new': [v for k, v in curr.items() if k not in base],
        'removed': [v for k, v in base.items() if k not in curr],
        'modified': [v for k, v in curr.items() if k in base and v != base[k]],
    }


def _rel_key(r):
    """Composite key for relationship edges: source->target->label."""
    return f"{r.get('source', '')}->{r.get('target', '')}->{r.get('label', '')}"


def _per_rel_deltas(curr_list, base_list):
    """Compute delta status map for relationship lists (keyed by composite key)."""
    curr = {_rel_key(r): r for r in curr_list}
    base = {_rel_key(r): r for r in base_list}
    all_keys = set(curr) | set(base)
    result = {}
    for k in all_keys:
        if k in curr and k not in base:
            result[k] = 'new'
        elif k in base and k not in curr:
            result[k] = 'removed'
        elif curr[k] != base[k]:
            result[k] = 'modified'
    return result


def classify_deltas(current, baseline):
    """Compare current vs baseline C4 data, return delta classification."""
    if not baseline:
        return None

    deltas = {'c1_people': {}, 'c1_systems': {}, 'c2': {}, 'c3': {}, 'c3_5': {},
              'c1_rels': {}, 'c2_rels': {}, 'c3_rels': {}, 'type_rels': {}}

    # C1 people deltas
    deltas['c1_people'] = _per_item_deltas(
        current.get('c1_context', {}).get('people', []),
        baseline.get('c1_context', {}).get('people', []),
    )

    # C1 external systems deltas
    deltas['c1_systems'] = _per_item_deltas(
        current.get('c1_context', {}).get('external_systems', []),
        baseline.get('c1_context', {}).get('external_systems', []),
    )

    # C2 container deltas
    deltas['c2'] = _per_item_deltas(
        current.get('c2_containers', {}).get('containers', []),
        baseline.get('c2_containers', {}).get('containers', []),
    )

    # C3 component deltas (per container)
    curr_c3 = current.get('c3_components', {}).get('containers', {})
    base_c3 = baseline.get('c3_components', {}).get('containers', {})
    c3_keys = set(list(curr_c3.keys()) + list(base_c3.keys()))
    for cid in c3_keys:
        curr_comps = curr_c3.get(cid, {}).get('components', []) if cid in curr_c3 else []
        base_comps = base_c3.get(cid, {}).get('components', []) if cid in base_c3 else []
        d = _per_item_deltas(curr_comps, base_comps)
        if any(d.values()):
            deltas['c3'][cid] = d

    # C3.5 type deltas (per container)
    curr_c35 = current.get('c3_5_types', {}).get('containers', {})
    base_c35 = baseline.get('c3_5_types', {}).get('containers', {})
    c35_keys = set(list(curr_c35.keys()) + list(base_c35.keys()))
    for cid in c35_keys:
        curr_types = curr_c35.get(cid, {}).get('types', []) if cid in curr_c35 else []
        base_types = base_c35.get(cid, {}).get('types', []) if cid in base_c35 else []
        d = _per_item_deltas(curr_types, base_types)
        if any(d.values()):
            deltas['c3_5'][cid] = d

    # Relationship deltas (C1, C2, C3)
    curr_rels = current.get('relationships', {})
    base_rels = baseline.get('relationships', {})
    for level in ('c1', 'c2', 'c3'):
        deltas[f'{level}_rels'] = _per_rel_deltas(
            curr_rels.get(level, []),
            base_rels.get(level, []),
        )

    # Type relationship deltas (C3.5)
    deltas['type_rels'] = _per_rel_deltas(
        current.get('type_relationships', []),
        baseline.get('type_relationships', []),
    )

    return deltas


def get_delta_class(item_id, deltas, level):
    """Return CSS class for delta highlighting."""
    if not deltas or level not in deltas:
        return ''
    d = deltas[level]
    if item_id in [i.get('id') for i in d.get('new', [])]:
        return 'delta-new'
    if item_id in [i.get('id') for i in d.get('removed', [])]:
        return 'delta-removed'
    if item_id in [i.get('id') for i in d.get('modified', [])]:
        return 'delta-modified'
    return ''


# =============================================================================
# SVG RENDERING
# =============================================================================

def _diagram_boundary(left, top, right, bottom, max_padding=30, dasharray="6,3"):
    cw = right - left
    ch = bottom - top
    padding = min(max_padding, max(12, int(min(cw, ch) * 0.03)))
    rx = max(6, padding)
    return f'<rect x="{left - padding}" y="{top - padding}" width="{cw + 2 * padding}" height="{ch + 2 * padding}" rx="{rx}" fill="none" stroke="#334155" stroke-width="2" stroke-dasharray="{dasharray}"/>'


def _person_icon(cx, cy, color='#64748b'):
    """SVG person icon — rounded head + body silhouette, cleaner than stick figure."""
    return f'''
        <ellipse cx="{cx}" cy="{cy - 18}" rx="10" ry="11" fill="{color}33" stroke="{color}" stroke-width="1.8"/>
        <path d="M {cx-16},{cy+18} C {cx-16},{cy+2} {cx-8},{cy-2} {cx},{cy-2} C {cx+8},{cy-2} {cx+16},{cy+2} {cx+16},{cy+18} Z"
              fill="{color}33" stroke="{color}" stroke-width="1.8"/>'''


def render_c1_svg(data, deltas=None):
    """Render C1 System Context diagram as SVG — 2-col right side for many external systems."""
    c1 = data['c1_context']
    people = c1.get('people', [])
    ext_systems = c1.get('external_systems', [])

    # External systems in 2 columns on the right
    ext_cols = 2 if len(ext_systems) > 4 else 1
    ext_rows = (len(ext_systems) + ext_cols - 1) // ext_cols
    ext_box_w, ext_box_h = 155, 52
    ext_spacing_x, ext_spacing_y = 16, 14

    # Overall dimensions
    left_w = 180    # person column
    center_w = max(200, len(c1['system_name']) * 8 + 40)
    right_w = ext_cols * ext_box_w + (ext_cols - 1) * ext_spacing_x + 40
    width = left_w + center_w + right_w + 80
    content_h = max(
        len(people) * 90 + 40,
        ext_rows * (ext_box_h + ext_spacing_y) + 40,
        200,
    )
    height = content_h + 60

    # Column x centres
    person_cx = left_w // 2 + 20
    system_cx = left_w + 40 + center_w // 2
    ext_col0_x = left_w + 40 + center_w + 50  # left edge of first ext col

    # Vertical centres
    sys_cy = height // 2
    sys_box_h = 70

    svg_parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" class="diagram-svg">']
    svg_parts.append(_diagram_boundary(20, 20, width - 20, height - 20))
    svg_parts.append('''
    <defs>
        <marker id="arrow-c1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569"/>
        </marker>
    </defs>''')

    # People
    person_y_start = (height - len(people) * 90) // 2 + 40
    for i, person in enumerate(people):
        cy = person_y_start + i * 90
        delta_cls = get_delta_class(person['id'], deltas, 'c1_people') if deltas else ''
        # Wrap description into 2 lines (max 40 chars per line)
        desc = person.get('description', '')
        desc_lines = wrap_text(desc, 40)
        desc_tspans = ''
        for li, dl in enumerate(desc_lines[:2]):
            dy_val = 0 if li == 0 else 11
            desc_tspans += f'<tspan x="{person_cx}" dy="{dy_val}">{dl}</tspan>'
        if not desc_lines:
            desc_tspans = f'<tspan x="{person_cx}" dy="0"></tspan>'

        svg_parts.append(f'''
        <g class="element {delta_cls}" data-id="{person['id']}" data-type="Person" data-tech="" data-path="{person.get('source','')}" data-container-type="person">
            {_person_icon(person_cx, cy)}
            <text x="{person_cx}" y="{cy + 35}" text-anchor="middle" fill="#e2e8f0" font-size="12" font-weight="bold" font-family="system-ui">{person['name']}</text>
            <text fill="#94a3b8" font-size="9" font-family="system-ui">{desc_tspans}</text>
        </g>''')

    # Main system box
    sys_name = c1['system_name']
    svg_parts.append(f'''
    <g class="element system-box" data-id="{sanitize_id(sys_name)}" data-type="Software System" data-tech="" data-path="" data-container-type="system">
        <rect x="{system_cx - center_w // 2}" y="{sys_cy - sys_box_h // 2}" width="{center_w}" height="{sys_box_h}" rx="8" fill="#1e3a5f" stroke="#3b82f6" stroke-width="2.5"/>
        <text x="{system_cx}" y="{sys_cy - 8}" text-anchor="middle" fill="#e2e8f0" font-size="12" font-weight="bold" font-family="system-ui">{sys_name}</text>
        <text x="{system_cx}" y="{sys_cy + 10}" text-anchor="middle" fill="#94a3b8" font-size="10" font-family="system-ui">Software System</text>
    </g>''')

    # External systems — 2 columns, evenly spaced vertically
    ext_total_h = ext_rows * (ext_box_h + ext_spacing_y) - ext_spacing_y
    ext_y_start = (height - ext_total_h) // 2

    ext_positions = {}  # id -> (cx, cy)
    for i, ext in enumerate(ext_systems):
        col = i % ext_cols
        row = i // ext_cols
        x = ext_col0_x + col * (ext_box_w + ext_spacing_x)
        y = ext_y_start + row * (ext_box_h + ext_spacing_y)
        ecx, ecy = x + ext_box_w // 2, y + ext_box_h // 2
        ext_positions[ext['id']] = (ecx, ecy, x, y)
        delta_cls = get_delta_class(ext['id'], deltas, 'c1_systems') if deltas else ''

        svg_parts.append(f'''
        <g class="element {delta_cls}" data-id="{ext['id']}" data-type="Software System" data-tech="{ext.get('technology', '')}" data-path="" data-container-type="external">
            <rect x="{x}" y="{y}" width="{ext_box_w}" height="{ext_box_h}" rx="6" fill="#1e293b" stroke="#64748b" stroke-width="1.8" stroke-dasharray="6,3"/>
            <text x="{ecx}" y="{y + 20}" text-anchor="middle" fill="#e2e8f0" font-size="10" font-weight="bold" font-family="system-ui">{ext['name'][:22]}</text>
            <text x="{ecx}" y="{y + 35}" text-anchor="middle" fill="#94a3b8" font-size="8.5" font-family="system-ui">{ext.get('technology', 'External System')[:28]}</text>
        </g>''')

    # Person -> system arrows
    for i, person in enumerate(people):
        py = person_y_start + i * 90 + 10
        ex1, ey1 = person_cx + 16, py
        ex2 = system_cx - center_w // 2
        ey2 = sys_cy
        mx, my = (ex1 + ex2) // 2, (ey1 + ey2) // 2 - 8
        svg_parts.append(f'''
        <g class="relationship" data-from="{person['id']}" data-to="{sanitize_id(sys_name)}" data-label="Uses">
            <line x1="{ex1}" y1="{ey1}" x2="{ex2}" y2="{ey2}"
                  stroke="#475569" stroke-width="1.5" marker-end="url(#arrow-c1)"/>
            <text x="{mx}" y="{my}" fill="#64748b" font-size="9" font-family="system-ui" text-anchor="middle">Uses</text>
        </g>''')

    # System -> external arrows — distribute exit points across right edge of system box
    # so arrows fan out cleanly rather than all leaving from the same point
    n_ext = len(ext_systems)
    right_x = system_cx + center_w // 2
    for idx, ext in enumerate(ext_systems):
        ecx, ecy, ex, ey = ext_positions[ext['id']]
        # Distribute vertically along the right edge of the system box
        if n_ext > 1:
            frac = idx / (n_ext - 1)
            ay1 = int(sys_cy - sys_box_h // 2 + frac * sys_box_h)
        else:
            ay1 = sys_cy
        ax1 = right_x
        ax2, ay2 = ex, ecy  # left edge of target box
        # Only show "Uses" label on every other arrow to avoid stacking
        rel_label = ext.get('_rel_label', 'Uses')
        show_label = (idx % 2 == 0)
        mx, my = (ax1 + ax2) // 2, (ay1 + ay2) // 2 - 7
        label_svg = (f'<text x="{mx}" y="{my}" fill="#64748b" font-size="9" font-family="system-ui" text-anchor="middle">{rel_label}</text>'
                     if show_label else '')
        svg_parts.append(f'''
        <g class="relationship" data-from="{sanitize_id(sys_name)}" data-to="{ext['id']}" data-label="{rel_label}" style="opacity: 0;">
            <line x1="{ax1}" y1="{ay1}" x2="{ax2}" y2="{ay2}"
                  stroke="#475569" stroke-width="1.5" marker-end="url(#arrow-c1)"/>
            {label_svg}
        </g>''')

    svg_parts.append('</svg>')
    return '\n'.join(svg_parts)


def _desc_tspan(text, x, y, max_width_px, font_size=9, chars_per_line=28):
    """Render description as wrapped tspan lines."""
    lines = wrap_text(text, chars_per_line)[:2]  # max 2 lines
    parts = []
    for i, line in enumerate(lines):
        dy = 0 if i == 0 else 13
        parts.append(f'<tspan x="{x}" dy="{dy}" fill="#94a3b8" font-size="{font_size}" font-family="system-ui">{line}</tspan>')
    return f'<text x="{x}" y="{y}">{"".join(parts)}</text>'


def _box_edge(cx, cy, w, h, toward_x, toward_y):
    """Return the point on the edge of a box (cx,cy,w,h) closest toward (toward_x,toward_y)."""
    dx = toward_x - cx
    dy = toward_y - cy
    if dx == 0 and dy == 0:
        return cx, cy
    hw, hh = w / 2, h / 2
    # Which edge does the line hit?
    if dx == 0:
        return cx, (cy - hh) if dy < 0 else (cy + hh)
    if dy == 0:
        return (cx - hw) if dx < 0 else (cx + hw), cy
    # Scale to hit nearest edge
    tx = hw / abs(dx)
    ty = hh / abs(dy)
    if tx < ty:
        return (cx - hw) if dx < 0 else (cx + hw), cy + dy * tx
    else:
        return cx + dx * ty, (cy - hh) if dy < 0 else (cy + hh)


def _rel_edge_cls(src, tgt, lbl, rel_deltas):
    """Return delta CSS class for a relationship edge, or '' if no delta."""
    if not rel_deltas:
        return ''
    status = rel_deltas.get(f"{src}->{tgt}->{lbl}")
    if status == 'new':
        return 'delta-new'
    if status == 'removed':
        return 'delta-removed'
    if status == 'modified':
        return 'delta-modified'
    return ''


def render_edges_svg(edges, positions, box_width, box_height, marker_id, stroke_color='#475569', label_bg='#0a1628', label_color='#94a3b8', box_sizes=None, rel_deltas=None):
    """
    UNIFIED edge rendering - used by ALL layers (C1, C2, C3, C3.5).

    Args:
        edges: List of {source, target, label, technology} dicts
        positions: Dict mapping entity_id -> (center_x, center_y)
        box_width: Width of boxes in pixels (used if box_sizes is None)
        box_height: Height of boxes in pixels (used if box_sizes is None)
        marker_id: SVG marker ID reference (e.g., 'arrow-c3')
        stroke_color: Stroke color for paths
        label_bg: Background color for label boxes
        label_color: Text color for labels
        box_sizes: Optional dict mapping entity_id -> (width, height) for variable-sized boxes (C2)

    Returns:
        String of SVG path elements
    """
    svg_parts = []
    drawn = set()

    for edge in edges:
        src, tgt = edge.get('source', ''), edge.get('target', '')
        if not src or not tgt or src not in positions or tgt not in positions:
            continue

        key = (src, tgt)
        if key in drawn:
            continue
        drawn.add(key)

        sx, sy = positions[src]
        tx, ty = positions[tgt]

        # Get box dimensions (use per-entity sizes if provided, else uniform)
        src_w, src_h = box_sizes[src] if box_sizes and src in box_sizes else (box_width, box_height)
        tgt_w, tgt_h = box_sizes[tgt] if box_sizes and tgt in box_sizes else (box_width, box_height)

        # Calculate box edge entry/exit points (unified for all layers)
        x1, y1 = _box_edge(sx, sy, src_w, src_h, tx, ty)
        x2, y2 = _box_edge(tx, ty, tgt_w, tgt_h, sx, sy)

        # Quadratic Bezier curve with perpendicular offset (unified for all layers)
        dx, dy = x2 - x1, y2 - y1
        dist = (dx**2 + dy**2) ** 0.5 or 1
        arc = max(30, dist * 0.35)

        # Perpendicular offset for control point
        px, py_perp = -dy / dist, dx / dist
        if py_perp > 0:
            px, py_perp = -px, -py_perp

        cx_ctrl = int((x1 + x2) / 2 + px * arc)
        cy_ctrl = int((y1 + y2) / 2 + py_perp * arc)

        # Label positioning at curve peak
        lbl = edge.get('label', 'Uses')
        lbl_x = int((x1 + 2 * cx_ctrl + x2) / 4)
        lbl_y = int((y1 + 2 * cy_ctrl + y2) / 4) - 4
        lbl_w = len(lbl) * 6 + 10

        # Determine stroke style based on technology
        tech = edge.get('technology', '')
        is_sql = 'sql' in tech.lower() or 'data' in tech.lower()
        final_stroke = '#a855f7' if is_sql else stroke_color
        dash_attr = 'stroke-dasharray="4,3" ' if is_sql else ''

        delta_cls = _rel_edge_cls(src, tgt, lbl, rel_deltas)

        svg_parts.append(f'''
        <g class="relationship {delta_cls}" data-from="{src}" data-to="{tgt}" data-label="{lbl}">
            <path d="M {int(x1)},{int(y1)} Q {cx_ctrl},{cy_ctrl} {int(x2)},{int(y2)}"
                  fill="none" stroke="{final_stroke}" stroke-width="1.5" {dash_attr}marker-end="url(#{marker_id})"/>
            <rect x="{lbl_x - lbl_w // 2}" y="{lbl_y - 10}" width="{lbl_w}" height="13" fill="{label_bg}" rx="2" opacity="0.92"/>
            <text x="{lbl_x}" y="{lbl_y}" text-anchor="middle" fill="{label_color}" font-size="8.5" font-family="system-ui">{lbl}</text>
        </g>''')

    return '\n'.join(svg_parts)


def render_c2_svg(data, deltas=None):
    """Render C2 Container diagram as SVG."""
    c2 = data['c2_containers']
    c1 = data.get('c1_context', {})
    containers = c2.get('containers', [])
    system_name = c1.get('system_name', 'Black Owned')

    # Separate by type - MUTUALLY EXCLUSIVE (check databases first, then services)
    databases = [c for c in containers if 'database' in c.get('description', '').lower() or
                 'database' in c.get('technology', '').lower() or
                 c.get('container_type', '') == 'database']
    queues = [c for c in containers if c not in databases and
              ('queue' in c.get('description', '').lower() or
               'queue' in c.get('technology', '').lower() or 'broker' in c.get('technology', '').lower() or
               c.get('container_type', '') == 'queue')]
    services = [c for c in containers if c not in databases and c not in queues and
                ('service' in c.get('technology', '').lower() or
                 c.get('container_type', '') in ('service', 'test') or
                 ('Container' in c.get('c4_type', '') and 'library' not in c.get('description', '').lower()))]
    libraries = [c for c in containers if c not in services and c not in databases and c not in queues]

    # Layout — wider boxes, more columns for large container sets
    margin_x = 40
    box_width = 230
    base_box_height = 96
    spacing_x = 20
    spacing_y = 26

    n_svc = len(services)
    services_per_row = max(1, min(n_svc, 5) if n_svc <= 10 else min(n_svc, 6))
    services_rows = (len(services) + services_per_row - 1) // services_per_row if services else 0

    # Compute content width as max right edge across all sections
    svc_cols = services_per_row if services else 0
    db_cols = len(databases) if databases else 0
    lib_cols = max(1, min(len(libraries), 6)) if libraries else 0

    right_extent = margin_x
    if svc_cols:
        last_svc_x = margin_x + (svc_cols - 1) * (box_width + spacing_x)
        right_extent = max(right_extent, last_svc_x + box_width)
    if db_cols:
        last_db_cx = margin_x + (db_cols - 1) * (box_width + spacing_x) + box_width // 2
        right_extent = max(right_extent, last_db_cx + 50)
    if lib_cols:
        last_lib_x = margin_x + (lib_cols - 1) * (130 + 15)
        right_extent = max(right_extent, last_lib_x + 130)

    width = max(right_extent + margin_x, 600)

    # Pre-compute content extent for height (bottom-up, each section starts after the previous content ends)
    y_services = 55
    services_bottom = y_services + services_rows * (base_box_height + spacing_y) if services else y_services

    last_bottom = services_bottom

    # Databases section
    y_db = last_bottom + 20 if databases else last_bottom
    db_cyl_h, db_cyl_ry = 35, 12
    db_bottom = y_db + db_cyl_h + db_cyl_ry * 2 + 14 if databases else y_db
    if databases:
        last_bottom = db_bottom

    # Queues section
    y_q = last_bottom + 20 if queues else last_bottom
    q_bottom = y_q + 42 if queues else y_q
    if queues:
        last_bottom = q_bottom

    # Libraries section
    if libraries:
        y_lib = last_bottom + 20 + 10
    else:
        y_lib = last_bottom
    lib_bottom = y_lib + 45 if libraries else y_lib
    content_bottom = max(services_bottom, db_bottom, q_bottom, lib_bottom)

    # Expand width for libraries (before SVG tag, so viewBox is correct)
    if libraries:
        lib_cols = max(1, min(len(libraries), 6))
        lib_row_w = lib_cols * (130 + 15) - 15
        width = max(width, margin_x * 2 + lib_row_w)

    height = content_bottom + 20

    svg_parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" class="diagram-svg">']

    svg_parts.append('''
    <defs>
        <marker id="arrow-c2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569"/>
        </marker>
    </defs>''')

    # System boundary — sized to content
    svg_parts.append(f'''
    {_diagram_boundary(margin_x, y_services, width - margin_x, content_bottom)}
    <text x="40" y="42" fill="#64748b" font-size="12" font-family="system-ui">{system_name}</text>''')

    # Track box positions for edge-to-edge arrow routing: {id: (cx, cy, w, h)}
    container_boxes = {}

    # Render services — section background + boxes
    if services:
        sec_h = services_bottom - y_services
        svg_parts.append(f'<rect x="{margin_x}" y="{y_services}" width="{width - 2 * margin_x}" height="{sec_h}" rx="6" fill="#3b82f606" stroke="#3b82f622" stroke-width="1"/>')
    for i, svc in enumerate(services):
        row = i // services_per_row
        col = i % services_per_row
        x = margin_x + col * (box_width + spacing_x)
        y = y_services + row * (base_box_height + spacing_y)
        cx, cy = x + box_width // 2, y + base_box_height // 2
        container_boxes[svc['id']] = (cx, cy, box_width, base_box_height)
        delta_cls = get_delta_class(svc['id'], deltas, 'c2') if deltas else ''

        border_color = '#3b82f6'
        if 'web' in svc.get('technology', '').lower() or 'react' in svc.get('technology', '').lower():
            border_color = '#22d3ee'
        elif 'api' in svc.get('name', '').lower():
            border_color = '#f59e0b'

        # No textLength/spacingAndGlyphs — it stretches glyphs. Use clip-path instead.
        # max_chars=32: keeps long dotted names (e.g. Procare.Pay.IntegrationService.Cryptography) in 2 tspan lines
        svc_name_lines = wrap_text(svc['name'], 32)
        if len(svc_name_lines) >= 2:
            name_text = (f'<text x="{x + 10}" y="{y + 16}" fill="#e2e8f0" font-size="10" font-weight="bold" font-family="system-ui">'
                         f'<tspan x="{x + 10}" dy="0">{svc_name_lines[0]}</tspan>'
                         f'<tspan x="{x + 10}" dy="13">{svc_name_lines[1]}</tspan>'
                         f'</text>')
            desc_y = y + 45
        else:
            name_text = f'<text x="{x + 10}" y="{y + 18}" fill="#e2e8f0" font-size="11" font-weight="bold" font-family="system-ui">{svc_name_lines[0]}</text>'
            desc_y = y + 33
        svg_parts.append(f'''
        <g class="element container {delta_cls}" data-id="{svc['id']}" data-type="Container" data-container-type="{svc.get('container_type', '')}" data-path="{svc.get('path', '')}" data-tech="{svc.get('technology', '')}">
            <rect x="{x}" y="{y}" width="{box_width}" height="{base_box_height}" rx="6" fill="#1e293b" stroke="{border_color}" stroke-width="2"/>
            {name_text}
            {_desc_tspan(svc.get('description', ''), x + 10, desc_y, box_width - 20)}
            <text x="{x + 10}" y="{desc_y + 32}" fill="#64748b" font-size="9" font-family="system-ui">[{svc.get('technology', 'Container')[:40]}]</text>
        </g>''')

    # Render databases
    if databases:
        sec_h = db_bottom - y_db
        svg_parts.append(f'<rect x="{margin_x}" y="{y_db}" width="{width - 2 * margin_x}" height="{sec_h}" rx="6" fill="#a855f706" stroke="#a855f722" stroke-width="1"/>')
    db_cyl_h, db_cyl_ry = 35, 12
    for i, db in enumerate(databases):
        x = margin_x + i * (box_width + spacing_x) + box_width // 2
        delta_cls = get_delta_class(db['id'], deltas, 'c2') if deltas else ''
        container_boxes[db['id']] = (x, y_db + db_cyl_h // 2, 100, db_cyl_h + db_cyl_ry * 2)

        svg_parts.append(f'''
        <g class="element database {delta_cls}" data-id="{db['id']}" data-type="Container" data-container-type="{db.get('container_type', '')}" data-path="{db.get('path', '')}" data-tech="{db.get('technology', '')}">
            <ellipse cx="{x}" cy="{y_db}" rx="50" ry="{db_cyl_ry}" fill="#1e293b" stroke="#a855f7" stroke-width="2"/>
            <rect x="{x - 50}" y="{y_db}" width="100" height="{db_cyl_h}" fill="#1e293b" stroke="none"/>
            <line x1="{x - 50}" y1="{y_db}" x2="{x - 50}" y2="{y_db + db_cyl_h}" stroke="#a855f7" stroke-width="2"/>
            <line x1="{x + 50}" y1="{y_db}" x2="{x + 50}" y2="{y_db + db_cyl_h}" stroke="#a855f7" stroke-width="2"/>
            <ellipse cx="{x}" cy="{y_db + db_cyl_h}" rx="50" ry="{db_cyl_ry}" fill="#1e293b" stroke="#a855f7" stroke-width="2"/>
            <text x="{x}" y="{y_db + 18}" text-anchor="middle" fill="#e2e8f0" font-size="10" font-weight="bold" font-family="system-ui">{db['name'][:25]}</text>
            <text x="{x}" y="{y_db + db_cyl_h + db_cyl_ry + 14}" text-anchor="middle" fill="#94a3b8" font-size="9" font-family="system-ui">[{db.get('technology', 'Database')}]</text>
        </g>''')

    # Render queues
    if queues:
        sec_h = q_bottom - y_q
        svg_parts.append(f'<rect x="{margin_x}" y="{y_q}" width="{width - 2 * margin_x}" height="{sec_h}" rx="6" fill="#22d3ee06" stroke="#22d3ee22" stroke-width="1"/>')
    for i, q in enumerate(queues):
        x = margin_x + i * (box_width + spacing_x) + box_width // 2
        delta_cls = get_delta_class(q['id'], deltas, 'c2') if deltas else ''
        container_boxes[q['id']] = (x, y_q + 15, 90, 30)

        svg_parts.append(f'''
        <g class="element queue {delta_cls}" data-id="{q['id']}" data-type="Container" data-container-type="{q.get('container_type', '')}" data-path="{q.get('path', '')}" data-tech="{q.get('technology', '')}">
            <rect x="{x - 45}" y="{y_q}" width="90" height="30" rx="15" fill="#1e293b" stroke="#22d3ee" stroke-width="2"/>
            <text x="{x}" y="{y_q + 18}" text-anchor="middle" fill="#e2e8f0" font-size="10" font-weight="bold" font-family="system-ui">{q['name'][:25]}</text>
            <text x="{x}" y="{y_q + 42}" text-anchor="middle" fill="#94a3b8" font-size="9" font-family="system-ui">[{q.get('technology', 'Queue')}]</text>
        </g>''')

    # Render libraries - no hard cap, layout dynamically
    if libraries:
        svg_parts.append(f'<rect x="{margin_x}" y="{y_lib}" width="{width - 2 * margin_x}" height="{lib_bottom - y_lib}" rx="6" fill="#22c55e06" stroke="#22c55e22" stroke-width="1"/>')
    n_lib = len(libraries)
    lib_cols = max(1, min(n_lib, 6))  # Up to 6 columns for libraries
    lib_width = 130
    lib_spacing = 15

    for i, lib in enumerate(libraries):
        row = i // lib_cols
        col = i % lib_cols
        x = margin_x + col * (lib_width + lib_spacing)
        if row > 0:
            y_lib += 55  # Add row spacing
        delta_cls = get_delta_class(lib['id'], deltas, 'c2') if deltas else ''
        container_boxes[lib['id']] = (x + 65, y_lib + 22, 130, 45)

        svg_parts.append(f'''
        <g class="element library {delta_cls}" data-id="{lib['id']}" data-type="Container" data-container-type="{lib.get('container_type', '')}" data-path="{lib.get('path', '')}" data-tech="{lib.get('technology', '')}">
            <rect x="{x}" y="{y_lib}" width="130" height="45" rx="4" fill="#1e293b" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4,2"/>
            <text x="{x + 8}" y="{y_lib + 16}" fill="#e2e8f0" font-size="10" font-weight="bold" font-family="system-ui">{lib['name'][:28]}</text>
            <text x="{x + 8}" y="{y_lib + 30}" fill="#94a3b8" font-size="8" font-family="system-ui">{lib.get('description', '')[:35]}</text>
            <text x="{x + 8}" y="{y_lib + 42}" fill="#64748b" font-size="8" font-family="system-ui">[{lib.get('technology', 'Library')}]</text>
        </g>''')

    # Relationships - use unified edge rendering with variable box sizes
    rels = data.get('relationships', {})
    c2_edges = rels.get('c2', [])

    # Convert container_boxes to positions dict (center points)
    c2_positions = {eid: (cx, cy) for eid, (cx, cy, cw, ch) in container_boxes.items()}

    # Use unified edge rendering with variable box sizes
    c2_rel_deltas = deltas.get('c2_rels', {}) if deltas else None
    svg_parts.append(render_edges_svg(
        edges=c2_edges,
        positions=c2_positions,
        box_width=230,  # Default service size (fallback)
        box_height=96,  # Default service size (fallback)
        marker_id='arrow-c2',
        stroke_color='#475569',
        label_bg='#0a1628',
        label_color='#94a3b8',
        box_sizes={eid: (cw, ch) for eid, (cx, cy, cw, ch) in container_boxes.items()},
        rel_deltas=c2_rel_deltas,
    ))

    svg_parts.append('</svg>')
    return '\n'.join(svg_parts)


def _classify_component(comp):
    """Return (lane_key, lane_label, color) for a component."""
    name = comp.get('name', '').lower()
    tech = comp.get('technology', '').lower()

    # Explicit technology-based classification
    if 'controller' in tech:
        return 'controller', 'Controllers', '#3b82f6'
    if 'middleware' in tech:
        return 'middleware', 'Middleware', '#f97316'
    if 'validator' in tech:
        return 'validator', 'Validators', '#f59e0b'
    if 'handler' in tech or 'consumer' in tech:
        return 'handler', 'Handlers', '#22d3ee'
    if 'service' in tech:
        return 'service', 'Services', '#10b981'
    if 'repository' in tech or 'data access' in tech:
        return 'repository', 'Repositories', '#a855f7'
    if 'graphql' in tech:
        return 'graphql', 'GraphQL', '#e91e63'
    if 'auth' in tech or 'claims' in tech:
        return 'auth', 'Auth', '#7c3aed'
    if 'domain model' in tech or 'entity' in tech:
        return 'domain', 'Domain Models', '#84cc16'
    if 'analytics' in tech:
        return 'analytics', 'Analytics', '#ec4899'
    if 'event' in tech or 'message' in tech:
        return 'events', 'Events', '#f59e0b'
    if 'api request' in tech:
        return 'request', 'Requests', '#06b6d4'
    if 'api response' in tech:
        return 'response', 'Responses', '#8b5cf6'

    # Name-based classification for Rust struct / AST detection
    # Check name patterns first (order matters - more specific first)
    if 'service' in name:
        return 'service', 'Services', '#10b981'
    if 'handler' in name:
        return 'handler', 'Handlers', '#22d3ee'
    if 'middleware' in name:
        return 'middleware', 'Middleware', '#f97316'
    if 'validator' in name:
        return 'validator', 'Validators', '#f59e0b'
    if 'repository' in name or 'store' in name or 'row' in name:
        return 'repository', 'Repositories', '#a855f7'
    if 'controller' in name:
        return 'controller', 'Controllers', '#3b82f6'
    if 'client' in name:
        return 'service', 'Services', '#10b981'
    if 'config' in name:
        return 'other', 'Other', '#64748b'
    if 'context' in name:
        return 'other', 'Other', '#64748b'
    if 'cache' in name:
        return 'other', 'Other', '#64748b'
    if 'registry' in name:
        return 'other', 'Other', '#64748b'
    if 'state' in name:
        return 'other', 'Other', '#64748b'
    if 'builder' in name:
        return 'other', 'Other', '#64748b'
    if 'generator' in name:
        return 'other', 'Other', '#64748b'
    if 'processor' in name:
        return 'handler', 'Handlers', '#22d3ee'
    if 'writer' in name:
        return 'repository', 'Repositories', '#a855f7'
    if 'handle' in name:
        return 'other', 'Other', '#64748b'
    if 'payload' in name:
        return 'other', 'Other', '#64748b'
    if 'result' in name:
        return 'other', 'Other', '#64748b'
    if 'entry' in name:
        return 'other', 'Other', '#64748b'
    if 'snapshot' in name:
        return 'analytics', 'Analytics', '#ec4899'
    if 'stats' in name or 'statistics' in name:
        return 'analytics', 'Analytics', '#ec4899'
    if 'metrics' in name:
        return 'other', 'Other', '#64748b'
    if 'distribution' in name:
        return 'analytics', 'Analytics', '#ec4899'
    if 'bucket' in name:
        return 'analytics', 'Analytics', '#ec4899'
    if 'job' in name:
        return 'handler', 'Handlers', '#22d3ee'
    if 'record' in name:
        return 'repository', 'Repositories', '#a855f7'
    if 'input' in name:
        return 'request', 'Requests', '#06b6d4'
    if 'connection' in name:
        return 'graphql', 'GraphQL', '#e91e63'
    if 'node' in name:
        return 'graphql', 'GraphQL', '#e91e63'
    if 'query' in name or 'mutation' in name or 'subscription' in name:
        return 'graphql', 'GraphQL', '#e91e63'
    if 'event' in name or 'message' in name:
        return 'events', 'Events', '#f59e0b'
    if 'request' in name:
        return 'request', 'Requests', '#06b6d4'
    if 'response' in name:
        return 'response', 'Responses', '#8b5cf6'
    if 'url' in name:
        return 'other', 'Other', '#64748b'
    if 'template' in name:
        return 'other', 'Other', '#64748b'
    if 'log' in name or 'audit' in name:
        return 'other', 'Other', '#64748b'
    if 'token' in name:
        return 'auth', 'Auth', '#7c3aed'
    if 'router' in name:
        return 'other', 'Other', '#64748b'
    if 'schema' in name:
        return 'graphql', 'GraphQL', '#e91e63'
    if 'error' in name:
        return 'other', 'Other', '#64748b'
    if 'uuid' in name or 'id' in name or 'type' in name or 'path' in name:
        return 'other', 'Other', '#64748b'
    if 'map' in name or 'hash' in name:
        return 'other', 'Other', '#64748b'
    if 'key' in name:
        return 'other', 'Other', '#64748b'
    if 'size' in name or 'size' in name:
        return 'other', 'Other', '#64748b'
    if 'check' in name or 'checker' in name:
        return 'other', 'Other', '#64748b'
    if 'persist' in name or 'upload' in name or 'process' in name:
        return 'handler', 'Handlers', '#22d3ee'
    if 'build' in name or 'create' in name or 'generate' in name:
        return 'other', 'Other', '#64748b'
    if 'sign' in name or 'verify' in name:
        return 'auth', 'Auth', '#7c3aed'
    if 'extract' in name or 'decode' in name:
        return 'other', 'Other', '#64748b'
    if 'emit' in name or 'make' in name:
        return 'other', 'Other', '#64748b'
    if 'submit' in name or 'approve' in name or 'reject' in name:
        return 'handler', 'Handlers', '#22d3ee'
    if 'update' in name or 'set' in name:
        return 'handler', 'Handlers', '#22d3ee'
    if 'is_' in name or 'by_' in name:
        return 'other', 'Other', '#64748b'
    if 'expect' in name:
        return 'other', 'Other', '#64748b'
    if 'category' in name:
        return 'other', 'Other', '#64748b'
    if 'notification' in name:
        return 'events', 'Events', '#f59e0b'
    if 'email' in name:
        return 'other', 'Other', '#64748b'
    if 'sender' in name:
        return 'service', 'Services', '#10b981'
    if 'worker' in name:
        return 'handler', 'Handlers', '#22d3ee'
    if 'consumer' in name:
        return 'handler', 'Handlers', '#22d3ee'
    if 'with_' in name:
        return 'handler', 'Handlers', '#22d3ee'
    if 'next' in name:
        return 'middleware', 'Middleware', '#f97316'
    if 'value' in name or 't_' in name or 't' == name:
        return 'other', 'Other', '#64748b'
    if 'json' in name:
        return 'other', 'Other', '#64748b'
    if 'file' in name:
        return 'other', 'Other', '#64748b'
    if 'component' in name or 'relationship' in name or 'output' in name:
        return 'other', 'Other', '#64748b'

    return 'other', 'Other', '#64748b'


# Lane display order — top to bottom reflects request flow
LANE_ORDER = ['controller', 'middleware', 'handler', 'request', 'response', 'service', 'validator', 'repository', 'mapper', 'graphql', 'auth', 'domain', 'analytics', 'events', 'other']


def render_c3_svg(data, container_id, deltas=None, rel_deltas=None):
    """Render C3 Component diagram grouped into swim lanes by architectural layer."""
    c3 = data.get('c3_components', {}).get('containers', {})
    container = c3.get(container_id)
    if not container:
        for key, val in c3.items():
            if sanitize_id(key) == container_id:
                container = val
                break
    components = container.get('components', []) if container else []

    if not components:
        return f'<div class="no-data">No component data extracted for {container_id}. Components are detected from source code patterns (classes, functions, modules).</div>'

    # Group into lanes
    lanes = {}
    for comp in components:
        lkey, llabel, lcolor = _classify_component(comp)
        if lkey not in lanes:
            lanes[lkey] = {'label': llabel, 'color': lcolor, 'items': []}
        lanes[lkey]['items'].append(comp)
    ordered_lanes = [(k, lanes[k]) for k in LANE_ORDER if k in lanes]

    # Layout constants
    box_width = 220
    base_box_height = 88
    box_spacing_x = 14
    lane_label_w = 110
    lane_pad_y = 14
    lane_gap = 12
    margin_top = 50
    margin_bottom = 35
    margin_right = 24
    cols = 5

    def lane_height(items):
        rows = (len(items) + cols - 1) // cols
        return lane_pad_y * 2 + rows * base_box_height + (rows - 1) * 12

    total_content_h = sum(lane_height(l['items']) for _, l in ordered_lanes) + (len(ordered_lanes) - 1) * lane_gap
    height = margin_top + total_content_h + margin_bottom

    content_cols = min(cols, max(len(l['items']) for _, l in ordered_lanes)) if ordered_lanes else 1
    calculated_width = lane_label_w + content_cols * (box_width + box_spacing_x) - box_spacing_x + margin_right + 10
    min_width = lane_label_w + box_width + margin_right + 50
    width = max(calculated_width, min_width)

    svg_parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" class="diagram-svg c3-svg">']

    svg_parts.append('<defs>')
    clip_idx = 0
    y_cursor = margin_top
    for lkey, lane in ordered_lanes:
        lh = lane_height(lane['items'])
        for i, comp in enumerate(lane['items']):
            row = i // cols
            col = i % cols
            bx = lane_label_w + col * (box_width + box_spacing_x)
            by = y_cursor + lane_pad_y + row * (base_box_height + 12)
            svg_parts.append(f'<clipPath id="clip-{clip_idx}"><rect x="{bx + 6}" y="{by}" width="{box_width - 12}" height="{base_box_height}"/></clipPath>')
            clip_idx += 1
        y_cursor += lh + lane_gap
    svg_parts.append('</defs>')

    svg_parts.append(_diagram_boundary(14, 35, width - 14, height - margin_bottom, max_padding=14))
    svg_parts.append(f'<text x="24" y="34" fill="#64748b" font-size="11" font-family="system-ui">{container_id} - Components ({len(components)})</text>')

    clip_idx = 0
    y_cursor = margin_top
    for lkey, lane in ordered_lanes:
        lh = lane_height(lane['items'])
        color = lane['color']
        label = lane['label']

        svg_parts.append(f'<rect x="14" y="{y_cursor}" width="{width - 28}" height="{lh}" rx="6" fill="{color}18" stroke="{color}44" stroke-width="1"/>')

        label_cx = 14 + lane_label_w // 2
        label_cy = y_cursor + lh // 2
        svg_parts.append(f'<text x="{label_cx}" y="{label_cy}" text-anchor="middle" dominant-baseline="middle" fill="{color}" font-size="11" font-weight="600" font-family="system-ui" transform="rotate(-90 {label_cx} {label_cy})">{label}</text>')
        svg_parts.append(f'<line x1="{14 + lane_label_w - 4}" y1="{y_cursor + 6}" x2="{14 + lane_label_w - 4}" y2="{y_cursor + lh - 6}" stroke="{color}55" stroke-width="1"/>')

        for i, comp in enumerate(lane['items']):
            row = i // cols
            col = i % cols
            x = lane_label_w + col * (box_width + box_spacing_x)
            y = y_cursor + lane_pad_y + row * (base_box_height + 12)

            name = comp['name']
            tech = comp.get('technology', 'Component')
            desc_lines = wrap_text(comp.get('description', ''), 34)[:2]
            pad = 8

            desc_tspans = ''
            for li, dl in enumerate(desc_lines):
                dy_val = 0 if li == 0 else 13
                desc_tspans += f'<tspan x="{x + pad}" dy="{dy_val}">{dl}</tspan>'

            delta_cls = ''
            if deltas:
                if comp['id'] in [i.get('id') for i in deltas.get('new', [])]:
                    delta_cls = 'delta-new'
                elif comp['id'] in [i.get('id') for i in deltas.get('removed', [])]:
                    delta_cls = 'delta-removed'
                elif comp['id'] in [i.get('id') for i in deltas.get('modified', [])]:
                    delta_cls = 'delta-modified'

            svg_parts.append(f'<g class="element component {delta_cls}" data-id="{comp['id']}" data-type="Component" data-container-type="component" data-path="" data-tech="{tech}">')
            svg_parts.append(f'<rect x="{x}" y="{y}" width="{box_width}" height="{base_box_height}" rx="5" fill="#1e293b" stroke="{color}" stroke-width="1.5"/>')
            if delta_cls:
                dtag = delta_cls.replace('delta-', '').upper()
                bc = '#d946ef' if dtag == 'NEW' else '#fbbf24'
                svg_parts.append(f'<g class="delta-badge">')
                svg_parts.append(f'<rect x="{x + box_width - 44}" y="{y + 4}" width="40" height="14" rx="3" fill="{bc}22" stroke="{bc}" stroke-width="1"/>')
                svg_parts.append(f'<text x="{x + box_width - 24}" y="{y + 14}" text-anchor="middle" fill="{bc}" font-size="7" font-weight="bold" font-family="system-ui">{dtag}</text>')
                svg_parts.append(f'</g>')
            svg_parts.append(f'<g clip-path="url(#clip-{clip_idx})">')
            svg_parts.append(f'<text x="{x + pad}" y="{y + 17}" fill="#e2e8f0" font-size="10" font-weight="bold" font-family="system-ui">{name}</text>')
            svg_parts.append(f'<text x="{x + pad}" y="{y + 33}" fill="#94a3b8" font-size="8.5" font-family="system-ui">{desc_tspans}</text>')
            svg_parts.append(f'<text x="{x + pad}" y="{y + 70}" fill="#64748b" font-size="8" font-family="system-ui">[{tech}]</text>')
            svg_parts.append('</g></g>')
            clip_idx += 1

        y_cursor += lh + lane_gap

    # Relationships is a dict with c1, c2, c3 keys
    rels = data.get('relationships', {})
    c3_edges = rels.get('c3', [])
    comp_pos = {}
    y_cursor2 = margin_top
    for lkey, lane in ordered_lanes:
        lh = lane_height(lane['items'])
        for i, comp in enumerate(lane['items']):
            row = i // cols
            col_idx = i % cols
            bx = lane_label_w + col_idx * (box_width + box_spacing_x)
            by = y_cursor2 + lane_pad_y + row * (base_box_height + 12)
            comp_pos[comp['id']] = (bx + box_width // 2, by + base_box_height // 2)
        y_cursor2 += lh + lane_gap

    svg_parts.append('<defs><marker id="arrow-c3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#475569"/></marker></defs>')

    drawn_c3 = set()
    for edge in c3_edges:
        src, tgt = edge['source'], edge['target']
        key = (src, tgt)
        if key in drawn_c3 or src not in comp_pos or tgt not in comp_pos:
            continue
        drawn_c3.add(key)
        sx, sy = comp_pos[src]
        tx, ty = comp_pos[tgt]
        x1, y1 = _box_edge(sx, sy, box_width, base_box_height, tx, ty)
        x2, y2 = _box_edge(tx, ty, box_width, base_box_height, sx, ty)
        dx, dy = x2 - x1, y2 - y1
        dist = (dx**2 + dy**2) ** 0.5 or 1
        arc = max(30, dist * 0.35)
        cy_ctrl = int((y1 + y2) / 2 - arc)
        cx_ctrl = int((x1 + x2) / 2)
        path_d = f'M {int(x1)},{int(y1)} Q {cx_ctrl},{cy_ctrl} {int(x2)},{int(y2)}'

        # Add delta class to relationship
        rel_cls = 'relationship'
        if rel_deltas:
            rel_key = f'{src}->{tgt}->{edge.get("label", "")}'
            delta_status = rel_deltas.get(rel_key)
            if delta_status == 'new':
                rel_cls += ' delta-new'
            elif delta_status == 'modified':
                rel_cls += ' delta-modified'

        svg_parts.append(f'<path d="{path_d}" stroke="#475569" stroke-width="1.5" fill="none" marker-end="url(#arrow-c3)" class="{rel_cls}" data-from="{src}" data-to="{tgt}"/>')

    svg_parts.append('</svg>')
    return '\n'.join(svg_parts)


def render_c3_5_svg(data, container_id, deltas=None, rel_deltas=None):
    """Render C3.5 Types diagram showing code-level types and their relationships."""
    c3_5 = data.get('c3_5_types', {}).get('containers', {})
    container = c3_5.get(container_id)
    types_list = container.get('types', []) if container else []

    # Get relationships for this container
    all_type_rels = data.get('type_relationships', [])
    container_rels = [r for r in all_type_rels if r.get('source', '').startswith(container_id.replace('-', '_')) or
                      r.get('target', '').startswith(container_id.replace('-', '_'))]

    if not types_list:
        return f'<div class="no-data">No type data for {container_id}. Types are extracted from function signatures and type definitions.</div>'

    # Group types by kind (Rust + .NET type equivalence)
    # .NET: class/record → types, interface → traits, enum → enums
    # Rust: struct → types, function → functions
    structs = [t for t in types_list if t.get('type_kind') in ('struct', 'class', 'record')]
    interfaces = [t for t in types_list if t.get('type_kind') == 'interface']
    enums = [t for t in types_list if t.get('type_kind') == 'enum']
    functions = [t for t in types_list if t.get('type_kind') == 'function']

    # Layout - adaptive based on number of elements
    num_structs = len(structs)
    num_interfaces = len(interfaces)
    num_enums = len(enums)
    num_funcs = len(functions)
    total_types = num_structs + num_interfaces + num_enums + num_funcs

    # Base dimensions
    base_box_width = 300
    base_box_height = 110
    box_spacing_x = 25
    box_spacing_y = 25
    margin_top = 100
    margin_bottom = 40
    margin_left = 50
    margin_right = 50

    # Adaptive column count: more types = more columns, but cap at 6
    # Start with 3 cols for <10 types, scale up to 6 for 30+ types
    if total_types == 0:
        cols = 3
    else:
        cols = min(6, max(3, (total_types + 4) // 5))  # 3-6 columns based on count

    # Adaptive box width: shrink slightly if many columns, but keep minimum readable size
    max_width_target = 2400  # Target max width for full landscape
    calculated_width = margin_left + margin_right + cols * (base_box_width + box_spacing_x) - box_spacing_x
    if calculated_width > max_width_target:
        # Scale down box width to fit within target
        available_width = max_width_target - margin_left - margin_right - (cols - 1) * box_spacing_x
        box_width = max(220, available_width // cols)  # Min 220px for readability
    else:
        box_width = base_box_width

    struct_rows = (num_structs + cols - 1) // cols if num_structs > 0 else 0
    iface_rows = (num_interfaces + cols - 1) // cols if num_interfaces > 0 else 0
    enum_rows = (num_enums + cols - 1) // cols if num_enums > 0 else 0
    func_rows = (num_funcs + cols - 1) // cols if num_funcs > 0 else 0

    type_kind_label = lambda t: t.get('rust_equivalent', t.get('type_kind', 'type'))

    width = max(1600, calculated_width)
    height = margin_top + margin_bottom + struct_rows * (base_box_height + box_spacing_y) + iface_rows * (base_box_height + box_spacing_y) + enum_rows * (base_box_height + box_spacing_y) + func_rows * (base_box_height + box_spacing_y) + 50

    svg_parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" class="diagram-svg c3-5-svg" style="display: block; width: {width}px; height: auto;">']
    svg_parts.append(_diagram_boundary(margin_left, 40, width - margin_right, height - margin_bottom))
    svg_parts.append('<defs><marker id="arrow-c3-5" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/></marker></defs>')

    # Title
    svg_parts.append(f'<text x="{width // 2}" y="55" text-anchor="middle" fill="#1e293b" font-size="24" font-weight="bold" font-family="system-ui">{container_id} - Types ({len(types_list)})</text>')

    def _render_type_group(svg_parts, types, label, color, section_y, cols, box_width, base_box_height, box_spacing_x, box_spacing_y, deltas, type_kind_label):
        """Render a group of type boxes in the C3.5 diagram."""
        if not types:
            return section_y
        n = len(types)
        rows = (n + cols - 1) // cols
        svg_parts.append(f'<text x="{margin_left}" y="{section_y - 20}" fill="#64748b" font-size="18" font-weight="600" font-family="system-ui">{label} ({n})</text>')
        section_y += 32
        for i, t in enumerate(types):
            row = i // cols
            col = i % cols
            bx = margin_left + col * (box_width + box_spacing_x)
            by = section_y + row * (base_box_height + box_spacing_y)
            cx = bx + box_width // 2
            cy = by + base_box_height // 2
            delta_cls = ''
            if deltas:
                if t['id'] in [i.get('id') for i in deltas.get('new', [])]:
                    delta_cls = 'delta-new'
                elif t['id'] in [i.get('id') for i in deltas.get('removed', [])]:
                    delta_cls = 'delta-removed'
                elif t['id'] in [i.get('id') for i in deltas.get('modified', [])]:
                    delta_cls = 'delta-modified'
            svg_parts.append(f'<g class="type-element {delta_cls}" data-id="{t["id"]}" data-type="Type" style="cursor: pointer;">')
            svg_parts.append(f'<rect x="{bx}" y="{by}" width="{box_width}" height="{base_box_height}" rx="8" fill="{color}22" stroke="{color}" stroke-width="3"/>')
            if delta_cls:
                dtag = delta_cls.replace('delta-', '').upper()
                bc = '#d946ef' if dtag == 'NEW' else '#fbbf24'
                svg_parts.append(f'<g class="delta-badge"><rect x="{bx + box_width - 44}" y="{by + 4}" width="40" height="14" rx="3" fill="{bc}22" stroke="{bc}" stroke-width="1"/><text x="{bx + box_width - 24}" y="{by + 14}" text-anchor="middle" fill="{bc}" font-size="7" font-weight="bold" font-family="system-ui">{dtag}</text></g>')
            svg_parts.append(f'<text x="{cx}" y="{by + 38}" text-anchor="middle" fill="#1e40af" font-size="18" font-weight="600" font-family="system-ui">{t["name"][:35]}</text>')
            label_text = type_kind_label(t)
            svg_parts.append(f'<text x="{cx}" y="{cy + 10}" text-anchor="middle" fill="#64748b" font-size="13" font-family="system-ui">{label_text}</text>')
            svg_parts.append('</g>')
        return section_y + rows * (base_box_height + box_spacing_y) + 40

    section_y = margin_top
    section_y = _render_type_group(svg_parts, structs, 'Structs/Classes/Records', '#3b82f6', section_y, cols, box_width, base_box_height, box_spacing_x, box_spacing_y, deltas, type_kind_label)
    section_y = _render_type_group(svg_parts, interfaces, 'Interfaces/Traits', '#8b5cf6', section_y, cols, box_width, base_box_height, box_spacing_x, box_spacing_y, deltas, type_kind_label)
    section_y = _render_type_group(svg_parts, enums, 'Enums', '#f59e0b', section_y, cols, box_width, base_box_height, box_spacing_x, box_spacing_y, deltas, type_kind_label)
    section_y = _render_type_group(svg_parts, functions, 'Functions', '#10b981', section_y, cols, box_width, base_box_height, box_spacing_x, box_spacing_y, deltas, type_kind_label)

    # Build position map for all types (used for relationship lines)
    type_positions = {}
    pos_y = margin_top
    if structs:
        pos_y += 32
        for i, t in enumerate(structs):
            row = i // cols
            col = i % cols
            bx = margin_left + col * (box_width + box_spacing_x)
            by = pos_y + row * (base_box_height + box_spacing_y)
            type_positions[t['id']] = (bx + box_width // 2, by + base_box_height // 2)
        pos_y += struct_rows * (base_box_height + box_spacing_y) + 40
    if interfaces:
        pos_y += 32
        for i, t in enumerate(interfaces):
            row = i // cols
            col = i % cols
            bx = margin_left + col * (box_width + box_spacing_x)
            by = pos_y + row * (base_box_height + box_spacing_y)
            type_positions[t['id']] = (bx + box_width // 2, by + base_box_height // 2)
        pos_y += iface_rows * (base_box_height + box_spacing_y) + 40
    if enums:
        pos_y += 32
        for i, t in enumerate(enums):
            row = i // cols
            col = i % cols
            bx = margin_left + col * (box_width + box_spacing_x)
            by = pos_y + row * (base_box_height + box_spacing_y)
            type_positions[t['id']] = (bx + box_width // 2, by + base_box_height // 2)
        pos_y += enum_rows * (base_box_height + box_spacing_y) + 40
    if functions:
        pos_y += 32
        for i, t in enumerate(functions):
            row = i // cols
            col = i % cols
            bx = margin_left + col * (box_width + box_spacing_x)
            by = pos_y + row * (base_box_height + box_spacing_y)
            type_positions[t['id']] = (bx + box_width // 2, by + base_box_height // 2)

    # Draw type relationships using unified edge rendering
    svg_parts.append(render_edges_svg(
        edges=data.get('type_relationships', []),
        positions=type_positions,
        box_width=box_width,
        box_height=base_box_height,
        marker_id='arrow-c3-5',
        stroke_color='#64748b',
        label_bg='#0a1628',
        label_color='#94a3b8',
        rel_deltas=rel_deltas,
    ))
    svg_parts.append('</svg>')
    return '\n'.join(svg_parts)


def render_delta_svg(data, deltas):
    """Compact delta-only SVG showing only changed items and their relationships."""
    if not deltas:
        return '<div class="no-data">No changes detected - compare against a baseline with --baseline.</div>'

    parts = []
    width = 960
    margin_x = 40
    section_gap = 28
    box_w = 190
    box_h = 54
    cols = 4
    spc_x = 24
    spc_y = 16

    # --- Collect display items ---
    # (section_label, group_label, id, name, subtitle, delta_cls, is_context)
    display = []

    # C2 container deltas
    c2d = deltas.get('c2', {})
    for s in ('new', 'modified', 'removed'):
        for it in c2d.get(s, []):
            tech = it.get('technology', 'Container')
            display.append(('Containers', '', it['id'], it['name'], tech, f'delta-{s}', False))

    # C3 component deltas (grouped by container name)
    c3d = deltas.get('c3', {})
    con_map = {sanitize_id(c['name']): c['name'] for c in data.get('c2_containers', {}).get('containers', [])}
    for cid, c_deltas in c3d.items():
        gname = con_map.get(cid, cid)
        for s in ('new', 'modified', 'removed'):
            for it in c_deltas.get(s, []):
                tech = it.get('technology', 'Component')
                display.append((f'Components — {gname}', cid, it['id'], it['name'], tech, f'delta-{s}', False))

    # C3.5 type deltas (grouped by container name)
    c35d = deltas.get('c3_5', {})
    for cid, t_deltas in c35d.items():
        gname = con_map.get(cid, cid)
        for s in ('new', 'modified', 'removed'):
            for it in t_deltas.get(s, []):
                ttype = it.get('c4_type', 'type')
                display.append((f'Types — {gname}', cid, it['id'], it['name'], ttype, f'delta-{s}', False))

    if not display:
        return '<div class="no-data">No items changed.</div>'

    # --- Collect context items (unchanged, referenced by delta relationships) ---
    # Gather all delta relationship source/target IDs
    rel_deltas = {}
    for level in ('c1', 'c2', 'c3'):
        rel_deltas.update(deltas.get(f'{level}_rels', {}))
    rel_deltas.update(deltas.get('type_rels', {}))

    display_ids = {d[2] for d in display}
    ctx_ids = set()
    for key, _ in rel_deltas.items():
        parts_k = key.split('->')
        if len(parts_k) >= 2:
            for pid in (parts_k[0].strip(), parts_k[1].strip()):
                if pid and pid not in display_ids:
                    ctx_ids.add(pid)

    # Resolve context items from data — store (name, subtitle, level, container_type)
    ctx_boxes = {}
    type_map = {  # heuristic from technology/description
        'postgres': 'database', 'clickhouse': 'database', 'valkey': 'database', 'minio': 'database',
        'nats': 'queue',
    }
    for c in data.get('c2_containers', {}).get('containers', []):
        if c['id'] in ctx_ids:
            ct = c.get('container_type', '') or ('database' if 'database' in c.get('description','').lower() or 'database' in c.get('technology','').lower() else 'container')
            ctx_boxes[c['id']] = (c['name'], c.get('technology', 'Container'), 'c2', ct)
    for ext in data.get('c1_context', {}).get('external_systems', []):
        if ext['id'] in ctx_ids:
            ctx_boxes[ext['id']] = (ext['name'], ext.get('technology', 'External System'), 'c2', 'external')
    for p in data.get('c1_context', {}).get('people', []):
        if p['id'] in ctx_ids:
            ctx_boxes[p['id']] = (p['name'], 'Person', 'c2', 'person')
    for cid, cont in data.get('c3_components', {}).get('containers', {}).items():
        for comp in cont.get('components', []):
            if comp['id'] in ctx_ids:
                ctx_boxes[comp['id']] = (comp['name'], comp.get('technology', 'Component'), cid, 'component')
    for cid, cont in data.get('c3_5_types', {}).get('containers', {}).items():
        for t in cont.get('types', []):
            if t['id'] in ctx_ids:
                ctx_boxes[t['id']] = (t['name'], t.get('c4_type', 'type'), cid, 'type')

    # Categorize context items — keep name+subtitle from the data
    ctx_c2 = {cid: (n, s) for cid, (n, s, l, ct) in ctx_boxes.items() if l == 'c2'}
    ctx_c3 = {cid: (n, s) for cid, (n, s, l, ct) in ctx_boxes.items() if l != 'c2'}
    # Build type lookup for context items (so context boxes show proper type styling)
    ctx_type_map = {cid: ct for cid, (n, s, l, ct) in ctx_boxes.items()}

    y_cursor = margin_x + 44
    position_map = {}
    ctx_box_w = 150
    ctx_box_h = 44

    def draw_section(title, items, ctx_items, y, add_top_gap=False):
        nonlocal position_map
        # Add extra gap before new sections (not the first one)
        y_start = y + section_gap if add_top_gap else y
        parts.append(f'<text x="{margin_x}" y="{y_start + 16}" fill="#94a3b8" font-size="13" font-weight="600" font-family="system-ui">{title}</text>')
        y_content = y_start + 32

        # Combine items and context items
        all_items = items + [('', '', cid, name, sub, '', True) for cid, (name, sub) in ctx_items.items()]
        if not all_items:
            return y_content + spc_y

        n = len(all_items)
        ncols = min(cols, n)
        # Always use max columns for consistent left alignment across sections
        total_w = cols * box_w + (cols - 1) * spc_x
        start_x = margin_x

        for i, (sec, grp, item_id, name, subtitle, dcls, is_ctx) in enumerate(all_items):
            col = i % ncols
            row = i // ncols
            bw = ctx_box_w if is_ctx else box_w
            bh = ctx_box_h if is_ctx else box_h
            x = start_x + col * (box_w + spc_x)
            # center context items within the box_w grid
            cx = x + bw // 2
            cy = y_content + row * (bh + spc_y) + bh // 2
            position_map[item_id] = (cx, cy)

            if is_ctx:
                ctx_fill = {'database': '#a855f706', 'queue': '#22d3ee06', 'container': '#3b82f606',
                            'external': '#1e293b', 'person': '#1e293b', 'component': '#1e293b',
                            'type': '#1e293b'}.get(ctx_type_map.get(item_id, ''), '#1e293b')
                ctx_stroke = {'database': '#a855f7', 'queue': '#22d3ee', 'container': '#3b82f6',
                              'external': '#64748b', 'person': '#eab308', 'component': '#64748b',
                              'type': '#64748b'}.get(ctx_type_map.get(item_id, ''), '#475569')
                ctx_type = ctx_type_map.get(item_id, 'container')
                cy_off = y_content + row * (bh + spc_y)
                parts.append(f'<g class="element context" data-id="{item_id}" data-type="Container" data-container-type="{ctx_type}" style="cursor: pointer; opacity: 0.65;">')
                cx_center = x + bw // 2
                if ctx_type == 'database':
                    cy_top = cy_off + 8
                    rr, rh = 72, 7
                    parts.append(f'<ellipse cx="{cx_center}" cy="{cy_top}" rx="{rr}" ry="{rh}" fill="{ctx_fill}" stroke="{ctx_stroke}" stroke-width="1.5"/>')
                    parts.append(f'<rect x="{cx_center - rr}" y="{cy_top}" width="{rr * 2}" height="{bh - 16}" fill="{ctx_fill}" stroke="none"/>')
                    parts.append(f'<line x1="{cx_center - rr}" y1="{cy_top}" x2="{cx_center - rr}" y2="{cy_top + bh - 16}" stroke="{ctx_stroke}" stroke-width="1.5"/>')
                    parts.append(f'<line x1="{cx_center + rr}" y1="{cy_top}" x2="{cx_center + rr}" y2="{cy_top + bh - 16}" stroke="{ctx_stroke}" stroke-width="1.5"/>')
                    parts.append(f'<ellipse cx="{cx_center}" cy="{cy_top + bh - 16}" rx="{rr}" ry="{rh}" fill="{ctx_fill}" stroke="{ctx_stroke}" stroke-width="1.5"/>')
                    parts.append(f'<text x="{cx_center}" y="{cy_off + 22}" text-anchor="middle" fill="#e2e8f0" font-size="9" font-weight="500" font-family="system-ui">{name}</text>')
                    parts.append(f'<text x="{cx_center}" y="{cy_off + 35}" text-anchor="middle" fill="#64748b" font-size="8" font-family="system-ui">{subtitle}</text>')
                elif ctx_type == 'queue':
                    parts.append(f'<rect x="{x}" y="{cy_off}" width="{bw}" height="{bh}" rx="22" fill="{ctx_fill}" stroke="{ctx_stroke}" stroke-width="1.5"/>')
                    parts.append(f'<text x="{cx_center}" y="{cy_off + 20}" text-anchor="middle" fill="#e2e8f0" font-size="9" font-weight="500" font-family="system-ui">{name}</text>')
                    parts.append(f'<text x="{cx_center}" y="{cy_off + 33}" text-anchor="middle" fill="#64748b" font-size="8" font-family="system-ui">{subtitle}</text>')
                else:
                    parts.append(f'<rect x="{x}" y="{cy_off}" width="{bw}" height="{bh}" rx="5" fill="{ctx_fill}" stroke="{ctx_stroke}" stroke-width="1.5"/>')
                    parts.append(f'<text x="{cx_center}" y="{cy_off + 18}" text-anchor="middle" fill="#e2e8f0" font-size="9" font-weight="500" font-family="system-ui">{name}</text>')
                    parts.append(f'<text x="{cx_center}" y="{cy_off + 31}" text-anchor="middle" fill="#64748b" font-size="8" font-family="system-ui">{subtitle}</text>')
                parts.append('</g>')
            else:
                parts.append(f'<g class="element component {dcls}" data-id="{item_id}" data-type="Component" data-tech="{subtitle}" style="cursor: pointer;">')
                parts.append(f'<rect x="{x}" y="{y_content + row * (bh + spc_y)}" width="{bw}" height="{bh}" rx="5" fill="#1e293b" stroke="#64748b" stroke-width="1.5"/>')
                if dcls:
                    dtag = dcls.replace('delta-', '').upper()
                    bc = '#d946ef' if dtag == 'NEW' else '#fbbf24'
                    parts.append(f'<g class="delta-badge">')
                    parts.append(f'<rect x="{x + bw - 44}" y="{y_content + row * (bh + spc_y) + 4}" width="40" height="14" rx="3" fill="{bc}22" stroke="{bc}" stroke-width="1"/>')
                    parts.append(f'<text x="{x + bw - 24}" y="{y_content + row * (bh + spc_y) + 14}" text-anchor="middle" fill="{bc}" font-size="7" font-weight="bold" font-family="system-ui">{dtag}</text>')
                    parts.append(f'</g>')
                parts.append(f'<text x="{x + 8}" y="{y_content + row * (bh + spc_y) + 16}" fill="#e2e8f0" font-size="10" font-weight="bold" font-family="system-ui">{name[:28]}</text>')
                parts.append(f'<text x="{x + 8}" y="{y_content + row * (bh + spc_y) + 30}" fill="#64748b" font-size="8" font-family="system-ui">[{subtitle}]</text>')
                parts.append('</g>')

        rows = (n + ncols - 1) // ncols
        return y_content + rows * (max(box_h, ctx_box_h) + spc_y) + section_gap

    # --- Draw sections ---
    # C2 containers
    c2_items = [d for d in display if d[0] == 'Containers']
    if c2_items or ctx_c2:
        y_cursor = draw_section('Containers (C2)', c2_items, ctx_c2, y_cursor)

    # C3 components per container group
    c3_groups = set(d[0] for d in display if d[0].startswith('Components'))
    first_c3 = True
    for g in sorted(c3_groups):
        grp_items = [d for d in display if d[0] == g]
        # Find container prefix for context inference
        ctx_for_grp = {kid: v for kid, v in ctx_c3.items()}
        y_cursor = draw_section(g, grp_items, ctx_for_grp, y_cursor, add_top_gap=not first_c3)
        first_c3 = False

    # C3.5 types per container group
    c35_groups = set(d[0] for d in display if d[0].startswith('Types'))
    first_c35 = True
    for g in sorted(c35_groups):
        grp_items = [d for d in display if d[0] == g]
        y_cursor = draw_section(g, grp_items, {}, y_cursor, add_top_gap=not first_c35)
        first_c35 = False

    total_h = y_cursor + 20

    # --- Draw edges ---
    # Build edge list from delta relationships that have both endpoints in position_map
    delta_edges = []
    for key, status in rel_deltas.items():
        parts_k = key.split('->')
        if len(parts_k) >= 3:
            src, tgt, lbl = parts_k[0].strip(), parts_k[1].strip(), parts_k[2].strip()
            if src in position_map and tgt in position_map:
                delta_edges.append({'source': src, 'target': tgt, 'label': lbl, 'technology': '', '_delta': status})

    edge_svg = render_edges_svg(
        delta_edges, position_map, box_w, box_h, 'arrow-delta',
        stroke_color='#d946ef', label_bg='#1e293b', label_color='#d946ef',
    )

    # Build viewBox with 20px padding
    delta_style = '''
<style>
    @keyframes delta-pulse { 0%,100% { filter: drop-shadow(0 0 3px currentColor); } 50% { filter: drop-shadow(0 0 8px currentColor); } }
    .delta-badge rect { animation: delta-pulse 1.5s ease-in-out infinite; }
    .delta-new rect { stroke: #d946ef !important; stroke-width: 3 !important; fill: #d946ef44 !important; }
    .delta-modified rect { stroke: #fbbf24 !important; stroke-width: 3 !important; fill: #fbbf2444 !important; }
    .delta-removed rect { stroke: #ef4444 !important; stroke-width: 2.5; opacity: 0.5; filter: grayscale(0.5); }
    .relationship.delta-new, .relationship.delta-modified { pointer-events: auto; }
    .relationship.delta-new path, .relationship.delta-modified path { stroke: #d946ef !important; }
    .context rect { filter: opacity(0.7); }
</style>'''
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {total_h}" width="100%" style="background: transparent;">
<defs>
    <marker id="arrow-delta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#d946ef"/>
    </marker>
    {delta_style}
</defs>
<rect x="10" y="10" width="{width - 20}" height="{total_h - 20}" rx="8" fill="transparent" stroke="#d946ef22" stroke-width="1" stroke-dasharray="6,3"/>
<text x="{margin_x}" y="{margin_x + 16}" fill="#d946ef" font-size="15" font-weight="700" font-family="system-ui">Δ DELTA CHANGES</text>
{chr(10).join(parts)}
{edge_svg}
</svg>'''
    return svg


def style_block():
    """Delta CSS rules (no wrapper — injected inside the main <style> block)."""
    return '''
    @keyframes delta-pulse { 0%,100% { filter: drop-shadow(0 0 3px currentColor); } 50% { filter: drop-shadow(0 0 8px currentColor); } }
    .delta-badge rect { animation: delta-pulse 1.5s ease-in-out infinite; }
    .delta-new rect, .delta-new ellipse, .delta-new path { stroke: #d946ef !important; stroke-width: 3 !important; }
    .delta-new rect { fill: #d946ef44 !important; }
    .delta-new.type-element rect { fill: #d946ef66 !important; }
    .delta-modified rect, .delta-modified ellipse, .delta-modified path { stroke: #fbbf24 !important; stroke-width: 3 !important; }
    .delta-modified rect { fill: #fbbf2444 !important; }
    .delta-removed rect, .delta-removed ellipse, .delta-removed path { stroke: #ef4444 !important; stroke-width: 2.5; opacity: 0.5; filter: grayscale(0.5); }
    .relationship.delta-new, .relationship.delta-modified { pointer-events: auto; }
    .relationship.delta-new path, .relationship.delta-modified path { stroke: #d946ef !important; }
    .tab-btn.has-delta { color: #d946ef !important; }'''

def generate_html(data, deltas=None, system_name='Architecture'):
    """Generate complete self-contained HTML following C4 model."""

    c1 = data.get('c1_context', {})
    c2 = data.get('c2_containers', {})
    containers = c2.get('containers', [])
    # Relationships is a dict with c1, c2, c3 keys
    rels = data.get('relationships', {})
    c1_edges_json = json.dumps(rels.get('c1', []))
    c2_edges_json = json.dumps(rels.get('c2', []))
    c3_edges_json = json.dumps(rels.get('c3', []))
    c3_5_edges_json = json.dumps(data.get('type_relationships', []))

    # Build C3 sub-tabs — only include containers that actually have components
    container_tabs = ''
    container_panels = ''
    for c in containers:
        cid = sanitize_id(c['name'])
        c3_deltas = deltas.get('c3', {}).get(cid, {}) if deltas else None
        c3_rel_deltas = deltas.get('c3_rels', {}) if deltas else None
        svg = render_c3_svg(data, cid, c3_deltas, c3_rel_deltas)
        if 'no-data' in svg:
            continue
        delta_cls = get_delta_class(c['id'], deltas, 'c2') if deltas else ''
        container_tabs += f'<button class="tab-btn sub-tab {delta_cls}" data-target="c3-{cid}">{c["name"]}</button>\n'
        container_panels += f'<div class="panel" id="c3-{cid}">{svg}</div>\n'

    # Build C3.5 Types tabs — separate loop so C3 no-data doesn't skip types
    c3_5_tabs = ''
    c3_5_panels = ''
    for c in containers:
        cid = sanitize_id(c['name'])
        c3_5_deltas = deltas.get('c3_5', {}).get(cid, {}) if deltas else None
        type_rel_deltas = deltas.get('type_rels', {}) if deltas else None
        svg_35 = render_c3_5_svg(data, cid, c3_5_deltas, type_rel_deltas)
        if 'no-data' not in svg_35:
            c3_5_delta_cls = 'delta-new' if c3_5_deltas else ''
            c3_5_tabs += f'<button class="tab-btn sub-tab {c3_5_delta_cls}" data-target="c3-5-{cid}">{c["name"]} - Types</button>\n'
            c3_5_panels += f'<div class="panel c3-5-panel" id="c3-5-{cid}" style="padding: 0; margin: 0; overflow-x: auto;">{svg_35}</div>\n'

    # Build delta legend
    delta_legend = ''
    if deltas:
        delta_legend = '''
        <div class="legend-section">
            <span class="legend-title">Changes:</span>
            <span class="legend-item"><span class="dot new"></span> New</span>
            <span class="legend-item"><span class="dot modified"></span> Modified</span>
            <span class="legend-item"><span class="dot removed"></span> Removed</span>
        </div>'''

    # Build delta panel
    delta_svg = render_delta_svg(data, deltas)
    delta_has_changes = 'no-data' not in delta_svg

    # Build delta edges for JS registry
    delta_edges = []
    if deltas:
        for level in ('c1', 'c2', 'c3'):
            for key, status in deltas.get(f'{level}_rels', {}).items():
                parts_k = key.split('->')
                if len(parts_k) >= 3:
                    delta_edges.append({'source': parts_k[0].strip(), 'target': parts_k[1].strip(), 'label': parts_k[2].strip()})
        for key, status in deltas.get('type_rels', {}).items():
            parts_k = key.split('->')
            if len(parts_k) >= 3:
                delta_edges.append({'source': parts_k[0].strip(), 'target': parts_k[1].strip(), 'label': parts_k[2].strip()})
    delta_edges_json = json.dumps(delta_edges)
    delta_tab_cls = 'has-delta' if delta_has_changes else ''

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>C4 Architecture -- {system_name}</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }}

.header {{ padding: 24px 32px 0; }}
.header h1 {{ font-size: 20px; font-weight: 600; color: #f8fafc; }}
.header .subtitle {{ font-size: 12px; color: #64748b; margin-top: 4px; }}

.nav-row {{ display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 32px 0; gap: 20px; flex-wrap: wrap; }}
.tabs {{ display: flex; gap: 2px; }}
.tab-btn {{ background: transparent; border: none; color: #64748b; font-size: 13px; font-weight: 500;
            padding: 10px 16px; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }}
.tab-btn:hover {{ color: #94a3b8; }}
.tab-btn.active {{ color: #3b82f6; border-bottom-color: #3b82f6; }}

.legend {{ display: flex; gap: 16px; font-size: 11px; color: #64748b; flex-wrap: wrap; align-items: center; }}
.legend-section {{ display: flex; gap: 10px; align-items: center; }}
.legend-title {{ font-weight: 600; color: #94a3b8; }}
.legend-item {{ display: flex; align-items: center; gap: 4px; }}
.dot {{ width: 8px; height: 8px; border-radius: 50%; }}
.dot.new {{ background: #d946ef; }}
.dot.modified {{ background: #f59e0b; }}
.dot.removed {{ background: #ef4444; opacity: 0.6; }}

.shape-legend {{ display: flex; gap: 12px; flex-wrap: wrap; }}
.shape-item {{ display: flex; align-items: center; gap: 6px; }}
.shape {{ border: 1.5px solid; border-radius: 3px; }}
.shape.person {{ width: 14px; height: 14px; border-radius: 50%; border-color: #475569; }}
.shape.software-system {{ width: 18px; height: 12px; border-color: #64748b; }}
.shape.container {{ width: 18px; height: 12px; border-color: #3b82f6; }}
.shape.database {{ width: 14px; height: 14px; border-radius: 50%; border-color: #a855f7; }}
.shape.queue {{ width: 18px; height: 10px; border-radius: 10px; border-color: #22d3ee; }}
.shape.library {{ width: 18px; height: 12px; border-color: #64748b; border-style: dashed; }}
.line {{ width: 20px; height: 0; border-top: 2px solid; }}
.line.solid {{ border-color: #475569; }}
.line.dashed {{ border-color: #a855f7; border-top-style: dashed; }}

.sub-tabs {{ display: flex; gap: 2px; padding: 12px 32px 0; flex-wrap: wrap; }}
.sub-tab {{ background: transparent; border: none; color: #475569; font-size: 12px; font-weight: 500;
            padding: 6px 12px; cursor: pointer; border-radius: 4px; transition: all 0.15s; }}
.sub-tab:hover {{ color: #94a3b8; background: #1e293b; }}
.sub-tab.active {{ color: #22d3ee; background: #1e3a5f; }}

.content {{ padding: 20px 32px; }}
.panel {{ display: none; overflow-x: auto; }}
.panel.active {{ display: block; }}
.c3-5-panel {{ padding: 0 !important; margin: 0 !important; }}

.diagram-svg {{ width: 100%; max-height: 70vh; }}
.c3-svg {{ max-height: none; }}
.c3-5-svg {{ max-height: none !important; width: auto !important; min-width: 100%; }}

.element, .type-element {{ cursor: pointer; transition: opacity 0.15s; }}
.element:hover, .type-element:hover {{ opacity: 0.85; }}
/* Three-state highlighting - shared across C1/C2/C3/C3.5 */
.element.hl-selected rect, .element.hl-selected ellipse,
.type-element.hl-selected rect {{ stroke: #ffffff !important; stroke-width: 2.5; }}
.element.hl-selected text, .type-element.hl-selected text {{ fill: #ffffff !important; }}
.element.hl-feeder rect, .element.hl-feeder ellipse,
.type-element.hl-feeder rect {{ stroke: #22c55e !important; stroke-width: 2.5;
    filter: drop-shadow(0 0 6px #22c55e88); }}
.element.hl-consumer rect, .element.hl-consumer ellipse,
.type-element.hl-consumer rect {{ stroke: #f59e0b !important; stroke-width: 2.5;
    filter: drop-shadow(0 0 6px #f59e0b88); }}
.element.hl-dim, .type-element.hl-dim {{ opacity: 0.2; }}
.element.highlighted rect, .element.highlighted ellipse,
.type-element.highlighted rect {{ stroke: #ffffff !important; stroke-width: 2.5; filter: drop-shadow(0 0 8px rgba(255,255,255,0.4)); }}
.element.highlighted text, .type-element.highlighted text {{ fill: #ffffff !important; }}

.relationship {{ cursor: pointer; transition: stroke-width 0.15s; opacity: 0; pointer-events: none; }}
.relationship.highlighted {{ opacity: 1; pointer-events: auto; stroke-width: 2; filter: drop-shadow(0 0 4px currentColor); }}
.relationship.highlighted:hover {{ stroke-width: 3; }}

.tooltip {{ position: fixed; background: #1e293b; border: 1px solid #334155; border-radius: 6px;
    padding: 0; min-width: 220px; max-width: 320px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    display: none; z-index: 1000; cursor: default; user-select: none; }}
.tooltip .tt-header {{ display: flex; align-items: center; gap: 8px; padding: 8px 10px 4px; cursor: move; }}
.tooltip .tt-drag {{ color: #475569; font-size: 14px; letter-spacing: 2px; }}
.tooltip .tt-type {{ font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; flex: 1; }}
.tooltip .tt-close {{ color: #64748b; font-size: 16px; cursor: pointer; padding: 0 4px; }}
.tooltip .tt-close:hover {{ color: #ef4444; }}
.tooltip .tt-name {{ font-weight: 600; color: #f8fafc; margin: 0 10px 4px; font-size: 13px; }}
.tooltip .tt-desc {{ color: #94a3b8; line-height: 1.4; margin: 0 10px 4px; font-size: 11px; }}
.tooltip .tt-tech-row {{ margin: 0 10px 4px; }}
.tooltip .tt-tech {{ color: #64748b; font-size: 11px; }}
.tooltip .tt-meta {{ border-top: 1px solid #334155; padding: 6px 10px 8px; font-size: 10px; color: #475569; display: none; }}
.tooltip .tt-container-type {{ margin-bottom: 2px; }}
.tooltip .tt-path {{ word-break: break-all; }}

/* Expandable relationship sections */
.tooltip .tt-relationships {{ border-top: 1px solid #334155; margin-top: 6px; padding: 6px 10px 8px; }}
.tooltip .tt-rel-section {{ margin: 6px 0; }}
.tooltip .tt-rel-header {{ cursor: pointer; color: #64748b; font-size: 10px; font-weight: 600; text-transform: uppercase;
    display: flex; align-items: center; gap: 6px; padding: 4px 0; user-select: none; }}
.tooltip .tt-rel-header:hover {{ color: #94a3b8; }}
.tooltip .tt-rel-header::before {{ content: '▶'; font-size: 8px; transition: transform 0.15s; }}
.tooltip .tt-rel-header.open::before {{ transform: rotate(90deg); }}
.tooltip .tt-rel-list {{ display: none; margin-left: 12px; font-size: 10px; color: #94a3b8; max-height: 120px; overflow-y: auto; overflow-x: hidden;
    scrollbar-width: thin; scrollbar-color: #475569 #1e293b; }}
.tooltip .tt-rel-list.show {{ display: block; }}
.tooltip .tt-rel-list::-webkit-scrollbar {{ width: 6px; }}
.tooltip .tt-rel-list::-webkit-scrollbar-track {{ background: #1e293b; }}
.tooltip .tt-rel-list::-webkit-scrollbar-thumb {{ background: #475569; border-radius: 3px; }}
.tooltip .tt-rel-list::-webkit-scrollbar-thumb:hover {{ background: #64748b; }}
.tooltip .tt-rel-item {{ padding: 4px 0; border-bottom: 1px solid #33415555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
.tooltip .tt-rel-item:last-child {{ border-bottom: none; }}
.tooltip .tt-rel-arrow {{ color: #3b82f6; margin: 0 4px; }}

.no-data {{ color: #64748b; font-size: 13px; padding: 40px; text-align: center; background: #1e293b; border-radius: 8px; }}
.diagram-title {{ font-size: 11px; color: #475569; margin-bottom: 12px; letter-spacing: 0.3px; }}

        {style_block()}
</style>
</head>
<body>

<div class="header">
    <h1>{system_name}</h1>
    <div class="subtitle">C4 Architecture Documentation</div>
</div>

<div class="nav-row">
    <div class="tabs">
        <button class="tab-btn active" data-target="c1">1. System Context</button>
        <button class="tab-btn" data-target="c2">2. Containers</button>
        <button class="tab-btn" data-target="c3">3. Components</button>
        <button class="tab-btn" data-target="c3-5">3.5 Types</button>
        <button class="tab-btn {delta_tab_cls}" data-target="delta">Δ Delta</button>
    </div>
    <div class="legend" id="legend">
        <div class="legend-section">
            <span class="legend-title">Elements:</span>
            <span class="shape-item"><span class="shape person"></span> Person</span>
            <span class="shape-item"><span class="shape software-system"></span> Software System</span>
            <span class="shape-item"><span class="shape container"></span> Container</span>
            <span class="shape-item"><span class="shape database"></span> Database</span>
            <span class="shape-item"><span class="shape queue"></span> Queue/Topic</span>
            <span class="shape-item"><span class="shape library"></span> Library</span>
        </div>
        <div class="legend-section">
            <span class="legend-title">Lines:</span>
            <span class="shape-item"><span class="line solid"></span> Sync call</span>
            <span class="shape-item"><span class="line dashed"></span> Async / Data</span>
        </div>
        <div class="legend-section">
            <span class="legend-title">Layers:</span>
            <span class="shape-item"><span class="shape" style="border-color:#3b82f6;width:14px;height:10px;"></span> Controller</span>
            <span class="shape-item"><span class="shape" style="border-color:#f97316;width:14px;height:10px;"></span> Middleware</span>
            <span class="shape-item"><span class="shape" style="border-color:#22d3ee;width:14px;height:10px;"></span> Handler</span>
            <span class="shape-item"><span class="shape" style="border-color:#10b981;width:14px;height:10px;"></span> Service</span>
            <span class="shape-item"><span class="shape" style="border-color:#f59e0b;width:14px;height:10px;"></span> Validator</span>
            <span class="shape-item"><span class="shape" style="border-color:#a855f7;width:14px;height:10px;"></span> Repository</span>
            <span class="shape-item"><span class="shape" style="border-color:#e879f9;width:14px;height:10px;"></span> Mapper</span>
            <span class="shape-item"><span class="shape" style="border-color:#64748b;width:14px;height:10px;"></span> Other</span>
        </div>
        <div class="legend-section">
            <span class="legend-title">Click:</span>
            <span class="shape-item"><span class="shape" style="border-color:#ffffff;width:14px;height:10px;"></span> Selected</span>
            <span class="shape-item"><span class="shape" style="border-color:#22c55e;width:14px;height:10px;"></span> Feeds into it</span>
            <span class="shape-item"><span class="shape" style="border-color:#f59e0b;width:14px;height:10px;"></span> Consumes it</span>
        </div>
        {delta_legend}
    </div>
</div>

<div class="sub-tabs" id="c3-subtabs" style="display:none;">
    {container_tabs}
</div>
<div class="sub-tabs" id="c3-5-subtabs" style="display:none;">
    {c3_5_tabs}
</div>

<div class="content">
    <div class="panel active" id="c1">
        <div class="diagram-title">System Context diagram for {system_name}</div>
        {render_c1_svg(data, deltas)}
    </div>
    <div class="panel" id="c2">
        <div class="diagram-title">Container diagram for {system_name}</div>
        {render_c2_svg(data, deltas)}
    </div>
    <div class="panel" id="c3">
        {container_panels}
    </div>
    <div class="panel" id="c3-5">
        {c3_5_panels}
    </div>
    <div class="panel" id="delta">
        {delta_svg}
    </div>
</div>

<div class="tooltip" id="tooltip">
    <div class="tt-header" id="tt-header">
        <span class="tt-drag">::</span>
        <span class="tt-type"></span>
        <span class="tt-close" id="tt-close">×</span>
    </div>
    <div class="tt-name"></div>
    <div class="tt-desc"></div>
    <div class="tt-tech-row"><span class="tt-tech"></span></div>
    <div class="tt-meta" id="tt-meta">
        <div class="tt-container-type"></div>
        <div class="tt-path"></div>
    </div>
    <div class="tt-relationships" id="tt-relationships" style="display:none;">
        <div class="tt-rel-section">
            <div class="tt-rel-header">Incoming</div>
            <div class="tt-rel-list tt-rel-incoming"></div>
        </div>
        <div class="tt-rel-section">
            <div class="tt-rel-header">Outgoing</div>
            <div class="tt-rel-list tt-rel-outgoing"></div>
        </div>
    </div>
</div>

<script>
const tooltip = document.getElementById('tooltip');

const c1Edges = {c1_edges_json};
const c2Edges = {c2_edges_json};
const c3Edges = {c3_edges_json};
const c35Edges = {c3_5_edges_json};
const deltaEdges = {delta_edges_json};

// =============================================================================
// UTILITY HELPERS
// =============================================================================

const TOOLTIP_WIDTH = 320;

function tabToLayer(tab) {{
    if (tab === 'c3' || (tab.startsWith('c3-') && !tab.startsWith('c3-5'))) return 'c3';
    if (tab.startsWith('c3-5')) return 'c35';
    return tab;
}}

function findTooltipAnchor(clickedEl) {{
    const dimmed = document.querySelectorAll('.hl-dim');
    if (dimmed.length === 0) return clickedEl.getBoundingClientRect();

    const clickRect = clickedEl.getBoundingClientRect();
    const clickCx = clickRect.left + clickRect.width / 2;
    const clickCy = clickRect.top + clickRect.height / 2;

    let best = null;
    let bestDist = Infinity;

    for (const el of dimmed) {{
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const ecx = r.left + r.width / 2;
        const ecy = r.top + r.height / 2;
        const dist = Math.sqrt((ecx - clickCx) ** 2 + (ecy - clickCy) ** 2);
        if (dist < bestDist) {{
            bestDist = dist;
            best = r;
        }}
    }}

    return best || clickedEl.getBoundingClientRect();
}}

function positionTooltipAbove(rect) {{
    let top = Math.max(10, rect.top - 10);
    tooltip.style.left = Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH) + 'px';
    tooltip.style.top = top + 'px';
}}

function setTooltipContent({{ type, name, desc, tech }}) {{
    tooltip.querySelector('.tt-type').textContent = type || 'Element';
    tooltip.querySelector('.tt-name').textContent = name;
    tooltip.querySelector('.tt-desc').textContent = desc || '';
    tooltip.querySelector('.tt-tech').textContent = tech || '';
}}

function renderRelationshipList(container, items, formatFn, emptyText) {{
    container.innerHTML = '';
    if (items.length > 0) {{
        items.forEach(item => {{
            const div = document.createElement('div');
            div.className = 'tt-rel-item';
            div.textContent = formatFn(item);
            container.appendChild(div);
        }});
    }} else {{
        const div = document.createElement('div');
        div.className = 'tt-rel-item';
        div.textContent = emptyText;
        container.appendChild(div);
    }}
}}

function activateFirstSubTab(containerId) {{
    const firstSub = document.querySelector('#' + containerId + ' .sub-tab');
    if (firstSub) firstSub.click();
}}

// =============================================================================
// UNIFIED ENTITY & RELATIONSHIP MODEL
// =============================================================================

const registry = {{
    getEdgesForLayer(layer) {{
        switch(layer) {{
            case 'c1': return c1Edges;
            case 'c2': return c2Edges;
            case 'c3': return c3Edges;
            case 'c35': return c35Edges;
            case 'delta': return deltaEdges;
            default: return [];
        }}
    }},

    getAllEdges() {{
        return [...c1Edges, ...c2Edges, ...c3Edges, ...c35Edges];
    }},

    buildFeedsConsumersForLayer(layer) {{
        const edges = this.getEdgesForLayer(layer);
        const feeds = {{}}, consumers = {{}};
        edges.forEach(e => {{
            if (!consumers[e.source]) consumers[e.source] = new Set();
            consumers[e.source].add(e.target);
            if (!feeds[e.target]) feeds[e.target] = new Set();
            feeds[e.target].add(e.source);
        }});
        return {{ feeds, consumers }};
    }},

    findEdgesForEntity(id, tab) {{
        const layer = tabToLayer(tab);
        const edges = this.getEdgesForLayer(layer);
        const outgoing = [];
        const incoming = [];
        edges.forEach(e => {{
            const srcMatch = e.source === id || (e.source || '').includes(id) || id.includes(e.source || '');
            const tgtMatch = e.target === id || (e.target || '').includes(id) || id.includes(e.target || '');
            if (srcMatch) outgoing.push({{ target: e.target, label: e.label || 'Uses' }});
            if (tgtMatch) incoming.push({{ source: e.source, label: e.label || 'Used by' }});
        }});
        return {{ outgoing, incoming }};
    }}
}};

let currentFeeds = {{}}, currentConsumers = {{}};
let currentTab = 'c1';

function updateRelationshipData(tab) {{
    currentTab = tab;
    const layer = tabToLayer(tab);
    const result = registry.buildFeedsConsumersForLayer(layer);
    currentFeeds = result.feeds;
    currentConsumers = result.consumers;
}}

function highlightElement(element) {{
    const id = element.dataset.id;
    const type = element.dataset.type;

    clearAllHighlights();

    const feeders = currentFeeds[id] || new Set();
    const consumers = currentConsumers[id] || new Set();

    const selector = type === 'Type' || type === 'Function' ? '.type-element' : '.element';
    document.querySelectorAll(selector).forEach(other => {{
        const oid = other.dataset.id;
        if (oid === id) {{
            other.classList.add('hl-selected');
        }} else if (feeders.has(oid)) {{
            other.classList.add('hl-feeder');
        }} else if (consumers.has(oid)) {{
            other.classList.add('hl-consumer');
        }} else {{
            other.classList.add('hl-dim');
        }}
    }});

    const layer = tabToLayer(currentTab);
    const rels = registry.getEdgesForLayer(layer);
    rels.forEach(rel => {{
        if (rel.source === id || rel.target === id) {{
            const selector = '.relationship[data-from="' + rel.source + '"][data-to="' + rel.target + '"]';
            document.querySelectorAll(selector).forEach(r => r.classList.add('highlighted'));
        }}
    }});
}}

function clearAllHighlights() {{
    document.querySelectorAll('.hl-selected,.hl-feeder,.hl-consumer,.hl-dim')
        .forEach(el => el.classList.remove('hl-selected','hl-feeder','hl-consumer','hl-dim'));
    document.querySelectorAll('.highlighted').forEach(h => h.classList.remove('highlighted'));
}}

updateRelationshipData('c1');

// Tab switching
document.querySelectorAll('.tab-btn:not(.sub-tab)').forEach(btn => {{
    btn.addEventListener('click', () => {{
        document.querySelectorAll('.tab-btn:not(.sub-tab)').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');

        const subtabs = document.getElementById('c3-subtabs');
        const c35Subtabs = document.getElementById('c3-5-subtabs');
        subtabs.style.display = btn.dataset.target === 'c3' ? 'flex' : 'none';
        c35Subtabs.style.display = btn.dataset.target === 'c3-5' ? 'flex' : 'none';

        const isC3 = btn.dataset.target === 'c3';
        const isC35 = btn.dataset.target === 'c3-5';
        const isDelta = btn.dataset.target === 'delta';

        updateRelationshipData(btn.dataset.target);

        if (isC3) {{
            activateFirstSubTab('c3-subtabs');
        }} else if (isC35) {{
            activateFirstSubTab('c3-5-subtabs');
        }}
    }});
}});

// Sub-tab switching (C3 containers and C3.5 types)
document.querySelectorAll('.sub-tab').forEach(btn => {{
    btn.addEventListener('click', () => {{
        document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
        const targetId = btn.dataset.target;
        if (targetId.startsWith('c3-5-')) {{
            document.querySelectorAll('#c3-5 .panel').forEach(p => p.classList.remove('active'));
        }} else {{
            document.querySelectorAll('#c3 .panel').forEach(p => p.classList.remove('active'));
        }}
        btn.classList.add('active');
        document.getElementById(targetId).classList.add('active');
        clearAllHighlights();
        tooltip.style.display = 'none';
        const parentTab = targetId.startsWith('c3-5-') ? 'c3-5' : 'c3';
        updateRelationshipData(parentTab);
    }});
}});

// Unified click handler for all element types (C1/C2/C3/C3.5)
document.querySelectorAll('.element, .type-element').forEach(el => {{
    el.addEventListener('click', (e) => {{
        e.stopPropagation();

        const id = el.dataset.id;
        const textElements = el.querySelectorAll('text');

        setTooltipContent({{
            type: el.dataset.type,
            name: textElements[0]?.textContent || id,
            desc: textElements[1]?.textContent || '',
            tech: textElements[2]?.textContent || '',
        }});

        const ctype = el.dataset.containerType || '';
        const path = el.dataset.path || '';
        const tech = el.dataset.tech || '';
        const meta = document.getElementById('tt-meta');
        if (ctype || path || tech) {{
            meta.style.display = 'block';
            document.querySelector('.tt-container-type').textContent =
                ctype ? 'Type: ' + ctype : '';
            document.querySelector('.tt-path').textContent =
                path ? 'Source: ' + path : '';
        }} else {{
            meta.style.display = 'none';
        }}

        highlightElement(el);

        positionTooltipAbove(findTooltipAnchor(el));
        tooltip.style.display = 'block';

        const relsContainer = document.getElementById('tt-relationships');
        const outgoingList = tooltip.querySelector('.tt-rel-outgoing');
        const incomingList = tooltip.querySelector('.tt-rel-incoming');

        const result = registry.findEdgesForEntity(id, currentTab);
        renderRelationshipList(incomingList, result.incoming, r => r.source + ' \u2192 ' + r.label, 'No incoming relationships');
        renderRelationshipList(outgoingList, result.outgoing, r => r.label + ' \u2192 ' + r.target, 'No outgoing relationships');

        relsContainer.style.display = 'block';
    }});
}});

// Click on relationships to show tooltip
document.querySelectorAll('.relationship').forEach(rel => {{
    rel.addEventListener('click', (e) => {{
        e.stopPropagation();
        document.querySelectorAll('.highlighted').forEach(h => h.classList.remove('highlighted'));
        rel.classList.add('highlighted');

        setTooltipContent({{
            type: 'Relationship',
            name: rel.dataset.from + ' --> ' + rel.dataset.to,
            desc: rel.dataset.label || 'Connects to',
            tech: rel.dataset.label || '',
        }});
        document.getElementById('tt-meta').style.display = 'none';

        positionTooltipAbove(findTooltipAnchor(rel));
        tooltip.style.display = 'block';

        document.querySelectorAll('.element, .type-element').forEach(el => {{
            if (el.dataset.id === rel.dataset.from || el.dataset.id === rel.dataset.to) {{
                el.classList.add('highlighted');
            }}
        }});
    }});
}});

// Expandable relationship sections
document.querySelectorAll('.tt-rel-header').forEach(header => {{
    header.addEventListener('click', (e) => {{
        e.stopPropagation();
        const list = header.nextElementSibling;
        header.classList.toggle('open');
        list.classList.toggle('show');
    }});
}});

// Close tooltip via close button
document.getElementById('tt-close').addEventListener('click', (e) => {{
    e.stopPropagation();
    tooltip.style.display = 'none';
    clearAllHighlights();
}});

// Drag to reposition
(function() {{
    let dragging = false, ox = 0, oy = 0;
    tooltip.style.cursor = 'grab';
    tooltip.addEventListener('mousedown', e => {{
        if (e.button !== 0) return;
        dragging = true;
        ox = e.clientX - tooltip.getBoundingClientRect().left;
        oy = e.clientY - tooltip.getBoundingClientRect().top;
        tooltip.style.cursor = 'grabbing';
        e.stopPropagation();
        e.preventDefault();
    }});
    document.addEventListener('mousemove', e => {{
        if (!dragging) return;
        const x = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - tooltip.offsetWidth));
        const y = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - tooltip.offsetHeight));
        tooltip.style.left = x + 'px';
        tooltip.style.top  = y + 'px';
    }});
    document.addEventListener('mouseup', () => {{
        if (dragging) {{ dragging = false; tooltip.style.cursor = 'grab'; }}
    }});
}})();

// Click anywhere to clear all highlights
document.addEventListener('click', (e) => {{
    if (tooltip.contains(e.target)) return;
    clearAllHighlights();
    tooltip.style.display = 'none';
}});
</script>
</body>
</html>'''

    return html


def main():
    parser = argparse.ArgumentParser(description='Render C4 diagrams as interactive HTML')
    parser.add_argument('c4_data', help='Path to C4 JSON from c4-extract.py')
    parser.add_argument('--baseline', '-b', help='Baseline C4 JSON for delta highlighting')
    parser.add_argument('--output', '-o', default='c4.html', help='Output HTML file')
    args = parser.parse_args()

    with open(args.c4_data) as f:
        data = json.load(f)

    baseline = None
    if args.baseline:
        with open(args.baseline) as f:
            baseline = json.load(f)

    deltas = classify_deltas(data, baseline)
    system_name = data.get('c1_context', {}).get('system_name', 'Architecture')

    html = generate_html(data, deltas, system_name)

    os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"Rendered: {args.output}")


if __name__ == '__main__':
    main()
