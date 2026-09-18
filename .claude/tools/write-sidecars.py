"""write-sidecars.py -- Auto-generate JSON sidecars for .md survey artifacts.

Reads each .md file in the given directory, parses its frontmatter comment header
and section structure, then writes a companion .json sidecar. Replaces ~12 manual
Write tool calls in Luke S4.

GPTS flag-only CLI. --help / -h / no-args prints this JSON contract and exits 0.

Flags:
  --dir <path>    Directory containing .md artifact files (required).
  --force         Overwrite existing .json files even when fresh.

Fresh sidecars are skipped; a sidecar older than its source .md is refreshed
automatically and reported under "refreshed".

Repo name is derived as <dir>/../.. (i.e. <repo> for
<repo>/.claude/codebase/).

Exit codes:
  0 = done (written / no_change / no_files)
  1 = usage or validation error
  4 = not found (--dir missing or not a directory)
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from toolkit import Tool, NotFound, audit_append

BASE_DIR = Path(__file__).resolve().parent.parent

SKIP_FILES = {"index.md", ".survey-meta.md"}

CONSUMER_MAP = {
    "api-documentation": ["luke", "damian", "alfred", "lucius"],
    "test-infrastructure": ["luke", "bruce", "damian"],
    "findings": ["luke", "damian", "alfred"],
    "anti-patterns": ["luke", "damian", "alfred"],
    "architecture": ["luke", "lucius", "damian", "alfred"],
    "component-inventory": ["luke", "lucius", "damian", "alfred"],
}


def has_survey_header(md_path):
    """True if the file opens with a metadata comment carrying commit:.

    Guards against mechanically sidecaring non-survey documents that happen
    to live in the artifacts directory (event logs, imported notes)."""
    try:
        content = md_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False
    match = re.match(r"<!--\s*(.*?)\s*-->", content, re.DOTALL)
    return bool(match and re.search(r"commit:", match.group(1)))


def detect_consumers(filename_stem):
    """Detect primary consumers based on filename stem."""
    stem = filename_stem.lower()
    for key, consumers in CONSUMER_MAP.items():
        if key in stem:
            return consumers
    return ["luke", "damian"]


def parse_frontmatter(content):
    """Parse the HTML comment header at the top of the file."""
    meta = {
        "surveyed_at": None,
        "commit": None,
        "relevant_paths": [],
        "summary": None,
    }

    match = re.match(r"<!--\s*(.*?)\s*-->", content, re.DOTALL)
    if not match:
        return meta

    header = match.group(1)

    # surveyed_at
    m = re.search(r"surveyed_at:\s*(.+)", header)
    if m:
        meta["surveyed_at"] = m.group(1).strip()

    # commit
    m = re.search(r"commit:\s*(.+)", header)
    if m:
        meta["commit"] = m.group(1).strip()

    # summary
    m = re.search(r"summary:\s*(.+)", header)
    if m:
        meta["summary"] = m.group(1).strip()

    # relevant_paths (list under the key, indented with "- ")
    paths_match = re.search(r"relevant_paths:\s*\n((?:[ \t]*-[ \t]*.+\n?)*)", header)
    if paths_match:
        block = paths_match.group(1)
        meta["relevant_paths"] = [
            re.sub(r"^[ \t]*-[ \t]*", "", line).strip()
            for line in block.splitlines()
            if line.strip().startswith("-")
        ]

    return meta


def strip_html_comments(text):
    """Remove HTML comment blocks from text."""
    return re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL).strip()


def detect_section_type(content):
    """Detect section content type."""
    if "|---|" in content or re.search(r"\|.*\|.*\|", content):
        return "table"
    stripped = content.strip()
    if stripped.startswith("- ") or re.match(r"^\d+\.", stripped):
        return "list"
    if "```" in content:
        return "code"
    return "prose"


def parse_sections(content):
    """Split content by ## headings into section dicts."""
    # Strip the frontmatter comment first
    body = re.sub(r"^<!--.*?-->\s*", "", content, flags=re.DOTALL)
    # Also strip the SKELETON_MARKER comment if present
    body = re.sub(r"<!--.*?-->\s*", "", body, flags=re.DOTALL)

    sections = []
    # Split on ## headings (level 2 and below)
    parts = re.split(r"(^#{2,}\s+.+$)", body, flags=re.MULTILINE)

    i = 0
    while i < len(parts):
        part = parts[i]
        heading_match = re.match(r"^(#{2,})\s+(.+)$", part.strip())
        if heading_match:
            heading_text = heading_match.group(2).strip()
            section_content = parts[i + 1].strip() if i + 1 < len(parts) else ""
            clean_content = strip_html_comments(section_content)
            sections.append({
                "heading": heading_text,
                "content": clean_content,
                "type": detect_section_type(clean_content),
            })
            i += 2
        else:
            i += 1

    return sections


def first_sentence(text):
    """Extract the first sentence from plain text."""
    clean = re.sub(r"\s+", " ", text.strip())
    m = re.search(r"[^.!?]+[.!?]", clean)
    if m:
        return m.group(0).strip()
    return clean[:120] if clean else ""


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def process_file(md_path, force, repo_name):
    """Process a single .md file. Returns ("write"|"refresh"|"skip", filename)."""
    json_path = md_path.with_suffix(".json")

    existing = json_path.exists()
    if existing and not force:
        # Freshness: an .md newer than its sidecar means the sidecar is stale —
        # refresh it. Plain skip-if-exists let hand-edited artifacts ship with a
        # sidecar describing the old content.
        if md_path.stat().st_mtime <= json_path.stat().st_mtime:
            return "skip", json_path.name

    content = md_path.read_text(encoding="utf-8")
    meta = parse_frontmatter(content)
    sections = parse_sections(content)

    # Determine summary: from header or first sentence of body text
    summary = meta.get("summary")
    if not summary:
        body_text = re.sub(r"<!--.*?-->", "", content, flags=re.DOTALL)
        body_text = re.sub(r"^#{1,}\s+.+$", "", body_text, flags=re.MULTILINE)
        summary = first_sentence(body_text)

    consumers = detect_consumers(md_path.stem)

    sidecar = {
        "artifact": md_path.name,
        "generated_at": now_iso(),
        "commit": meta.get("commit") or "unknown",
        "repo": repo_name,
        "sections": sections,
        "summary": summary or "",
        "primary_consumers": consumers,
    }

    json_path.write_text(json.dumps(sidecar, indent=2) + "\n", encoding="utf-8")
    return ("refresh" if existing else "write"), json_path.name


def handle(v):
    artifacts_dir = Path(v["--dir"]).resolve()
    if not artifacts_dir.is_dir():
        raise NotFound(
            f"--dir does not exist or is not a directory: {artifacts_dir}",
            "pass --dir <existing artifacts directory>",
        )

    # Repo name: parent.parent of artifacts dir
    # (artifacts_dir = <repo>/.claude/codebase/)
    try:
        repo_name = artifacts_dir.parent.parent.name
    except Exception:
        repo_name = "unknown"

    candidates = sorted(
        p for p in artifacts_dir.glob("*.md")
        if p.name not in SKIP_FILES
    )
    md_files = [p for p in candidates if has_survey_header(p)]
    no_header = [p.name for p in candidates if not has_survey_header(p)]

    if not md_files:
        return {"status": "no_files", "dir": artifacts_dir.as_posix(),
                "written": [], "skipped": [], "skipped_no_header": no_header}

    written = []
    refreshed = []
    skipped = []
    for md_path in md_files:
        action, name = process_file(md_path, v.get("--force"), repo_name)
        if action == "write":
            written.append(name)
        elif action == "refresh":
            written.append(name)
            refreshed.append(name)
        else:
            skipped.append(name)

    status = "written" if written else "no_change"
    if written:
        audit_append(BASE_DIR, "write-sidecars", "write", key=repo_name,
                     result=f"{len(written)} written ({len(refreshed)} refreshed), "
                            f"{len(skipped)} skipped")
    return {"status": status, "dir": artifacts_dir.as_posix(),
            "written": written, "refreshed": refreshed, "skipped": skipped,
            "skipped_no_header": no_header}


TOOL = Tool(
    name="write-sidecars",
    version="2.2",
    summary="Generate JSON sidecars for .md survey artifacts; skips fresh sidecars and auto-refreshes ones older than their source .md (skips index.md / .survey-meta.md and any .md lacking a commit: metadata header).",
    flags={
        "--dir": {"required": True, "type": "path",
                  "description": "Directory containing .md artifact files."},
        "--force": {"type": "bool",
                    "description": "Overwrite existing .json files even when fresh (default: fresh ones skip, stale ones refresh)."},
    },
    exit_codes={
        "0": "written · no_change (all skipped) · no_files (no .md to process)",
        "1": "usage or validation error",
        "4": "not found (--dir missing or not a directory)",
    },
    examples=[
        "$UB write-sidecars --dir <repo-root>/.claude/codebase",
        "$UB write-sidecars --dir <repo-root>/.claude/codebase --force",
    ],
    idempotent="Yes — fresh sidecars skip (no_change); a sidecar older than its source .md refreshes automatically (reported under refreshed[]); --force refreshes all.",
)


def main():
    TOOL.run(handle)


if __name__ == "__main__":
    main()
