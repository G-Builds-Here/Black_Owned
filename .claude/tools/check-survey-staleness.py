#!/usr/bin/env python3
"""Check survey artifact staleness against current HEAD.

Three signals combined into a single staleness verdict:
  1. Commit distance  — commits since survey commit
  2. Date age         — calendar days since survey date
  3. Lines changed    — lines added+deleted in relevant_paths since survey commit
                        (parsed from per-artifact metadata headers in each .md file)

Usage:
    python check-survey-staleness.py <repo_root>
    python check-survey-staleness.py <repo_root> --artifact <name>
        e.g. --artifact api-documentation.md

    Without --artifact: reports overall staleness from .survey-meta.md
    With --artifact:    reports per-artifact staleness using the file's
                        own metadata header (surveyed_at / commit / relevant_paths)

Output: JSON to stdout
    {
        "exists": true,
        "commit": "abc123...",
        "head": "def456...",
        "behind": 12,
        "days_old": 42,
        "lines_changed": 318,
        "date": "2026-04-04",
        "status": "fresh|stale|very_stale|absent",
        "message": "Survey is 12 commits behind, 42 days old, 318 lines changed in relevant paths"
        "artifacts": [...]   // present when --artifact not specified
    }

Status thresholds (worst of the three signals wins):
    fresh:      <10 commits AND <30 days AND <500 lines changed
    stale:      10-50 commits OR 30-90 days OR 500-2000 lines changed
    very_stale: >50 commits OR >90 days OR >2000 lines changed
    absent:     no meta found
"""

import json
import re
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

ARTIFACTS_DIR_PARTS = ("aidlc-docs", "inception", "reverse-engineering")


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


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Check survey artifact staleness")
    parser.add_argument("repo_root", nargs="?", default=".")
    parser.add_argument("--artifact", help="Check a specific artifact file (e.g. api-documentation.md)")
    args = parser.parse_args()

    repo_root = Path(args.repo_root)
    artifacts_dir = repo_root.joinpath(*ARTIFACTS_DIR_PARTS)
    meta_path = artifacts_dir / ".survey-meta.md"

    if args.artifact:
        result = check_artifact(artifacts_dir / args.artifact, repo_root)
        print(json.dumps(result, indent=2))
        return

    # Overall check from .survey-meta.md
    if not meta_path.exists():
        print(json.dumps({
            "exists": False, "commit": None, "head": None,
            "behind": None, "days_old": None, "lines_changed": None,
            "date": None, "status": "absent",
            "message": "No survey found at aidlc-docs/inception/reverse-engineering/.survey-meta.md"
        }))
        return

    content = meta_path.read_text(encoding="utf-8")
    commit_match = re.search(r"\*\*Commit:\*\*\s*([a-f0-9]+)", content)
    date_match = re.search(r"\*\*Date:\*\*\s*(.+)", content)

    if not commit_match:
        print(json.dumps({
            "exists": True, "commit": None, "head": None,
            "behind": None, "days_old": None, "lines_changed": None,
            "date": date_match.group(1).strip() if date_match else None,
            "status": "absent",
            "message": "Survey meta exists but has no commit hash"
        }))
        return

    survey_commit = commit_match.group(1).strip()
    survey_date = date_match.group(1).strip() if date_match else None
    head = run_git(["rev-parse", "HEAD"], repo_root)
    if not head:
        print(json.dumps({
            "exists": True, "commit": survey_commit, "head": None,
            "behind": None, "days_old": None, "lines_changed": None,
            "date": survey_date, "status": "absent",
            "message": "Not a git repository"
        }))
        return

    behind = commits_behind(survey_commit, repo_root)
    days = days_since(survey_date)
    lines = lines_changed_since(survey_commit, ["--"], repo_root)
    status = classify(behind, days, lines)
    artifacts = check_all_artifacts(artifacts_dir, repo_root)

    print(json.dumps({
        "exists": True,
        "commit": survey_commit,
        "head": head,
        "behind": behind,
        "days_old": days,
        "lines_changed": lines,
        "date": survey_date,
        "status": status,
        "message": build_message(behind, days, lines),
        "artifacts": artifacts,
    }, indent=2))


if __name__ == "__main__":
    main()
