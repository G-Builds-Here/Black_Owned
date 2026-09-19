#!/usr/bin/env python3
"""Check survey artifact staleness against current HEAD.

Three signals combined into a single staleness verdict:
  1. Commit distance  — commits since survey commit
  2. Date age         — calendar days since survey date
  3. Lines changed    — lines added+deleted in relevant_paths since survey commit
                        (parsed from per-artifact metadata headers in each .md file)

Contract:  python check-survey-staleness.py --help   (JSON)
Standard:  references/tooling-standards.md

Usage (flags only):
    $UB check-survey-staleness --repo-root <repo_root>
    $UB check-survey-staleness --repo-root <repo_root> --artifact <name>
        e.g. --artifact api-documentation.md

    Without --artifact: reports overall staleness from .survey-meta.md
    With --artifact:    reports per-artifact staleness using the file's
                        own metadata header (surveyed_at / commit / relevant_paths)

Output: JSON envelope on stdout
    {"ok": true, "status": "fresh|stale|very_stale|absent",
     "exists", "commit", "head", "behind", "days_old", "lines_changed",
     "date", "message", "artifacts" (when --artifact not specified)}

Exit codes: 0 inspected (state reported in payload) · 1 usage or validation error

Status thresholds (worst of the three signals wins):
    fresh:      <10 commits AND <30 days AND <500 lines changed
    stale:      10-50 commits OR 30-90 days OR 500-2000 lines changed
    very_stale: >50 commits OR >90 days OR >2000 lines changed
    absent:     no meta found
"""

import json
import re
import subprocess
from datetime import date, datetime
from pathlib import Path

from toolkit import Tool
ARTIFACTS_DIR_PARTS = (".claude", "codebase")


def run_git(args, cwd):
    try:
        return subprocess.check_output(["git"] + args, cwd=str(cwd), text=True).strip()
    except subprocess.CalledProcessError:
        return None


def commits_behind(survey_commit, repo_root):
    out = run_git(["rev-list", "--count", f"{survey_commit}..HEAD"], repo_root)
    try:
        return int(out)
    except (TypeError, ValueError):
        return -1


def lines_changed_since(commit, paths, repo_root):
    """Total lines added + deleted in `paths` since `commit`."""
    if not paths:
        return 0
    args = ["diff", "--stat", f"{commit}..HEAD", "--"] + list(paths)
    out = run_git(args, repo_root)
    if not out:
        return 0
    total = 0
    for line in out.splitlines():
        m = re.search(r"(\d+) insertion", line)
        if m:
            total += int(m.group(1))
        m = re.search(r"(\d+) deletion", line)
        if m:
            total += int(m.group(1))
    return total


def days_since(date_str):
    """Parse ISO date or ISO datetime; return days since then."""
    if not date_str:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            then = datetime.strptime(date_str.strip(), fmt).date()
            return (date.today() - then).days
        except ValueError:
            continue
    return None


def classify(behind, days, lines):
    """Return status string from worst of three signals."""
    if behind < 0:
        return "very_stale"
    if behind > 50 or (days is not None and days > 90) or lines > 2000:
        return "very_stale"
    if behind >= 10 or (days is not None and days >= 30) or lines >= 500:
        return "stale"
    return "fresh"


def build_message(behind, days, lines):
    parts = []
    if behind < 0:
        parts.append("survey commit not in current history (rebased?)")
    else:
        parts.append(f"{behind} commit{'s' if behind != 1 else ''} behind")
    if days is not None:
        parts.append(f"{days} day{'s' if days != 1 else ''} old")
    parts.append(f"{lines} lines changed in relevant paths")
    return ", ".join(parts)


def parse_artifact_header(content):
    """Extract surveyed_at, commit, relevant_paths from HTML comment header."""
    m = re.search(r"<!--(.*?)-->", content, re.DOTALL)
    if not m:
        return None, None, []
    block = m.group(1)
    commit = None
    surveyed_at = None
    paths = []
    for line in block.splitlines():
        line = line.strip()
        if line.startswith("commit:"):
            commit = line.split(":", 1)[1].strip()
        elif line.startswith("surveyed_at:"):
            surveyed_at = line.split(":", 1)[1].strip()
        elif line.startswith("- "):
            paths.append(line[2:].strip().strip('"'))
    return surveyed_at, commit, paths


def check_artifact(artifact_path, repo_root):
    """Check staleness of a single artifact using its embedded header."""
    if not artifact_path.exists():
        return {"exists": False, "status": "absent",
                "message": f"{artifact_path.name} not found"}
    content = artifact_path.read_text(encoding="utf-8")
    surveyed_at, commit, paths = parse_artifact_header(content)
    if not commit:
        return {"exists": True, "status": "absent",
                "message": f"{artifact_path.name} has no commit header — add metadata header"}
    head = run_git(["rev-parse", "HEAD"], repo_root)
    behind = commits_behind(commit, repo_root)
    days = days_since(surveyed_at)
    lines = lines_changed_since(commit, paths, repo_root) if paths else 0
    status = classify(behind, days, lines)
    return {
        "artifact": artifact_path.name,
        "exists": True,
        "commit": commit,
        "head": head,
        "behind": behind,
        "days_old": days,
        "lines_changed": lines,
        "relevant_paths": paths,
        "status": status,
        "message": build_message(behind, days, lines),
    }


def check_all_artifacts(artifacts_dir, repo_root):
    results = []
    for md in sorted(artifacts_dir.glob("*.md")):
        if md.name.startswith("."):
            continue
        results.append(check_artifact(md, repo_root))
    return results


def handle(v):
    repo_root = Path(v["--repo-root"])
    artifacts_dir = repo_root.joinpath(*ARTIFACTS_DIR_PARTS)
    meta_path = artifacts_dir / ".survey-meta.md"

    if v.get("--artifact"):
        return check_artifact(artifacts_dir / v["--artifact"], repo_root)

    # Overall check from .survey-meta.md
    if not meta_path.exists():
        return {
            "status": "absent",
            "exists": False, "commit": None, "head": None,
            "behind": None, "days_old": None, "lines_changed": None,
            "date": None,
            "message": "No survey found at .claude/codebase/.survey-meta.md"
        }

    content = meta_path.read_text(encoding="utf-8")
    commit_match = re.search(r"\*\*Commit:\*\*\s*([a-f0-9]+)", content)
    date_match = re.search(r"\*\*Date:\*\*\s*(.+)", content)

    if not commit_match:
        return {
            "status": "absent",
            "exists": True, "commit": None, "head": None,
            "behind": None, "days_old": None, "lines_changed": None,
            "date": date_match.group(1).strip() if date_match else None,
            "message": "Survey meta exists but has no commit hash"
        }

    survey_commit = commit_match.group(1).strip()
    survey_date = date_match.group(1).strip() if date_match else None
    head = run_git(["rev-parse", "HEAD"], repo_root)
    if not head:
        return {
            "status": "absent",
            "exists": True, "commit": survey_commit, "head": None,
            "behind": None, "days_old": None, "lines_changed": None,
            "date": survey_date,
            "message": "Not a git repository"
        }

    behind = commits_behind(survey_commit, repo_root)
    days = days_since(survey_date)
    lines = lines_changed_since(survey_commit, ["--"], repo_root)
    status = classify(behind, days, lines)
    artifacts = check_all_artifacts(artifacts_dir, repo_root)

    return {
        "status": status,
        "exists": True,
        "commit": survey_commit,
        "head": head,
        "behind": behind,
        "days_old": days,
        "lines_changed": lines,
        "date": survey_date,
        "message": build_message(behind, days, lines),
        "artifacts": artifacts,
    }


TOOL = Tool(
    name="check-survey-staleness",
    version="1.0",
    summary="Check survey artifact staleness against current HEAD — commit distance, date age, and lines changed in relevant paths.",
    flags={
        "--repo-root": {"required": False, "type": "path", "default": ".",
                        "description": "Path to the repository root (default: current directory)."},
        "--artifact": {"required": False, "type": "str",
                       "description": "Check a specific artifact file (e.g. api-documentation.md) using its own metadata header instead of .survey-meta.md."},
    },
    exit_codes={
        "0": "inspected — status is fresh, stale, very_stale, or absent (state reported in payload)",
        "1": "usage or validation error",
    },
    examples=[
        "$UB check-survey-staleness --repo-root /path/to/myrepo",
        "$UB check-survey-staleness --repo-root /path/to/myrepo --artifact api-documentation.md",
    ],
    idempotent="Read-only: re-running gives the same result for the same repo state.",
)


if __name__ == "__main__":
    TOOL.run(handle)
