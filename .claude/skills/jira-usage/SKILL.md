---
name: jira-usage
argument-hint: "[ticket-key]"
description: Jira conventions for acceptance criteria, ticket refinement, bug reports, and description formatting. Use this skill when the user mentions Jira, acceptance criteria, Gherkin, tickets, bug reports, refinement, or when creating/updating Jira issues. Jira API tools take --passphrase <pin> -- the credential passphrase from /onepassword-setup, never an account token.
license: MIT
compatibility: opencode
---
**Gotham Pipeline** · Jira Usage · Reference · standalone (no persona -- shared conventions only)

Apply these conventions when working with Jira tickets -- creating, refining, or updating issues.

> **User's request:** $ARGUMENTS

Parse a ticket key (e.g. `LOC-123`) from the request. No key given → apply the conventions to the ticket already in conversation context; ask once if none is unambiguous.

## Tools

All Jira I/O goes through these (credentials handled internally via `read-cred`; every call takes `--passphrase <pin>`):

| Task | Command |
|---|---|
| Fetch ticket / JQL / any REST GET | `$UB jira-fetch --passphrase <pin> --url <url> [--output <file>]` |
| Update issue fields or description | `$UB jira-write --passphrase <pin> --method PUT --url <url> --data-file <file>` |
| Post a comment (markdown or ADF sections) | `$UB post-jira-comment --passphrase <pin> --issue-key <key> (--sections-file <file> \| --markdown)` |
| Attach files | `$UB jira-attach-file --passphrase <pin> --issue-key <key> --files <f1,f2>` |

## Acceptance Criteria Format (Gherkin)

Canonical source is `references/alfred-reference.md`; this inline copy is intentional so the skill works standalone and in repo copies. Two templates depending on ticket type.

### Implementation tickets (features, bugs, refactors)

```
Acceptance Criteria:

**AC1: <title>**
- Given <system state>
- When <user action>
- Then <expected outcome>
      - And <additional outcome>

Gherkin Scenarios:

**AC1: <same title>**
- Scenario: <specific scenario name>
      - Given <specific precondition>
      - When <specific action>
      - Then <specific expected result>
            - And <additional assertion>
```

### Test-project tickets (labels: "Nothing-To-Release")

```
Acceptance Criteria:

**AC1: <title>**
- Given <test setup>
- When <action under test>
- Then <assertion>
      - And <additional assertion>
```

### Indentation rules (exact, for Jira Cloud rendering)

- `**AC1: <title>**` -- bold header, no bullet
- Given/When/Then -- top-level bullets (`- `)
- And/But under Given/When/Then -- 6 spaces + `- And` / `- But`
- Scenario -- top-level bullet (`- Scenario: `)
- Given/When/Then under Scenario -- 6 spaces + `- `
- And/But under Scenario's steps -- 12 spaces + `- And` / `- But`

Prefer `And` over `But`. Use `But` only for explicit negative contrast as a last resort.

## Refining Acceptance Criteria

When refining existing AC:

1. **Testability check** -- can each criterion be verified with a concrete pass/fail? Flag vague or unmeasurable items.
2. **Sub-criteria suggestions** -- break broad AC into specific, testable sub-criteria. Tag confidence: High (90%+), Medium (50-89%), Low (<50%).
3. **Completeness validation** -- are edge cases covered? Missing error paths? Missing boundary conditions?
4. **Dependency tagging** -- mark AC as dependent when ordering matters (safe default when unsure).
5. **Size assessment** -- 3+ AC items or distinct dependencies? Suggest splitting into multiple tickets (don't force).

## Bug Reports

Summary: `[Component] -- [what's wrong]`. Description structure, in order: Steps to Reproduce (numbered, specific) → Expected vs Actual → Evidence (logs, screenshots, error messages) → Environment context → Gherkin AC for the fix.

## Description Conventions

When updating a description with refined AC, always preserve the original:

```
<Refined Gherkin AC here>

---
**Original Acceptance Criteria (preserved)**
> <original text verbatim, as blockquote lines>
```

## Media Attachments

Before updating a description that contains inline images:
1. Check the existing ADF for `mediaSingle`/`media` nodes
2. Verify image IDs exist in the attachments list
3. If an image ID is missing, upload the local file first: `$UB jira-attach-file --passphrase <pin> --issue-key <key> --files <file>`
4. Reference inline images as `(see attachment <filename>)` in markdown

## Comment Templates

**After refinement:**
```
Refined the acceptance criteria for this ticket.

**Changes made:**
- [List changes: Gherkin conversion, new criteria, sub-tasks planned]

Original A/C preserved as blockquote in the description.
```

**After scope split:**
```
Scope split performed. The following A/C were moved to a new story:
- [list each split-out criterion]

New story: [KEY] -- [summary]
Remaining A/C on this ticket: [list what stays]
```

---

## RULES

- Use a Tools-table command whenever one exists; raw REST only for calls no tool covers.
- Credentials flow through `--passphrase` on the tools -- never ask for a token, never echo one. Passphrase problems route to `/onepassword-setup`.
- Preserve the original AC verbatim on every description update (Description Conventions above).
- Fetch before editing (`jira-fetch`) -- remembered ticket content may be stale; exception: content fetched earlier this same session.
- Check existing ADF media nodes before any description update (Media Attachments above).
- Full lifecycle work (refinement sessions, story maps, bug creation) is `/alfred`'s -- route, don't re-implement.

## CONTEXT MANAGEMENT

Standalone utility: no handoff, no session state of its own. Fetch large ticket JSON to a file (`jira-fetch --output`) rather than into context. When the Jira work is part of a pipeline run, the parent skill owns the handoffs -- this skill supplies conventions and tool calls only.

---
**Gotham Pipeline** · Jira Usage · Reference · standalone
