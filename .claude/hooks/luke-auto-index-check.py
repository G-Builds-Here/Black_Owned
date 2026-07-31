#!/usr/bin/env python3
# luke-auto-index-check.py — PreToolUse on ctx_search (runs in background)
# On the first ctx_search of the session, indexes all survey artifacts into FTS5
# so every subsequent ctx_search can find them without reading raw files.
import os
import subprocess
import sys
from pathlib import Path

repo_root = Path(os.environ.get("REPO_ROOT") or os.environ.get("CLAUDE_PROJECT_ROOT") or os.getcwd())
artifacts_dir = repo_root / "aidlc-docs" / "inception" / "reverse-engineering"
flag_file = repo_root / ".claude" / ".session-artifacts-indexed"

# Only index once per session
if flag_file.exists() or not artifacts_dir.exists():
    sys.exit(0)

md_files = [str(p) for p in sorted(artifacts_dir.glob("*.md")) if not p.name.startswith(".")]
if not md_files:
    sys.exit(0)

# Write flag before indexing so parallel triggers don't double-index
try:
    flag_file.write_text("indexed", encoding="utf-8")
except OSError:
    sys.exit(0)

# Emit a ctx_batch_execute command list to stdout for context-mode to pick up.
# Format: one JSON line per file, label = artifact filename.
import json
commands = [{"label": Path(f).name, "command": f"cat {f}"} for f in md_files]
sys.stdout.write(json.dumps({"ctx_batch_execute": commands}) + "\n")
