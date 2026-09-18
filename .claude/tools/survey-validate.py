"""
survey-validate.py — Validate Luke survey output + build the S1 reconciliation plan (GPTS).

Two read audits in one tool, re-derived from skills/luke/SKILL.md:
  validate  — the mechanical S4 gates: required artifacts present, JSON sidecars
              written, .survey-meta.md fields complete (commit resolvable in git),
              every produced file on disk, index.md links every artifact.
  reconcile — the S1 asset audit as a plan: CLAUDE.md variants, .claude/codebase/
              state, legacy aidlc-docs/, untracked remnants, local luke skill.
Freshness (commit distance / age / lines changed) is NOT re-computed here —
that is check-survey-staleness's job.

Flags (flag-only; --help / no-args print the JSON contract and exit 0):
    --repo-root <path>      REQUIRED  Project repo root (must be a git repo).
    --op <validate|reconcile|all>     Default: all.

Output: exactly one JSON document on stdout (diagnostics to stderr).
    validate/all:  {"ok": true, "status": "valid|invalid", "issues": [...],
                    "meta": {...}, "reconcile": {"plan": [...]}}
    reconcile:     {"ok": true, "status": "planned", "reconcile": {"plan": [...]}}
    failure:       {"ok": false, "status": "error|precondition|not_found",
                    "reason", "fix"}

Used by: Luke (S1 reconciliation gate, S4 write gate). Read-only; no audit line.
"""

import re
import subprocess
from pathlib import Path

from toolkit import NotFound, Precondition, Tool, UsageError

CODEBASE_PARTS = (".claude", "codebase")

# Core artifacts every survey must write (luke SKILL S4; anti-patterns "no exceptions",
# index.md is the navigation hub). Conditional ones (api-documentation,
# business-overview, patterns, domain-model) are NOT required.
REQUIRED_ARTIFACTS = [
    "overview.md", "technology-stack.md", "architecture.md", "code-structure.md",
    "component-inventory.md", "dependencies.md", "test-infrastructure.md",
    "findings.md", "anti-patterns.md", "index.md",
]


def _git(repo_root, *args):
    """Run git in repo_root; return stdout str, or None on failure."""
    try:
        r = subprocess.run(["git", "-C", str(repo_root)] + list(args),
                           capture_output=True, text=True, timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if r.returncode != 0:
        return None
    return r.stdout.strip()


def _issue(rule, detail, fix_hint, artifact=None):
    item = {"rule": rule, "detail": detail, "fix_hint": fix_hint}
    if artifact:
        item["artifact"] = artifact
    return item


# ---------------------------------------------------------------- validate

def _parse_meta(meta_path):
    """Extract commit, date, files_produced, has_change_triggers from .survey-meta.md."""
    content = meta_path.read_text(encoding="utf-8")
    cm = re.search(r"\*\*Commit:\*\*\s*([a-f0-9]+)", content)
    dm = re.search(r"\*\*Date:\*\*\s*(.+)", content)
    files_produced = []
    fp_match = re.search(r"\*\*Files produced:\*\*\s*\n((?:\s*-\s*.+\n?)+)", content)
    if fp_match:
        for line in fp_match.group(1).splitlines():
            # Filenames in the list are often wrapped in backticks or quotes —
            # a raw compare against disk false-fails files-produced-missing.
            name = line.strip().lstrip("-").strip().strip("`\"'").strip()
            if name and not name.startswith("["):
                files_produced.append(name)
    has_triggers = bool(re.search(r"^##\s*Change Triggers\s*$", content, re.MULTILINE))
    trigger_rows = [ln for ln in content.splitlines()
                    if ln.strip().startswith("|") and "File pattern" not in ln
                    and set(ln.strip()) - set("|-: ")]
    return {
        "commit": cm.group(1) if cm else None,
        "date": dm.group(1).strip() if dm else None,
        "files_produced": files_produced,
        "has_change_triggers": has_triggers and bool(trigger_rows),
    }


def _validate(repo_root, codebase_dir, issues):
    meta = {}
    if not codebase_dir.is_dir():
        issues.append(_issue("missing-codebase-dir",
                             f"{codebase_dir} does not exist",
                             "run a full survey (Luke S1-S5) — nothing to validate"))
        return meta

    for name in REQUIRED_ARTIFACTS:
        if not (codebase_dir / name).is_file():
            issues.append(_issue("missing-artifact",
                                 f"{name} not found in .claude/codebase/",
                                 "write the artifact (luke S4) or re-run the S2 cluster "
                                 "that produces it", artifact=name))

    for md in sorted(codebase_dir.glob("*.md")):
        if md.name in ("index.md",) or md.name.startswith("."):
            continue
        if not (md.parent / (md.stem + ".json")).is_file():
            issues.append(_issue("missing-sidecar",
                                 f"{md.name} has no JSON sidecar",
                                 "run $UB write-sidecars --dir <repo-root>/.claude/codebase",
                                 artifact=md.name))

    meta_path = codebase_dir / ".survey-meta.md"
    if not meta_path.is_file():
        issues.append(_issue("meta-missing", ".survey-meta.md not found",
                             "write .survey-meta.md per luke-reference § Template for "
                             ".survey-meta.md"))
        return meta

    meta = _parse_meta(meta_path)
    FIELD_FORMAT = {
        "commit": "`**Commit:** <git-sha>`",
        "date": "`**Date:** <ISO-8601 timestamp>`",
        "files_produced": "`**Files produced:**` on its own line, then one `- <file.md>` bullet per artifact",
        "change_triggers": "`## Change Triggers` heading followed by a `| File pattern | ... |` table",
    }
    for field, present in (("commit", meta["commit"]), ("date", meta["date"]),
                           ("files_produced", meta["files_produced"]),
                           ("change_triggers", meta["has_change_triggers"])):
        if not present:
            issues.append(_issue(f"meta-field-missing:{field}",
                                 f".survey-meta.md is missing the {field} field/table",
                                 f"expected format: {FIELD_FORMAT[field]} "
                                 "(luke-reference § Template for .survey-meta.md)"))
    if meta["commit"]:
        if _git(repo_root, "cat-file", "-e", f"{meta['commit']}^{{commit}}") is None:
            issues.append(_issue("meta-commit-unknown",
                                 f"commit {meta['commit']} is not in this repo's history",
                                 "survey meta is stale or history was rewritten — "
                                 "re-survey (full S1-S5)"))
        else:
            behind = _git(repo_root, "rev-list", "--count", f"{meta['commit']}..HEAD")
            meta["behind"] = int(behind) if behind is not None and behind.isdigit() else -1
        for name in meta["files_produced"]:
            if not (codebase_dir / name).is_file():
                issues.append(_issue("files-produced-missing",
                                     f"{name} listed in Files produced but absent on disk",
                                     "restore the file or correct the Files produced list",
                                     artifact=name))

    index_path = codebase_dir / "index.md"
    if index_path.is_file():
        index_text = index_path.read_text(encoding="utf-8")
        for md in sorted(codebase_dir.glob("*.md")):
            if md.name in ("index.md",) or md.name.startswith("."):
                continue
            if md.name not in index_text:
                issues.append(_issue("index-missing-link",
                                     f"index.md does not link {md.name}",
                                     "add the artifact to the index hub", artifact=md.name))
    return meta


# ---------------------------------------------------------------- reconcile

def _reconcile(repo_root):
    plan = []

    def row(asset, exists, action):
        plan.append({"asset": asset, "exists": exists, "action": action})

    claude_l = repo_root / ".claude" / "CLAUDE.md"
    if claude_l.is_file():
        text = claude_l.read_text(encoding="utf-8")
        if "## Architecture" in text:
            ok_ptr = ".claude/codebase" in text.split("## Architecture", 1)[1][:2000]
            row(".claude/CLAUDE.md", True,
                "keep — Architecture section points at .claude/codebase/" if ok_ptr
                else "fix stale Architecture pointer (must reference .claude/codebase/)")
        else:
            row(".claude/CLAUDE.md", True,
                "inject Architecture section only; preserve all other content")
    else:
        row(".claude/CLAUDE.md", False,
            "generate .claude/CLAUDE.md — identity + Architecture pointer + AI Context "
            "Protocol only (facts live in .claude/codebase/, per luke-reference § S5 content policy)")

    row("CLAUDE.md (root)", (repo_root / "CLAUDE.md").is_file(),
        "leave untouched; record any conflict with .claude/CLAUDE.md in survey findings"
        if (repo_root / "CLAUDE.md").is_file() else "—")

    codebase_dir = repo_root.joinpath(*CODEBASE_PARTS)
    cb_files = [p for p in codebase_dir.rglob("*") if p.is_file()] \
        if codebase_dir.is_dir() else []
    row(".claude/codebase/", bool(cb_files),
        "read each file; reconcile with survey — preserve accurate content, update stale "
        "sections" if cb_files else "full survey write (empty/missing)")

    legacy = repo_root / "aidlc-docs"
    row("aidlc-docs/ (legacy root)", legacy.is_dir(),
        "run $UB luke-migrate --repo-root <repo-root> — staged, review plan with user first"
        if legacy.is_dir() else "—")

    porcelain = _git(repo_root, "status", "--porcelain", "--untracked-files=all",
                     "--", ".claude/codebase")
    untracked = [ln[3:] for ln in (porcelain or "").splitlines()
                 if ln.startswith("??")] if porcelain is not None else []
    row(".claude/codebase/ untracked remnants", bool(untracked),
        f"merge {len(untracked)} untracked file(s) into the tracked tree; warn the user "
        f"the content may be stale" if untracked else "—")

    local_skill = repo_root / ".claude" / "skills" / "luke" / "SKILL.md"
    row(".claude/skills/luke/SKILL.md", local_skill.is_file(),
        "re-generate from updated artifacts after S4"
        if local_skill.is_file() else "generated by survey-finalize (S5)")
    return plan


# ---------------------------------------------------------------- handle

def handle(v):
    repo_root = Path(v["--repo-root"])
    op = v.get("--op") or "all"
    if op not in ("validate", "reconcile", "all"):
        raise UsageError(f"unknown --op {op!r}", "use --op validate|reconcile|all")
    if not repo_root.is_dir():
        raise NotFound(f"repo root not found: {repo_root}",
                       "pass --repo-root <absolute path to the project repo>")
    if _git(repo_root, "rev-parse", "--git-dir") is None:
        raise Precondition(f"{repo_root} is not a git repository",
                           "survey audits require git (commit resolution, untracked scan)")

    codebase_dir = repo_root.joinpath(*CODEBASE_PARTS)
    out = {}
    if op in ("validate", "all"):
        issues = []
        meta = _validate(repo_root, codebase_dir, issues)
        out["status"] = "valid" if not issues else "invalid"
        out["issues"] = issues
        out["meta"] = meta
    if op in ("reconcile", "all"):
        out["reconcile"] = {"plan": _reconcile(repo_root)}
    if op == "reconcile":
        out["status"] = "planned"
    return out


TOOL = Tool(
    name="survey-validate",
    version="1.0",
    summary="Validate Luke survey output (S4 gates: artifacts, sidecars, .survey-meta.md fields, index links) and build the S1 reconciliation plan. Read-only.",
    flags={
        "--repo-root": {"required": True, "type": "path",
                        "description": "Project repo root (must be a git repository)."},
        "--op": {"required": False, "type": "choice", "choices": ["validate", "reconcile", "all"],
                 "default": "all",
                 "description": "validate = structural gates; reconcile = S1 asset audit plan; all = both."},
    },
    exit_codes={
        "0": "audit ran — status valid|invalid (validate/all) or planned (reconcile); issues[]/plan[] are the answer",
        "1": "usage/validation error (bad/unknown flag, bad --op)",
        "3": "precondition: repo root is not a git repository",
        "4": "not_found: --repo-root does not exist",
    },
    examples=[
        "$UB survey-validate --repo-root /path/to/repo --op reconcile   # Luke S1",
        "$UB survey-validate --repo-root /path/to/repo --op validate   # Luke S4 gate",
    ],
    idempotent="Read-only audits; re-running gives the same result for the same repo state. Writes nothing, no audit line.",
    base_default=Path(__file__).resolve().parent.parent,
)


if __name__ == "__main__":
    TOOL.run(handle)
