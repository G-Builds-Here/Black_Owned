"""
read-reference.py -- Read sections from a skill reference file.

Reference files use markdown headings (## Section Name) as section boundaries.
This script extracts sections by name, returning only the content between
that heading and the next heading of equal or higher level.

Usage:
    python read-reference.py <file_path> --section "Section Name"
    python read-reference.py <file_path> --section "Name1,Name2,Name3"
    python read-reference.py <file_path> --sections
    python read-reference.py <file_path> --toc

Output: JSON to stdout
  --section "Name"        → {"exists": true, "section": "Name", "content": "..."}
  --section "A,B,C"       → {"exists": true, "results": [{"section": "A", "content": "..."}, ...], "not_found": []}
                            (multi-section mode when comma-separated names are provided)
  --sections              → {"exists": true, "sections": ["Name1", "Name2", ...]}
  --toc                   → {"exists": true, "toc": [{"level": 2, "name": "...", "line": N}, ...]}

Section matching is case-insensitive and supports partial prefix match.
"Epic Creation" matches "## Epic Creation Flow".

Exit codes: 0 = success, 1 = error (file not found, bad args)
"""

import json
import os
import re
import sys


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


def main():
    if len(sys.argv) < 3:
        print("Usage: python read-reference.py <file_path> --section \"Name\" | --sections | --toc",
              file=sys.stderr)
        sys.exit(1)

    file_path = os.path.expanduser(sys.argv[1])

    if not os.path.isfile(file_path):
        print(json.dumps({"exists": False, "error": f"File not found: {file_path}"}))
        sys.exit(1)

    mode = sys.argv[2] if len(sys.argv) > 2 else None

    if mode == "--sections":
        headings = parse_headings(file_path)
        print(json.dumps({
            "exists": True,
            "sections": [h["name"] for h in headings],
        }))

    elif mode == "--toc":
        headings = parse_headings(file_path)
        print(json.dumps({
            "exists": True,
            "toc": headings,
        }))

    elif mode == "--section":
        if len(sys.argv) < 4:
            print("Usage: --section requires a section name", file=sys.stderr)
            sys.exit(1)
        raw = sys.argv[3]
        names = [n.strip() for n in raw.split(",") if n.strip()]

        if len(names) == 1:
            matched_name, content = extract_section(file_path, names[0])
            if matched_name:
                print(json.dumps({
                    "exists": True,
                    "section": matched_name,
                    "content": content,
                }))
            else:
                headings = parse_headings(file_path)
                print(json.dumps({
                    "exists": True,
                    "section": names[0],
                    "content": None,
                    "available": [h["name"] for h in headings],
                }))
        else:
            results = []
            not_found = []
            for name in names:
                matched_name, content = extract_section(file_path, name)
                if matched_name:
                    results.append({"section": matched_name, "content": content})
                else:
                    not_found.append(name)
            output = {"exists": True, "results": results, "not_found": not_found}
            if not_found:
                headings = parse_headings(file_path)
                output["available"] = [h["name"] for h in headings]
            print(json.dumps(output))
    else:
        print(f"Unknown mode: {mode}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
