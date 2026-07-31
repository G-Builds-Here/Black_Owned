#!/usr/bin/env python3
"""
luke-repo-init.py — scaffold and sync Luke's Claude Code configuration.

Supports three flows via --target:

  repo      (default)  Scaffold <repo-root>/.claude/ — creates .gitignore,
                       settings.json, hooks/, skills/, memory/.
                       Use when initialising a repo for the first time,
                       or refreshing after a Luke re-survey.

  local                Sync <repo-root>/.claude/ → user's ~/.claude/settings.json.
                       Use when a new developer clones the repo and wants their
                       local Claude setup to recognise this project correctly:
                       adds repo to additionalDirectories, merges permissions,
                       installs the staleness hook globally.

  repo-from <src>      Copy Luke scaffold from <src>/.claude/ into <repo-root>/.claude/.
                       Use when propagating Luke setup from one repo to another
                       (monorepo siblings, related projects). Copies .gitignore,
                       settings.json structure, and hook scripts. Does NOT copy
                       skills/luke/SKILL.md or memory/ — those are repo-specific.

Usage:
  $UB luke-repo-init <repo-root> [--target repo|local|repo-from] [--src <src-repo>]
                     [--stack dotnet|node|python|unknown] [--dry-run]

Examples:
  # Initialise a repo (global → repo):
  $UB luke-repo-init /path/to/myrepo --stack dotnet

  # New dev syncs their local after cloning (repo → local):
  $UB luke-repo-init /path/to/myrepo --target local

  # Propagate setup from one repo to another (repo → repo):
  $UB luke-repo-init /path/to/new-repo --target repo-from --src /path/to/existing-repo
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

HOME = Path.home()

# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------

BASE_PERMISSIONS = [
    "Read",
    "Glob",
    "Grep",
    "Skill(luke)",
    "mcp__plugin_context-mode_context-mode__ctx_search",
    "mcp__plugin_context-mode_context-mode__ctx_batch_execute",
    "mcp__plugin_context-mode_context-mode__ctx_execute",
]

STACK_PERMISSIONS = {
    "dotnet":  ["Bash(dotnet *)", "Bash(git *)"],
    "node":    ["Bash(npm *)", "Bash(npx *)", "Bash(git *)"],
    "python":  ["Bash(python *)", "Bash(pip *)", "Bash(git *)"],
    "unknown": ["Bash(git *)"],
}

STALENESS_HOOK_ENTRY = {
    "matcher": "Skill",
    "hooks": [{"type": "command", "command": "bash .claude/hooks/py.sh .claude/hooks/luke-staleness-check.py"}]
}

EDIT_STALENESS_HOOK_ENTRY = {
    "matcher": "Edit|Write",
    "hooks": [{"type": "command", "command": "bash .claude/hooks/py.sh .claude/hooks/luke-edit-staleness-check.py", "runInBackground": True}]
}

AUTO_INDEX_HOOK_ENTRY = {
    "matcher": "mcp__plugin_context-mode_context-mode__ctx_search",
    "hooks": [{"type": "command", "command": "bash .claude/hooks/py.sh .claude/hooks/luke-auto-index-check.py", "runInBackground": True}]
}

SESSION_START_HOOK_ENTRY = {
    "hooks": [{"type": "command", "command": "bash .claude/hooks/py.sh .claude/hooks/luke-session-start.py", "runInBackground": True}]
}

# ---------------------------------------------------------------------------
# File content templates
# ---------------------------------------------------------------------------

GITIGNORE_CONTENT = """\
# Personal overrides — never shared
settings.local.json

# Transient session state — meaningless outside the session
.session*

# Local safety backups — not for version control
backups/

# Legacy Lucius artifacts (migrated to aidlc-docs/ by Luke)
codebase/

# Transient working files
*.tmp
*.bak

# plans/ — uncomment to exclude planning files from version control
# plans/

# Python bytecode from hooks — auto-generated, never commit
hooks/__pycache__/

# memory/ is intentionally tracked — repo-specific knowledge shared across the team
"""

STALENESS_HOOK_PY = """\
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
    sys.stderr.write("Luke: No survey found for this repo. Run /luke to survey and initialise.\\n")
    sys.exit(0)

content = meta_path.read_text(encoding="utf-8")
commit_m = re.search(r"\\*\\*Commit:\\*\\*\\s+([a-f0-9]+)", content)
date_m = re.search(r"\\*\\*Date:\\*\\*\\s+(.+)", content)
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
        sys.stderr.write(f"Luke: Survey very stale — {behind} commits, {days_str} days old. Run /luke to refresh.{ctx_note}\\n")
    elif warn:
        sys.stderr.write(f"Luke: Survey is {behind} commits behind ({days_str} days old). Consider refreshing with /luke.{ctx_note}\\n")
except Exception:
    pass
"""

AUTO_INDEX_HOOK_PY = """\
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
sys.stdout.write(json.dumps({"ctx_batch_execute": commands}) + "\\n")
"""

EDIT_STALENESS_HOOK_PY = """\
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
        commit_m = re.search(r"commit:\\s*([a-f0-9]+)", block)
        paths = [m.group(1).strip().strip('\\"').strip("'") for m in re.finditer(r"-\\s+[\\\"']?([^\\\"'\\n]+)[\\\"']?", block)]
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
                f"re-run /luke then re-index with ctx_batch_execute.\\n"
            )
        break
except Exception:
    pass
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_json(path: Path, data: dict):
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def merge_permissions(existing_allow: list, new_entries: list) -> list:
    result = list(existing_allow)
    for entry in new_entries:
        if entry not in result:
            result.append(entry)
    return result


def merge_pretooluse_hooks(existing: list, new_hook: dict) -> list:
    new_cmds = {hh.get("command", "") for hh in new_hook.get("hooks", [])}
    already = any(
        h.get("matcher") == new_hook["matcher"] and
        any(hh.get("command", "") in new_cmds for hh in h.get("hooks", []))
        for h in existing
    )
    return existing if already else existing + [new_hook]


def check_root_gitignore(repo_root: Path) -> str | None:
    gi = repo_root / ".gitignore"
    if not gi.exists():
        return None
    if re.search(r"^\.claude/?$|^\.claude/\*\*?$", gi.read_text(encoding="utf-8"), re.MULTILINE):
        return (
            "root .gitignore blanket-excludes .claude/ — Luke's repo files will not be tracked. "
            "Add '!.claude/' and '!.claude/**' overrides or replace with specific exclusions. "
            "This file was NOT auto-modified."
        )
    return None


def detect_stack(repo_root: Path) -> str:
    if any(repo_root.rglob("*.csproj")) or any(repo_root.rglob("*.sln")):
        return "dotnet"
    if (repo_root / "package.json").exists():
        return "node"
    if (repo_root / "requirements.txt").exists() or any(repo_root.rglob("pyproject.toml")):
        return "python"
    return "unknown"


def ensure_dir(path: Path, log: list, dry_run: bool):
    if not path.exists():
        if not dry_run:
            path.mkdir(parents=True, exist_ok=True)
        log.append(("create", str(path) + "/"))


def write_new(path: Path, content: str, log: list, dry_run: bool):
    if path.exists():
        log.append(("skip", str(path)))
    else:
        if not dry_run:
            path.write_text(content, encoding="utf-8")
        log.append(("create", str(path)))


# ---------------------------------------------------------------------------
# Target: repo — scaffold <repo-root>/.claude/
# ---------------------------------------------------------------------------

def init_repo(repo_root: Path, stack: str, dry_run: bool):
    dot_claude = repo_root / ".claude"
    log = []
    warnings = []

    # Auto-detect stack if not specified
    if stack == "unknown":
        detected = detect_stack(repo_root)
        if detected != "unknown":
            print(f"Auto-detected stack: {detected}")
            stack = detected

    permissions = BASE_PERMISSIONS + STACK_PERMISSIONS.get(stack, STACK_PERMISSIONS["unknown"])

    ensure_dir(dot_claude, log, dry_run)
    write_new(dot_claude / ".gitignore", GITIGNORE_CONTENT, log, dry_run)

    # settings.json — merge if exists
    settings_path = dot_claude / "settings.json"
    if settings_path.exists():
        data = load_json(settings_path)
        data.setdefault("permissions", {}).setdefault("allow", [])
        data["permissions"]["allow"] = merge_permissions(data["permissions"]["allow"], permissions)
        data.setdefault("hooks", {}).setdefault("PreToolUse", [])
        data["hooks"]["PreToolUse"] = merge_pretooluse_hooks(
            data["hooks"]["PreToolUse"], STALENESS_HOOK_ENTRY
        )
        data["hooks"]["PreToolUse"] = merge_pretooluse_hooks(
            data["hooks"]["PreToolUse"], AUTO_INDEX_HOOK_ENTRY
        )
        data["hooks"].setdefault("PostToolUse", [])
        data["hooks"]["PostToolUse"] = merge_pretooluse_hooks(
            data["hooks"]["PostToolUse"], EDIT_STALENESS_HOOK_ENTRY
        )
        data["hooks"].setdefault("SessionStart", [])
        if not any(
            any(hh.get("command", "") == SESSION_START_HOOK_ENTRY["hooks"][0]["command"]
                for hh in h.get("hooks", []))
            for h in data["hooks"]["SessionStart"]
        ):
            data["hooks"]["SessionStart"].append(SESSION_START_HOOK_ENTRY)
        data.setdefault("$schema", "https://json.schemastore.org/claude-code-settings.json")
        if not dry_run:
            save_json(settings_path, data)
        log.append(("merge", str(settings_path)))
    else:
        content = {
            "$schema": "https://json.schemastore.org/claude-code-settings.json",
            "permissions": {"allow": permissions},
            "hooks": {
                "SessionStart": [SESSION_START_HOOK_ENTRY],
                "PreToolUse": [STALENESS_HOOK_ENTRY, AUTO_INDEX_HOOK_ENTRY],
                "PostToolUse": [EDIT_STALENESS_HOOK_ENTRY],
            }
        }
        if not dry_run:
            save_json(settings_path, content)
        log.append(("create", str(settings_path)))

    # hooks/ + staleness scripts
    hooks_dir = dot_claude / "hooks"
    ensure_dir(hooks_dir, log, dry_run)
    write_new(hooks_dir / "luke-staleness-check.py", STALENESS_HOOK_PY, log, dry_run)
    write_new(hooks_dir / "luke-edit-staleness-check.py", EDIT_STALENESS_HOOK_PY, log, dry_run)
    write_new(hooks_dir / "luke-auto-index-check.py", AUTO_INDEX_HOOK_PY, log, dry_run)

    # skills/ and memory/ directories
    ensure_dir(dot_claude / "skills", log, dry_run)
    ensure_dir(dot_claude / "memory", log, dry_run)

    # Root .gitignore check
    w = check_root_gitignore(repo_root)
    if w:
        warnings.append(w)

    return log, warnings


# ---------------------------------------------------------------------------
# Target: local — sync repo/.claude/ → ~/.claude/settings.json
# ---------------------------------------------------------------------------

def sync_to_local(repo_root: Path, dry_run: bool):
    """
    Reads the repo's .claude/settings.json and merges its permissions into
    the user's global ~/.claude/settings.json. Also adds the repo root to
    additionalDirectories so Claude Code can access it across sessions.
    """
    log = []
    warnings = []

    repo_settings_path = repo_root / ".claude" / "settings.json"
    if not repo_settings_path.exists():
        warnings.append(
            f"No .claude/settings.json found in {repo_root}. "
            "Run --target repo first to initialise the repo."
        )
        return log, warnings

    repo_settings = load_json(repo_settings_path)
    repo_permissions = repo_settings.get("permissions", {}).get("allow", [])

    global_settings_path = HOME / ".claude" / "settings.json"
    global_settings = load_json(global_settings_path) if global_settings_path.exists() else {}

    # Merge permissions
    global_settings.setdefault("permissions", {}).setdefault("allow", [])
    before = len(global_settings["permissions"]["allow"])
    global_settings["permissions"]["allow"] = merge_permissions(
        global_settings["permissions"]["allow"], repo_permissions
    )
    added_perms = len(global_settings["permissions"]["allow"]) - before

    # Add repo root to additionalDirectories
    global_settings["permissions"].setdefault("additionalDirectories", [])
    repo_str = str(repo_root)
    if repo_str not in global_settings["permissions"]["additionalDirectories"]:
        global_settings["permissions"]["additionalDirectories"].append(repo_str)
        log.append(("add", f"additionalDirectories: {repo_str}"))

    # Merge PreToolUse hooks from repo settings into global
    repo_hooks = repo_settings.get("hooks", {}).get("PreToolUse", [])
    global_settings.setdefault("hooks", {}).setdefault("PreToolUse", [])
    for hook in repo_hooks:
        global_settings["hooks"]["PreToolUse"] = merge_pretooluse_hooks(
            global_settings["hooks"]["PreToolUse"], hook
        )

    if not dry_run:
        save_json(global_settings_path, global_settings)

    log.append(("merge", str(global_settings_path) + f" (+{added_perms} permissions)"))

    # Check that the staleness hook exists (written by --target repo)
    hook_path = repo_root / ".claude" / "hooks" / "luke-staleness-check.py"
    if not hook_path.exists():
        warnings.append(
            "luke-staleness-check.py not found in repo .claude/hooks/. "
            "Run --target repo to scaffold the hook first."
        )

    return log, warnings


# ---------------------------------------------------------------------------
# Target: repo-from — copy scaffold from src repo to dest repo
# ---------------------------------------------------------------------------

def init_repo_from(repo_root: Path, src_root: Path, stack: str, dry_run: bool):
    """
    Copies Luke scaffold structure from src/.claude/ to repo-root/.claude/.
    Copies: .gitignore, hooks/luke-staleness-check.py, hooks/luke-edit-staleness-check.py.
    Merges: settings.json permissions (not a wholesale copy — src may have
    src-specific entries).
    Does NOT copy: skills/luke/SKILL.md (repo-specific), memory/ contents (repo-specific).
    """
    log = []
    warnings = []

    src_claude = src_root / ".claude"
    if not src_claude.exists():
        warnings.append(f"Source .claude/ not found at {src_root}. Nothing to copy from.")
        return log, warnings

    # Detect stack from dest repo if not specified
    if stack == "unknown":
        detected = detect_stack(repo_root)
        if detected != "unknown":
            stack = detected

    # Run standard repo init first (creates scaffold)
    init_log, init_warnings = init_repo(repo_root, stack, dry_run)
    log.extend(init_log)
    warnings.extend(init_warnings)

    # Overlay src .gitignore if dest doesn't have one yet
    src_gi = src_claude / ".gitignore"
    dest_gi = repo_root / ".claude" / ".gitignore"
    if src_gi.exists() and not dest_gi.exists():
        if not dry_run:
            dest_gi.write_text(src_gi.read_text(encoding="utf-8"), encoding="utf-8")
        log.append(("copy", f"{src_gi} -> {dest_gi}"))

    # Merge src permissions into dest settings (not overwrite)
    src_settings = load_json(src_claude / "settings.json") if (src_claude / "settings.json").exists() else {}
    src_perms = src_settings.get("permissions", {}).get("allow", [])
    # Filter out src-specific entries (Skill(luke) already added by init_repo)
    # Only copy generic entries: Read, Glob, Grep, Bash(*), mcp__plugin_context-mode_*
    generic = [p for p in src_perms if not p.startswith("Skill(") or p == "Skill(luke)"]

    dest_settings_path = repo_root / ".claude" / "settings.json"
    dest_settings = load_json(dest_settings_path)
    dest_settings.setdefault("permissions", {}).setdefault("allow", [])
    dest_settings["permissions"]["allow"] = merge_permissions(
        dest_settings["permissions"]["allow"], generic
    )
    if not dry_run:
        save_json(dest_settings_path, dest_settings)
    log.append(("merge-from-src", str(dest_settings_path)))

    return log, warnings


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def print_report(repo_root: Path, target: str, log: list, warnings: list, dry_run: bool):
    prefix = "[DRY RUN] " if dry_run else ""
    print(f"\n{prefix}luke-repo-init — target: {target}")
    print(f"Repo: {repo_root}\n")

    icons = {"create": "+", "merge": "~", "skip": "=",
             "add": "+", "copy": "->", "merge-from-src": "~"}

    if log:
        for action, desc in log:
            print(f"  {icons.get(action, '?')} [{action}] {desc}")
    else:
        print("  (nothing to do)")

    if warnings:
        print("\nWarnings:")
        for w in warnings:
            print(f"  ! {w}")

    print()
    if target == "repo":
        print("Next: Luke will write .claude/skills/luke/SKILL.md and CLAUDE.md content.")
    elif target == "local":
        print("Next: Open a new Claude Code session in this repo — your global settings now include it.")
    elif target == "repo-from":
        print("Next: Luke will write .claude/skills/luke/SKILL.md and CLAUDE.md content for the new repo.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Scaffold and sync Luke's Claude Code configuration.",
    )
    parser.add_argument("repo_root", help="Absolute path to the target repo root")
    parser.add_argument(
        "--target",
        choices=["repo", "local", "repo-from"],
        default="repo",
        help=(
            "repo: scaffold <repo-root>/.claude/ (default). "
            "local: sync repo config into user's ~/.claude/settings.json. "
            "repo-from: copy scaffold from --src repo into <repo-root>/.claude/. "
        )
    )
    parser.add_argument(
        "--src",
        help="Source repo root (required when --target repo-from)"
    )
    parser.add_argument(
        "--stack",
        choices=["dotnet", "node", "python", "unknown"],
        default="unknown",
        help="Tech stack for permissions (auto-detected if omitted)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would happen without writing anything"
    )
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    if not repo_root.exists():
        print(f"ERROR: repo root not found: {repo_root}", file=sys.stderr)
        sys.exit(1)

    if args.target == "repo-from":
        if not args.src:
            print("ERROR: --target repo-from requires --src <source-repo-root>", file=sys.stderr)
            sys.exit(1)
        src_root = Path(args.src).resolve()
        if not src_root.exists():
            print(f"ERROR: source repo not found: {src_root}", file=sys.stderr)
            sys.exit(1)
        log, warnings = init_repo_from(repo_root, src_root, args.stack, args.dry_run)

    elif args.target == "local":
        log, warnings = sync_to_local(repo_root, args.dry_run)

    else:  # repo (default)
        log, warnings = init_repo(repo_root, args.stack, args.dry_run)

    print_report(repo_root, args.target, log, warnings, args.dry_run)

    if warnings and not args.dry_run:
        sys.exit(1 if any("ERROR" in w for w in warnings) else 0)


if __name__ == "__main__":
    main()
