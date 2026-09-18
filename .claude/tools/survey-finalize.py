#!/usr/bin/env python3
"""survey-finalize.py -- Luke S4/S5 post-write finalization in one call.

Runs luke-copy-assets, luke-repo-init, luke-project-include, c4-navigator,
creates memory/.gitkeep, and stages files with git add. Replaces 6+ sequential
UB calls with parallelism where safe.

Contract:  python survey-finalize.py --help   (JSON)
Standard:  references/tooling-standards.md

Usage (flags only):
    $UB survey-finalize --repo-root <repo_root> [--stack <dotnet|node|python|unknown>] [--skip-git]

Output:
    JSON envelope — per-step results (ok/msg), summary counts. Step diagnostics to stderr.

Exit codes: 0 finalized · 1 usage/validation · 4 not found (repo root)
"""

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

TOOLS_DIR = Path(__file__).parent
BASE_DIR = Path(__file__).resolve().parent.parent

from toolkit import Tool, UsageError, NotFound, audit_append


def run_script(script_name, args):
    """Run a script from TOOLS_DIR. Returns (success, stdout, stderr)."""
    script_path = TOOLS_DIR / script_name
    if not script_path.exists():
        return False, "", f"Script not found: {script_path}"
    cmd = [sys.executable, str(script_path)] + args
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return False, result.stdout, result.stderr
    return True, result.stdout, result.stderr


def parse_envelope(stdout):
    """Parse a GPTS tool's JSON envelope from stdout. None if unparseable/not a dict."""
    try:
        doc = json.loads(stdout)
    except (json.JSONDecodeError, ValueError, TypeError):
        return None
    return doc if isinstance(doc, dict) else None


def failure_reason(stdout, stderr):
    """Prefer the GPTS envelope's reason; fall back to stderr/stdout text."""
    doc = parse_envelope(stdout)
    if doc and doc.get("reason"):
        return str(doc["reason"]).strip()
    return (stderr or stdout or "unknown error").strip()


def detect_stack(repo_root):
    """Auto-detect the technology stack from repo root files."""
    root = Path(repo_root)

    # Check for .sln or .csproj
    if list(root.glob("*.sln")) or list(root.glob("*.csproj")):
        return "dotnet"

    # Check for package.json at root
    if (root / "package.json").exists():
        return "node"

    # Check for Python project files
    if (root / "pyproject.toml").exists() or (root / "requirements.txt").exists():
        return "python"

    return "unknown"


def create_gitkeep(repo_root):
    """Create <repo_root>/.claude/memory/.gitkeep if not present."""
    memory_dir = Path(repo_root) / ".claude" / "memory"
    os.makedirs(str(memory_dir), exist_ok=True)
    gitkeep = memory_dir / ".gitkeep"
    if not gitkeep.exists():
        gitkeep.write_text("", encoding="utf-8")
        return True, ".claude/memory/.gitkeep created"
    return True, ".claude/memory/.gitkeep already exists"


def run_git_add(repo_root):
    """Stage .claude/ with git add."""
    result = subprocess.run(
        ["git", "-C", str(repo_root), "add", ".claude/"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        return False, result.stderr.strip()

    # Get status summary
    status_result = subprocess.run(
        ["git", "-C", str(repo_root), "status", "--short", "--", ".claude/"],
        capture_output=True, text=True
    )
    staged_count = sum(
        1 for line in status_result.stdout.splitlines()
        if line and line[0] in ("A", "M", "D")
    )
    return True, f"git add completed -- {staged_count} files staged"


def handle(v):
    repo_root = Path(v["--repo-root"]).resolve()
    if not repo_root.is_dir():
        raise NotFound(
            f"repo_root does not exist or is not a directory: {repo_root}",
            "pass an existing repository directory: $UB survey-finalize --repo-root <repo-root>",
        )

    stack = v.get("--stack") or detect_stack(repo_root)
    skip_git = bool(v.get("--skip-git", False))
    print(f"Stack: {stack}", file=sys.stderr)

    results = {}

    # -- Parallel step A: luke-copy-assets + luke-repo-init --
    def run_copy_assets():
        ok, out, err = run_script("luke-copy-assets.py", ["--repo-root", str(repo_root)])
        if not ok:
            return False, f"luke-copy-assets failed: {failure_reason(out, err)}"
        return True, "luke-copy-assets completed"

    def run_repo_init():
        ok, out, err = run_script(
            "luke-repo-init.py", ["--repo-root", str(repo_root), "--stack", stack]
        )
        if not ok:
            return False, f"luke-repo-init failed: {failure_reason(out, err)}"
        return True, "luke-repo-init completed"

    print("\n[A] Running luke-copy-assets + luke-repo-init in parallel...", file=sys.stderr)
    step_a = {"luke-copy-assets": run_copy_assets, "luke-repo-init": run_repo_init}
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(fn): key for key, fn in step_a.items()}
        for future in as_completed(futures):
            key = futures[future]
            try:
                ok, msg = future.result()
                results[key] = {"ok": ok, "msg": msg}
                status = "OK" if ok else "WARN"
                print(f"  [{status}] {key}: {msg}", file=sys.stderr)
                if not ok:
                    print(f"  [WARN] {key} failed but continuing", file=sys.stderr)
            except Exception as exc:
                results[key] = {"ok": False, "msg": str(exc)}
                print(f"  [WARN] {key} raised exception: {exc}", file=sys.stderr)

    # -- Parallel step B: luke-project-include + c4-navigator + memory/.gitkeep --
    reverse_eng_dir = repo_root / ".claude" / "codebase"

    def run_project_include():
        ok, out, err = run_script("luke-project-include.py", ["--repo-root", str(repo_root)])
        if not ok:
            return False, f"luke-project-include failed: {failure_reason(out, err)}"
        return True, "luke-project-include completed"

    def run_c4_navigator():
        ok, out, err = run_script(
            "c4-navigator.py", ["--directory", str(reverse_eng_dir), "--force"]
        )
        if not ok:
            doc = parse_envelope(out)
            detail = " (conflict: index.md already exists)" if doc and doc.get("status") == "conflict" else ""
            return False, f"c4-navigator failed{detail}: {failure_reason(out, err)}"
        return True, "c4-navigator completed"

    def run_gitkeep():
        return create_gitkeep(repo_root)

    print("\n[B] Running luke-project-include + c4-navigator + memory/.gitkeep in parallel...", file=sys.stderr)
    step_b = {
        "luke-project-include": run_project_include,
        "c4-navigator": run_c4_navigator,
        "memory-gitkeep": run_gitkeep,
    }
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(fn): key for key, fn in step_b.items()}
        for future in as_completed(futures):
            key = futures[future]
            try:
                ok, msg = future.result()
                results[key] = {"ok": ok, "msg": msg}
                status = "OK" if ok else "WARN"
                print(f"  [{status}] {key}: {msg}", file=sys.stderr)
                if not ok:
                    print(f"  [WARN] {key} failed but continuing", file=sys.stderr)
            except Exception as exc:
                results[key] = {"ok": False, "msg": str(exc)}
                print(f"  [WARN] {key} raised exception: {exc}", file=sys.stderr)

    # -- Git add --
    if skip_git:
        results["git-add"] = {"ok": True, "msg": "skipped (--skip-git)"}
        print("\n[C] git add: skipped (--skip-git)", file=sys.stderr)
    else:
        print("\n[C] Running git add .claude/ ...", file=sys.stderr)
        ok, msg = run_git_add(repo_root)
        results["git-add"] = {"ok": ok, "msg": msg}
        status = "OK" if ok else "WARN"
        print(f"  [{status}] git-add: {msg}", file=sys.stderr)

    # -- Summary --
    total = len(results)
    ok_count = sum(1 for r in results.values() if r["ok"])
    warn_count = total - ok_count
    print(f"\nSummary: {ok_count}/{total} steps OK, {warn_count} warnings", file=sys.stderr)

    result = "finalized" if ok_count == total else "partial"
    audit_append(Path(v["--base"]), "survey-finalize", "finalize", key=str(repo_root), result=result)

    return {
        "status": "partial" if ok_count < total else "finalized",
        "repo_root": str(repo_root),
        "stack": stack,
        "skip_git": skip_git,
        "results": results,
        "summary": {"ok": ok_count, "total": total, "warnings": warn_count},
    }


TOOL = Tool(
    name="survey-finalize",
    version="1.0",
    summary="Luke S4/S5 post-write finalization — luke-copy-assets + luke-repo-init in parallel, then luke-project-include + c4-navigator + memory/.gitkeep in parallel, then git add of .claude/.",
    flags={
        "--repo-root": {"required": True, "type": "path",
                        "description": "Path to the repository root (must exist)."},
        "--stack": {"required": False, "type": "choice",
                    "choices": ["dotnet", "node", "python", "unknown"],
                    "description": "Technology stack override (auto-detected from repo files if omitted)."},
        "--skip-git": {"required": False, "type": "bool",
                       "description": "Skip the git add step."},
    },
    exit_codes={
        "0": "finalized — payload carries per-step results (failed steps report ok:false; the tool continues, matching legacy behavior)",
        "1": "usage or validation error",
        "4": "not found: repo root does not exist or is not a directory",
    },
    examples=[
        "$UB survey-finalize --repo-root /path/to/myrepo",
        "$UB survey-finalize --repo-root /path/to/myrepo --skip-git --stack dotnet",
    ],
    idempotent="Re-running re-copies assets, re-merges settings, regenerates index.md (--force), and re-stages files.",
    base_default=BASE_DIR,
)


if __name__ == "__main__":
    TOOL.run(handle)
