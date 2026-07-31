#!/usr/bin/env python3
# luke-edit-staleness-check.py — PostToolUse on Edit|Write (runs in background)
# Checks if the edited file falls under any artifact's relevant_paths.
# Surfaces a note if that area has changed significantly since last survey.
import fnmatch
import os
import re
import subprocess
import sys
from pathlib import Path

repo_root = Path(os.environ.get("REPO_ROOT") or os.environ.get("CLAUDE_PROJECT_ROOT") or os.getcwd())
artifacts_dir = repo_root / "aidlc-docs" / "inception" / "reverse-engineering"
edited_file = os.environ.get("TOOL_INPUT_FILE_PATH") or os.environ.get("TOOL_INPUT_PATH") or ""

if not edited_file or not artifacts_dir.exists():
    sys.exit(0)

try:
    rel_edited = Path(edited_file).relative_to(repo_root).as_posix()
except ValueError:
    sys.exit(0)

try:
    for md in sorted(artifacts_dir.glob("*.md")):
        if md.name.startswith("."):
            continue
        text = md.read_text(encoding="utf-8")
        header_m = re.search(r"<!--(.*?)-->", text, re.DOTALL)
        if not header_m:
            continue
        block = header_m.group(1)
        commit_m = re.search(r"commit:\s*([a-f0-9]+)", block)
        paths = [m.group(1).strip().strip('\"').strip("'") for m in re.finditer(r"-\s+[\"']?([^\"'\n]+)[\"']?", block)]
        if not commit_m or not paths:
            continue
        if not any(fnmatch.fnmatch(rel_edited, p) for p in paths):
            continue
        path_args = paths
        behind = int(subprocess.check_output(
            ["git", "-C", str(repo_root), "rev-list", "--count",
             f"{commit_m.group(1).strip()}..HEAD", "--"] + path_args,
            stderr=subprocess.DEVNULL, text=True
        ).strip())
        if behind >= 5:
            sys.stderr.write(
                f"Luke: {md.name} may be stale — {behind} commits have touched this area "
                f"since the last survey. Run /luke to refresh. "
                f"If artifacts are indexed in context-mode, those results are also stale — "
                f"re-run /luke then re-index with ctx_batch_execute.\n"
            )
        break
except Exception:
    pass
