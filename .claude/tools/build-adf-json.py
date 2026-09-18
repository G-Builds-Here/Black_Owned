#!/usr/bin/env python3
"""
build-adf-json.py — Convert structured JSON input to Atlassian Document Format (ADF) (GPTS).

Used by skills that fall back to Jira REST API (v3) when MCP is unavailable.
The Jira v3 REST API requires ADF for description and comment fields.

Usage:
    python build-adf-json.py --input <input_json_file|-> [--output <output_json_file>]
    --input - reads from stdin.

The --output file is the raw ADF document, consumed directly by jira-write.
Do NOT pass a pre-converted ADF file back through jira-write's sections path —
raw ADF cannot be re-wrapped and will 400.

Input format (JSON):
{
    "sections": [
        {"type": "heading", "level": 2, "text": "Acceptance Criteria"},
        {"type": "paragraph", "text": "Plain text paragraph"},
        {"type": "bullet_list", "items": ["Item 1", "Item 2"]},
        {"type": "ordered_list", "items": ["Step 1", "Step 2"]},
        {"type": "code_block", "language": "gherkin", "text": "Given ..."},
        {"type": "blockquote", "text": "Quoted text"},
        {"type": "rule"},
        {"type": "expand", "title": "Original A/C (preserved)", "content": [
            {"type": "paragraph", "text": "Original criteria here..."}
        ]},
        {"type": "panel", "panel_type": "info", "content": [
            {"type": "paragraph", "text": "Alfred refined these criteria."}
        ]},
        {"type": "table", "headers": ["AC", "Status"], "rows": [["AC1", "Done"], ["AC2", "In Progress"]]},
        {"type": "paragraph", "text": "Text with **bold** and *italic* markup"},
        {"type": "raw", "nodes": [{"type": "paragraph", "content": [{"type": "text", "text": "Pre-existing ADF node passed through unchanged"}]}]}
    ]
}

A bare array of sections (no "sections" wrapper) is also accepted.
Output: ADF JSON to the --output file, or in the envelope ("result") when omitted.

Contract:  python build-adf-json.py --help   (JSON)
Standard:  references/tooling-standards.md

Exit codes: 0 converted · 1 usage/validation · 4 input file not found
"""

import json
import re
import sys
from pathlib import Path

from toolkit import Tool, UsageError, NotFound, audit_append, safe_subpath

BASE_DIR = Path(__file__).resolve().parent.parent

_GHERKIN_RE = re.compile(r'^\s*(Scenario:|Given |When |Then |And |But |Feature:)', re.MULTILINE)


def parse_inline_marks(text):
    """Parse **bold**, *italic*, and `code` markup into ADF text nodes with marks."""
    nodes = []
    # Pattern: **bold**, *italic*, `code`, or plain text
    pattern = re.compile(r'(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)')
    last_end = 0

    for match in pattern.finditer(text):
        # Add plain text before this match
        if match.start() > last_end:
            plain = text[last_end:match.start()]
            if plain:
                nodes.append({"type": "text", "text": plain})

        if match.group(2):  # **bold**
            nodes.append({
                "type": "text",
                "text": match.group(2),
                "marks": [{"type": "strong"}]
            })
        elif match.group(3):  # *italic*
            nodes.append({
                "type": "text",
                "text": match.group(3),
                "marks": [{"type": "em"}]
            })
        elif match.group(4):  # `code`
            nodes.append({
                "type": "text",
                "text": match.group(4),
                "marks": [{"type": "code"}]
            })

        last_end = match.end()

    # Add remaining plain text
    if last_end < len(text):
        remaining = text[last_end:]
        if remaining:
            nodes.append({"type": "text", "text": remaining})

    # If no markup found, return single text node
    if not nodes:
        nodes.append({"type": "text", "text": text})

    return nodes


def build_paragraph(text):
    """Build an ADF paragraph node."""
    return {
        "type": "paragraph",
        "content": parse_inline_marks(text)
    }


def build_heading(text, level=2):
    """Build an ADF heading node."""
    return {
        "type": "heading",
        "attrs": {"level": min(max(level, 1), 6)},
        "content": parse_inline_marks(text)
    }


def build_bullet_list(items):
    """Build an ADF bulletList node."""
    return {
        "type": "bulletList",
        "content": [
            {
                "type": "listItem",
                "content": [build_paragraph(item)]
            }
            for item in items
        ]
    }


def build_ordered_list(items):
    """Build an ADF orderedList node."""
    return {
        "type": "orderedList",
        "content": [
            {
                "type": "listItem",
                "content": [build_paragraph(item)]
            }
            for item in items
        ]
    }


def build_code_block(text, language=None):
    """Build an ADF codeBlock node."""
    node = {
        "type": "codeBlock",
        "content": [{"type": "text", "text": text}]
    }
    if language:
        node["attrs"] = {"language": language}
    return node


def build_blockquote(text):
    """Build an ADF blockquote node."""
    return {
        "type": "blockquote",
        "content": [build_paragraph(text)]
    }


def build_rule():
    """Build an ADF horizontal rule node."""
    return {"type": "rule"}


def build_expand(title, content_sections, nested=False):
    """Build an ADF expand or nestedExpand (collapsible) node.

    Use {"type": "expand", ...} for top-level expands.
    Use {"type": "nestedExpand", ...} for expands inside an expand's content.
    Jira ADF does not allow expand inside expand — nestedExpand is the correct type.
    """
    return {
        "type": "nestedExpand" if nested else "expand",
        "attrs": {"title": title},
        "content": _flatten_sections(content_sections, nested=True),
    }


def _flatten_sections(sections, nested=False):
    """Convert a list of section dicts, flattening any that return multiple nodes."""
    result = []
    for s in sections:
        r = convert_section(s, nested=nested)
        if isinstance(r, list):
            result.extend(r)
        else:
            result.append(r)
    return result


def build_panel(panel_type, content_sections):
    """Build an ADF panel node (info, note, warning, error, success).

    Input:
        {"type": "panel", "panel_type": "info", "content": [<sections>]}
    """
    valid_types = {"info", "note", "warning", "error", "success"}
    if panel_type not in valid_types:
        print(f"Warning: unknown panel type '{panel_type}', using 'info'", file=sys.stderr)
        panel_type = "info"
    return {
        "type": "panel",
        "attrs": {"panelType": panel_type},
        "content": _flatten_sections(content_sections),
    }


def build_table(headers, rows):
    """Build an ADF table node.

    Input:
        {"type": "table", "headers": ["Col1", "Col2"], "rows": [["val1", "val2"]]}

    If "headers" is omitted or empty and "rows" is non-empty, the first row is
    promoted to the header row. This prevents an empty tableRow which Jira rejects.
    """
    if not headers and rows:
        headers = rows[0]
        rows = rows[1:]

    all_rows = []
    if headers:
        all_rows.append({
            "type": "tableRow",
            "content": [
                {
                    "type": "tableHeader",
                    "content": [build_paragraph(h)]
                }
                for h in headers
            ]
        })
    all_rows += [
        {
            "type": "tableRow",
            "content": [
                {
                    "type": "tableCell",
                    "content": [build_paragraph(cell)]
                }
                for cell in row
            ]
        }
        for row in rows
    ]
    return {
        "type": "table",
        "attrs": {"isNumberColumnEnabled": False, "layout": "default"},
        "content": all_rows
    }


def _normalise_inline_nodes(nodes):
    """Convert shorthand inline nodes to valid ADF text nodes.

    Accepts {"type": "strong"/"em"/"code", "text": "..."} shorthand and
    converts to {"type": "text", "text": "...", "marks": [{"type": "strong"}]}.
    Passes through already-valid {"type": "text", ...} nodes unchanged.
    """
    result = []
    mark_map = {"strong": "strong", "em": "em", "code": "code"}
    for node in nodes:
        t = node.get("type")
        if t == "text":
            result.append(node)
        elif t in mark_map and "text" in node:
            result.append({
                "type": "text",
                "text": node["text"],
                "marks": [{"type": mark_map[t]}]
            })
        else:
            result.append(node)
    return result


def convert_section(section, nested=False):
    """Convert a single input section to an ADF node.

    nested=True means this section is inside an expand's content block.
    In that context, any "expand" type is promoted to "nestedExpand" because
    Jira ADF does not allow expand-inside-expand.

    Supports "raw" type for passing through pre-existing ADF nodes unchanged.
    Use {"type": "raw", "nodes": [<ADF node>, ...]} to embed existing ADF content
    (e.g. an original Jira description's content array) without re-encoding it.
    A single raw section can expand to multiple top-level content nodes.

    Natural shorthand keys (no "type" required):
      {"heading": "text"}            → heading level 2
      {"heading": "text", "level": N} → heading level N
      {"heading2": "text"}           → heading level 2
      {"heading3": "text"}           → heading level 3
      {"heading4": "text"}           → heading level 4
      {"heading": "Title", "body": "..."} → heading + paragraph pair (list)
      {"paragraph": "text"}          → paragraph
      {"bullets": ["a", "b"]}        → bulletList
      {"ordered": ["a", "b"]}        → orderedList
      {"rule": true}                 → horizontal rule
      {"blockquote": "text"}         → blockquote
    """
    # Natural shorthand: {"heading2": "text"} / {"heading3": "text"} etc.
    for lvl in (2, 3, 4, 5, 6):
        key = f"heading{lvl}"
        if key in section and "type" not in section:
            return build_heading(section[key], lvl)

    # Natural shorthand: {"bullets": [...]}
    if "bullets" in section and "type" not in section:
        return build_bullet_list(section["bullets"])

    # Natural shorthand: {"ordered": [...]}
    if "ordered" in section and "type" not in section:
        return build_ordered_list(section["ordered"])

    # Natural shorthand: {"paragraph": "text"}
    if "paragraph" in section and "type" not in section:
        return build_paragraph(section["paragraph"])

    # Natural shorthand: {"blockquote": "text"}
    if "blockquote" in section and "type" not in section:
        return build_blockquote(section["blockquote"])

    # Natural shorthand: {"rule": true}
    if "rule" in section and "type" not in section:
        return build_rule()

    # Natural shorthand: {"expand": "title", "content": [...]}
    if "expand" in section and "type" not in section:
        return build_expand(section["expand"], section.get("content", []), nested=nested)

    # Normalize shorthand: {"heading": "Title", "body": "..."} → heading + paragraph
    if "heading" in section and "type" not in section:
        nodes = [{"type": "heading", "text": section["heading"], "level": section.get("level", 2)}]
        if section.get("body"):
            nodes.append({"type": "paragraph", "text": section["body"]})
        return nodes  # list — caller must flatten

    section_type = section.get("type", "paragraph")

    # Type aliases for heading2/heading3/etc. used with explicit "type" key
    for lvl in (2, 3, 4, 5, 6):
        if section_type == f"heading{lvl}":
            return build_heading(section.get("text", ""), lvl)

    if section_type == "heading":
        return build_heading(section["text"], section.get("level", 2))
    elif section_type == "paragraph":
        # Accept both flat {"text": "..."} and inline ADF {"content": [...]}
        if "text" not in section and "content" in section:
            return {"type": "paragraph", "content": _normalise_inline_nodes(section["content"])}
        text = section.get("text", "")
        if _GHERKIN_RE.search(text):
            print("Warning: Gherkin content in paragraph node -- promoting to code_block", file=sys.stderr)
            return build_code_block(text, "gherkin")
        return build_paragraph(text)
    elif section_type in ("bullet_list", "bullets", "bulletList", "bulletlist"):
        return build_bullet_list(section.get("items", section.get("bullets", [])))
    elif section_type in ("ordered_list", "ordered", "orderedList", "orderedlist"):
        return build_ordered_list(section.get("items", section.get("ordered", [])))
    elif section_type == "code_block":
        return build_code_block(section["text"], section.get("language"))
    elif section_type == "blockquote":
        return build_blockquote(section["text"])
    elif section_type == "rule":
        return build_rule()
    elif section_type in ("expand", "nestedExpand"):
        return build_expand(section.get("title", ""), section.get("content", []), nested=nested)
    elif section_type == "panel":
        return build_panel(section.get("panel_type", "info"), section.get("content", []))
    elif section_type == "table":
        return build_table(section.get("headers", []), section.get("rows", []))
    elif section_type == "raw":
        # Sentinel: returns list of nodes, caller must flatten
        return section.get("nodes", [])
    else:
        print(f"Warning: unknown section type '{section_type}', treating as paragraph", file=sys.stderr)
        return build_paragraph(section.get("text", ""))


def build_adf(input_data):
    """Convert structured input to a full ADF document.

    Handles "raw" sections which expand to multiple nodes (flatten them).
    Also accepts a bare array of sections instead of {"sections": [...]}.
    """
    if isinstance(input_data, list):
        sections = input_data
    else:
        sections = input_data.get("sections", [])
    content = _flatten_sections(sections)
    return {
        "version": 1,
        "type": "doc",
        "content": content
    }


def resolve_path(raw, base, flag):
    """Base-relative or absolute path; rejects '..' and empty values."""
    raw = str(raw)
    if not raw or "\0" in raw:
        raise UsageError(f"{flag} value is empty or invalid", f"pass {flag} <path>")
    p = Path(raw)
    if p.is_absolute():
        if ".." in p.parts:
            raise UsageError(
                f"{flag}: '..' is not allowed in {raw!r}",
                f"pass {flag} <path> without '..' components",
            )
        return p
    return safe_subpath(base, raw)


def handle(v):
    base = Path(v["--base"])
    raw_input = v["--input"]
    if raw_input == "-":
        try:
            input_data = json.load(sys.stdin)
        except json.JSONDecodeError as e:
            raise UsageError(f"stdin is not valid JSON: {e}", "pipe a valid sections JSON document on stdin")
    else:
        p = resolve_path(raw_input, base, "--input")
        if not p.is_file():
            raise NotFound(
                f"input file not found: {p}",
                f"create the sections JSON file first, then re-run with --input {raw_input}",
            )
        try:
            with open(p, "r", encoding="utf-8") as f:
                input_data = json.load(f)
        except json.JSONDecodeError as e:
            raise UsageError(f"input file is not valid JSON: {e}", "the input must be a sections document (see --help)")

    adf = build_adf(input_data)
    result = json.dumps(adf, indent=2, ensure_ascii=False)

    payload = {"status": "converted", "content_nodes": len(adf["content"])}
    out = v.get("--output")
    if out:
        op = resolve_path(out, base, "--output")
        op.parent.mkdir(parents=True, exist_ok=True)
        with open(op, "w", encoding="utf-8") as f:
            f.write(result)
        audit_append(base, "build-adf-json", "convert", key=op.name, result="ok")
        payload["output"] = str(op).replace("\\", "/")
        payload["bytes"] = len(result)
    else:
        payload["result"] = adf
    return payload


TOOL = Tool(
    name="build-adf-json",
    version="1.0",
    summary="Convert structured sections JSON to a Jira ADF document (expand→nestedExpand promotion, snake_case types, inline marks).",
    flags={
        "--input": {"required": True, "type": "path",
                    "description": "Sections JSON file, or '-' to read from stdin (heredoc). Relative paths resolve under --base; absolute paths are used as-is."},
        "--output": {"required": False, "type": "path",
                     "description": "Write the raw ADF document to this file (parent dirs auto-created; consumed by jira-write). Omit to return it in the envelope."},
    },
    exit_codes={"0": "converted", "1": "usage/validation error", "4": "input file not found"},
    examples=[
        "python build-adf-json.py --input handoffs/alfred/temp/full-description.json --output handoffs/alfred/temp/adf.json",
    ],
    idempotent="Pure transform; with --output the target file is overwritten on each run.",
    base_default=BASE_DIR,
)


if __name__ == "__main__":
    TOOL.run(handle)
