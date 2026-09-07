# Luke Asset Manifest

Complete list of everything `$UB luke-copy-assets <repo-root>` copies into a repo's `.claude/`.

Run during every Luke survey (S4) and re-survey to keep repo in sync with the global versions.
After copy, post-copy patches are applied to fix global-path references in a subset of files —
see the **Patched after copy** column.

---

## Copied Assets (29 total)

> **Generated hooks** (written by `luke-repo-init.py`, not copied from global source):
> `hooks/luke-staleness-check.py`, `hooks/luke-edit-staleness-check.py`, `hooks/luke-auto-index-check.py`

| Dest in repo `.claude/` | Source in `~/.claude/` | Patched after copy |
|------------------------|----------------------|--------------------|
| `hooks/py.sh` | `hooks/py.sh` | No |
| `hooks/ub.sh` | `hooks/ub.sh` | No |
| `hooks/luke-session-start.py` | `hooks/luke-session-start.py` | No |
| `tools/utility-belt.py` | `tools/utility-belt.py` | No |
| `tools/make-handoff.py` | `tools/make-handoff.py` | No |
| `tools/read-handoff.py` | `tools/read-handoff.py` | No |
| `tools/read-reference.py` | `tools/read-reference.py` | No |
| `tools/luke-repo-init.py` | `tools/luke-repo-init.py` | No |
| `tools/pre-scan.py` | `tools/pre-scan.py` | No |
| `tools/c4-extract.py` | `tools/c4-extract.py` | No |
| `tools/c4-render.py` | `tools/c4-render.py` | No |
| `tools/c4-navigator.py` | `tools/c4-navigator.py` | No |
| `tools/c4-rust-parser/Cargo.toml` | `tools/c4-rust-parser/Cargo.toml` | No |
| `tools/c4-rust-parser/src/main.rs` | `tools/c4-rust-parser/src/main.rs` | No |
| `tools/check-survey-staleness.py` | `tools/check-survey-staleness.py` | No |
| `tools/check-unused-deps.py` | `tools/check-unused-deps.py` | No |
| `tools/find-helper-duplication.py` | `tools/find-helper-duplication.py` | No |
| `tools/map-token-usage.py` | `tools/map-token-usage.py` | No |
| `tools/luke-project-include.py` | `tools/luke-project-include.py` | No |
| `tools/generate-artifact-skeletons.py` | `tools/generate-artifact-skeletons.py` | No |
| `agents/luke.md` | `agents/luke.md` | Yes — `bash ~/.claude/` → `bash .claude/` |
| `skills/luke/SKILL.md` | `skills/luke/SKILL.md` | Yes — global paths, ref filename, asset count |
| `references/luke-survey.md` | `references/luke-reference.md` | No |
| `references/alfred-reference.md` | `references/alfred-reference.md` | No |
| `references/claude-rules.md` | `references/claude-rules.md` | No |
| `skills/handoff-discipline/SKILL.md` | `skills/handoff-discipline/SKILL.md` | Yes — `~/.claude/handoffs/` → `.claude/handoffs/` |
| `skills/jira-usage/SKILL.md` | `skills/jira-usage/SKILL.md` | No |
| `skills/pr-management/SKILL.md` | `skills/pr-management/SKILL.md` | No |

---

## Ensured (repo-only, no global source)

| Dest in repo `.claude/` | Purpose |
|------------------------|---------|
| `handoffs/session/.gitkeep` | Ensures `handoffs/session/` is tracked by git so handoffs land in the repo |

---

## Not Copied (intentional exclusions)

| Item | Reason |
|------|--------|
| `skills/onepassword-setup/SKILL.md` | Personal credential setup — not portable across developers |
| All pipeline commands (`oracle`, `alfred`, `damian`, `gordon`, `harvey`, `bruce`, `signal`, `blackgate`) | Pipeline orchestration — intentionally global-only, not repo-portable |
| `tools/talia.py`, `tools/session-state.py`, `tools/profiler-step.py`, etc. | Pipeline-only tools — not needed for repo-local operation |

---

## Path Patch Details

These substitutions are applied in-place after copy by `luke-copy-assets.py`:

### `skills/luke/SKILL.md`
| Old (global) | New (repo) |
|---|---|
| `bash ~/.claude/hooks/ub.sh` | `bash .claude/hooks/ub.sh` |
| `luke-reference.md` | `luke-survey.md` |
| "all 10 assets…" prose | "all 25 assets…" prose |
| "all 10 assets copied" checkbox | "all 25 assets copied…" checkbox |

### `agents/luke.md`
| Old (global) | New (repo) |
|---|---|
| `bash ~/.claude/hooks/ub.sh` | `bash .claude/hooks/ub.sh` |

### `skills/handoff-discipline/SKILL.md`
| Old (global) | New (repo) |
|---|---|
| `~/.claude/handoffs/session/` | `.claude/handoffs/session/` |

---

## Adding a New Asset

1. Add entry to `MANIFEST` in `~/.claude/tools/luke-copy-assets.py`
2. If the file contains `~/.claude/` references that need fixing, add a `POST_COPY_PATCHES` entry
3. Update the table above
4. Re-run `$UB luke-copy-assets <repo-root>` on any repo already initialised
