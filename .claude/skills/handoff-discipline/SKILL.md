---
name: handoff-discipline
description: How to write session handoffs that preserve context across conversations -- checkpointing work, capturing decisions, enabling cold-start resumption. Use this skill when the user mentions handing off, picking up where they left off, saving progress, session checkpoints, context loss, resuming work, or when context is getting large and compaction is approaching.
---

Write a handoff before context is lost. Handoffs are files on disk that survive session boundaries and compaction.

## When to Write a Handoff

- **Before stopping work** -- end of session, switching tasks, taking a break
- **Before context gets large** -- if the conversation is deep and compaction is approaching
- **Before switching topics** -- capture the current state before moving on
- **When prompted by the system** -- if a PreCompact hook or context warning fires

## How to Write One

Use the session handoff type:

```
$UB make-handoff <<'HANDOFF'
{"type": "session", "ticket_key": "<session-id-prefix>", "fields": {"Topic": "<what you were working on>", "Summary": "<what got done>", "Whats Left": "<remaining work>", "Key Decisions": "<choices made and why>", "Branch": "<current branch>", "Repo Root": "<repo path>", "Files Changed": "<files changed>"}}
HANDOFF
```

The ticket_key for session handoffs is the first 8 characters of the session ID. Files go to `.claude/handoffs/session/`.

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

- **User intent** -- what the user asked for in their own words
- **Decisions and reasoning** -- approach chosen and why
- **Rejected approaches** -- what was tried and why it didn't work
- **User decisions** -- choices the user made explicitly (sacred -- don't re-ask in the next session)
- **Domain knowledge** -- business context the user shared
- **Priority** -- urgency, stakes, deadlines
- **What's been explained** -- what the user already knows, avoid re-explaining

## Resuming from a Handoff

At the start of a new session, check for existing handoffs:

1. Look in `.claude/handoffs/session/` for recent Session-*.md files
2. Read the Topic to match what the user is asking about
3. Load the full handoff for context
4. Continue from where the previous session left off

## Principles

- **Capture the "why", not just the "what"** -- downstream sessions need the reasoning behind decisions
- **User decisions are sacred** -- if the user chose approach A over B, don't re-litigate it
- **Standard field order** -- enables grep and scripted extraction
- **Old handoffs auto-archive** -- previous session handoffs move to `handoffs/session/completed/` when a new one is written
