"""
Read a handoff markdown file and return structured JSON of its fields (GPTS).

Usage (flags only; --help prints this contract as JSON):
  $UB read-handoff --path <file.md> [--fields F1,F2] [--section Name] [--sections] [--raw] [--exists]
  $UB read-handoff --type <type> --key <key> [--unit <AC>] [same modes]
  $UB read-handoff --key <key> --scan [--fields F1,F2]
  $UB read-handoff --key <key> --route [--repo-root <path>]

Positional shorthand still accepted through $UB:
  $UB read-handoff <type> <key> [flags]
  $UB read-handoff <file.md> [flags]

Output: one JSON document {ok, status, ...payload} to stdout.
  - read mode (default): status=read, payload = exists/complete/path/header/fields
  - --exists: status=exists, payload = exists/complete/path/handoff_age_minutes
  - --raw: status=raw, payload = exists/complete/path/raw
  - --sections: status=sections, payload = exists/sections (list of names)
  - --section <name>: status=section, payload = exists/section/content/available
  - --scan: status=scan, payload = newest non-complete handoff across all types
    (exists/type/all_complete/scanned/fields) or exists=false when none active.
  - --route: status=route, payload = ticket_key/active/handoffs/all_complete/survey.
    active is null when no non-complete handoff exists. handoff values:
    "active"|"complete"|"absent"|"incomplete". survey: "missing"|"pending-review"|"complete".

Exit codes: 0 = read/scan/route completed (exists=false is NOT an error) ·
1 = usage error (no --path and no --type/--key; unknown --type; --scan/--route without --key)
"""
import os
import sys
import json
import re
import time
from pathlib import Path
import importlib.util

# Import ALIASES from make-handoff.py for --fields normalization
_mh_path = Path(__file__).parent / "make-handoff.py"
_spec = importlib.util.spec_from_file_location("make_handoff_mod", _mh_path)
_mh_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mh_mod)
_FIELDS_ALIASES = _mh_mod.ALIASES

from dupin_shared import (
    HANDOFF_PATHS,
    _DUPIN_TYPES,
    _DUPIN_STAGES,
    _DUPIN_PREFIX,
    build_ac_handoff_path,
    build_story_handoff_path,
    is_handoff_complete,
)

from toolkit import Tool, UsageError

BASE_DIR = Path(__file__).resolve().parent.parent

FIELD_RE = re.compile(r"^\*\*([^*]+):\*\*\s*(.*)")

# Types to skip in --scan (Oracle manages its own handoff separately)
SCAN_SKIP = {"oracle"}


def _glob_ac_files(base: Path, folder: str, template: str, key: str) -> list[Path]:
    """Find the base handoff file and any per-AC variants (e.g. Damian-KEY-AC1.md)."""
    out_dir = base / folder
    if not out_dir.exists():
        return []
    base_file = out_dir / template.format(key=key)
    stem, ext = os.path.splitext(template.format(key=key))
    matches = list(out_dir.glob(f"{stem}-*{ext}"))
    if base_file.exists():
        matches.append(base_file)
    return matches


def _glob_dupin_files(base: Path, ticket: str) -> list[Path]:
    """Find dupin handoff files under handoffs/dupin/{ticket}/:
       {stage}-{ticket}-{ac}.md (legacy per-AC) or {stage}-{ticket}.md
       (story-level, dupin plan §3.3). Exact match only — no partials."""
    dupin_dir = base / "handoffs/dupin" / ticket
    if not dupin_dir.exists():
        return []
    # Exact match: {stage}-{ticket}-{unit}.md — no partial matches
    stages = "|".join(_DUPIN_STAGES.values())
    exact_re = re.compile(rf"^({stages})-{re.escape(ticket)}(-.+)?\.md$")
    return [f for f in dupin_dir.iterdir() if f.is_file() and exact_re.match(f.name)]



def scan_for_active(base: Path, key: str, only_fields: set | None = None) -> dict:
    """Check all handoff types for a key, return the newest non-complete non-Oracle file.
    Also finds per-AC handoff files (e.g. Damian-KEY-AC1.md)."""
    candidates = []
    
    # For dupin types, use deterministic path lookup (key is ticket)
    # For other types, use template-based lookup (key is the full identifier)
    dupin_files = _glob_dupin_files(base, key)
    for path in dupin_files:
        # Determine type from filename: {stage}-{ticket}-{ac}.md
        stage = path.stem.split("-")[0] if "-" in path.stem else ""
        _stage_to_type = {v: k for k, v in _DUPIN_STAGES.items()}
        htype = _stage_to_type.get(stage, "dupin")
        candidates.append((htype, path, path.stat().st_mtime))
    
    # For non-dupin types, use template-based lookup
    for htype, (folder, template) in HANDOFF_PATHS.items():
        if htype in SCAN_SKIP or htype in _DUPIN_TYPES:
            continue
        paths = _glob_ac_files(base, folder, template, key)
        for path in paths:
            candidates.append((htype, path, path.stat().st_mtime))

    # Sort newest first
    candidates.sort(key=lambda x: x[2], reverse=True)
    scanned = list(dict.fromkeys(c[0] for c in candidates))

    for htype, path, _ in candidates:
        result = parse_handoff(path, only_fields)
        if not result.get("complete", False) and not is_stub(result):
            result["type"] = htype
            result["all_complete"] = False
            result["scanned"] = scanned
            # Include all AC files for this type
            ac_files = [str(c[1]) for c in candidates if c[0] == htype]
            if len(ac_files) > 1:
                result["ac_files"] = ac_files
            return result

    # All found files are complete (or none found)
    return {
        "exists": False,
        "all_complete": len(candidates) > 0,
        "scanned": scanned,
    }


ROUTING_FIELDS = {"Status", "Route To", "Mode", "Complexity", "PR Comments"}


def is_stub(result: dict) -> bool:
    """A handoff file is a stub if it has no routing-relevant fields.
    Stubs are created as placeholders but contain no actionable state."""
    fields = result.get("fields", {})
    return not any(f in fields for f in ROUTING_FIELDS)


def route_scan(base: Path, key: str, repo_root: Path | None = None) -> dict:
    """Full routing scan: per-type state map, active handoff fields, survey status."""
    handoffs = {}
    active = None

    candidates = []
    seen_types = set()
    
    # For dupin types, use deterministic path lookup (key is ticket)
    dupin_files = _glob_dupin_files(base, key)
    if dupin_files:
        seen_types.update(_DUPIN_TYPES)
        _stage_to_type = {v: k for k, v in _DUPIN_STAGES.items()}
        for path in dupin_files:
            stage = path.stem.split("-")[0] if "-" in path.stem else ""
            htype = _stage_to_type.get(stage, "dupin")
            candidates.append((htype, path, path.stat().st_mtime))
    
    # For non-dupin types, use template-based lookup
    for htype, (folder, template) in HANDOFF_PATHS.items():
        if htype in SCAN_SKIP or htype in _DUPIN_TYPES:
            continue
        paths = _glob_ac_files(base, folder, template, key)
        if paths:
            seen_types.add(htype)
            for path in paths:
                candidates.append((htype, path, path.stat().st_mtime))
        else:
            handoffs[htype] = "absent"

    candidates.sort(key=lambda x: x[2], reverse=True)

    for htype, path, _ in candidates:
        result = parse_handoff(path, ROUTING_FIELDS)
        if result.get("complete", False):
            handoffs[htype] = "complete"
        elif is_stub(result):
            # Stub files (no routing fields) are placeholders, not real handoffs
            handoffs[htype] = "absent"
        elif active is None:
            handoffs[htype] = "active"
            fields = result.get("fields", {})
            active = {
                "type": htype,
                "status": fields.get("Status", ""),
                "route_to": fields.get("Route To", ""),
                "mode": fields.get("Mode", ""),
                "complexity": fields.get("Complexity", "") or None,
                "pr_comments": fields.get("PR Comments", "") or None,
            }
        else:
            handoffs[htype] = "incomplete"

    # Stale Alfred detection: if the only active handoff is alfred but
    # Harvey completed, the full cycle ran (alfred→damian→gordon→bruce→harvey).
    # Harvey always runs before a ticket is truly done, so its completion
    # is the definitive signal that Alfred's work was fully delivered.
    if (active and active["type"] == "alfred"
            and handoffs.get("harvey") == "complete"):
        handoffs["alfred"] = "stale"
        active = None

    # all_complete requires both Bruce (QA) and Harvey (PR) to be complete.
    # The full pipeline: Alfred → Damian → Gordon → Bruce → Harvey.
    # Gordon alone = committed, not done.
    all_complete = (active is None
                    and handoffs.get("bruce") == "complete"
                    and handoffs.get("harvey") == "complete")

    # Calculate days since newest complete file (for archive eligibility)
    days_complete = None
    if all_complete:
        import time
        newest_mtime = max(c[2] for c in candidates) if candidates else 0
        if newest_mtime:
            days_complete = round((time.time() - newest_mtime) / 86400, 1)

    survey = "missing"
    if repo_root:
        meta = repo_root / ".claude" / "codebase" / ".survey-meta.md"
        if meta.exists():
            try:
                content = meta.read_text(encoding="utf-8")
                survey = "pending-review" if "pending-review: true" in content else "complete"
            except Exception:
                pass

    result = {
        "ticket_key": key,
        "active": active,
        "handoffs": handoffs,
        "all_complete": all_complete,
        "survey": survey,
    }
    if days_complete is not None:
        result["days_complete"] = days_complete
    return result


def resolve_path(base: Path, htype: str, key: str, unit: str | None = None) -> Path | None:
    """Resolve handoff file path from base + type + key (+ optional AC unit)."""
    if htype not in HANDOFF_PATHS:
        return None
    # Deterministic path for dupin sub-types when unit provided
    if htype in _DUPIN_TYPES and unit:
        return build_ac_handoff_path(base, htype, key, unit)
    # Story-level fallback: dupin stage type without unit resolves to the
    # story handoff {stage}-{key}.md (dupin plan §3.3) when that file exists;
    # otherwise fall through to legacy resolution below.
    if htype in _DUPIN_TYPES:
        story_path = build_story_handoff_path(base, htype, key)
        if story_path.exists():
            return story_path
    folder, template = HANDOFF_PATHS[htype]
    # Backward compat: parse slash-separated key for dupin types
    if htype in _DUPIN_PREFIX and "/" in key:
        story, ac = key.rsplit("/", 1)
        key = f"{story}/{_DUPIN_PREFIX[htype]}-{ac}"
    return base / folder / template.format(key=key)


def _check_complete(content: str, lines: list[str]) -> bool:
    """Check if handoff is in a terminal state."""
    TERMINAL_STATUSES = {"Refined", "Implemented", "Inspected", "Tested", "Reviewed", "Committed"}
    if is_handoff_complete(content):
        return True
    for line in lines:
        if "**Ticket Status:**" in line:
            status_val = line.split("**Ticket Status:**")[-1].strip()
            return status_val in TERMINAL_STATUSES
    return False


def _extract_header(lines: list[str]) -> str:
    """Extract header (first # or ## line)."""
    for line in lines[:10]:
        if line.startswith("#"):
            return line.strip()
    return ""


def parse_handoff(path: Path, only_fields: set | None = None) -> dict:
    """Parse a handoff markdown file into structured data.
    Single-line field extraction only — fast path for routing and field queries."""
    try:
        content = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {"exists": False, "complete": False, "path": str(path)}

    lines = content.split("\n")

    fields = {}
    for line in lines:
        m = FIELD_RE.match(line)
        if m:
            name, value = m.group(1).strip(), m.group(2).strip()
            if only_fields is None or name in only_fields:
                fields[name] = value

    return {
        "exists": True,
        "complete": _check_complete(content, lines),
        "path": str(path),
        "header": _extract_header(lines),
        "fields": fields,
    }


def parse_sections(path: Path) -> dict:
    """Parse all sections from a handoff file including multi-line content.
    A section starts with **Name:** and includes all subsequent lines until
    the next **Name:** line, a markdown header (#), or end of file.
    Returns {section_name: content_string}."""
    try:
        content = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}

    sections = {}
    current_name = None
    current_lines = []

    for line in content.split("\n"):
        m = FIELD_RE.match(line)
        if m:
            if current_name is not None:
                sections[current_name] = "\n".join(current_lines).strip()
            current_name = m.group(1).strip()
            first_line = m.group(2).strip()
            current_lines = [first_line] if first_line else []
        elif line.startswith("#"):
            if current_name is not None:
                sections[current_name] = "\n".join(current_lines).strip()
                current_name = None
                current_lines = []
        elif current_name is not None:
            current_lines.append(line)

    if current_name is not None:
        sections[current_name] = "\n".join(current_lines).strip()

    return sections


def handle(v):
    base = Path(v["--base"])
    htype = v.get("--type")
    key = v.get("--key")
    unit = v.get("--unit")

    only_fields = None
    if v.get("--fields"):
        normalized = set()
        for f in v["--fields"]:
            f_stripped = f.strip()
            canonical = _FIELDS_ALIASES.get(f_stripped.lower(), f_stripped)
            normalized.add(canonical)
        only_fields = normalized

    section_name = v.get("--section")
    repo_root = Path(v["--repo-root"]) if v.get("--repo-root") else None

    if v.get("--route"):
        if not key:
            raise UsageError("--route requires --key <key>", "pass --key <ticket>")
        result = route_scan(base, key, repo_root)
        return {"status": "route", **result}

    if v.get("--scan"):
        if not key:
            raise UsageError("--scan requires --key <key>", "pass --key <ticket>")
        result = scan_for_active(base, key, only_fields)
        return {"status": "scan", **result}

    if v.get("--path"):
        path = Path(v["--path"])
    elif htype and key:
        path = resolve_path(base, htype, key, unit)
        if path is None:
            raise UsageError(f"unknown handoff type: {htype}", "pass a valid --type, or use --path")
    else:
        raise UsageError(
            "no target: pass --path <file> or --type <type> --key <key>",
            "example: $UB read-handoff --type bruce --key LOC-0076",
        )

    if v.get("--exists"):
        exists = path.exists()
        complete = False
        handoff_age_minutes = 9999
        if exists:
            try:
                mtime = path.stat().st_mtime
                handoff_age_minutes = round((time.time() - mtime) / 60, 1)
                text = path.read_text(encoding="utf-8")
                complete = "status: complete" in text
            except Exception:
                pass
        return {"status": "exists", "exists": exists, "complete": complete,
                "path": str(path), "handoff_age_minutes": handoff_age_minutes}

    if v.get("--raw"):
        try:
            content = path.read_text(encoding="utf-8")
            lines = content.split("\n")
            return {"status": "raw", "exists": True, "complete": _check_complete(content, lines),
                    "path": str(path), "raw": content}
        except FileNotFoundError:
            return {"status": "raw", "exists": False, "path": str(path)}

    if v.get("--sections"):
        sections = parse_sections(path)
        return {"status": "sections", "exists": bool(sections) or path.exists(),
                "sections": list(sections.keys())}

    if section_name:
        sections = parse_sections(path)
        if not path.exists():
            return {"status": "section", "exists": False, "path": str(path)}
        elif section_name in sections:
            return {"status": "section", "exists": True, "section": section_name,
                    "content": sections[section_name]}
        else:
            return {"status": "section", "exists": True, "section": section_name,
                    "content": None, "available": list(sections.keys())}

    result = parse_handoff(path, only_fields)
    return {"status": "read", **result}


TOOL = Tool(
    name="read-handoff",
    version="1.0",
    summary="Read a pipeline handoff markdown file as structured JSON (GPTS).",
    flags={
        "--path": {"required": False, "type": "path",
                   "description": "Direct path to a handoff file."},
        "--type": {"required": False, "type": "str",
                   "description": "Handoff type (bruce, damian, gordon, dup-impl, ...) — with --key."},
        "--key": {"required": False, "type": "str",
                  "description": "Ticket key; STORY/AC2 form or --unit for per-AC handoffs."},
        "--unit": {"required": False, "type": "str",
                   "description": "AC unit for deterministic dupin sub-type paths."},
        "--scan": {"required": False, "type": "bool",
                   "description": "All non-Oracle types for a key; return the newest non-complete handoff."},
        "--route": {"required": False, "type": "bool",
                    "description": "Deterministic routing scan: per-type state, active routing fields, survey."},
        "--exists": {"required": False, "type": "bool",
                     "description": "Existence + complete status only (no field parsing)."},
        "--raw": {"required": False, "type": "bool",
                   "description": "Return the entire file content as a string."},
        "--sections": {"required": False, "type": "bool",
                       "description": "List all section names found in the file."},
        "--section": {"required": False, "type": "str",
                      "description": "Return the full multi-line content of a named section."},
        "--fields": {"required": False, "type": "list",
                     "description": "Only return named fields (alias-normalized)."},
        "--repo-root": {"required": False, "type": "path",
                        "description": "Repo root (used by --route for the survey check)."},
    },
    exit_codes={
        "0": "read/scan/route complete — exists=false is a valid result, not an error",
        "1": "usage error — missing target, unknown --type, or --scan/--route without --key",
    },
    examples=[
        "$UB read-handoff --type bruce --key LOC-0076 --fields Status,Route To",
        "$UB read-handoff --key LOC-0076 --route --repo-root /path/to/repo",
        "$UB read-handoff --path /path/to/Damian-LOC-0076.md --raw",
    ],
    idempotent="Pure read. No side effects.",
    base_default=BASE_DIR,
)


if __name__ == "__main__":
    TOOL.run(handle)
