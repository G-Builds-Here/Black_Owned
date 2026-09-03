---
name: pr-management
argument-hint: "[pr-number]"
description: PR review response and lifecycle management -- comment triage, reply discipline, fix list creation. Use this skill when the user mentions PR review, pull request comments, addressing reviewer feedback, responding to reviews, or managing a pull request lifecycle. This skill uses API credentials -- if prompted for a passphrase, provide the one from your 1Password setup.
---

Manage PR review comments systematically. Every comment gets a disposition and a reply.

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
2. **Bots second** -- but bot Critical/Major findings carry the same weight as human feedback. Don't dismiss them without evaluation.

## Reply Discipline

Every comment gets a reply with reasoning. Reviewers interpret silence as "ignored."

| Disposition | Reply pattern |
|---|---|
| Fix accepted | "Will fix: [specific detail of what changes]" |
| Fix declined | "Not changing because: [reasoning]. [Alternative if applicable]" |
| Discussion | Direct answer to the question with context |
| Nitpick | User's decision + reasoning if declined |

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

## Completeness Check

Before marking the PR as addressed:
- Every comment has a disposition (fix, decline, discuss, defer)
- Every disposition has a drafted reply
- All Blocking items are resolved
- All Should Fix items are resolved or explicitly deferred with reasoning
- No comment is left without a clear next step
