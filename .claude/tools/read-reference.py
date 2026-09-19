"""
read-reference.py -- Read sections from a skill reference file (GPTS).

Reference files use markdown headings (## Section Name) as section boundaries.
This tool extracts sections by name, returning only the content between
that heading and the next heading of equal or higher level.

Usage:
    python read-reference.py --path <file_path> --section "Section Name"
    python read-reference.py --path <file_path> --section "Name1,Name2,Name3"
    python read-reference.py --path <file_path> --sections
    python read-reference.py --path <file_path> --toc

Contract:  python read-reference.py --help   (JSON)
Standard:  references/tooling-standards.md

Output: JSON envelope to stdout
  --section "Name"        → {"ok": true, "exists": true, "section": "Name", "content": "..."}
  --section "A,B,C"       → {"ok": true, "exists": true, "results": [{"section": "A", "content": "..."}, ...], "not_found": []}
                            (multi-section mode when comma-separated names are provided)
  --sections              → {"ok": true, "exists": true, "sections": ["Name1", "Name2", ...]}
  --toc                   → {"ok": true, "exists": true, "toc": [{"level": 2, "name": "...", "line": N}, ...]}

Section matching is case-insensitive and supports partial prefix match.
"Epic Creation" matches "## Epic Creation Flow".

Exit codes: 0 = success (including exists:false for a missing file) ·
            1 = usage or validation error
"""

import re
from pathlib import Path

from toolkit import Tool, UsageError


def parse_headings(path):
    """Parse all markdown headings with their level, name, and line number.

    Skips headings inside fenced code blocks (``` or ~~~).
    """
    headings = []
    in_fence = False
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        for i, line in enumerate(f, 1):
            stripped = line.strip()
            if stripped.startswith('```') or stripped.startswith('~~~'):
                in_fence = not in_fence
                continue
            if in_fence:
                continue
            m = re.match(r'^(#{1,6})\s+(.+)', line)
            if m:
                headings.append({
                    "level": len(m.group(1)),
                    "name": m.group(2).strip(),
                    "line": i,
                })
    return headings


def extract_section(path, section_name):
    """Extract content for a section by heading name.

    Returns (matched_name, content) or (None, None) if not found.
    Case-insensitive prefix match.
    """
    headings = parse_headings(path)
    target = section_name.lower()

    match_idx = None
    for i, h in enumerate(headings):
        if h["name"].lower() == target or h["name"].lower().startswith(target):
            match_idx = i
            break

    if match_idx is None:
        return None, None

    matched = headings[match_idx]
    start_line = matched["line"]
    match_level = matched["level"]

    end_line = None
    for h in headings[match_idx + 1:]:
        if h["level"] <= match_level:
            end_line = h["line"]
            break

    lines = []
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        for i, line in enumerate(f, 1):
            if i < start_line:
                continue
            if end_line and i >= end_line:
                break
            lines.append(line.rstrip())

    content = '\n'.join(lines).strip()
    return matched["name"], content


def handle(v):
    file_path = Path(v["--path"]).expanduser()

    requested = [flag for flag in ("--section", "--sections", "--toc")
                 if v.get(flag) not in (None, False)]
    if len(requested) != 1:
        raise UsageError(
            "exactly one mode flag is required: --section, --sections, or --toc",
            "e.g. --path <file> --section \"Section Name\"",
        )

    if not file_path.is_file():
        return {
            "status": "not_found",
            "exists": False,
            "path": str(file_path),
            "reason": "file not found",
        }

    if requested[0] == "--sections":
        headings = parse_headings(str(file_path))
        return {
            "status": "ok",
            "exists": True,
            "sections": [h["name"] for h in headings],
        }

    if requested[0] == "--toc":
        headings = parse_headings(str(file_path))
        return {
            "status": "ok",
            "exists": True,
            "toc": headings,
        }

    raw = v["--section"]
    names = [n.strip() for n in raw.split(",") if n.strip()]
    if not names:
        raise UsageError(
            "--section value is empty",
            'pass --section "Section Name" (comma-separated names for multi-section)',
        )

    if len(names) == 1:
        matched_name, content = extract_section(str(file_path), names[0])
        if matched_name:
            return {
                "status": "ok",
                "exists": True,
                "section": matched_name,
                "content": content,
            }
        headings = parse_headings(str(file_path))
        return {
            "status": "ok",
            "exists": True,
            "section": names[0],
            "content": None,
            "available": [h["name"] for h in headings],
        }

    results = []
    not_found = []
    for name in names:
        matched_name, content = extract_section(str(file_path), name)
        if matched_name:
            results.append({"section": matched_name, "content": content})
        else:
            not_found.append(name)
    payload = {"status": "ok", "exists": True, "results": results, "not_found": not_found}
    if not_found:
        headings = parse_headings(str(file_path))
        payload["available"] = [h["name"] for h in headings]
    return payload


TOOL = Tool(
    name="read-reference",
    version="1.0",
    summary="Read a section (or list of sections / TOC) from a markdown reference file.",
    flags={
        "--path": {"required": True, "type": "path",
                   "description": "Resolved path of the reference file (utility-belt resolves bare filenames before exec)."},
        "--section": {"required": False, "type": "str",
                      "description": "Section name, or comma-separated names for multi-section mode (case-insensitive prefix match)."},
        "--sections": {"required": False, "type": "bool",
                       "description": "List all section names in the file."},
        "--toc": {"required": False, "type": "bool",
                  "description": "List the full table of contents with levels and line numbers."},
    },
    exit_codes={"0": "success — including exists:false for a missing file",
                "1": "usage or validation error"},
    examples=["$UB read-reference gotham-reference.md --section \"Subagent delegation\"",
              "python read-reference.py --path ~/.claude/references/gotham-reference.md --section \"Gates\"",
              "python read-reference.py --path ~/.claude/references/gotham-reference.md --toc"],
    idempotent="Read-only; repeated calls return identical output.",
)


if __name__ == "__main__":
    TOOL.run(handle)
