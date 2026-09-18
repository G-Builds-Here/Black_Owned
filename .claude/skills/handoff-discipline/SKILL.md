---
name: handoff-discipline
description: How to write session handoffs that preserve context across conversations -- checkpointing work, capturing decisions, enabling cold-start resumption. Use this skill when the user mentions handing off, picking up where they left off, saving progress, session checkpoints, context loss, resuming work, or when context is getting large and compaction is approaching.
license: MIT
compatibility: opencode
---
**Gotham Pipeline** · Handoff Discipline · Reference · standalone (no persona -- shared conventions only)

Write a handoff before context is lost. Handoffs are files on disk that survive session boundaries and compaction.

> **User's request:** $ARGUMENTS

Parse the operation from the request: *write* (save progress, hand off, "before we lose context") → How to Write One; *resume* (pick up where left off, "what was I doing") → Resuming from a Handoff; neither → teach the conventions on request, write nothing.

## When to Write a Handoff

- **Before stopping work** -- end of session, switching tasks, taking a break
- **Before context gets large** -- if the conversation is deep and compaction is approaching
- **Before switching topics** -- capture current state first
- **When prompted by the system** -- if a PreCompact hook or context warning fires. If a pipeline skill is active, prefer that skill's own checkpoint procedure (its `CONTEXT MANAGEMENT` section); use this session handoff for standalone work or as a backstop.

## How to Write One

Use the session handoff type:

```
$UB make-handoff <<'HANDOFF'
{"type": "session", "ticket_key": "<short topic or ticket label, e.g. LOC-0054 or PIPELINE-AUDIT>", "fields": {"Topic": "<what you were working on>", "Summary": "<what got done>", "Whats Left": "<remaining work>", "Key Decisions": "<choices made and why>", "Branch": "<current branch>", "Repo Root": "<repo path>", "Files Changed": "<files changed>"}}
HANDOFF
```

The `ticket_key` is a short topic or ticket label you choose (e.g. `LOC-0054`, `PIPELINE-AUDIT`) — `make-handoff` does not read or derive a session ID; it just formats the key into a filename. The tool writes the file to `.claude/handoffs/session/` as `Session-<ticket_key>.md`.

`make-handoff` stamps the shared base fields itself (Date, Status, Saved, and the handoff skeleton per its schema — check `make-handoff --help` for the current list). Supply only the content fields below; do not hand-write the markdown file.

## What to Capture

| Field | What goes in it |
|---|---|
| **Topic** | Human-readable description of the work (e.g., "refactoring auth middleware") |
| **Summary** | What was accomplished this session |
| **Whats Left** | Remaining work, next steps, unfinished items |
| **Key Decisions** | Choices made and WHY -- the reasoning matters more than the choice |
| **Branch** | Current git branch |
| **Repo Root** | Working directory path |
| **Files Changed** | List of files changed |

## Conversation Context (for cold-start resumption)

For handoffs that another session will pick up, include these in `_conversation_context`:

| Item | What goes in it |
|---|---|
| **User intent** | What the user asked for, in their own words |
| **Decisions and reasoning** | Approach chosen and why |
| **Rejected approaches** | What was tried and why it didn't work |
| **User decisions** | Choices the user made explicitly (sacred -- don't re-ask in the next session) |
| **Domain knowledge** | Business context the user shared |
| **Priority** | Urgency, stakes, deadlines |
| **What's been explained** | What the user already knows, avoid re-explaining |

## Resuming from a Handoff

At the start of a new session, check for existing handoffs:

1. If the label is known, read it directly: `$UB read-handoff --type session --key <label>` (`session` is a valid handoff type). If the label is unknown, list `.claude/handoffs/session/` newest-first with the platform-appropriate listing tool (`ls` or `dir`) — do NOT use Glob, it silently returns nothing on Windows.
2. Read the Topic to match what the user is asking about. Tie-break: prefer the file with the newest `Date` field; if two topics match, confirm with the user.
3. Load the full handoff for context
4. Continue from where the previous session left off

## Principles

- **Capture the "why", not just the "what"** -- downstream sessions need the reasoning behind decisions
- **User decisions are sacred** -- if the user chose approach A over B, don't re-litigate it
- **Standard field order** -- enables grep and scripted extraction
- **Old handoffs auto-archive** -- previous session handoffs move to `handoffs/session/completed/` when a new one is written

---

## RULES

- Write through `$UB make-handoff` -- never hand-write the handoff markdown.
- Capture before stopping, not after: a handoff written post-context-loss describes the loss, not the work.
- A pipeline skill's own checkpoint procedure wins over this session handoff while that skill is active.
- User decisions recorded in a handoff are not re-asked by the resuming session.
- Resume by reading the newest matching handoff -- do not reconstruct from conversation memory alone.
- `completed/` is tool-managed -- don't hand-edit or hand-place files there.

## CONTEXT MANAGEMENT

This skill *is* context management: its output (the handoff file) is the state. It keeps no checkpoint of its own -- if the session dies mid-handoff-drafting, the draft inputs (topic, leftovers, decisions) are still reconstructible from the live conversation. Files live under `.claude/handoffs/session/`, which is why they survive.

---
**Gotham Pipeline** · Handoff Discipline · Reference · standalone
