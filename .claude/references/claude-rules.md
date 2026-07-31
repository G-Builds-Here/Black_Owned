# Claude Code — Gotham Pipeline Rules

These rules govern how Claude operates in this repo. They apply to all pipeline skills and to Claude's general behaviour when working in this codebase.

---

## Rule 1 — Use tools, not raw shell

| | |
|---|---|
| **What** | All pipeline writes go through UtilityBelt. Reads use built-in tools (Read, Grep, Glob). One command per Bash call — no `&&`, `;`, `\|`. |
| **Why** | Scripts resolve paths, normalize platforms, and keep raw content out of context. Chained commands break permission patterns and the bash-guard hook blocks them. |
| **Tool** | `$UB <tool> [args]` — where `$UB` = `bash .claude/hooks/ub.sh` |

Paths: use absolute paths. Git can use `~`. Never `cd <dir> && <command>` — `cd` doesn't persist between Bash calls. Use absolute paths, `-C` for git, or `--cwd` flags instead.

---

## Rule 2 — Pre-route handoff

| | |
|---|---|
| **What** | Generate a handoff via `$UB make-handoff` before routing to another skill. Then `$UB talia "/compact" --next "/[next-skill]" --skill "<SkillName>"` to auto-inject `/compact` followed by the next skill. If talia reports ERROR, tell the user: "Talia couldn't fire — type `/compact` manually, then run `/[next-skill]`." |
| **Why** | Handoffs survive session boundaries. `/compact` between skills sheds accumulated tool results — the primary source of context bloat. |

---

## Rule 3 — Verify before claiming done

| | |
|---|---|
| **What** | Run a test that would fail without the change. "Syntax OK" proves nothing broke — not that the new thing works. |
| **Why** | Unverified changes compound. A green test that doesn't exercise the fix is worse than no test — it creates false confidence. |

---

## Rule 4 — Output format

| | |
|---|---|
| **What** | Lead with findings (table or bullets), follow with prose. Add `[HIGH]` / `[MED]` / `[LOW]` confidence ratings to all decisions and routing choices. Show pre-edit code in a fenced block with a `# Current behavior: <one line>` comment before proposing changes. Gate results use `[PASS]` / `[FAIL]` / `[BLOCKED: reason]` — one marker per item, scannable. |
| **Why** | Dense prose buries answers. Confidence ratings make reasoning catchable before it cascades. Pre-edit comments prevent "what did this do before?" after a change. |

---

## Rule 5 — Clarify before executing at low confidence

| | |
|---|---|
| **What** | Before starting a task, assess execution confidence on four axes: **WHO** (context/affected party), **WHY** (goal or constraint), **WHAT** (exact deliverable and scope), **HOW** (approach or known constraints). If confidence is LOW on any axis, ask up to 3 targeted questions grouped in one message. Do not guess and proceed. |
| **Why** | A 30-second clarifying question is cheaper than 3 wrong implementation loops. |

---

## Compaction Preservation

When compacting during a pipeline session, the summary MUST preserve:
- Active ticket key and branch name
- All A/C status (which are done, in progress, blocked)
- Decisions made and rejected approaches
- Current step number and what remains
- File paths modified this session
- Test results (pass/fail counts, specific failures)
- User preferences stated this session
- Handoff route-to target if determined
- AUTO_FLOW setting (true/false) if active
- Parallel phase state if in parallel dispatch (current phase, which ACs done/in-progress/blocked)