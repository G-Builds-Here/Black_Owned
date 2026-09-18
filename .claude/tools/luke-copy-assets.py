#!/usr/bin/env python3
"""luke-copy-assets.py — Copy Luke's global assets into a repo's .claude/ directory.

Makes the repo self-contained — no runtime dependency on the user's ~/.claude/.
Run this as part of S4 after luke-repo-init has scaffolded .claude/.

Capability gating: integrations are per-repo and orthogonal (a GitHub repo may
use Jira; a Bitbucket repo may not). Each gated asset ships only when the repo
profile carries the capability. The profile is auto-detected (git remote for
github/bitbucket, project manifests for languages, markers for jira), persisted
to .claude/repo-profile.json, and merged with manual edits on every run.
Override for one run: --capabilities github,jira (exact set; languages stay
auto-detected).

Audit/prune: --audit compares what is in the repo's .claude/ against the gated
manifest (report-only — unknown files are never auto-deleted). --prune deletes
(a) manifest assets the profile now excludes and (b) legacy destinations older
copies shipped but the current manifest dropped.

Contract:  python luke-copy-assets.py --help   (JSON)
Standard:  references/tooling-standards.md

Usage (flags only):
    $UB luke-copy-assets --repo-root <repo-root>
    $UB luke-copy-assets --repo-root <repo-root> --dry-run
    $UB luke-copy-assets --repo-root <repo-root> --capabilities github,jira
    $UB luke-copy-assets --repo-root <repo-root> --audit
    $UB luke-copy-assets --repo-root <repo-root> --audit --prune

Exit codes: 0 copied/audited (audit_clean flag in payload) · 1 usage/validation
            · 3 precondition (manifest sources missing under base)
            · 4 not found (repo root)
"""

import json
import shutil
import subprocess
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
    ("agents/luke-context.md", [
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
    ("tools/survey-validate.py",            "tools/survey-validate.py"),
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

    # Credential + Jira/Bitbucket toolchain — capability-gated below. Repo
    # ub.sh resolves tools repo-locally, so any tool a copied skill dispatches
    # must ship with it — gates keep skill and tool sets consistent.
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
    ("agents/luke-context.md",                       "agents/luke-context.md"),

    # Luke skill (global template — S5 patches in repo-specific content after copy)
    ("skills/luke/SKILL.md",                  "skills/luke/SKILL.md"),

    # References (alfred-reference.md dropped: Jira-centric, and the copied
    # jira-usage skill intentionally carries its templates inline)
    ("references/luke-reference.md",         "references/luke-survey.md"),
    ("references/luke-manifest.md",          "references/luke-manifest.md"),
    ("references/claude-rules.md",           "references/claude-rules.md"),

    # Skills — non-pipeline utilities (onepassword-setup excluded: personal credential setup)
    ("skills/handoff-discipline/SKILL.md",   "skills/handoff-discipline/SKILL.md"),
    ("skills/jira-usage/SKILL.md",           "skills/jira-usage/SKILL.md"),
    ("skills/pr-management/SKILL.md",        "skills/pr-management/SKILL.md"),
]

# src_rel -> set of capability names; the asset ships only if the repo profile
# carries ANY of them. Integrations are orthogonal: github does not imply
# "no jira" and vice versa — hence separate probes, never one platform label.
CAPABILITY_GATES = {
    "tools/read-cred.py": {"jira", "bitbucket"},
    "tools/cred_crypto.py": {"jira", "bitbucket"},
    "tools/confirm-passphrase.py": {"jira", "bitbucket"},
    "tools/build-adf-json.py": {"jira"},
    "tools/jira-fetch.py": {"jira"},
    "tools/jira-write.py": {"jira"},
    "tools/jira-attach-file.py": {"jira"},
    "tools/post-jira-comment.py": {"jira"},
    "tools/bb-fetch.py": {"bitbucket"},
    "tools/bb-post-comment.py": {"bitbucket"},
    "tools/fetch-bb-comments.py": {"bitbucket"},
    "tools/classify-pr-comments.py": {"bitbucket"},
    "tools/post-bb-reply.py": {"bitbucket"},
    "skills/jira-usage/SKILL.md": {"jira"},
    "skills/pr-management/SKILL.md": {"bitbucket"},
    "tools/pre-scan-rust.py": {"rust"},
    "tools/c4-rust-parser/Cargo.toml": {"rust"},
    "tools/c4-rust-parser/src/main.rs": {"rust"},
}

# Destinations that older copies shipped but the current manifest dropped.
# --prune deletes these from repo copies; --audit lists them as `legacy`.
LEGACY_DESTS = ["references/alfred-reference.md"]

# Files/dirs under repo .claude/ that copy-assets does not own but must not
# flag in --audit (repo-init/finalize output, repo-owned config, user trees).
AUDIT_ALLOW = {
    "CLAUDE.md", ".gitignore", ".gitkeep", "settings.json", "settings.local.json",
    "repo-profile.json", "scheduled_tasks.lock",
    "agents/luke.md",
    "hooks/luke-staleness-check.py", "hooks/luke-edit-staleness-check.py",
    "hooks/luke-auto-index-check.py",
    "memory/.gitkeep", "handoffs/session/.gitkeep",
}
AUDIT_ALLOW_DIRS = {
    "codebase", "memory", "handoffs", "tmp", "backups", "plans", "__pycache__",
    "construction", "planning", "application-design", "requirements",
}


def _git(repo_root, *args):
    try:
        r = subprocess.run(["git", "-C", str(repo_root), *args],
                           capture_output=True, text=True, timeout=10)
        return (r.stdout or "").strip()
    except Exception:
        return ""


def detect_profile(repo_root: Path, overrides=None):
    """Independent per-repo probes. Returns (capabilities, languages, sources).

    capabilities: github | bitbucket | jira   (orthogonal — a repo can have several)
    languages:    typescript | javascript | rust | dotnet | python
    Manual additions win via .claude/repo-profile.json `capabilities`/`languages`
    (union). --capabilities overrides the capability set exactly for one run.
    """
    caps, langs, sources = set(), set(), {}

    remote = _git(repo_root, "remote", "get-url", "origin").lower()
    caps_github = "github.com" in remote or (repo_root / ".github").is_dir()
    caps_bitbucket = "bitbucket" in remote or (repo_root / "bitbucket-pipelines.yml").exists()
    # Jira is invisible to git remotes: opt-in via marker files only.
    caps_jira = any((repo_root / p).exists() for p in
                    (".jira-cli.json", ".jira", ".claude/jira-config.json"))
    if caps_github:
        caps.add("github")
        sources["github"] = "git remote / .github/"
    if caps_bitbucket:
        caps.add("bitbucket")
        sources["bitbucket"] = "git remote / bitbucket-pipelines.yml"
    if caps_jira:
        caps.add("jira")
        sources["jira"] = "marker file"

    pkg = repo_root / "package.json"
    if pkg.exists():
        langs.add("javascript")
        sources["javascript"] = "package.json"
        try:
            pj = json.loads(pkg.read_text(encoding="utf-8"))
            deps = {**pj.get("dependencies", {}), **pj.get("devDependencies", {})}
            if "typescript" in deps or (repo_root / "tsconfig.json").exists():
                langs.add("typescript")
                sources["typescript"] = "package.json/tsconfig.json"
        except Exception:
            pass
    def _has(glob_pat, depth=3):
        for d in range(depth + 1):
            base = repo_root if d == 0 else None
            pattern = "/".join(["*"] * d + [glob_pat]) if d else glob_pat
            if any(repo_root.glob(pattern)):
                return True
        return False
    if _has("Cargo.toml", 2):
        langs.add("rust")
        sources["rust"] = "Cargo.toml"
    if _has("*.csproj", 3) or _has("*.sln", 2):
        langs.add("dotnet")
        sources["dotnet"] = "csproj/sln"
    if (repo_root / "pyproject.toml").exists() or (repo_root / "requirements.txt").exists():
        langs.add("python")
        sources["python"] = "pyproject.toml/requirements.txt"

    # Merge manual profile file (union — manual additions win).
    pf = repo_root / ".claude" / "repo-profile.json"
    if pf.exists():
        try:
            data = json.loads(pf.read_text(encoding="utf-8"))
            caps |= set(data.get("capabilities", []))
            langs |= set(data.get("languages", []))
            for c in data.get("capabilities", []):
                sources[c] = "repo-profile.json"
        except Exception:
            pass

    if overrides:
        caps = set(overrides)
        sources["capabilities_override"] = ",".join(sorted(caps))

    return caps, langs, sources


def ships(src_rel: str, profile_set: set) -> bool:
    """Does this manifest asset ship given the repo profile?

    profile_set = capabilities | languages — gates may name an integration
    (jira, bitbucket) or a language (rust); both live in one match space.
    """
    need = CAPABILITY_GATES.get(src_rel)
    return need is None or bool(need & profile_set)


def write_profile(dot_claude: Path, capabilities: set, languages: set, sources: dict):
    """Persist the profile so the repo (and future runs) can read it."""
    dot_claude.mkdir(parents=True, exist_ok=True)
    (dot_claude / "repo-profile.json").write_text(
        json.dumps({"capabilities": sorted(capabilities),
                    "languages": sorted(languages),
                    "detected_from": sources}, indent=2) + "\n",
        encoding="utf-8")


def handle(v):
    repo_root = Path(v["--repo-root"]).resolve()
    if not repo_root.exists():
        raise NotFound(
            f"repo root not found: {repo_root}",
            "pass an existing repository directory: $UB luke-copy-assets --repo-root <repo-root>",
        )

    dry_run = bool(v.get("--dry-run", False))
    audit_only = bool(v.get("--audit", False))
    prune = bool(v.get("--prune", False))
    overrides = None
    if v.get("--capabilities"):
        overrides = [c.strip().lower() for c in v["--capabilities"].split(",") if c.strip()]
    base = Path(v["--base"])
    dot_claude = repo_root / ".claude"

    capabilities, languages, sources = detect_profile(repo_root, overrides)
    profile_set = capabilities | languages  # gates match either space

    # ---- profile-only: refresh .claude/repo-profile.json, copy nothing ------
    if bool(v.get("--profile-only", False)):
        if not dry_run:
            write_profile(dot_claude, capabilities, languages, sources)
            audit_append(base, "luke-copy-assets", "profile", key=str(repo_root),
                         result="profile_only")
        return {"status": "dry_run" if dry_run else "profile_only",
                "capabilities": sorted(capabilities),
                "languages": sorted(languages),
                "profile": str(dot_claude / "repo-profile.json"),
                "dry_run": dry_run}

    # ---- audit mode: compare repo .claude/ against the gated manifest -------
    if audit_only:
        expected = {d for s, d in MANIFEST if ships(s, profile_set)}
        expected |= {d for d, _c in ENSURE_FILES}
        unknown, legacy, excluded_present = [], [], []
        for dst in LEGACY_DESTS:
            if (dot_claude / dst).exists():
                legacy.append(dst)
        for p in sorted(dot_claude.rglob("*")):
            if not p.is_file():
                continue
            rel = p.relative_to(dot_claude).as_posix()
            parts = rel.split("/")
            if parts[0] in AUDIT_ALLOW_DIRS or "__pycache__" in parts:
                continue
            if rel in expected or rel in AUDIT_ALLOW:
                continue
            unknown.append(rel)
        for src_rel, dest_rel in MANIFEST:
            if not ships(src_rel, profile_set) and (dot_claude / dest_rel).exists():
                excluded_present.append(dest_rel)
        prune_targets = sorted(set(excluded_present) | set(legacy))
        deleted = []
        if prune and not dry_run:
            for dst in prune_targets:
                (dot_claude / dst).unlink(missing_ok=True)
                deleted.append(dst)
        clean = not unknown and not prune_targets
        report_lines = [f"audit of {dot_claude}",
                        f"  capabilities: {sorted(capabilities) or '(none)'}   languages: {sorted(languages) or '(none)'}"]
        for u in unknown:
            report_lines.append(f"  ? [unknown] {u} (not in gated manifest — review, not auto-deleted)")
        for e in excluded_present:
            report_lines.append(f"  - [excluded-by-profile] {e}" + (" DELETED" if e in deleted else " (prune to delete)"))
        for l in legacy:
            report_lines.append(f"  - [legacy] {l}" + (" DELETED" if l in deleted else " (prune to delete)"))
        if clean:
            report_lines.append("  clean: repo .claude/ matches the gated manifest")
        return {
            "status": "audited",
            "capabilities": sorted(capabilities),
            "languages": sorted(languages),
            "unknown": unknown,
            "excluded_present": excluded_present,
            "legacy": legacy,
            "deleted": deleted,
            "audit_clean": clean,
            "report": "\n".join(report_lines),
        }

    # ---- persist profile so the repo (and future runs) can read it ----------
    if not dry_run:
        write_profile(dot_claude, capabilities, languages, sources)

    results = []
    missing_sources = []
    skipped_gated = []

    for src_rel, dest_rel in MANIFEST:
        src = BASE_DIR / src_rel
        dest = dot_claude / dest_rel

        if not ships(src_rel, profile_set):
            if dest.exists():
                skipped_gated.append(dest_rel)
            continue

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
    shipped_dests = {d for s, d in MANIFEST if ships(s, profile_set)}
    patch_misses = []
    for src_rel, dest_rel in MANIFEST:
        if dest_rel not in patch_index or dest_rel not in shipped_dests:
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
    lines = [f"\n{prefix}luke-copy-assets", f"Source: {BASE_DIR}", f"Dest:   {dot_claude}",
             f"Profile: capabilities={sorted(capabilities) or '(none)'} languages={sorted(languages) or '(none)'}\n"]
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
    if skipped_gated:
        lines.append(f"\nSkipped {len(skipped_gated)} asset(s) left in repo from an earlier copy but excluded "
                     f"by the current profile (run --audit --prune to remove):")
        for s in skipped_gated:
            lines.append(f"  - {s}")
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
        "capabilities": sorted(capabilities),
        "languages": sorted(languages),
        "results": [{"action": action, "source": s, "dest": d} for action, s, d in results],
        "copied": copied,
        "missing": missing,
        "excluded_by_profile_present": skipped_gated,
        "patch_misses": patch_misses,
        "dry_run": dry_run,
        "report": report,
    }


# Files to create in repo if they don't already exist (no global source — repo-only)
ENSURE_FILES = [
    # Ensures handoffs/session/ directory is tracked by git
    ("handoffs/session/.gitkeep", ""),
]


TOOL = Tool(
    name="luke-copy-assets",
    version="1.4",
    summary="Copy Luke's global assets into a repo's .claude/ directory (hooks, tools, agents, references, skills), gated per repo profile (github/bitbucket/jira capabilities, languages), apply post-copy patches with miss verification, ensure repo-only files, audit/prune repo drift, and seed the profile alone (--profile-only).",
    flags={
        "--repo-root": {"required": True, "type": "path",
                        "description": "Path to the target repo root (must exist)."},
        "--dry-run": {"required": False, "type": "bool",
                      "description": "Show what would be copied without writing anything."},
        "--capabilities": {"required": False, "type": "str",
                           "description": "Exact capability set for this run, comma-separated (e.g. github,jira). Overrides detection; languages stay auto-detected."},
        "--audit": {"required": False, "type": "bool",
                    "description": "Report-only: compare repo .claude/ against the gated manifest (unknown/legacy/excluded classes). Writes nothing unless combined with --prune."},
        "--prune": {"required": False, "type": "bool",
                    "description": "With --audit: delete profile-excluded manifest assets and legacy destinations. Unknown files are never deleted."},
        "--profile-only": {"required": False, "type": "bool",
                           "description": "Detect and write .claude/repo-profile.json only — copy nothing. Seeds the initial profile for a fresh repo (used by luke-repo-init)."},
    },
    exit_codes={
        "0": "copied/audited/profile_only (audit_clean flag in payload distinguishes clean from needs-review)",
        "1": "usage or validation error",
        "3": "precondition: manifest source files missing under the base directory",
        "4": "not found: repo root does not exist",
    },
    examples=[
        "$UB luke-copy-assets --repo-root /path/to/myrepo",
        "$UB luke-copy-assets --repo-root /path/to/myrepo --dry-run",
        "$UB luke-copy-assets --repo-root /path/to/myrepo --capabilities github,jira",
        "$UB luke-copy-assets --repo-root /path/to/myrepo --audit --prune",
        "$UB luke-copy-assets --repo-root /path/to/myrepo --profile-only",
    ],
    idempotent="Re-running re-copies from the global base and re-applies patches — always syncs to latest global versions on re-survey. Profile file is rewritten each run; manual capability additions are merged back in.",
    base_default=BASE_DIR,
)


if __name__ == "__main__":
    TOOL.run(handle)
