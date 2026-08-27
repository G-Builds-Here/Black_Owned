#!/usr/bin/env python3
# luke-session-start.py — SessionStart hook (runs in background)
# Indexes all Luke survey artifacts into context-mode's FTS5 knowledge base
# at session start so ctx_search can find them immediately, without waiting
# for the first ctx_search call to trigger the lazy auto-index hook.
import os
import subprocess
import sys
from pathlib import Path

repo_root = Path(os.environ.get("REPO_ROOT") or os.environ.get("CLAUDE_PROJECT_ROOT") or os.getcwd())
artifacts_dir = repo_root / "aidlc-docs" / "inception" / "reverse-engineering"
flag_file = repo_root / ".claude" / ".session-artifacts-indexed"

# Skip if already indexed this session or no artifacts exist yet
if flag_file.exists() or not artifacts_dir.exists():
    sys.exit(0)

md_files = [p for p in sorted(artifacts_dir.glob("*.md")) if not p.name.startswith(".")]
if not md_files:
    sys.exit(0)

# Find context-mode CLI — pick most recently installed version from plugin cache
home = Path(os.environ.get("USERPROFILE") or os.environ.get("HOME") or "~").expanduser()
cache_dir = home / ".claude" / "plugins" / "cache" / "context-mode" / "context-mode"
cli_candidates = sorted(cache_dir.glob("*/cli.bundle.mjs"), key=lambda p: p.stat().st_mtime, reverse=True)
if not cli_candidates:
    sys.exit(0)
cli_path = cli_candidates[0]

# Write flag before indexing so the PreToolUse ctx_search hook skips double-indexing
try:
    flag_file.write_text("indexed", encoding="utf-8")
except OSError:
    sys.exit(0)

try:
    subprocess.run(
        [
            "node", str(cli_path), "index", str(artifacts_dir),
            "--ext", ".md",
            "--project", str(repo_root),
            "--source", "luke-artifacts",
        ],
        capture_output=True,
        timeout=30,
    )
except Exception:
    pass
