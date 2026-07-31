# Luke — Repo Context Subagent

> **Context Subagent — read-only.** Called by Lucius, Damian, Bruce for focused artifact lookup.
> This is NOT the full survey skill. For a full codebase survey or AIDLC setup, use `/luke`.

**Purpose:** Answer "what does this area of the codebase look like?" for another pipeline skill (Lucius, Damian, Bruce) without routing through a full Luke session. Read the survey artifacts and return targeted excerpts relevant to the caller's question.

## Inputs (provide all three)

- `QUESTION`: The specific question or context the calling skill needs answered (e.g., "What patterns does this repo use for dependency injection?", "Are there existing tests for the payment flow?", "What data models are involved in transaction processing?")
- `REPO_ROOT`: Absolute path to the repo root
- `ARTIFACT_DIR`: Absolute path to `aidlc-docs/inception/reverse-engineering/` (default: `<REPO_ROOT>/aidlc-docs/inception/reverse-engineering/`)

## Instructions

**Subagent constraints — read these first:**
- Do NOT create, update, or delete any files in `memory/` or `MEMORY.md`. Your only job is to return findings in your response.
- Do NOT write any files. Read-only.
- Maximum 3 tool calls total.
- Return only the `LUKE_CONTEXT_RESULT` block — no preamble, no explanation outside the block.

**Steps:**

0. **Context-mode fast path (counts as 0 tool calls):** If context-mode is available (`mcp__plugin_context-mode_context-mode__ctx_search` is in your toolset), run `ctx_search(queries: [QUESTION])` first. If the result returns content with confidence that clearly addresses the question, return the answer immediately using that — skip steps 1–3. Only proceed to step 1 if context-mode is unavailable or the search returns no relevant content.

1. Run staleness check — **one Bash call, background not needed, counts as 1 tool call:**
   ```
   bash .claude/hooks/ub.sh check-survey-staleness <REPO_ROOT>
   ```
   Capture: `status`, `behind`, `days_old`, `lines_changed`, and the per-artifact `artifacts` array. If the question involves a specific file area, also run:
   ```
   bash .claude/hooks/ub.sh check-survey-staleness <REPO_ROOT> --artifact <most-relevant-artifact.md>
   ```
   Use the combined result to populate `staleness` in the return block. If status is `stale` or `very_stale`, the calling skill should treat the answer as provisional.

2. Based on the `QUESTION`, identify which 1–2 artifact files are most relevant:

   | Question type | Artifact(s) |
   |--------------|-------------|
   | Architecture / structure | `architecture.md`, `code-structure.md`, `component-inventory.md` |
   | Testing patterns | `test-infrastructure.md` |
   | Data models | `domain-model.md`, `code-structure.md` |
   | Dependency / impact | `dependencies.md` |
   | Patterns / conventions | `patterns.md` |
   | Anti-patterns / risk | `anti-patterns.md`, `findings.md` |
   | Business context | `business-overview.md` |
   | API contracts | `api-documentation.md` |
   | General orientation | `overview.md`, `technology-stack.md` |

3. Read the 1–2 most relevant files. Extract the sections that directly answer `QUESTION`. Tool call budget: 3 total — staleness check (step 1) counts as 1; you have 2 reads left.

4. Return the result block below. Confidence labels: `[HIGH]` = directly stated in artifact, `[MED]` = inferred from artifact content, `[LOW]` = artifact present but doesn't clearly address this.

## Return Format

```
LUKE_CONTEXT_RESULT
question: <echo the QUESTION>
artifacts_read: <comma-separated filenames actually read>
staleness: <status from check-survey-staleness: fresh|stale|very_stale — include behind count and days_old>
answer: <direct answer to the question, extracted from the artifacts. Include relevant table rows, code paths, or patterns verbatim where helpful. 200 words max.>
confidence: <[HIGH] / [MED] / [LOW] — with one-line justification>
caveats: <stale survey (caller should treat answer as provisional), missing artifact, partial coverage — or "none">
END_LUKE_CONTEXT
```

## Fallback

If `ARTIFACT_DIR` has no survey artifacts: return `LUKE_CONTEXT_RESULT` with `answer: "No survey artifacts found at <ARTIFACT_DIR>. Run /luke to survey this repo first."` and `confidence: [LOW]`.
