#!/usr/bin/env python3
"""luke-copy-assets.py — Copy Luke's global assets into a repo's .claude/ directory.

Makes the repo self-contained — no runtime dependency on the user's ~/.claude/.
Run this as part of S4 after luke-repo-init has scaffolded .claude/.

Copies:
  hooks/      py.sh, ub.sh (glue scripts Luke's toolchain depends on)
  tools/      the full repo-local toolchain the copied luke skill dispatches:
              toolkit, utility-belt (ub.sh dispatcher), make-handoff,
              read-handoff, read-reference, luke-repo-init, luke-copy-assets,
              luke-migrate, survey-prep, survey-finalize, write-sidecars,
              generate-artifact-skeletons, pre-scan, pre-scan-rust,
              c4-extract, c4-render, c4-navigator (+c4-rust-parser sources),
              check-survey-staleness, check-unused-deps,
              find-helper-duplication, map-token-usage, luke-project-include
  tools/      credential + PR/Jira toolchain dispatched by the copied
              utility skills: read-cred, confirm-passphrase, cred_crypto,
              jira-fetch, jira-write, jira-attach-file, post-jira-comment,
              build-adf-json, bb-fetch, bb-post-comment, fetch-bb-comments,
              classify-pr-comments, post-bb-reply. Credentials are personal —
              the cred tools are re-anchored to the developer's global
              ~/.claude/assets/creds after copy (POST_COPY_PATCHES);
              sync-1pass-creds.py stays global-only.
  agents/     luke.md
  skills/     luke/SKILL.md (repo-specific content written by Luke S5, not this script)
  references/ luke-reference.md -> luke-survey.md, luke-manifest.md,
              alfred-reference.md, claude-rules.md
  skills/     luke/SKILL.md, handoff-discipline, jira-usage, pr-management
              (onepassword-setup excluded — personal)
  handoffs/   session/.gitkeep (ensures handoff directory exists in repo)

Creates target directories if they don't exist.
Existing files are overwritten (always sync to latest global versions on re-survey).
The skills/luke/SKILL.md has repo-specific content (artifact table, commit date) so
it is written by Luke's S5 step — not overwritten by this script.

Contract:  python luke-copy-assets.py --help   (JSON)
Standard:  references/tooling-standards.md

Usage (flags only):
    $UB luke-copy-assets --repo-root <repo-root>
    $UB luke-copy-assets --repo-root <repo-root> --dry-run

Exit codes: 0 copied · 1 usage/validation · 3 precondition (manifest sources missing under base) · 4 not found (repo root)
"""

import shutil
import sys
from pathlib import Path

from toolkit import Tool, Precondition, NotFound, audit_append

BASE_DIR = Path(__file__).resolve().parent.parent

# Post-copy text patches applied to specific dest files after copying.
# These fix global-context references (bash ~/.claude/...) that are correct
# in the user's global ~/.claude/ but wrong in a cloned repo's .claude/.
# Format: (dest_rel, [(old_text, new_text), ...])
POST_COPY_PATCHES = [
    ("skills/luke/SKILL.md", [
        # Fix UB path — global uses ~/.claude/, repo uses .claude/
        ("bash ~/.claude/hooks/ub.sh", "bash .claude/hooks/ub.sh"),
        # Fix reference filename — repo has luke-survey.md, not luke-reference.md
        ("luke-reference.md", "luke-survey.md"),
    ]),
    ("agents/luke.md", [
        ("bash ~/.claude/hooks/ub.sh", "bash .claude/hooks/ub.sh"),
    ]),
    ("skills/handoff-discipline/SKILL.md", [
        ("~/.claude/handoffs/session/", ".claude/handoffs/session/"),
    ]),
    # Credential plumbing: assets/creds/ is personal (synced from each
    # developer's own 1Password) — repo copies must resolve to the user's
    # global store, since <repo>/.claude/assets/creds/ never exists.
    ("tools/read-cred.py", [
        ("_BASE_DIR = Path(__file__).resolve().parent.parent",
         '_BASE_DIR = Path.home() / ".claude"  # repo copy: personal credential store'),
    ]),
    ("tools/confirm-passphrase.py", [
        ("BASE_DIR = Path(__file__).resolve().parent.parent",
         'BASE_DIR = Path.home() / ".claude"  # repo copy: personal credential store'),
    ]),
    ("tools/cred_crypto.py", [
        ("_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))",
         '_BASE_DIR = os.path.join(os.path.expanduser("~"), ".claude")  # repo copy: personal credential store'),
    ]),
]

MANIFEST = [
    # (source relative to BASE_DIR, dest relative to repo/.claude/)

    # Hooks — glue scripts the entire Luke toolchain depends on
    ("hooks/py.sh",                          "hooks/py.sh"),
    ("hooks/ub.sh",                          "hooks/ub.sh"),
    ("hooks/luke-session-start.py",          "hooks/luke-session-start.py"),

    # Tools — UB dispatcher + pipeline tools + survey scripts
    ("tools/toolkit.py",                  "tools/toolkit.py"),
    ("tools/utility-belt.py",               "tools/utility-belt.py"),
    ("tools/make-handoff.py",               "tools/make-handoff.py"),
    ("tools/read-handoff.py",               "tools/read-handoff.py"),
    ("tools/read-reference.py",             "tools/read-reference.py"),
    ("tools/luke-repo-init.py",             "tools/luke-repo-init.py"),
    ("tools/luke-copy-assets.py",           "tools/luke-copy-assets.py"),
    ("tools/luke-migrate.py",               "tools/luke-migrate.py"),
    ("tools/survey-prep.py",                "tools/survey-prep.py"),
    ("tools/survey-finalize.py",            "tools/survey-finalize.py"),
    ("tools/write-sidecars.py",             "tools/write-sidecars.py"),
    ("tools/pre-scan.py",                    "tools/pre-scan.py"),
    ("tools/pre-scan-rust.py",               "tools/pre-scan-rust.py"),
    ("tools/c4-extract.py",                  "tools/c4-extract.py"),
    ("tools/c4-render.py",                   "tools/c4-render.py"),
    ("tools/c4-navigator.py",                "tools/c4-navigator.py"),
    ("tools/c4-rust-parser/Cargo.toml",      "tools/c4-rust-parser/Cargo.toml"),
    ("tools/c4-rust-parser/src/main.rs",     "tools/c4-rust-parser/src/main.rs"),
    ("tools/check-survey-staleness.py",      "tools/check-survey-staleness.py"),
    ("tools/check-unused-deps.py",           "tools/check-unused-deps.py"),
    ("tools/find-helper-duplication.py",     "tools/find-helper-duplication.py"),
    ("tools/map-token-usage.py",             "tools/map-token-usage.py"),
    ("tools/luke-project-include.py",        "tools/luke-project-include.py"),
    ("tools/generate-artifact-skeletons.py", "tools/generate-artifact-skeletons.py"),

    # Credential + PR/Jira toolchain the copied utility skills dispatch
    # (jira-usage, pr-management). Repo ub.sh resolves tools repo-locally —
    # any tool a copied skill dispatches must ship here, or it fails at runtime.
    ("tools/read-cred.py",                   "tools/read-cred.py"),
    ("tools/cred_crypto.py",                 "tools/cred_crypto.py"),
    ("tools/confirm-passphrase.py",          "tools/confirm-passphrase.py"),
    ("tools/build-adf-json.py",              "tools/build-adf-json.py"),
    ("tools/jira-fetch.py",                  "tools/jira-fetch.py"),
    ("tools/jira-write.py",                  "tools/jira-write.py"),
    ("tools/jira-attach-file.py",            "tools/jira-attach-file.py"),
    ("tools/post-jira-comment.py",           "tools/post-jira-comment.py"),
    ("tools/bb-fetch.py",                    "tools/bb-fetch.py"),
    ("tools/bb-post-comment.py",             "tools/bb-post-comment.py"),
    ("tools/fetch-bb-comments.py",           "tools/fetch-bb-comments.py"),
    ("tools/classify-pr-comments.py",        "tools/classify-pr-comments.py"),
    ("tools/post-bb-reply.py",               "tools/post-bb-reply.py"),

    # Agents
    ("agents/luke.md",                       "agents/luke.md"),

    # Luke skill (global template — S5 patches in repo-specific content after copy)
    ("skills/luke/SKILL.md",                  "skills/luke/SKILL.md"),

    # References
    ("references/luke-reference.md",         "references/luke-survey.md"),
    ("references/luke-manifest.md",          "references/luke-manifest.md"),
    ("references/alfred-reference.md",       "references/alfred-reference.md"),
    ("references/claude-rules.md",           "references/claude-rules.md"),

    # Skills — non-pipeline utilities (onepassword-setup excluded: personal credential setup)
    ("skills/handoff-discipline/SKILL.md",   "skills/handoff-discipline/SKILL.md"),
    ("skills/jira-usage/SKILL.md",           "skills/jira-usage/SKILL.md"),
    ("skills/pr-management/SKILL.md",        "skills/pr-management/SKILL.md"),
]

# Files to create in repo if they don't already exist (no global source — repo-only)
ENSURE_FILES = [
    # Ensures handoffs/session/ directory is tracked by git
    ("handoffs/session/.gitkeep", ""),
]


def handle(v):
    repo_root = Path(v["--repo-root"]).resolve()
    if not repo_root.exists():
        raise NotFound(
            f"repo root not found: {repo_root}",
            "pass an existing repository directory: $UB luke-copy-assets --repo-root <repo-root>",
        )

    dry_run = bool(v.get("--dry-run", False))
    base = Path(v["--base"])
    dot_claude = repo_root / ".claude"

    results = []
    missing_sources = []

    for src_rel, dest_rel in MANIFEST:
        src = BASE_DIR / src_rel
        dest = dot_claude / dest_rel

        if not src.exists():
            missing_sources.append(str(src))
            results.append(("missing", src_rel, dest_rel))
            continue

        if not dry_run:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)

        action = "copy" if not dest.exists() or dry_run else "update"
        results.append((action, src_rel, dest_rel))

    # Apply post-copy patches — fix global-path references in copied text files.
    # Verify mode: every patch's old_text must be found; misses are reported as
    # patch_misses (a silently-missed patch reintroduces global paths into the
    # repo copy — the exact bug class this guards).
    patch_index = {dest_rel: patches for dest_rel, patches in POST_COPY_PATCHES}
    patch_misses = []
    for src_rel, dest_rel in MANIFEST:
        if dest_rel not in patch_index:
            continue
        if dry_run:
            # verify against the global source — dry-run hasn't written dest yet
            text_file = BASE_DIR / src_rel
        else:
            text_file = dot_claude / dest_rel
        if text_file.exists():
            text = text_file.read_text(encoding="utf-8")
            for old, new in patch_index[dest_rel]:
                if old not in text:
                    patch_misses.append({"file": dest_rel, "expected": old[:70]})
                    continue
                text = text.replace(old, new)
            if not dry_run:
                text_file.write_text(text, encoding="utf-8")
                results.append(("patch", dest_rel, dest_rel))

    # Ensure repo-only files (no global source)
    for dest_rel, content in ENSURE_FILES:
        dest = dot_claude / dest_rel
        if not dest.exists():
            if not dry_run:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(content, encoding="utf-8")
            results.append(("ensure", dest_rel, dest_rel))

    copied = sum(1 for a, _, _ in results if a in ("copy", "update", "ensure"))
    missing = len(missing_sources)

    prefix = "[DRY RUN] " if dry_run else ""
    lines = [f"\n{prefix}luke-copy-assets", f"Source: {BASE_DIR}", f"Dest:   {dot_claude}\n"]
    icons = {"copy": "+", "update": "~", "missing": "!", "ensure": "+", "patch": "p"}
    for action, src_rel, dest_rel in results:
        if action == "ensure":
            label = f".claude/{dest_rel} (repo-only)"
        elif src_rel != dest_rel:
            label = f"{src_rel} -> .claude/{dest_rel}"
        else:
            label = f".claude/{dest_rel}"
        lines.append(f"  {icons[action]} [{action}] {label}")
    lines.append(f"\nDone: {copied} copied" + (f", {missing} missing" if missing else "") + ".")
    if patch_misses:
        lines.append(f"\nWARN: {len(patch_misses)} post-copy patch(es) did not match -- "
                     "copied file may still carry global-context paths:")
        for pm in patch_misses:
            lines.append(f"  p [MISS] {pm['file']}: {pm['expected']}")
    if missing_sources:
        lines.append("\nMissing source files (not copied):")
        for m in missing_sources:
            lines.append(f"  ! {m}")
    report = "\n".join(lines)

    if missing_sources:
        raise Precondition(
            f"{missing} manifest source files missing under {BASE_DIR} — not copied: "
            + "; ".join(sorted(missing_sources)),
            f"restore the missing global files under {BASE_DIR} (git restore ~/.claude or re-clone), "
            f"then re-run: $UB luke-copy-assets --repo-root {repo_root}",
        )

    if not dry_run:
        audit_append(base, "luke-copy-assets", "copy", key=str(repo_root), result="copied")

    return {
        "status": "dry_run" if dry_run else "copied",
        "source": str(BASE_DIR),
        "destination": str(dot_claude),
        "results": [{"action": action, "source": s, "dest": d} for action, s, d in results],
        "copied": copied,
        "missing": missing,
        "patch_misses": patch_misses,
        "dry_run": dry_run,
        "report": report,
    }


TOOL = Tool(
    name="luke-copy-assets",
    version="1.2",
    summary="Copy Luke's global assets into a repo's .claude/ directory (hooks, tools incl. the credential/PR/Jira toolchain, agents, references, skills), apply post-copy patches with miss verification, and ensure repo-only files.",
    flags={
        "--repo-root": {"required": True, "type": "path",
                        "description": "Path to the target repo root (must exist)."},
        "--dry-run": {"required": False, "type": "bool",
                      "description": "Show what would be copied without writing anything."},
    },
    exit_codes={
        "0": "copied (or dry-run reported) — payload carries per-file results and counts",
        "1": "usage or validation error",
        "3": "precondition: manifest source files missing under the base directory",
        "4": "not found: repo root does not exist",
    },
    examples=[
        "$UB luke-copy-assets --repo-root /path/to/myrepo",
        "$UB luke-copy-assets --repo-root /path/to/myrepo --dry-run",
    ],
    idempotent="Re-running re-copies from the global base and re-applies patches — always syncs to latest global versions on re-survey.",
    base_default=BASE_DIR,
)


if __name__ == "__main__":
    TOOL.run(handle)
