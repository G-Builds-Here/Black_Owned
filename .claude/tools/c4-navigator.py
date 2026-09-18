#!/usr/bin/env python3
"""
c4-navigator.py — Generate index.md navigation hub (GPTS).

Scans the directory for generated artifacts and creates a structured
index.md with links to all documents, organized by C4 level. In a survey
directory (<repo>/.claude/codebase/) the hub gets the repo name as title,
a commit/surveyed_at metadata header parsed from .survey-meta.md, and
links into ticket subdirectory families (planning/, construction/, ...).

Contract:  python c4-navigator.py --help   (JSON)
Standard:  references/tooling-standards.md

Exit codes: 0 generated · 2 conflict (index.md exists, no --force) ·
            4 not_found (target directory missing) · 1 usage error
"""
import re
from pathlib import Path

from toolkit import Tool, Conflict, NotFound, audit_append

SURVEY_INTERNAL_DIRS = {"survey_tmp"}

BASE_DIR = Path(__file__).resolve().parent.parent


def find_artifacts(directory: Path) -> dict:
    """Find all artifacts in the scanned directory, incl. ticket subdirs."""
    artifacts = {
        'c4_html': False,
        'c4_json': False,
        'decisions': [],
        'adrs': [],
        'risks': False,
        'nfr': False,
        'other': [],
        'subdirs': {},
    }

    for item in directory.iterdir():
        if item.name == 'index.md':
            continue

        if item.is_dir():
            if item.name in SURVEY_INTERNAL_DIRS or item.name.startswith('.'):
                continue
            mds = sorted(p.relative_to(item).as_posix() for p in item.rglob('*.md'))
            if mds:
                artifacts['subdirs'][item.name] = mds
            continue

        if item.name == 'c4.html' and item.is_file():
            artifacts['c4_html'] = True
        elif item.name == 'c4-skeleton.json' and item.is_file():
            artifacts['c4_json'] = True
        elif item.name == 'Design-Decisions.md':
            artifacts['decisions'].append(item.name)
        elif item.name.startswith('ADR-'):
            artifacts['adrs'].append(item.name)
        elif item.name == 'Risk-Register.md':
            artifacts['risks'] = True
        elif item.name == 'NFR-Analysis.md':
            artifacts['nfr'] = True
        elif item.name.endswith('.md'):
            artifacts['other'].append(item.name)

    return artifacts


def load_survey_meta(directory: Path) -> tuple:
    """Parse (commit, date) from .survey-meta.md if present."""
    meta = directory / ".survey-meta.md"
    if not meta.is_file():
        return None, None
    try:
        text = meta.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None, None
    cm = re.search(r"\*\*Commit:\*\*\s*([a-f0-9]+)", text)
    dm = re.search(r"\*\*Date:\*\*\s*(.+)", text)
    return (cm.group(1) if cm else None,
            dm.group(1).strip() if dm else None)


def generate_index_content(slug: str, artifacts: dict, commit: str = None,
                           surveyed_at: str = None, repo_name: str = None) -> str:
    """Generate the index.md content."""
    lines = []
    if repo_name:
        # Survey hub: carry the same metadata header the artifacts use, so
        # check-survey-staleness can version the hub too.
        hdr = ["<!--"]
        if surveyed_at:
            hdr.append(f"surveyed_at: {surveyed_at}")
        if commit:
            hdr.append(f"commit: {commit}")
        hdr.append("summary: Navigation hub for the codebase survey and ticket artifacts.")
        hdr.append("-->")
        lines += hdr + ["", f"# Codebase Survey: {repo_name}", ""]
    else:
        lines.append(f"# Architecture Documentation: {slug}")
        lines.append("")
    lines += [
        "Navigation hub for all design artifacts.",
        "",
    ]

    # C4 diagrams
    if artifacts['c4_html'] or artifacts['c4_json']:
        lines.append("## C4 Diagrams")
        lines.append("")
        if artifacts['c4_html']:
            lines.append("- [Interactive C4 Diagram (C1/C2/C3)](c4.html)")
        if artifacts['c4_json']:
            lines.append("- [C4 Model Data (JSON)](c4-skeleton.json)")
        lines.append("")
    
    # Design decisions
    if artifacts['decisions']:
        lines.append("## Design Decisions")
        lines.append("")
        for name in artifacts['decisions']:
            lines.append(f"- [{name}]({name})")
        lines.append("")
    
    # ADRs
    if artifacts['adrs']:
        lines.append("## Architecture Decision Records")
        lines.append("")
        for name in artifacts['adrs']:
            lines.append(f"- [{name}]({name})")
        lines.append("")
    
    # Risk and NFR
    if artifacts['risks'] or artifacts['nfr']:
        lines.append("## Analysis")
        lines.append("")
        if artifacts['risks']:
            lines.append("- [Risk Register](Risk-Register.md)")
        if artifacts['nfr']:
            lines.append("- [NFR Analysis](NFR-Analysis.md)")
        lines.append("")
    
    # Other
    if artifacts['other']:
        lines.append("## Other")
        lines.append("")
        for name in artifacts['other']:
            lines.append(f"- [{name}]({name})")
        lines.append("")

    # Ticket subdirectory families (planning/, requirements/, construction/, ...)
    if artifacts['subdirs']:
        lines.append("## Planning & ticket artifacts")
        lines.append("")
        for name in sorted(artifacts['subdirs']):
            lines.append(f"### {name}/")
            lines.append("")
            for rel in artifacts['subdirs'][name]:
                lines.append(f"- [{rel}]({name}/{rel})")
            lines.append("")

    return "\n".join(lines)


def handle(v):
    base = Path(v.get("--base") or BASE_DIR)
    dir_path = Path(v["--directory"]).expanduser()
    if not dir_path.is_dir():
        raise NotFound(
            f"{dir_path} is not a directory",
            "pass an existing planning/<slug>/ or reverse-engineering/ directory: $UB c4-navigator --directory <dir>",
        )

    index_path = dir_path / "index.md"
    if index_path.exists() and not v.get("--force"):
        raise Conflict(
            f"{index_path} already exists",
            f"re-run with --force to overwrite: $UB c4-navigator --directory {dir_path.as_posix()} --force",
        )

    artifacts = find_artifacts(dir_path)
    slug = dir_path.name
    commit, surveyed_at = load_survey_meta(dir_path)
    # Survey hub: <repo>/.claude/codebase/ titled by repo, with metadata header.
    repo_name = dir_path.parent.parent.name if (slug == "codebase" and commit) else None
    content = generate_index_content(slug, artifacts, commit=commit,
                                     surveyed_at=surveyed_at, repo_name=repo_name)

    index_path.write_text(content, encoding="utf-8")
    audit_append(base, "c4-navigator", "generate", key=slug, result="generated")
    return {
        "status": "generated",
        "path": index_path.as_posix(),
        "slug": slug,
        "survey_hub": bool(repo_name),
        "artifacts": {
            "c4_html": artifacts["c4_html"],
            "c4_json": artifacts["c4_json"],
            "decisions": sorted(artifacts["decisions"]),
            "adrs": sorted(artifacts["adrs"]),
            "risks": artifacts["risks"],
            "nfr": artifacts["nfr"],
            "other": sorted(artifacts["other"]),
            "subdirs": sorted(artifacts["subdirs"]),
        },
    }


TOOL = Tool(
    name="c4-navigator",
    version="2.0",
    summary="Generate index.md navigation hub in a .claude/codebase/ survey directory (repo-named title, metadata header, planning/ + ticket artifacts) or a planning/{slug}/ directory.",
    flags={
        "--directory": {"required": True, "type": "path",
                        "description": "Path to the .claude/codebase/ survey directory or planning/{slug}/ directory to index."},
        "--force": {"required": False, "type": "bool",
                    "description": "Overwrite an existing index.md."},
    },
    exit_codes={"0": "generated — index.md written; payload: path, slug, artifacts",
                "2": "conflict (index.md already exists, no --force)",
                "4": "not found (target directory missing)",
                "1": "usage or validation error"},
    examples=[
        "$UB c4-navigator --directory C:/repos/bw-api/.claude/codebase",
        "$UB c4-navigator --directory ./planning/LOC-0076 --force",
    ],
    idempotent="Re-run without --force conflicts (exit 2); with --force the index is regenerated from current directory contents.",
    base_default=BASE_DIR,
)


if __name__ == "__main__":
    TOOL.run(handle)
