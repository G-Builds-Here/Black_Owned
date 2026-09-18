#!/usr/bin/env python3
"""
luke-migrate.py — Migrate a repo's legacy aidlc-docs/ tree to .claude/codebase/.

Codifies the Luke S1 lazy-migration: git mv the legacy tree (preserving
structure), merge with any untracked remnants, repoint repo-local hooks and
config at the new path, strip the legacy .gitignore rule, rewrite in-document
path pointers, regenerate the index.md hub, and refresh repo-local assets via
luke-copy-assets. Everything is staged, NOTHING is committed — the user
reviews with `git diff --cached`.

Legacy audit.md (the dead AIDLC event log) is handled per --legacy-audit:
  archive (default) — move to .claude/backups/aidlc-audit-archive.md (untracked)
  keep    — move to .claude/audit.md (stays tracked)
  delete  — remove

Contract:  python luke-migrate.py --help   (JSON)
Standard:  references/tooling-standards.md

Exit codes: 0 migrated / housekeeping_only / already_migrated ·
            4 not_found (repo not scaffolded — no .claude/) · 1 usage error
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

from toolkit import Tool, NotFound, audit_append, Conflict

BASE_DIR = Path(__file__).resolve().parent.parent

# legacy subtree -> destination dir name. Project docs (planning, requirements,
# application-design, construction) land at the .claude/ TOP level —
# .claude/codebase/ is reserved for generated survey artifacts only.
DIR_MAP = [
    ("inception/reverse-engineering", None),   # merge into codebase root
    ("inception/planning", "planning"),
    ("inception/requirements", "requirements"),
    ("inception/application-design", "application-design"),
    ("construction", "construction"),
]
TOP_LEVEL_DIRS = {"planning", "requirements", "application-design", "construction"}
LEFT_BEHIND = ["operations"]  # AIDLC-scaffold-only; nothing lives here that we write

PATH_MAP = [
    ("aidlc-docs/inception/reverse-engineering", ".claude/codebase"),
    ("aidlc-docs/inception/planning", ".claude/planning"),
    ("aidlc-docs/inception/requirements", ".claude/requirements"),
    ("aidlc-docs/inception/application-design", ".claude/application-design"),
    ("aidlc-docs/construction", ".claude/construction"),
    ("aidlc-docs/audit.md", ".claude/backups/aidlc-audit-archive.md"),
    ("aidlc-docs", ".claude/codebase"),
]


def run(cmd, cwd):
    try:
        return subprocess.run([str(c) for c in cmd], cwd=str(cwd),
                              capture_output=True, text=True)
    except OSError:
        return None


def git(args, cwd):
    return run(["git"] + list(args), cwd)


def tracked_files(cwd, path):
    out = git(["ls-files", "--", path], cwd)
    if out is None or out.returncode != 0 or not out.stdout.strip():
        return []
    return out.stdout.splitlines()


def move_dir(repo, src, dest_dir, dry):
    """Move src directory into dest_dir. Returns (tracked, untracked, conflicts)."""
    tracked = untracked = conflicts = 0
    dest_dir.mkdir(parents=True, exist_ok=True)
    # pathspecs must be repo-relative — absolute Windows paths match nothing
    src_rel = src.relative_to(repo).as_posix()
    prefix = src_rel + "/"
    conflicted = set()
    for rel in tracked_files(repo, src_rel):
        if not rel.startswith(prefix):
            continue
        target_rel = (dest_dir / rel[len(prefix):]).relative_to(repo).as_posix()
        if (repo / target_rel).exists():
            conflicts += 1
            conflicted.add(str(repo / rel))
            continue
        if not dry:
            (repo / target_rel).parent.mkdir(parents=True, exist_ok=True)
            git(["mv", rel, target_rel], repo)
        tracked += 1
    # leftovers = untracked files that did not ride a directory rename
    if src.is_dir():
        for p in sorted(src.rglob("*")):
            if not p.is_file() or str(p) in conflicted:
                continue
            target = dest_dir / p.relative_to(src)
            if target.exists():
                conflicts += 1
                conflicted.add(str(p))
                continue
            if not dry:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(p), str(target))
                git(["add", "--", target.relative_to(repo).as_posix()], repo)
            untracked += 1
    return tracked, untracked, conflicts


def handle(v):
    repo = Path(v["--repo-root"]).resolve()
    dry = bool(v.get("--dry-run"))
    policy = v.get("--legacy-audit") or "archive"
    dot = repo / ".claude"
    legacy = repo / "aidlc-docs"
    dest = dot / "codebase"

    if not dot.is_dir():
        raise NotFound(
            f"{repo} has no .claude/ scaffold",
            "run $UB luke-repo-init --repo-root <repo> first",
        )

    report = {
        "status": None, "repo_root": repo.as_posix(), "dry_run": dry,
        "moved": {"tracked": 0, "untracked": 0}, "merge_conflicts": [],
        "left_behind": [], "legacy_audit_log": None,
        "gitignore_cleaned": False, "hooks_patched": [],
        "session_flag_removed": False, "pointers_rewritten": {},
        "index_regenerated": False, "assets_refreshed": None,
        "note": "All changes are staged, not committed — review with `git diff --cached`.",
    }

    # ---- 1. move legacy tree --------------------------------------------
    if legacy.is_dir():
        dest.mkdir(parents=True, exist_ok=True)
        for rel_src, sub in DIR_MAP:
            src = legacy / rel_src
            if not src.is_dir():
                continue
            if sub in TOP_LEVEL_DIRS:
                target_dir = dot / sub          # project docs -> .claude/ top level
            elif sub:
                target_dir = dest / sub
            else:
                target_dir = dest               # reverse-engineering merges into codebase root
            t, u, c = move_dir(repo, src, target_dir, dry)
            report["moved"]["tracked"] += t
            report["moved"]["untracked"] += u
            if c:
                report["merge_conflicts"].append({"dir": rel_src, "skipped_existing": c})
        # legacy audit event log
        audit = legacy / "audit.md"
        if audit.exists():
            if dry:
                report["legacy_audit_log"] = f"{policy} (dry-run)"
            elif policy == "delete":
                if tracked_files(repo, "aidlc-docs/audit.md"):
                    git(["rm", "-f", "aidlc-docs/audit.md"], repo)
                elif audit.exists():
                    audit.unlink()
                report["legacy_audit_log"] = "deleted"
            else:
                target = (dot / "backups" / "aidlc-audit-archive.md"
                          if policy == "archive" else dot / "audit.md")
                target.parent.mkdir(parents=True, exist_ok=True)
                target_rel = target.relative_to(repo).as_posix()
                was_tracked = bool(tracked_files(repo, "aidlc-docs/audit.md"))
                if was_tracked:
                    git(["mv", "-f", "aidlc-docs/audit.md", target_rel], repo)
                    if policy == "archive":
                        # untrack: backups/ is gitignored — local archive only
                        git(["rm", "--cached", "--", target_rel], repo)
                else:
                    audit.rename(target)
                report["legacy_audit_log"] = f"archived to {target.as_posix()}" \
                    if policy == "archive" else f"kept at {target.as_posix()}"
            if policy == "archive" and not dry:
                (dot / "backups").mkdir(exist_ok=True)
        # unknown strays -> codebase root; known dead dirs -> left behind
        if legacy.is_dir():
            for item in sorted(legacy.iterdir()):
                if item.name in LEFT_BEHIND:
                    report["left_behind"].append(item.name)
                    continue
                if item.is_file():
                    target = dest / item.name
                    if target.exists():
                        report["merge_conflicts"].append({"file": item.name})
                    elif not dry:
                        if tracked_files(repo, f"aidlc-docs/{item.name}"):
                            git(["mv", "-f", f"aidlc-docs/{item.name}",
                                 target.relative_to(repo).as_posix()], repo)
                        else:
                            item.rename(target)
                        report["moved"]["untracked"] += 1
        # prune empty dirs
        if not dry and legacy.is_dir():
            for d in sorted(legacy.rglob("*"), reverse=True):
                if d.is_dir():
                    try:
                        d.rmdir()
                    except OSError:
                        pass
            try:
                legacy.rmdir()
            except OSError:
                pass
        if legacy.exists():
            report["left_behind"].append("<non-empty remnants>")
        report["status"] = ("migrated" if (report["moved"]["tracked"]
                            or report["moved"]["untracked"]) else "remnants_only")
    else:
        report["status"] = "already_migrated"

    # ---- 2. .claude/.gitignore legacy rule ------------------------------
    gi = dot / ".gitignore"
    if gi.is_file():
        text = gi.read_text(encoding="utf-8")
        cleaned = text.replace(
            "# Legacy Lucius artifacts (migrated to aidlc-docs/ by Luke)\ncodebase/\n\n", "")
        cleaned = "\n".join(l for l in cleaned.splitlines()
                            if l.strip() != "codebase/") + "\n"
        if cleaned != text:
            if not dry:
                gi.write_text(cleaned, encoding="utf-8")
                git(["add", "--", ".claude/.gitignore"], repo)
            report["gitignore_cleaned"] = True

    # ---- 3. repo-local hooks ---------------------------------------------
    hooks_dir = dot / "hooks"
    if hooks_dir.is_dir():
        for h in sorted(hooks_dir.glob("*.py")):
            try:
                text = h.read_text(encoding="utf-8")
            except OSError:
                continue
            new = (text
                   .replace('"aidlc-docs" / "inception" / "reverse-engineering"',
                            '".claude" / "codebase"')
                   .replace("'aidlc-docs' / 'inception' / 'reverse-engineering'",
                            "'.claude' / 'codebase'")
                   .replace('"aidlc-docs" / "inception" / "reverse-engineering" / ".survey-meta.md"',
                            '".claude" / "codebase" / ".survey-meta.md"')
                   .replace("aidlc-docs/inception/reverse-engineering", ".claude/codebase"))
            if new != text:
                if not dry:
                    h.write_text(new, encoding="utf-8")
                    git(["add", "--", str(h.relative_to(repo)).replace("\\", "/")], repo)
                report["hooks_patched"].append(h.name)

    # ---- 4. session-indexed flag -----------------------------------------
    flag = dot / ".session-artifacts-indexed"
    if flag.exists():
        if not dry:
            if tracked_files(repo, ".claude/.session-artifacts-indexed"):
                git(["rm", "-f", ".claude/.session-artifacts-indexed"], repo)
            else:
                flag.unlink()
        report["session_flag_removed"] = True

    # ---- 5. in-document pointers ------------------------------------------
    doc_targets = ([p for p in dest.rglob("*.md")] if dest.is_dir() and not dry
                   else ([p for p in dest.rglob("*.md")] if dest.is_dir() else []))
    claude_mds = [dot / "CLAUDE.md"]
    if (repo / "CLAUDE.md").is_file():
        claude_mds.append(repo / "CLAUDE.md")
    for md in doc_targets + [p for p in claude_mds if p.is_file()]:
        try:
            text = md.read_text(encoding="utf-8")
        except OSError:
            continue
        if "aidlc-docs" not in text:
            continue
        audit_target = {
            "archive": ".claude/backups/aidlc-audit-archive.md",
            "keep": ".claude/audit.md",
            "delete": "the archived audit log",
        }[policy]
        new = text
        for old, repl in PATH_MAP:
            new = new.replace(old, audit_target if old == "aidlc-docs/audit.md" else repl)
        if new != text:
            if not dry:
                md.write_text(new, encoding="utf-8")
                rel = md.relative_to(repo).as_posix()
                if md == repo / "CLAUDE.md":
                    git(["add", "--", rel], repo)
            report["pointers_rewritten"][md.relative_to(repo).as_posix()] = \
                text.count("aidlc-docs")

    # ---- 6. stage the codebase tree ----------------------------------------
    if dest.is_dir() and not dry:
        git(["add", "--", ".claude/codebase"], repo)

    # ---- 7. regenerate the index hub ---------------------------------------
    if dest.is_dir() and (dest / ".survey-meta.md").exists():
        nav = Path(__file__).resolve().parent / "c4-navigator.py"
        if not dry:
            r = run([sys.executable, nav, "--directory", dest, "--force"], repo)
            report["index_regenerated"] = bool(r and r.returncode == 0)
            if report["index_regenerated"]:
                git(["add", "--", ".claude/codebase/index.md"], repo)
        else:
            report["index_regenerated"] = "planned"

    # ---- 8. refresh repo-local assets ---------------------------------------
    copier = Path(__file__).resolve().parent / "luke-copy-assets.py"
    if copier.is_file():
        if not dry:
            r = run([sys.executable, copier, "--repo-root", repo], repo)
            try:
                payload = json.loads(r.stdout)
                report["assets_refreshed"] = payload.get("copied", 0)
                git(["add", "--", ".claude/tools", ".claude/hooks",
                     ".claude/agents", ".claude/references", ".claude/skills"], repo)
            except Exception:
                report["assets_refreshed"] = "copy-assets run failed — run manually"
        else:
            report["assets_refreshed"] = "planned"

    if report["status"] == "already_migrated" and not any(
            [report["gitignore_cleaned"], report["hooks_patched"],
             report["session_flag_removed"], report["pointers_rewritten"]]):
        report["status"] = "already_migrated"
    elif report["status"] == "already_migrated":
        report["status"] = "housekeeping_only"

    if not dry:
        audit_append(BASE_DIR, "luke-migrate", "migrate", key=repo.name,
                     result=report["status"])
    return report


TOOL = Tool(
    name="luke-migrate",
    version="1.0",
    summary="Migrate a legacy root aidlc-docs/ tree to .claude/codebase/ (git mv, hook repoint, pointer rewrite, index regen, asset refresh). Stages everything; commits nothing.",
    flags={
        "--repo-root": {"required": True, "type": "path",
                        "description": "Repository root containing .claude/ (and optionally aidlc-docs/)."},
        "--dry-run": {"type": "bool",
                      "description": "Report the plan without touching the repo."},
        "--legacy-audit": {"type": "str", "default": "archive",
                           "description": "audit.md policy: archive (default, to .claude/backups/) | keep (as codebase/audit.md) | delete."},
    },
    exit_codes={
        "0": "migrated · remnants_only (only unmovable strays remain) · housekeeping_only · already_migrated (state in payload)",
        "4": "not found (no .claude/ scaffold)",
        "1": "usage or validation error",
    },
    examples=[
        "$UB luke-migrate --repo-root C:/repos/myrepo --dry-run",
        "$UB luke-migrate --repo-root C:/repos/myrepo",
    ],
    idempotent="Safe to re-run: a repo without aidlc-docs/ returns already_migrated; document pointers only rewrite when 'aidlc-docs' remains.",
    base_default=BASE_DIR,
)


if __name__ == "__main__":
    TOOL.run(handle)
