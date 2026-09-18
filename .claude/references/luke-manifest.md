# Luke Asset Manifest

Complete list of everything `$UB luke-copy-assets --repo-root <repo-root>` copies into a repo's `.claude/`.

Run during every Luke survey (S4) and re-survey to keep repo in sync with the global versions.
After copy, post-copy patches are applied to fix global-path references in a subset of files —
see the **Patched after copy** column.

---

## Copied Assets (49 total)

> **Generated hooks** (written by `luke-repo-init.py`, not copied from global source):
> `hooks/luke-staleness-check.py`, `hooks/luke-edit-staleness-check.py`, `hooks/luke-auto-index-check.py`

> Post-copy patches are **verified**: every patch's source text must be found in the copied file; misses surface in the payload as `patch_misses[]` (a silently-missed patch would leave global paths in the repo copy).

| Dest in repo `.claude/` | Source in `~/.claude/` | Patched after copy |
|------------------------|----------------------|--------------------|
| `hooks/py.sh` | `hooks/py.sh` | No |
| `hooks/ub.sh` | `hooks/ub.sh` | No |
| `hooks/luke-session-start.py` | `hooks/luke-session-start.py` | No |
| `tools/toolkit.py` | `tools/toolkit.py` | No |
| `tools/utility-belt.py` | `tools/utility-belt.py` | No |
| `tools/make-handoff.py` | `tools/make-handoff.py` | No |
| `tools/read-handoff.py` | `tools/read-handoff.py` | No |
| `tools/read-reference.py` | `tools/read-reference.py` | No |
| `tools/luke-repo-init.py` | `tools/luke-repo-init.py` | No |
| `tools/luke-copy-assets.py` | `tools/luke-copy-assets.py` | No — copied so `survey-finalize` can call it in-repo |
| `tools/luke-migrate.py` | `tools/luke-migrate.py` | No |
| `tools/survey-prep.py` | `tools/survey-prep.py` | No |
| `tools/survey-finalize.py` | `tools/survey-finalize.py` | No |
| `tools/write-sidecars.py` | `tools/write-sidecars.py` | No |
| `tools/pre-scan.py` | `tools/pre-scan.py` | No |
| `tools/pre-scan-rust.py` | `tools/pre-scan-rust.py` | No — used by `survey-prep` on Rust repos |
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
| `tools/read-cred.py` | `tools/read-cred.py` | Yes — `_BASE_DIR` re-anchored to `~/.claude` (credentials are personal) |
| `tools/cred_crypto.py` | `tools/cred_crypto.py` | Yes — `_BASE_DIR` re-anchored to `~/.claude` |
| `tools/confirm-passphrase.py` | `tools/confirm-passphrase.py` | Yes — `BASE_DIR` re-anchored to `~/.claude` |
| `tools/build-adf-json.py` | `tools/build-adf-json.py` | No — imported by `jira-write`/`post-jira-comment` |
| `tools/jira-fetch.py` | `tools/jira-fetch.py` | No |
| `tools/jira-write.py` | `tools/jira-write.py` | No |
| `tools/jira-attach-file.py` | `tools/jira-attach-file.py` | No |
| `tools/post-jira-comment.py` | `tools/post-jira-comment.py` | No |
| `tools/bb-fetch.py` | `tools/bb-fetch.py` | No |
| `tools/bb-post-comment.py` | `tools/bb-post-comment.py` | No |
| `tools/fetch-bb-comments.py` | `tools/fetch-bb-comments.py` | No |
| `tools/classify-pr-comments.py` | `tools/classify-pr-comments.py` | No |
| `tools/post-bb-reply.py` | `tools/post-bb-reply.py` | No |
| `agents/luke.md` | `agents/luke.md` | Yes — `bash ~/.claude/` → `bash .claude/` |
| `skills/luke/SKILL.md` | `skills/luke/SKILL.md` | Yes — global paths, ref filename |
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
| `tools/sync-1pass-creds.py` | Personal credential producer — reads each developer's own 1Password vault via the `op` CLI. Run it once globally (`$UB sync-1pass-creds`); the repo's read-cred then decrypts the resulting `~/.claude/assets/creds/` files. Never copied into a repo. |
| All pipeline commands (`oracle`, `alfred`, `damian`, `gordon`, `harvey`, `bruce`, `signal`, `blackgate`) | Pipeline orchestration — intentionally global-only, not repo-portable |
| `tools/talia.py`, `tools/session-state.py`, `tools/profiler-step.py`, etc. | Pipeline-only tools — not needed for repo-local operation |

---

## Credential Flow in Repo Copies

The copied `jira-usage` / `pr-management` skills dispatch real API tools, which need credentials. How that resolves in a repo:

- Repo copies of `read-cred.py` / `cred_crypto.py` / `confirm-passphrase.py` are patched so `BASE_DIR` points at `~/.claude`, **not** the repo. Credentials live in one global store (`~/.claude/assets/creds/`), shared by every repo — a repo working tree is the wrong home for secrets and is typically gitignored anyway.
- A developer runs `sync-1pass-creds` **once on their own machine** (it needs the `op` CLI + their vault). Repos never sync; they only read.
- The first API call per session needs `confirm-passphrase` (cred-gate), exactly like the global pipeline.
- **Dependency:** these tools import `cryptography` (pip). Not vendored — must be present in the target interpreter, same as the global pipeline.

---

## Path Patch Details

These substitutions are applied in-place after copy by `luke-copy-assets.py`:

### `skills/luke/SKILL.md`
| Old (global) | New (repo) |
|---|---|
| `bash ~/.claude/hooks/ub.sh` | `bash .claude/hooks/ub.sh` |
| `luke-reference.md` | `luke-survey.md` |

### `agents/luke.md`
| Old (global) | New (repo) |
|---|---|
| `bash ~/.claude/hooks/ub.sh` | `bash .claude/hooks/ub.sh` |

### `skills/handoff-discipline/SKILL.md`
| Old (global) | New (repo) |
|---|---|
| `~/.claude/handoffs/session/` | `.claude/handoffs/session/` |

### Credential tools (`tools/read-cred.py`, `tools/cred_crypto.py`, `tools/confirm-passphrase.py`)
`BASE_DIR`/`_BASE_DIR` is re-anchored from `Path(__file__).parent.parent` (→ repo `.claude/`) to the user's home `~/.claude`, so a repo copy reads the developer's global `assets/creds/`. See § Credential Flow in Repo Copies.

---

## Adding a New Asset

1. Add entry to `MANIFEST` in `~/.claude/tools/luke-copy-assets.py`
2. If the file contains `~/.claude/` references that need fixing, add a `POST_COPY_PATCHES` entry
3. Update the table above
4. Re-run `$UB luke-copy-assets --repo-root <repo-root>` on any repo already initialised
