"""
Read a handoff markdown file and return structured JSON of its fields.

Usage:
  python read-handoff.py <file_path>
  python read-handoff.py <file_path> --fields Status,Branch,Mode
  python read-handoff.py <base_dir> --type bruce --key PAY-6670
  python read-handoff.py <base_dir> --type bruce --key PAY-6670 --exists
  python read-handoff.py <base_dir> --key PAY-6670 --scan
  python read-handoff.py <base_dir> --key PAY-6670 --scan --fields Status,Branch,Route To,Mode
  python read-handoff.py <base_dir> --type damian --key PAY-6670 --section "Conversation Context"
  python read-handoff.py <base_dir> --type damian --key PAY-6670 --sections
  python read-handoff.py <base_dir> --type damian --key PAY-6670 --raw

Output: JSON to stdout
  {
    "exists": true,
    "complete": false,
    "path": "/path/to/Damian-PAY-6670.md",
    "fields": {"Status": "ready", "Branch": "quality/PAY-6670_foo", "Mode": "standard"},
    "header": "## Damian Handoff"
  }

--exists mode: just check existence + complete status (no field parsing)
  {"exists": true, "complete": false, "path": "..."}

--fields: only return named fields (comma-separated), skip full parse

--section <name>: return the full multi-line content of a named section.
  Sections start with **Name:** and include all lines until the next **Key:**
  or end of file. Returns {"exists": true, "section": "Name", "content": "..."}.

--sections: list all section names found in the file.
  Returns {"exists": true, "sections": ["Status", "Branch", "Conversation Context", ...]}.

--raw: return the entire file content as a string.
  Returns {"exists": true, "complete": <bool>, "path": "...", "raw": "..."}.

--scan mode: check ALL non-Oracle handoff types for a key, return the newest
  non-complete file (by mtime). Returns type + scanned list.
  {"exists": true, "complete": false, "type": "lucius", "all_complete": false,
   "scanned": ["lucius", "damian", "alfred"], "path": "...", "fields": {...}}
  If all complete: {"exists": false, "all_complete": true, "scanned": [...]}

--route mode: deterministic routing scan. Returns per-type state map, active
  handoff routing fields, and survey status. One call, no follow-up reads needed.
  python read-handoff.py <base_dir> --key PAY-6611 --route --repo-root /path/to/repo
  {
    "ticket_key": "PAY-6611",
    "active": {"type": "alfred", "status": "in-progress", "route_to": "Damian",
               "mode": "standard", "complexity": null, "pr_comments": null},
    "handoffs": {"alfred": "active", "damian": "complete", "gordon": "absent", ...},
    "all_complete": false,
    "survey": "complete"
  }
  active is null when no non-complete handoff exists.
  handoff values: "active", "complete", "absent", "incomplete" (older non-complete).
  survey values: "missing", "pending-review", "complete".

Exits 0 always. exists=false if file not found.
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
    is_handoff_complete,
)

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
    """Find dupin handoff files using deterministic path: handoffs/dupin/{ticket}/{stage}-{ticket}-{ac}.md"""
    dupin_dir = base / "handoffs/dupin" / ticket
    if not dupin_dir.exists():
        return []
    # Exact match: {stage}-{ticket}-{ac_id}.md — no partial matches
    stages = "|".join(_DUPIN_STAGES.values())
    exact_re = re.compile(rf"^({stages})-{re.escape(ticket)}-.+\.md$")
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


def resolve_path(args) -> Path:
    """Resolve file path from args — either direct path or base_dir + type + key."""
    if "--type" in args:
        # Check if --key is present
        try:
            key_idx = args.index("--key")
        except ValueError:
            # --type provided but no --key: treat first arg as direct path
            return Path(args[0])
        htype = args[args.index("--type") + 1]
        key = args[key_idx + 1]
        base = Path(args[0])
        if htype not in HANDOFF_PATHS:
            return None
        
        # Check for --ac_id option
        ac_id = None
        if "--ac_id" in args:
            ac_id_idx = args.index("--ac_id")
            ac_id = args[ac_id_idx + 1]
        
        # Deterministic path for dupin sub-types when ac_id provided
        if htype in _DUPIN_TYPES and ac_id:
            return build_ac_handoff_path(base, htype, key, ac_id)

        folder, template = HANDOFF_PATHS[htype]
        # Backward compat: parse slash-separated key for dupin types
        if htype in _DUPIN_PREFIX and "/" in key:
            story, ac = key.rsplit("/", 1)
            key = f"{story}/{_DUPIN_PREFIX[htype]}-{ac}"
        return base / folder / template.format(key=key)
    return Path(args[0])


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


def main():
    raw_args = sys.argv[1:]
    if not raw_args:
        print("Usage: python read-handoff.py <path> | <base_dir> --type <type> --key <key> "
              "[--exists] [--fields F1,F2] [--section Name] [--sections] [--raw]",
              file=sys.stderr)
        sys.exit(1)

    route_mode = "--route" in raw_args
    scan_mode = "--scan" in raw_args
    exists_only = "--exists" in raw_args
    raw_mode = "--raw" in raw_args
    sections_list = "--sections" in raw_args
    section_name = None
    if "--section" in raw_args:
        sec_idx = raw_args.index("--section")
        section_name = raw_args[sec_idx + 1]

    clean_args = [a for a in raw_args
                  if a not in ("--exists", "--scan", "--route", "--raw", "--sections")]
    # Remove --section and its value from clean_args
    if "--section" in clean_args:
        sec_idx = clean_args.index("--section")
        clean_args = clean_args[:sec_idx] + clean_args[sec_idx + 2:]

    only_fields = None
    if "--fields" in clean_args:
        idx = clean_args.index("--fields")
        raw_fields = clean_args[idx + 1].split(",")
        # Normalize each field name through ALIASES so snake_case keys
        # (e.g. "commit_hash", "acs_done") resolve to canonical names
        normalized = set()
        for f in raw_fields:
            f_stripped = f.strip()
            canonical = _FIELDS_ALIASES.get(f_stripped.lower(), f_stripped)
            normalized.add(canonical)
        only_fields = normalized
        clean_args = clean_args[:idx] + clean_args[idx + 2:]

    # Handle --repo-root (used by --route for survey check)
    repo_root = None
    if "--repo-root" in clean_args:
        rr_idx = clean_args.index("--repo-root")
        repo_root = Path(clean_args[rr_idx + 1])
        clean_args = clean_args[:rr_idx] + clean_args[rr_idx + 2:]

    path = resolve_path(clean_args)
    if path is None:
        print(json.dumps({"exists": False, "error": "unknown handoff type"}))
        return

    if route_mode:
        if "--key" not in clean_args:
            print(json.dumps({"error": "--route requires --key <key>"}))
            return
        key_idx = clean_args.index("--key")
        key = clean_args[key_idx + 1]
        base = Path(clean_args[0])
        result = route_scan(base, key, repo_root)
        print(json.dumps(result))
        return

    if scan_mode:
        if "--key" not in clean_args:
            print(json.dumps({"error": "--scan requires --key <key>"}))
            return
        key_idx = clean_args.index("--key")
        key = clean_args[key_idx + 1]
        base = Path(clean_args[0])
        result = scan_for_active(base, key, only_fields)
        print(json.dumps(result))
        return

    if exists_only:
        exists = path.exists()
        complete = False
        handoff_age_minutes = 9999  # sentinel: unknown age treated as old (safe for < comparisons)
        if exists:
            try:
                mtime = path.stat().st_mtime
                handoff_age_minutes = round((time.time() - mtime) / 60, 1)
                text = path.read_text(encoding="utf-8")
                complete = "status: complete" in text
            except Exception:
                pass
        print(json.dumps({"exists": exists, "complete": complete, "path": str(path), "handoff_age_minutes": handoff_age_minutes}))
        return

    if raw_mode:
        try:
            content = path.read_text(encoding="utf-8")
            lines = content.split("\n")
            print(json.dumps({
                "exists": True,
                "complete": _check_complete(content, lines),
                "path": str(path),
                "raw": content,
            }))
        except FileNotFoundError:
            print(json.dumps({"exists": False, "path": str(path)}))
        return

    if sections_list:
        sections = parse_sections(path)
        print(json.dumps({
            "exists": bool(sections) or path.exists(),
            "sections": list(sections.keys()),
        }))
        return

    if section_name:
        sections = parse_sections(path)
        if not path.exists():
            print(json.dumps({"exists": False, "path": str(path)}))
        elif section_name in sections:
            print(json.dumps({
                "exists": True,
                "section": section_name,
                "content": sections[section_name],
            }))
        else:
            print(json.dumps({
                "exists": True,
                "section": section_name,
                "content": None,
                "available": list(sections.keys()),
            }))
        return

    result = parse_handoff(path, only_fields)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
