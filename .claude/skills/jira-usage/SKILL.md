---
name: jira-usage
description: Jira conventions for acceptance criteria, ticket refinement, bug reports, and description formatting. Use this skill when the user mentions Jira, acceptance criteria, Gherkin, tickets, bug reports, refinement, or when creating/updating Jira issues. This skill uses API credentials -- if prompted for a passphrase, provide the one from your 1Password setup.
---

Apply these conventions when working with Jira tickets -- creating, refining, or updating issues.

## Acceptance Criteria Format (Gherkin)

Two templates depending on ticket type.

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

Summary format: `[Component] -- [what's wrong]`

Description structure:
1. Steps to Reproduce (numbered, specific)
2. Expected vs Actual behavior
3. Evidence (logs, screenshots, error messages)
4. Environment context
5. Gherkin AC for the fix

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
3. If an image ID is missing, upload via `POST /rest/api/3/issue/<key>/attachments` first
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
