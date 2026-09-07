#!/usr/bin/env python3
# luke-staleness-check.py — PreToolUse on Skill
# Checks overall survey age (3 signals) before any /luke invocation.
# Operates on the repo — never reads ~/.claude/.
import os
import re
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

repo_root = Path(os.environ.get("REPO_ROOT") or os.environ.get("CLAUDE_PROJECT_ROOT") or os.getcwd())
meta_path = repo_root / "aidlc-docs" / "inception" / "reverse-engineering" / ".survey-meta.md"

if not meta_path.exists():
    sys.stderr.write("Luke: No survey found for this repo. Run /luke to survey and initialise.\n")
    sys.exit(0)

content = meta_path.read_text(encoding="utf-8")
commit_m = re.search(r"\*\*Commit:\*\*\s+([a-f0-9]+)", content)
date_m = re.search(r"\*\*Date:\*\*\s+(.+)", content)
if not commit_m:
    sys.exit(0)

stored_commit = commit_m.group(1).strip()
survey_date_str = date_m.group(1).strip() if date_m else None

try:
    behind = int(subprocess.check_output(
        ["git", "-C", str(repo_root), "rev-list", "--count", f"{stored_commit}..HEAD"],
        stderr=subprocess.DEVNULL, text=True
    ).strip())
    days = None
    if survey_date_str:
        for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
            try:
                days = (date.today() - datetime.strptime(survey_date_str, fmt).date()).days
                break
            except ValueError:
                continue
    stale = behind > 50 or (days is not None and days > 90)
    warn  = behind > 10 or (days is not None and days > 30)
    days_str = str(days) if days is not None else "?"
    ctx_note = " If artifacts are indexed in context-mode (ctx_search), those results also reflect the old survey — re-survey first, then re-index."
    if stale:
        sys.stderr.write(f"Luke: Survey very stale — {behind} commits, {days_str} days old. Run /luke to refresh.{ctx_note}\n")
    elif warn:
        sys.stderr.write(f"Luke: Survey is {behind} commits behind ({days_str} days old). Consider refreshing with /luke.{ctx_note}\n")
except Exception:
    pass
