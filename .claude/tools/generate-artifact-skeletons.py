#!/usr/bin/env python3
"""generate-artifact-skeletons.py — Pre-fill deterministic sections of survey artifacts.

Runs after pre-scan, check-unused-deps, and find-helper-duplication.
Writes skeleton .md files to .claude/codebase/ with:
  - Auto-extracted tables (endpoints, classes, packages, test groups)
  - Deterministic .survey-meta.md (git SHA + date — no model needed)
  - Header comment marking what the model must still fill in

Cluster agents receive these skeletons as starting context. They add the WHY,
fill non-mechanical sections, and complete any gaps — they do not transcribe
raw script output from scratch.

Contract:  python generate-artifact-skeletons.py --help   (JSON)
Standard:  references/tooling-standards.md

Usage (flags only):
    $UB generate-artifact-skeletons --repo-root <repo-root>
        [--pre-scan <pre_scan_json>] [--unused-deps <json>]
        [--duplication <json>] [--force]

    All JSON inputs are optional. If omitted, that artifact section is left
    with a placeholder comment for the model to fill.

Output: JSON envelope; payload carries per-file results, counts, and the
    legacy human report text under "report".

Exit codes: 0 generated · 1 usage/validation · 4 not found (repo root)
"""

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from toolkit import Tool, NotFound, audit_append

BASE_DIR = Path(__file__).resolve().parent.parent

ARTIFACTS_DIR_PARTS = (".claude", "codebase")
SKELETON_MARKER = "<!-- AUTO-GENERATED SKELETON"
PLACEHOLDER = "<!-- TODO: fill in this section -->"


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------

def git(args, cwd):
    try:
        return subprocess.check_output(["git"] + args, cwd=str(cwd), text=True,
                                       stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def get_head_sha(repo_root):
    return git(["rev-parse", "HEAD"], repo_root) or "UNKNOWN"


def get_now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# JSON input loaders
# ---------------------------------------------------------------------------

def load_json_file(path):
    if not path:
        return None
    p = Path(path)
    if not p.exists():
        print(f"  [WARN] {path} not found — skipping that input", file=sys.stderr)
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"  [WARN] {path} is not valid JSON: {e}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# Skeleton writers
# ---------------------------------------------------------------------------

def skeleton_header(artifact_name, commit, now, relevant_paths):
    paths_block = "\n".join(f"- {p}" for p in relevant_paths) if relevant_paths else "- **"
    return (
        f"<!--\n"
        f"surveyed_at: {now}\n"
        f"commit: {commit}\n"
        f"relevant_paths:\n{paths_block}\n"
        f"summary: Auto-generated skeleton. Cluster agent must add WHY, fill gaps, and complete non-mechanical sections.\n"
        f"-->\n\n"
        f"{SKELETON_MARKER} — add WHY, fill gaps, complete non-mechanical sections -->\n\n"
    )


def make_api_documentation(pre_scan, commit, now):
    lines = [skeleton_header("api-documentation.md", commit, now,
                             ["**Controllers/**", "**Endpoints/**", "**Routes/**"])]
    lines.append("# API Documentation\n\n")

    if pre_scan and pre_scan.get("http_endpoints"):
        endpoints = pre_scan["http_endpoints"]
        lines.append("## Endpoints\n\n")
        lines.append("| Controller | Route | Method | Auth Required |\n")
        lines.append("|-----------|-------|--------|---------------|\n")
        for ep in endpoints:
            controller = ep.get("controller", ep.get("class", "Unknown"))
            route = ep.get("route", ep.get("path", ""))
            method = ep.get("http_method", ep.get("method", ""))
            auth = ep.get("auth", "Unknown")
            lines.append(f"| {controller} | `{route}` | {method} | {auth} |\n")
        lines.append("\n")
    else:
        lines.append(f"## Endpoints\n\n{PLACEHOLDER}\n\n")

    lines.append("## Request / Response Shapes\n\n")
    lines.append(f"{PLACEHOLDER}\n\n")
    lines.append("## Authentication\n\n")
    lines.append(f"{PLACEHOLDER}\n")

    return "".join(lines)


def make_component_inventory(pre_scan, commit, now):
    lines = [skeleton_header("component-inventory.md", commit, now,
                             ["**/**/*.cs", "**/**/*.ts", "**/**/*.py"])]
    lines.append("# Component Inventory\n\n")

    if pre_scan and pre_scan.get("class_inventory"):
        raw = pre_scan["class_inventory"]
        # class_inventory is dict[namespace_path -> list[{class, base, file, ...}]]
        if isinstance(raw, dict):
            inventory = [
                {"name": c.get("class", ""), "namespace": ns_path, "base": c.get("base", "")}
                for ns_path, classes in raw.items()
                for c in (classes if isinstance(classes, list) else [])
            ]
        else:
            inventory = raw
        lines.append("## Classes\n\n")
        lines.append("| Class | Namespace | Responsibility | Key Dependencies |\n")
        lines.append("|-------|-----------|---------------|------------------|\n")
        for cls in inventory:
            name = cls.get("name", "")
            ns = cls.get("namespace", "")
            responsibility = cls.get("responsibility", PLACEHOLDER)
            deps = ", ".join(cls.get("dependencies", [])) or ""
            lines.append(f"| {name} | {ns} | {responsibility} | {deps} |\n")
        lines.append("\n")
    elif pre_scan and pre_scan.get("projects"):
        # Fallback: list projects
        lines.append("## Projects\n\n")
        lines.append("| Project | Type | Responsibility |\n")
        lines.append("|---------|------|----------------|\n")
        for proj in pre_scan["projects"]:
            name = proj.get("name", "")
            ptype = proj.get("type", "")
            lines.append(f"| {name} | {ptype} | {PLACEHOLDER} |\n")
        lines.append("\n")
    else:
        lines.append(f"## Classes\n\n{PLACEHOLDER}\n\n")

    lines.append("## Component Relationships\n\n")
    lines.append(f"{PLACEHOLDER}\n")

    return "".join(lines)


def make_dependencies(pre_scan, unused_deps, commit, now):
    lines = [skeleton_header("dependencies.md", commit, now,
                             ["*.csproj", "package.json", "requirements.txt", "pyproject.toml"])]
    lines.append("# Dependencies\n\n")

    # Packages from pre-scan
    if pre_scan and pre_scan.get("packages"):
        packages = pre_scan["packages"]
        unused_names = set()
        if unused_deps and unused_deps.get("unused"):
            unused_names = {u.get("name", u) if isinstance(u, dict) else u
                            for u in unused_deps["unused"]}

        lines.append("## External Packages\n\n")
        lines.append("| Package | Version | Used | Purpose |\n")
        lines.append("|---------|---------|------|----------|\n")
        for pkg in packages:
            name = pkg.get("name", pkg) if isinstance(pkg, dict) else pkg
            version = pkg.get("version", "") if isinstance(pkg, dict) else ""
            used = "No" if name in unused_names else "Yes"
            lines.append(f"| {name} | {version} | {used} | {PLACEHOLDER} |\n")
        lines.append("\n")
    else:
        lines.append(f"## External Packages\n\n{PLACEHOLDER}\n\n")

    if unused_deps and unused_deps.get("unused"):
        lines.append("## Potentially Unused Packages\n\n")
        lines.append("> Auto-detected by check-unused-deps.py. Verify before removing — "
                     "transitive deps, reflection, and config usage may not be detected.\n\n")
        lines.append("| Package | Confidence | Notes |\n")
        lines.append("|---------|-----------|-------|\n")
        for u in unused_deps["unused"]:
            name = u.get("name", u) if isinstance(u, dict) else u
            confidence = u.get("confidence", "MED") if isinstance(u, dict) else "MED"
            notes = u.get("notes", "") if isinstance(u, dict) else ""
            lines.append(f"| {name} | [{confidence}] | {notes} |\n")
        lines.append("\n")

    lines.append("## Internal Dependency Graph\n\n")
    lines.append(f"{PLACEHOLDER}\n")

    return "".join(lines)


def make_test_infrastructure(pre_scan, commit, now):
    lines = [skeleton_header("test-infrastructure.md", commit, now,
                             ["**/*Tests*/**", "**/*.Tests/**", "*Tests.cs", "*.runsettings"])]
    lines.append("# Test Infrastructure\n\n")

    if pre_scan and pre_scan.get("test_groups"):
        groups = pre_scan["test_groups"]
        lines.append("## Test Groups (Traits)\n\n")
        lines.append("| Group | Purpose | Run Filter |\n")
        lines.append("|-------|---------|------------|\n")
        for g in groups:
            name = g.get("name", g) if isinstance(g, dict) else g
            purpose = g.get("purpose", PLACEHOLDER) if isinstance(g, dict) else PLACEHOLDER
            run_filter = g.get("filter", f'--filter "Grouping={name}"') if isinstance(g, dict) else f'--filter "Grouping={name}"'
            lines.append(f"| {name} | {purpose} | `{run_filter}` |\n")
        lines.append("\n")
    else:
        lines.append(f"## Test Groups\n\n{PLACEHOLDER}\n\n")

    if pre_scan and pre_scan.get("base_classes"):
        lines.append("## Base Classes\n\n")
        lines.append("| Class | Inheritors | Provides |\n")
        lines.append("|-------|-----------|----------|\n")
        for bc in pre_scan["base_classes"]:
            name = bc.get("name", bc) if isinstance(bc, dict) else bc
            inheritors = bc.get("inheritors", "") if isinstance(bc, dict) else ""
            provides = bc.get("provides", PLACEHOLDER) if isinstance(bc, dict) else PLACEHOLDER
            lines.append(f"| {name} | {inheritors} | {provides} |\n")
        lines.append("\n")

    lines.append("## Running Tests\n\n")
    lines.append(f"{PLACEHOLDER}\n\n")
    lines.append("## Credential Chain\n\n")
    lines.append(f"{PLACEHOLDER}\n")

    return "".join(lines)


def make_anti_patterns(duplication, commit, now):
    lines = [skeleton_header("anti-patterns.md", commit, now,
                             ["**/*Helper*", "**/*Tests*/**"])]
    lines.append("# Anti-Patterns\n\n")

    if duplication and duplication.get("findings"):
        findings = duplication["findings"]
        lines.append("## Helper Duplication\n\n")
        lines.append("> Auto-detected by find-helper-duplication.py. "
                     "Each finding is a local method that likely duplicates a shared helper.\n\n")
        lines.append("| Local Method | Similar To | Similarity | Cross-Cutting Risk |\n")
        lines.append("|-------------|-----------|------------|-------------------|\n")
        for f in findings:
            local = f.get("consumer_method", "") if isinstance(f, dict) else ""
            helper = f.get("helper_method", "") if isinstance(f, dict) else ""
            sim = f"{round(f.get('similarity', 0) * 100)}%" if isinstance(f, dict) else ""
            risk = "Yes" if (isinstance(f, dict) and f.get("cross_cutting")) else "No"
            lines.append(f"| `{local}` | `{helper}` | {sim} | {risk} |\n")
        lines.append("\n")
    else:
        lines.append("## Helper Duplication\n\n")
        lines.append(f"{PLACEHOLDER}\n\n")

    lines.append("## Other Anti-Patterns\n\n")
    lines.append(f"{PLACEHOLDER}\n")

    return "".join(lines)


def make_survey_meta(commit, now, artifacts_dir):
    """Fully deterministic — no model input needed."""
    files_produced = sorted(p.name for p in artifacts_dir.glob("*.md")
                            if not p.name.startswith(".") or p.name == ".survey-meta.md")

    files_block = "\n".join(f"- `{f}`" for f in files_produced) if files_produced else "- (none yet)"

    return (
        f"# Survey Metadata\n\n"
        f"**Commit:** {commit}\n"
        f"**Date:** {now}\n\n"
        f"## Files Produced\n\n"
        f"{files_block}\n\n"
        f"## Change Triggers\n\n"
        f"<!-- TODO: fill in the change_triggers table after survey completes -->\n\n"
        f"| Area | Trigger Condition | Re-survey Scope |\n"
        f"|------|------------------|-----------------|\n"
        f"| (complete after survey) | | |\n"
    )


# ---------------------------------------------------------------------------
# Safe write — never overwrite completed model work
# ---------------------------------------------------------------------------

def is_skeleton_only(path):
    """True if the file was written by this script and has no model content yet."""
    if not path.exists():
        return True
    content = path.read_text(encoding="utf-8")
    # If it has the skeleton marker AND every non-header section is a placeholder, it's skeleton-only
    if SKELETON_MARKER not in content:
        return False
    non_placeholder_lines = [
        l for l in content.splitlines()
        if l.strip() and not l.strip().startswith("<!--") and
           not l.strip().startswith("#") and
           not l.strip().startswith("|") and
           not l.strip().startswith("-") and
           l.strip() != ">"
        and PLACEHOLDER not in l
    ]
    # If there's meaningful prose beyond headers and table rows, a model has filled it in
    return len(non_placeholder_lines) < 3


def safe_write(path, content, results, force=False):
    if path.exists() and not force and not is_skeleton_only(path):
        results.append(("skip", path.name, "file has model content — not overwritten"))
        return
    path.write_text(content, encoding="utf-8")
    results.append(("write", path.name, "skeleton written"))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def handle(v):
    repo_root = Path(v["--repo-root"]).resolve()
    if not repo_root.is_dir():
        raise NotFound(
            f"repo root not found: {repo_root}",
            "pass an existing repository directory: $UB generate-artifact-skeletons --repo-root <repo>",
        )
    force = bool(v.get("--force", False))
    base = Path(v["--base"])

    artifacts_dir = repo_root.joinpath(*ARTIFACTS_DIR_PARTS)
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    commit = get_head_sha(repo_root)
    now = get_now_iso()

    pre_scan = load_json_file(v.get("--pre-scan"))
    unused_deps = load_json_file(v.get("--unused-deps"))
    duplication = load_json_file(v.get("--duplication"))

    results = []

    safe_write(artifacts_dir / "api-documentation.md",
               make_api_documentation(pre_scan, commit, now), results, force)

    safe_write(artifacts_dir / "component-inventory.md",
               make_component_inventory(pre_scan, commit, now), results, force)

    safe_write(artifacts_dir / "dependencies.md",
               make_dependencies(pre_scan, unused_deps, commit, now), results, force)

    safe_write(artifacts_dir / "test-infrastructure.md",
               make_test_infrastructure(pre_scan, commit, now), results, force)

    safe_write(artifacts_dir / "anti-patterns.md",
               make_anti_patterns(duplication, commit, now), results, force)

    # .survey-meta.md is always safe to write — it's deterministic
    (artifacts_dir / ".survey-meta.md").write_text(
        make_survey_meta(commit, now, artifacts_dir), encoding="utf-8"
    )
    results.append(("write", ".survey-meta.md", f"commit={commit[:12]}, date={now[:10]}"))

    written = sum(1 for a, _, _ in results if a == "write")
    skipped = sum(1 for a, _, _ in results if a == "skip")

    icons = {"write": "+", "skip": "="}
    report_lines = [
        f"\ngenerate-artifact-skeletons — {repo_root}",
        f"Artifacts dir: {artifacts_dir}\n",
    ]
    for action, name, note in results:
        report_lines.append(f"  {icons.get(action, '?')} [{action}] {name}  — {note}")
    report_lines.append(f"\nDone: {written} written, {skipped} skipped.")
    if skipped:
        report_lines.append("  (skipped files have model content — use --force to overwrite)")
    report = "\n".join(report_lines)

    audit_append(base, "generate-artifact-skeletons", "generate",
                 key=str(repo_root), result="generated")

    return {
        "status": "generated",
        "repo_root": str(repo_root),
        "artifacts_dir": str(artifacts_dir),
        "results": [{"action": a, "file": n, "note": note} for a, n, note in results],
        "written": written,
        "skipped": skipped,
        "report": report,
    }


TOOL = Tool(
    name="generate-artifact-skeletons",
    version="1.0",
    summary="Pre-fill deterministic sections of survey artifacts (endpoints, classes, packages, "
            "test groups) and write a git-SHA-stamped .survey-meta.md; model work is never overwritten without --force.",
    flags={
        "--repo-root": {"required": False, "type": "path", "default": ".",
                        "description": "Path to the repository root (default: current directory)."},
        "--pre-scan": {"required": False, "type": "path",
                       "description": "Path to pre-scan JSON output."},
        "--unused-deps": {"required": False, "type": "path",
                          "description": "Path to check-unused-deps JSON output."},
        "--duplication": {"required": False, "type": "path",
                          "description": "Path to find-helper-duplication JSON output."},
        "--force": {"required": False, "type": "bool",
                    "description": "Overwrite even if model content exists (use carefully)."},
    },
    exit_codes={
        "0": "generated — payload carries per-file results, counts, and the report",
        "1": "usage or validation error",
        "4": "not found: repo root does not exist",
    },
    examples=[
        "$UB generate-artifact-skeletons --repo-root . --pre-scan survey_tmp/pre-scan.json --duplication survey_tmp/duplication.json",
        "$UB generate-artifact-skeletons --repo-root . --force",
    ],
    idempotent="Re-running regenerates skeleton files only where they are still skeleton-only; .survey-meta.md is rewritten with the current SHA/date.",
    base_default=BASE_DIR,
)


if __name__ == "__main__":
    TOOL.run(handle)
