---
name: pr-management
argument-hint: "[pr-number]"
description: PR review response and lifecycle management -- comment triage, reply discipline, fix list creation. Use this skill when the user mentions PR review, pull request comments, addressing reviewer feedback, responding to reviews, or managing a pull request lifecycle. Bitbucket tools take --passphrase <pin> -- the credential passphrase from /onepassword-setup, never an account token.
license: MIT
compatibility: opencode
---
**Gotham Pipeline** · PR Management · Reference · standalone (no persona -- shared conventions only)

Manage PR review comments systematically. Every comment gets a disposition and a reply.

> **User's request:** $ARGUMENTS

Parse a PR number from the request. No number given → derive the PR from the current branch via `$UB bb-fetch`, or ask once which PR is meant.

## Tools

Comment I/O is Bitbucket-first (GitHub PRs: `gh pr comment` / `gh api`). This skill defines the discipline; the commands are the ones `/harvey` uses:

| Task | Command |
|---|---|
| Fetch PR comments | `$UB fetch-bb-comments --workspace <ws> --repo <repo> --pr-id <N> --passphrase <pin> [--count-only]` |
| Triage/classify comments | `$UB classify-pr-comments` |
| Post a threaded reply | `$UB post-bb-reply --workspace <ws> --repo <repo> --pr-id <N> --parent-id <id> --text "<text>" --passphrase <pin>` (batch: `--batch --file replies.json`) |
| Post a top-level PR comment | `$UB bb-post-comment` |
| Find the PR for a branch | `$UB bb-fetch` |

All take auth via `--passphrase`; `fetch-bb-comments` and `post-bb-reply` also accept direct auth via `--user <email> --token <token>`. For full PR lifecycle execution (creation, posting, Damian handoff), route to `/harvey` — it provides this tooling.

## Comment Triage

Categorize every reviewer comment into one of four tiers:

| Tier | Meaning | Examples |
|---|---|---|
| **Blocking** | Must fix before merge | Security flaw, breaks tests, violates requirements, missing null check on user input |
| **Should Fix** | Good call, not blocking | Performance improvement, missing edge case, better pattern exists |
| **Discussion** | Needs reply, not necessarily code change | Architecture question, "why not X?", design tradeoff |
| **Nitpick** | Style preference, low signal | Variable naming, formatting, import order |

## Process Order

1. **Humans first** -- human reviewers are waiting for responses. Triage and reply to human comments before bot comments.
2. **Bots second** -- but bot Critical/Major findings carry the same weight as human feedback. Don't dismiss them without evaluation. Bot Critical/Major are reviewer severity labels, not tiers: read the flagged code and evaluate each comment, then assign it one of the four tiers (a confirmed finding typically lands Blocking or Should Fix; a weak one Discussion or Nitpick). Do not map by label alone — the evaluated content decides the tier.

## Reply Discipline

Every comment gets a reply with reasoning. Reviewers interpret silence as "ignored."

| Disposition | Reply pattern |
|---|---|
| Fix accepted | "Will fix: [specific detail of what changes]" |
| Fix declined | "Not changing because: [reasoning]. [Alternative if applicable]" |
| Discussion | Direct answer to the question with context |
| Nitpick | Ask the user whether they want it fixed; skip if unrelated to any AC (mirrors /harvey triage). Reply with the user's decision + reasoning if declined |

## Bot Comment Handling

When a bot flags a design pattern:
- **Evaluate first**: is the flagged pattern actually wrong, or is it intentional?
- **If intentional**: reply "by design" (the code is correct), not "out of scope" (which implies the code is a problem you're deferring)
- **If wrong**: treat it like any other blocking comment

## Fix List

When fixes are needed, create a structured Fix List:

For each fix:
- **File** and **line** where the change goes
- **What** to change (specific, not vague)
- **Why** (reviewer's concern + your understanding)
- **Edge cases** to watch for
- **Dependency order** if fixes interact

Note conflicting fixes if two reviewers suggest contradictory changes -- flag for the user to decide.

Persist the Fix List -- a chat-only list is lost on `/compact`. With a ticket key, include it in the Harvey handoff (`handoffs/harvey/Harvey-<key>.md` via `$UB make-handoff`); that is where Harvey keeps its own Fix List. Without a ticket key, tell the user where the list lives before ending the session.

## Completeness Check

"Marking the PR as addressed" = posting a triage-summary comment on the PR (`$UB bb-post-comment --workspace <ws> --repo <repo> --pr-id <N> --passphrase <pin>`; GitHub: `gh pr comment`) listing each comment's disposition. Before posting it, verify:
- Every comment has a disposition (fix, decline, discuss, defer)
- Every disposition has a drafted reply
- All Blocking items are resolved
- All Should Fix items are resolved or explicitly deferred with reasoning
- No comment is left without a clear next step

---

## RULES

- Every comment gets a reply -- silence reads as "ignored," even for Nitspicks (ask the user first on those).
- Humans before bots; bot Critical/Major get evaluated in full before any dismissal.
- Bot severity labels are inputs, not tiers -- assign the four-tier disposition after reading the flagged code.
- "By design" is the reply for an intentional pattern; "out of scope" is not (it admits a problem).
- Change code for a Nitpick only with the user's say-so.
- Fix Lists and dispositions go on disk, not just in chat (see Fix List section).
- Full PR lifecycle (creation, Damian handoff, merge) is `/harvey`'s -- route, don't re-implement.

## CONTEXT MANAGEMENT

| Checkpoint | When | What |
|---|---|---|
| Fix List handoff | Session ending mid-triage, or context near compaction | Harvey handoff file (`handoffs/harvey/`) if a ticket key exists; else tell the user where the Fix List lives |

PR number, disposition table, and drafted replies are the working state -- persist them to the Fix List before any `/compact`. When this skill runs standalone (no `/harvey`), the Fix List file is the only resume point; without it the triage is lost.

---
**Gotham Pipeline** · PR Management · Reference · standalone
