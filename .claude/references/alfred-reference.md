# Alfred Reference

Load on demand — not needed on every Alfred invocation. Alfred.md points here for procedures and formatting rules.

---

## CARVED Gate

Loaded by Alfred Step 4b. Scores each AC for implementability before Gherkin conversion.

### Scoring rubric

**GREEN** — all of the following are true:
- Expected outcome is concrete and measurable (not "should work correctly", "returns appropriate response")
- Test can be written without guessing: given a specific input, the expected output is unambiguous
- No undefined terms that Damian would have to interpret (e.g. "valid user", "reasonable timeout", "standard format")
- Scope fits a single implementation unit — not "and also updates the audit log and sends an email"
- Estimable: complexity is understood well enough to size (roughly 1–13 story points); if the AC is a black box — unknown integrations, undocumented contracts — it cannot be realistically planned
- Parameters are at the right level of specificity: literal values, counts, named tools, and configuration choices are fixed constraints only when they are genuinely required — not implementation details dressed as requirements (see Negotiable check below)

**AMBER** — implementable but has exactly one gap:
- One vague term that has a likely-correct interpretation (e.g. "active account" — probably means `status = active`)
- One missing boundary value (e.g. max length not stated, but a sensible default exists)
- One unclear failure case (e.g. "returns an error" — HTTP 400 or 422 or 500?)
- Scope slightly broad but could be a single task with one clarifying question
- Story point estimate has high variance (e.g. 3–13 depending on an unknown) — one clarifying question would narrow it

**RED** — any of the following:
- Expected outcome is absent or unmeasurable ("user experience is improved", "performance is acceptable")
- AC contains "and" joining two distinct behaviors that should be separate criteria
- Contradicts another AC or an existing system behavior without acknowledging the conflict
- Requires knowledge Alfred doesn't have and can't infer (e.g. references an undocumented external contract)
- Damian would have to make a business decision to implement it
- Completely inestimable: no frame of reference, no comparable work, unknown external dependencies — cannot be sized even roughly

### Negotiable check

For each AC, scan for literal values, counts, named tools, specific IDs, or configuration choices. Ask: is this a fixed constraint the business requires, or a parameter that could vary without changing what the AC is actually asserting?

If it is a parameter dressed as a constraint — e.g. "send exactly 3 events" when the real intent is "events are processed", or "use Mailosaur" when the real intent is "email delivery is verified" — flag it:
*"AC[N] hard-codes [X]. Is that a firm requirement, or a negotiable parameter? If negotiable, I'll rewrite to express the intent instead."*

Over-specified ACs are harder to implement, harder to test across environments, and break when the parameter changes. The fix is to express intent and treat the parameter as a known example, not a constraint.

### AMBER targeted question format

One question only. Format: *"For AC[N] — [vague term]: do you mean [most likely interpretation], or [alternative]?"*

If the user answers → update the AC text to reflect the clarification, re-score GREEN, continue.
If the user defers ("use your judgment") → document the assumption inline in the AC: `(assumed: [interpretation])`, score GREEN with note, continue.

---

## Handoff Template

Inline in `alfred.md` § CONTEXT MANAGEMENT — that is the single source of truth. Load the skill file if you need the full template.

---

## Epic Creation Flow

When the user wants to create an epic from a PRD or multi-feature description, guide them through scanning the requirements, surfacing open questions, and routing to Lucius for architectural design. The epic + child stories are created together in one pass after Lucius returns the blueprint (see Story Breakout Flow).

**1. Get the PRD** — The user provides a PRD file path, pastes content, or describes the feature scope. If a file path is given, read it. If pasted, work from the paste. Ask clarifying questions if scope is unclear.

**2. PRD scan and assessment** — Read the PRD and produce a single response with:
- **Summary** — 2-4 sentences: what this adds, which services/components, the core user-facing change
- **Deployable units** — extract service/project names referenced in the PRD
- **Testability assessment** — for each A/C item in the PRD, flag gaps (vague criteria, missing boundaries, contradictions between sections). Present as a table: A/C Item | Gap | Confidence
- **PRD contradictions** — sections that disagree with each other
- **Open questions** — items that block story-level sizing

**3. Repo detection** — After extracting deployable units, run:
```
$UB repo-detect "<prd_path>" --scan-dir ~/source/repos --current-repo "<repo_root>"
```
Present results to the user.

**4. Refine epic-level A/C** — Consolidate the PRD's acceptance criteria into clean, testable epic-level A/C. This is the value add — not copying, but restructuring:
- Merge related items (PRD often splits what belongs together)
- Add criteria the PRD implies but doesn't state (cross-service validation, E2E suites, consumer notices)
- Close testability gaps identified in step 2
- Present the mapping: which original items folded into each new A/C

Ask: *"Do these look right, or would you like to adjust anything?"*

**5. MoSCoW and sprint plan** — Assign a MoSCoW rating to each epic-level A/C or deployable unit. Reference `references/templates-shared.md § MoSCoW Prioritization` for the full definition and assignment guidance. Present as:

| Item | MoSCoW | Rationale |
|------|--------|-----------|
| <feature or A/C> | Must | <why it's critical — e.g. "unblocks all downstream work"> |
| <feature or A/C> | Should | <why it's important but deferrable — e.g. "enhancement, workaround exists"> |

**Rules for Alfred:**
- Must items: core functionality the epic cannot ship without, foundation/infrastructure, items that unblock other Must stories. Limit to ~50% of total.
- Should items: significant value but a workaround or manual process exists. Second priority after Must.
- Could items: nice-to-have UX polish, convenience features, minor admin tooling. Cut first if scope tightens.
- Won't items: explicitly deferred. Documented so they aren't forgotten. No ticket is created for Won't items.
- After Lucius returns his blueprint, cross-reference Lucius's MoSCoW assignments against this initial draft — adjust if needed.

Ask: *"Does this MoSCoW breakdown look right, or would you adjust any priorities?"*

**6. Generate handoff and route to Lucius** — Generate the Alfred handoff via `$UB make-handoff` with:
- `Type: Epic`
- `Epic Phase: requirements`
- `PRD Path: <absolute path>`
- `PRD Hash: <sha256>`
- `PRD Version: <version or "none">`
- `Repos: <comma-separated paths from repo-detect>`
- Epic-level A/C in the handoff body
- Open questions in `_blocks`

Delete any `-notes.md` for this key. Ask: *"Ready to route this to Lucius for the architectural design pass? He'll produce a blueprint with decomposed stories, then I'll create the epic and all child stories in one pass."*
- If yes: route to Lucius via Skill tool
- If no: sign off, the handoff is saved

Do not create the Jira epic here — it will be created after Lucius returns his blueprint, alongside the child stories.

---

## Epic Resume and PRD Drift Check

When resuming an epic session (Alfred handoff exists with `Epic Phase` set):

1. Read the handoff to get `PRD Path` and `PRD Hash`
2. Run drift check:
```
$UB check-prd-drift <ticket_key> "<prd_path>"
```
3. If `drifted: false` — continue from saved phase
4. If `drifted: true` — present the delta to the user:

> *"The PRD has changed since our last session. Here's what moved:*
>
> **Added:** [new sections from delta]
> **Changed:** [modified sections from delta]
> **Removed:** [removed sections from delta]
>
> *Let me re-derive the A/C against the updated PRD."*

5. Re-read the PRD, compare against the existing A/C, and propose specific changes:
   - New A/C items from added sections
   - Modified A/C items from changed sections
   - A/C items to remove from removed sections

Present as a before/after diff. Ask: *"Want me to apply these changes?"*

6. On confirmation: update the handoff A/C, update the Jira epic description (if API available), re-snapshot the PRD (new hash replaces old).

---

## Story Breakout Flow

When Alfred resumes after a Lucius design pass (handoff has `Epic Phase: story-breakout` or Lucius design handoff exists for the epic):

**Prerequisites:**
- Lucius design artifact exists with `_blocks.Stories` array (pre-decomposed stories) or dependency map + epic A/C
- Epic A/C is finalized
- PRD drift check passed (run Epic Resume check first)

**Entry mode detection:**

| Signal | Mode | Action |
|--------|------|--------|
| Lucius handoff has `_blocks.Stories` array with at least 1 entry | **Pre-built mode** | Load stories from Lucius handoff but run Step 2 and 2b-2c anyway — CARVED evaluation is mandatory, not optional. Lucius's story boundaries are a scaffold, not a constraint. |
| Lucius handoff has no Stories array (escalation or incomplete pass) | **Derive mode** | Run Step 2 to decompose epic A/C into stories from scratch. |

**Key principle: Lucius scaffolds, Alfred owns.** Lucius provides a reasonable first cut of stories and dependencies, but you are expected to improve on it. If a Lucius story has 5+ draft ACs, spans multiple independent capabilities, mixes auth logic with business logic, or would take a single developer more than a few days — split it into more granular stories.

**Inviolable constraint: preserve Lucius's dependency graph and parallelization.** If Lucius says Story A depends on Story B, and you split A into A1/A2/A3, then A1, A2, and A3 ALL depend on Story B. If Lucius says Stories C and D are parallelizable, and you merge them into CD, CD inherits all of C and D's dependencies and all their dependents. You can make the graph more granular (split adds new edges) but never change its direction or break parallel groups. If splitting would create a cycle or violate parallelism, your split is wrong — consolidate instead.

More granular stories are better for parallel implementation and make Dupin's job easier.

**0. Load Lucius handoff** — Read the Lucius handoff (`$UB read-handoff lucius <key>`). Extract:
- `_blocks.Stories` array (if present)
- `technology_stack` array — tech decisions per layer, used in Step 2b3 for consistency checking
- `blueprint_path` — full path to Implementation-Blueprint.md for reference
- `delta_html_path` — full path to C4 delta HTML for architectural context

Also read the Alfred epic handoff if one exists (for epic-level A/C and open questions).

---

**0a. Create the epic (if not already created)** — The epic does not exist yet. Create it from the Lucius blueprint + refined epic-level A/C:

Epic description content:
- Overview paragraph (what + why) — from Lucius blueprint's epic summary
- Epic-level A/C (numbered) — from Alfred's earlier refinement in Epic Creation Flow Step 4
- Deployable units — from Alfred's Epic Creation Flow
- MoSCoW summary table — from Lucius's `moscow` field per story, showing count per category: `Must: N, Should: N, Could: N, Won't: N`
- Story dependencies table with MoSCoW column — | Story | MoSCoW | Depends On | Phase |
- Story count and component map — from Lucius Stories array
- Blueprint reference — link to the Implementation-Blueprint.md

| Mode | How |
|------|-----|
| `rest`/`api` | Create Jira epic (issuetype: Epic). Use `jira-write.py` POST with project, summary, description ADF, team field. |
| `local` | Create per LOC template with Type: Epic. Auto-increment from `tickets/.prefix`. |

Record the epic key for child story creation in Step 5.

---

**0b. Validate epic phases** — After creating the epic, verify the phase data is correct:

Run: `$UB epic-tickets <epic_key> --story-level --validate`

- If validation **passes**: proceed to Step 1
- If validation **fails**: the script will show which stories have mismatched phases. Correct the phase values in the epic ticket to match the computed values, then re-run validation.

Example output on failure:
```
Validation FAILED - mismatches found:
  LOC-0044: written=4, computed=5
```

Fix by updating the epic ticket's Story Dependencies table to use the computed phase value.

---

**1. Load context** — Read the Alfred epic handoff (A/C, open questions) and the Lucius design handoff. In **pre-built mode**, the Lucius Stories array defines the starting point.

**2. Draft story boundaries** — Always run this step, even in pre-built mode. Lucius's story list is a starting point; you must review each story and decide whether it's right-sized.

**When to split a Lucius story into multiple stories:**
- It has 5+ draft ACs (too big for one developer sprint)
- Its ACs span multiple independent capabilities (e.g. "can create businesses AND can upload documents" should be two stories)
- Mixes different layers (auth logic + business logic + UI — these are separate stories)
- Would take a single developer more than a few days to implement
- Some ACs could run in parallel if separated

**When to merge Lucius stories:**
- They share the same dependency set and would be implemented by the same person anyway
- One story is trivially small (1 AC, no meaningful independence)
- Merging enables a cleaner end-to-end test

**Constraint on any split or merge:** Must preserve Lucius's dependency direction and parallelization groups. Splits can add new dependency edges but never reverse them. Merges inherit all dependencies from both sides. If your change would create a cycle or break a parallel group, undo it.

**Story numbering when inserting new stories:** When adding a story to an existing epic (whether from a split, scope expansion, or gap in Lucius's scaffold), the new story must be inserted into the sequence — not appended with the next unused number. The story map is an ordered list (STORY-001→LOC-XXX, STORY-002→LOC-XXX, ...). Insert the new story at the correct position based on its dependency order, then renumber all subsequent stories. Example: if the map is STORY-001→LOC-0031, STORY-002→LOC-0032 and you add a new story between them, it becomes STORY-002→<new LOC>, STORY-003→LOC-0032, etc. Update all references: ticket files, dependency tables, phase maps, and the epic handoff. Never create a story key that skips numbers in the sequence (e.g., LOC-0045 after LOC-0043 with nothing in between).

**2b. CARVED evaluation gate** — Before writing any ACs, evaluate each proposed story against the CARVED axes to validate it's right-sized. If any axis flags a problem, adjust the story boundaries before proceeding to AC refinement.

| CARVED Axis | Evaluation question | If it fails... |
|-------------|-------------------|---------------|
| Concrete | Is the scope boundary clear — do you know exactly what's in and out? | Refine the story's summary until you can state the boundary in one sentence |
| Atomic | Does this story capture ONE capability or concern? | Split — each independent capability gets its own story |
| Realistic | Can one developer deliver this in 1-3 days at the estimated points? | Split if > 8 points, or if the AC count would exceed 4 |
| Variable | Are the configurable parameters limited and well-understood? | If parameters span multiple systems, split by system |
| Exact | Can every AC specify concrete, measurable outcomes? | If any AC would need vague language, decompose until it's concrete |
| Defined | Is there a clear "done" condition that can be checked in a single CI run? | Split until each story has an independent done condition |

If you can't pass all 6 axes for a proposed story, don't write ACs yet — go back to Step 2 and split or merge until every story passes.

**2b2. Story type completeness check** — Before presenting to the user, verify the story list covers required types:

| Required story type | When | What to do if missing |
|--------------------|------|-----------------------|
| Infrastructure | If the epic introduces new services/containers, CI/CD pipelines, shared types, monitoring, database migrations, or test harnesses | Add `type: infrastructure` stories for each new concern, following Lucius's infra guidance. For new services: at minimum a deployment config story (Docker/k8s) and a CI workflow story. |
| E2E integration tests | Always — exactly one E2E test story per epic | Add one `type: test` story with `depends_on` listing ALL feature story IDs (puts it in the last phase). Draft a single E2E AC: the full cross-feature happy path (e.g. "Can create, moderate, and publish a review" → exercises auth, business creation, review submission, moderation, listing). |

The E2E story must be the last story in dependency order — every feature and infrastructure story must be complete before it can run. If the story list has no `type: test` entry or has more than one, fix it now before AC refinement.

**2b3. Technology stack consistency check** — Before presenting to the user, cross-reference every story's draft ACs against Lucius's `technology_stack` array (in the handoff) or the epic's Technology Stack Table (in the blueprint). Every story that names a technology must use one listed in the stack. Flag any mismatch:

| Story | Draft AC Reference | Tech Stack Expectation | Issue |
|-------|-------------------|----------------------|-------|
| LOC-0035 | `dotnet build`, Hot Chocolate | Rust (async-graphql + axum) | TECHNOLOGY MISMATCH |

If any mismatch is found, present it to the user before proceeding. *"Sir, [N] stories reference a technology that doesn't match the epic's architecture stack. Want me to fix them to use the correct stack, or adjust the stack definition?"*

**2c. User gate — present and confirm** — Show the CARVED evaluation for EVERY proposed story to the user in a single table. This is not optional and not silent. You must present it before writing any ACs.

```
| Story | Points | AC Count | CARVED Result | Action |
|-------|--------|----------|---------------|--------|
| LOC-0031 | 8 | 5 | FAIL (Atomic, Realistic, Defined) | Split |
| LOC-0032 | 5 | 3 | PASS | Keep |
```

For each FAIL, explain exactly which axis failed and what you propose to fix it. Then ask: **"Does this boundary look right before I write the ACs?"** Do not proceed to Step 3 until the user confirms. If they disagree, go back to Step 2, adjust, re-evaluate, and present again.

**Why this gate exists:** Without it, CARVED becomes a post-hoc checkbox you check in your head after writing tickets. The user needs to see the evaluation so they can push back before 14 files are created.

Each story must satisfy:
- Follow architectural seams (one service boundary, one contract change, one independent capability)
- Map to specific A/C items (every epic A/C must be covered by at least one story)
- Have clear dependencies noted (from Lucius's dependency map)
- Be independently testable

Present as a table:

| Story | Summary | MoSCoW | Epic A/C Covered | Depends On | Service(s) | Sprint |
|-------|---------|-----------------|------------|------------|--------|

---

**3. Refine story A/C — THIS IS WHERE ALFRED EARNS HIS KEEP.**

Lucius provides draft ACs — 1–3 "can" statements per story. These are *starting hints*, not final content. Your job as Alfred is to take these rough sketches and produce production-grade tickets that a developer can implement without asking clarifying questions.

**Core rule:** One Lucius draft AC becomes 1–3 full ACs, each with 2–4 Scenarios (happy path + at least one error path + empty state where applicable). Every Scenario must have concrete inputs, specific conditions, and measurable outputs — no hand-waving.

**Type-specific refinement:**

| Story type | Refinement approach | Example draft AC → Refined |
|-----------|---------------------|----------------------------|
| `feature` | Expand each draft AC into full ACs with Given/When/Then Scenarios. Add: error paths, validation rules, auth checks, empty states, edge cases (pagination boundaries, duplicate submissions, concurrent edits) | `"Can list reviews with cursor pagination"` → AC1: cursor pagination (happy path + last page), AC2: filter by rating (valid range + out-of-range), AC3: empty directory |
| `infrastructure` | Expand into operational criteria with specific conditions and failure modes | `"Can run tests on every PR push"` → AC1: PR triggers workflow (push + non-PR skip), AC2: test pass (green check + failure notification) |
| `test` | Draft ACs are end-to-end scenarios — expand into multi-step Gherkin with setup, action, assertion phases | `"Can create, moderate, and publish a review"` → multi-step E2E Gherkin scenario with user auth, business creation, review submission, admin login, moderation |

**Concrete example — what "expand" means in practice:**

Lucius gives you:
```
draft_acs: [
  "Can submit a review with rating 1-5 and text",
  "Returns validation errors for missing fields"
]
```

You must produce:
```
### AC1: Submit review with rating and text
Given I am authenticated as a regular user
And business "biz-123" exists
When I submit a review with rating 4 and text "Great place"
Then the review is created with status "pending"
And the business ratingAvg is recalculated
And a NATS event review.submitted is published

Scenario: Duplicate review
Given I already submitted a review for business "biz-123"
When I submit another review
Then I receive error "You have already reviewed this business"

Scenario: Review for nonexistent business
Given business "ghost-biz" does not exist
When I submit a review for it
Then I receive error "Business not found"

### AC2: Validation rejects bad input
Given I am authenticated
When I submit a review with rating 0
Then I receive error "Rating must be between 1 and 5"

When I submit a review with text exceeding 5000 characters
Then I receive error "Review text must be under 5000 characters"

When I submit a review without authentication
Then I receive error "Authentication required"
```

**That is the difference between a draft and a production ticket.** If your ticket has fewer than 2 Scenarios per AC, or any Scenario lacks specific values/conditions, or there's no error-path coverage — you haven't refined enough. Go deeper.

**Lucius story format (pre-built mode):**
```json
{
  "id": "STORY-001",
  "name": "ReviewQueries: paginated review listing",
  "user_behavior": "User can browse reviews",
  "type": "feature",
  "draft_acs": [
    "Can list reviews with cursor pagination",
    "Can filter by rating range 1-5"
  ],
  "component": "review-queries",
  "layer": "handler",
  "parallel": true,
  "moscow": "must|should|could|wont",
  "depends_on": [],
  "contract_acs": [],
  "testability": "standard unit tests"
}
```

**Quality gate — before moving to Step 4, every AC must pass:**
- [ ] Each Lucius draft AC produced 1–3 full ACs (not a 1:1 copy)
- [ ] Every AC has: happy path Scenario + at least one error/edge-case Scenario
- [ ] Empty state covered where applicable (no results, no data, first-time use)
- [ ] Every Scenario has concrete inputs (specific IDs, values, thresholds) — never "valid", "invalid", "existing"
- [ ] All auth/role requirements are explicit per AC (authenticated, admin, owner, anonymous)
- [ ] Error Scenarios specify exact error messages or codes
- [ ] Feature story ACs reference published events (NATS subjects) where applicable

---

**4. Dependency ordering** — Present the full dependency graph (same for both modes):
- Which stories are independent (can run in parallel)
- Which stories block others
- Recommended build order based on `depends_on` and `contract_acs`

In **pre-built mode**, cross-reference Lucius's `depends_on` and `parallel` fields to validate consistency.

---

**5. Create child stories** — After all stories are confirmed (use epic key from Step 0a for parent):

| Mode | How |
|------|-----|
| `rest`/`api` | Create each story as a child of the epic (`parent: <epic key from Step 0a>`). Use `jira-write.py` POST. Create in dependency order (no-dependency stories first). Track the Jira key returned for each story. |
| `local` | Create LOC tickets at `tickets/<KEY>.md` with `Parent: <epic key>` and `Epic Key: <epic key>`. Auto-increment from `tickets/.prefix`. |

**Ticket format requirements (both modes):** Each story ticket MUST include:
- `**Persona:**` set in frontmatter — every AC is written from this persona's perspective (their Given/When/Then)
- `**Points:**` set in frontmatter — Fibonacci estimate with rationale in CARVED.Realistic
- `### AC<N>: <Title>` (h3) headers — NOT `##` or `####`
- Full Given/When/Then Gherkin as paragraphs with blank lines between
- `Scenario:` sub-headings for alternative flows (error paths, edge cases, empty states)
- Frontmatter fields: **Depends On**, **Blocking**, **Parallelizable**, **Epic A/C**, **Points**, **Persona**, **MoSCoW**
- **CARVED Check** table after ACs — Concrete, Atomic, Realistic (includes points rationale), Variable, Exact, Defined
- AC Dependencies table: `| AC | Depends On | Notes |` with `<TicketKey>-<ACn>` format for cross-ticket deps
- **Cross-story dependency validation:** Before writing a cross-story dep (`<TicketKey>-<ACn>`), verify the referenced story is in the same phase and scheduled earlier. If it's in a later phase or unscheduled, **do not write the dep** — flag the conflict and offer: (a) reorder the phase, (b) remove the dep, (c) merge the stories. Out-of-order deps block the pipeline.
- `**Phase:**` tag at the bottom of the file
- At least one error/edge-case Scenario per AC
- Empty state Scenario where applicable

Refer to `references/templates-shared.md` § Local Ticket (LOC) for the canonical template. Use `tickets/LOC-0009.md` as the gold standard reference for format correctness.

**Pre-built mode creation order:** Create in dependency order respecting `depends_on`:
1. Stories with empty `depends_on` (STORY-001, STORY-003, STORY-004)
2. Stories depending on those (STORY-002 depends on STORY-003; STORY-006, STORY-007 depend on STORY-003)
3. Stories with deeper deps (STORY-005 depends on STORY-002)

For multi-story creation, accumulate all stories first, present the full list, confirm once, then create in batch.

---

**5b. Story ID → Jira key mapping & contract update (pre-built mode only):**
After creating all stories (when real Jira keys exist), build a mapping table:

| Lucius ID | Jira Key | Notes |
|-----------|----------|-------|
| STORY-001 | LOC-042 | No dependencies |
| STORY-002 | LOC-043 | Depends on LOC-042 (was STORY-001) |

Record this mapping in the Alfred handoff under `**Lucius Story Map:** STORY-001 → LOC-042, STORY-002 → LOC-043`. This ensures downstream skills (Damian, Bruce) can resolve references.

**Update contract ACs with real Jira keys:** For each story with `contract_acs`:
1. Replace Lucius internal IDs with real Jira keys in the text (e.g. `"Contract with STORY-001"` → `"Contract with LOC-042"`)
2. For `rest`/`api` mode: edit the story's Jira description to add a `**Dependencies**` section listing the resolved contract references
3. For `local` mode: append the resolved contract references to the ticket file

---

**6. Update epic phase** — Make updated Alfred handoff via `$UB make-handoff` with `Epic Phase: active`. Include:
- All created story keys and their dependency ordering
- The Lucius Story Map (STORY-N → real Jira key)
- Path to the Implementation Blueprint for Damian's reference

---

## Bug Creation Flow

When the user wants to file a new bug, guide them through the **Bug Report** template from `references/templates-shared.md`. The goal is a scannable, evidence-driven ticket — not a data dump. This flow creates the bug and ends the session — the bug enters the pipeline later when picked up for work (at which point it goes through the normal existing-ticket flow: Steps 2-7).

**1. Gather the defect** — Ask the user to describe what's wrong. They may paste test output, error logs, JSON payloads, or just explain in plain English. Accept whatever they give you — your job is to structure it, not demand a specific input format. Ask clarifying questions if the defect isn't clear: *"What were you expecting to happen, sir?"*

**2. Structure the report** — Using the **Bug Report (Jira)** template, build the ticket:
- **Summary:** Write a clear one-line summary. Format: `[Component] — [what's wrong]`. E.g. `[Transactions GET] — payorId and savedPaymentMethodId missing from response`.
- **Environment:** Extract from context or ask.
- **Steps to Reproduce:** Translate the user's input into numbered human-readable steps. If a test name was provided, include it as a shortcut but always write the actual steps too.
- **Expected vs Actual:** Be specific — name the fields, values, or behaviors.
- **Evidence:** This is the critical part. Extract only the relevant delta from any payloads the user provided. If they pasted 150 lines of JSON, pull out the 5 lines that matter. Full payloads go in a Jira comment or attachment, not inline.

**3. Draft A/C** — Write Gherkin acceptance criteria for the fix. For bugs, A/C describes what must be true when the bug is resolved — not a restatement of the bug. Use the formatting rules from § Gherkin Formatting Rules below.

**4. Review with user** — Present the full structured bug report and ask: *"How does this look, sir? Anything to adjust before we file it?"*

**5. File it** —
- **API mode:** Create with `jira_create_issue` (type: Bug), confirm before executing. If a parent epic or component is known, include it.
- **Local mode:** Create per **Bug Backlog Entry** template in `references/templates-shared.md`. Save to `<BASE_DIR>/tickets/bugs/BUG-XXXX.md`. Auto-increment: glob `BUG-*.md` in `tickets/bugs/`, highest + 1, padded to 4 digits. Prefix counter in `tickets/bugs/.prefix`.

After filing, confirm in Alfred's voice and sign off: *"Bug filed and ready for action whenever the team picks it up, sir."* Do not proceed to the refinement steps — the bug will go through the full flow (Steps 2-7) when it's picked up for work.

---

## Split Story Procedure

When the user confirms a ticket is too big and identifies A/C to split out, for each item:

### New Story Path
1. Print the full story for user review:
   ```
   Summary: <title>
   Type: Story
   Description:
   As a <persona>, I want <goal> so that <reason>.

   Acceptance Criteria:
   <Gherkin A/C for that item — using bullet hierarchy format>

   Links: split from <original ticket key>
   ```
2. **API mode:** After showing it, ask: "Want me to create this story in Jira?"
   - If **yes**:
     1. Create it using `jira_create_issue`, copying the fields listed in config.md's `### When Creating a Split Story` section from the original ticket. For the team field, pass it as a plain string ID (e.g. `"<team-field>": "<team-uuid>"`).
     2. Link it using `jira_create_issue_link` with the split link type from config.md's `### Jira Link Types` section, `inward_issue_key: <original ticket>`, `outward_issue_key: <new story>`.
   - If **no**, leave it for the user to copy-paste manually.
   **Paste mode:** Say: *"I can't create this in Jira directly, sir. Here's the full story ready for copy-paste."* The story details above serve as the copy-paste template. Note it in the handoff for reference.

### Sub-task Path
Add it to a running **Sub-task list** maintained in context for this session:
```
Sub-tasks to create:
- [summary]: [Gherkin A/C for this item]
```
Confirm each addition: "Added to sub-task list. Anything else to split?" Continue until done. Step 6 will create all items in this list.

---

## Jira Update Procedure

### If user says YES to updating Jira:

1. Check if the current A/C is already in Gherkin format.
2. Convert all A/C (original + new) to Gherkin style using the template chosen in Step 5. Use the exact indentation from § Gherkin Formatting Rules below:
   - **Test project**: Acceptance Criteria section only.
   - **Implementation project**: Acceptance Criteria section, then a Gherkin Scenarios section below it. Each AC gets one or more Scenarios with specific inputs/outputs. Scenarios nest Given/When/Then at 6 spaces, And at 12 spaces.
   - Keep each scenario focused on one behavior.
3. Build the **complete description** using the canonical template in § Standard ADF Format (below). The template defines the full section order: Story heading (open, includes story points) → CARVED Check (collapsible expand) → Acceptance Criteria (AC expands) → Original AC (collapsible expand) → Dependencies (collapsible expand). Do NOT include Example Tests or Existing Framework Reuse sections — those are Bruce/Damian's domain.
   Write via: `$UB write-temp alfred full-description.json <<'JSON' ... JSON`
   **⚠ Do NOT call `$UB build-adf-json` separately.** `jira-write` calls it internally via the payload pipeline.
   **Note on nesting:** write both outer and inner levels as `expand` in the input JSON -- `build-adf-json.py` automatically promotes inner expands to `nestedExpand` (required by Jira ADF). Do not write `nestedExpand` manually.
4. Write the full description in one call:
   - **MCP available:** `jira_update_issue` MCP tool with the complete description content
   - **REST fallback:**
     1. `$UB build-adf-json <full-description.json> <output-payload>`
     2. `$UB jira-write <pin> PUT <issue-url> <output-payload>`
     3. **Post-write verification:** fetch `$UB jira-fetch <pin> "<issue-url>?fields=description"` and confirm the expected AC headings appear in the response. If they are missing, report failure -- do not claim success.
5. Use `jira_add_comment` MCP tool to post a comment:
   ```
   Refined the acceptance criteria for this ticket.

   **Changes made:**
   - [Converted A/C to Gherkin format, if applicable]
   - [List any new criteria added]
   - [Note any sub-tasks to be created]

   Original A/C preserved as blockquote in the description.
   ```
6. If the **Sub-task list** from Step 4 contains any items, display it in full:
   ```
   Sub-tasks to create:
   - [summary 1]: [Gherkin A/C]
   - [summary 2]: [Gherkin A/C]
   ```
   Ask: "Want me to create these [N] sub-tasks in Jira now?" If yes, create each one using `jira_create_issue` with:
   - `issuetype: Sub-task`
   - `parent: <original ticket key>`
   - Summary and Gherkin A/C for that item

**⚠ Media preservation (do this before writing -- skipping wipes inline images):** Scan the fetched description ADF (from Step 1) for `mediaSingle`/`media` nodes. If any exist: (1) extract each media `id`, (2) verify those IDs exist as attachments via `GET /rest/api/3/issue/<key>?fields=attachment`, (3) if any inline image is NOT in the attachments list, upload it first via `POST /rest/api/3/issue/<key>/attachments`. Add a `(see attachment <filename>)` reference in the relevant section of the reconstructed description. Only then write. If no `mediaSingle` nodes are found, proceed immediately.

**Partial failure handling:** Step 6 makes multiple Jira calls (description update, comment, sub-tasks). If any call fails with a 4xx/5xx after earlier calls succeeded, report what landed and what didn't — e.g. *"The description was updated, sir, but the comment failed with [error]. Want me to retry, or shall I note it for later?"* Record the partial state in the handoff: `**Jira Updated:** partial (description updated, comment failed: [error])`.

**For complex comments** (with bullet lists, nested structure, or multiple formatting types): If `post-jira-comment` with sections format fails or produces poor formatting, write proper ADF JSON directly using the exact structure from `build-adf-json.py` output (with `"type": "doc"`, `"version": 1`, `"content": [...]`), then POST it via `$UB jira-write <pin> POST "https://procare.atlassian.net/rest/api/3/issue/<key>/comment" <adf-file>`. The sections format is simpler but less reliable for lists. Use `PUT .../comment/<id>` to fix an existing malformed comment.

### If user says NO to updating Jira:

- Check if the A/C is already in Gherkin format.
- If **not in Gherkin**, ask: "The A/C isn't in Gherkin format — want me to update it to Given/When/Then/And without changing anything else?"
  - If yes, convert to Gherkin (same format as YES path step 2), update the description via `jira_update_issue`, and add the Alfred comment via `jira_add_comment`.
  - If no, skip.

---

## Standard ADF Format (build-adf-json sections)

This is the canonical input format for `build-adf-json.py` when writing a Jira ticket description. Gold standard established from PAY-7334. Use this full template every time — not just the AC block.

**CRITICAL:** Use snake_case type names (`bullet_list`, `ordered_list`, `code_block`), NOT camelCase (`bulletList`, `orderedList`, `codeBlock`). The script converts snake_case to proper ADF camelCase internally. If you use camelCase in the input, the script won't recognize the type and will treat it as a paragraph (causing `KeyError: 'text'`).

### Complete sections JSON template

```json
{"sections": [
  {"type": "heading", "level": 2, "text": "Story"},
  {"type": "paragraph", "text": "**Story Points:** <N> story points"},
  {"type": "paragraph", "text": "**Persona:** <role>"},
  {"type": "paragraph", "text": "As a <persona>, I want <goal>"},
  {"type": "rule"},
  {"type": "expand", "title": "CARVED Check", "content": [
    {"type": "bullet_list", "items": [
      "Concrete: <one line>",
      "Atomic: <one line>",
      "Realistic: <N> story points -- <rationale for the estimate>",
      "Variable: <configurable parameters -- e.g. counts, IDs, tool choices>",
      "Exact: <one line>",
      "Defined: <one line>"
    ]}
  ]},
  {"type": "rule"},
  {"type": "paragraph", "text": "**Acceptance Criteria**"},
  {"type": "expand", "title": "AC-01: descriptive title for this criterion", "content": [
    {"type": "expand", "title": "Scenario: Happy path scenario name", "content": [
      {"type": "code_block", "language": "gherkin", "text": "Given [precondition]\nWhen [action]\nThen [expected result]\nAnd [additional assertion]"}
    ]},
    {"type": "expand", "title": "Scenario: Error case scenario name", "content": [
      {"type": "code_block", "language": "gherkin", "text": "Given [precondition]\nWhen [action with invalid input]\nThen [expected error response]"}
    ]}
  ]},
  {"type": "expand", "title": "AC-02: next criterion title", "content": [
    {"type": "expand", "title": "Scenario: ...", "content": [
      {"type": "code_block", "language": "gherkin", "text": "Given ...\nWhen ...\nThen ..."}
    ]}
  ]},
  {"type": "rule"},
  {"type": "expand", "title": "Original Acceptance Criteria (preserved)", "content": [
    {"type": "blockquote", "text": "original AC text verbatim"}
  ]},
  {"type": "rule"},
  {"type": "expand", "title": "Dependencies", "content": [
    {"type": "bullet_list", "items": [
      "<dependency 1 -- e.g. US-01: golden path scenarios verified here>",
      "<dependency 2>"
    ]}
  ]}
]}
```

### Story point sizing rubric

Fibonacci scale. Alfred picks the closest fit and states the reason in the Realistic bullet.

| Points | Anchor |
|--------|--------|
| 1 | Trivial -- config change, rename, single-line fix with no test impact |
| 2 | Small -- single well-understood unit, clear scope, no unknowns |
| 3 | Moderate -- a few components, some decisions but approach is known |
| 5 | Meaningful -- cross-cutting or multiple components, one or two unknowns |
| 8 | Complex -- new pattern, infra addition, or significant unknowns requiring investigation |
| 13 | Large -- multiple unknowns, needs design pass first, or spans multiple services |

If the estimate spans two values (e.g. 8--13), state the condition that determines the high end.

### Format rules

- Gherkin ALWAYS goes in `code_block` with `language: "gherkin"` -- **never** in `paragraph`
- AC titles use hyphen-number format: `AC-01: descriptive title` (the expand title, not a bold paragraph)
- Each AC is an outer `expand`. Each scenario inside it is an inner `expand` (written as `expand` in input -- `build-adf-json.py` auto-promotes inner ones to `nestedExpand` for Jira ADF)
- Gherkin steps inside `code_block` are flush-left -- no leading spaces on Given/When/Then/And
- Multiple scenarios per AC = multiple inner `expand` nodes, one per scenario
- CARVED Check is a collapsible `expand` with a `bullet_list` inside -- one bullet per axis (C/A/R/V/E/D)
- Story section (h2 heading + story points + persona + user story) is NOT wrapped in an expand -- it stays open
- Dependencies section is a collapsible `expand` with a `bullet_list` inside
- Do NOT include Example Tests or Existing Framework Reuse sections -- those belong to Bruce/Damian
- Original AC always preserved below a `rule` separator in a collapsible `expand` titled "Original Acceptance Criteria (preserved)", text inside a `blockquote`

### AC category coverage (from PAY-7334 gold standard)

Cover these categories where applicable:
- **AC-01: Happy path** -- valid inputs, expected success behavior
- **AC-02: Validation/error cases** -- each invalid input variant gets its own `Scenario`
- **AC-03: Regression/backward compat** -- existing behavior unaffected by the change
- **AC-04: Edge/boundary cases** -- zero, null, max, concurrent, large payload as applicable

### Characters that are safe in code_block nodes

Gherkin code blocks pass through ADF unchanged -- these characters are all safe:
`{merchantId}`, `| field | value |`, `"quoted"`, `'single'`, `` `backtick` ``, `*.json`, `&`, `<`, `>`

Never use paragraph nodes for Gherkin -- `parse_inline_marks()` will eat asterisks and backticks.

---

## Gherkin Formatting Rules

### Template Selection

Pick based on ticket context:

- **Test project** (labels like "Nothing-To-Release", ticket is about writing tests/QA automation, description mentions test suites or test coverage): use the **test project** template — same expand/nestedExpand structure as the implementation template. Given = test setup, When = action under test, Then = assertion. A/C map to expand blocks with scenarios nested inside.
- **Implementation project** (features, bugs, refactors — code that ships): use the **implementation** template — two sections (Acceptance Criteria + Gherkin Scenarios). A/C define what must be true. Scenarios break each AC into concrete, testable cases with specific inputs and expected outputs.

If unsure, ask: *"Is this a test-only ticket (writing tests, not shipping features), or does it involve implementation that ships to production?"*

### Test Project Template

Same expand/nestedExpand structure as the implementation template. Each AC becomes an outer `expand` (title = AC title). Each scenario becomes a `nestedExpand` inside it. Given/When/Then steps go in a `code_block` with `language: gherkin`. `build-adf-json.py` handles the `expand` → `nestedExpand` promotion automatically.

ADF sections structure:

```json
{"type": "expand", "title": "AC1: <title>", "content": [
  {"type": "expand", "title": "Scenario: <scenario name>", "content": [
    {"type": "code_block", "language": "gherkin", "text": "Given <test setup>\nWhen <action under test>\nThen <assertion>\nAnd <additional assertion>"}
  ]}
]}
```

Jira preview format (human-readable):

```
AC1: <title>
  └─ Scenario: <scenario name>
       Given <test setup>
       When <action under test>
       Then <assertion>
       And <additional assertion>
```

### Implementation Template

Each AC becomes an outer `expand` (title = AC title). Each scenario becomes a `nestedExpand` inside it (title = Scenario name). The Given/When/Then steps go in a `code_block` with `language: gherkin` inside the nestedExpand. Jira renders the code block verbatim — no bullet hierarchy needed.

ADF sections structure:

```json
{"type": "expand", "title": "AC1: <title>", "content": [
  {"type": "expand", "title": "Scenario: <scenario name>", "content": [
    {"type": "code_block", "language": "gherkin", "text": "Given <precondition>\nWhen <action>\nThen <expected result>\nAnd <additional assertion>"}
  ]},
  {"type": "expand", "title": "Scenario: <another scenario>", "content": [
    {"type": "code_block", "language": "gherkin", "text": "Given <different precondition>\nWhen <different action>\nThen <different result>"}
  ]}
]}
```

Default view: six AC title lines visible. Click an AC to see scenario names. Click a scenario to read the steps.

`build-adf-json.py` handles the `expand` -> `nestedExpand` promotion automatically — any `expand` node inside another expand's `content` array is emitted as `nestedExpand`. Input JSON uses `expand` for both levels; the tool does the right thing.

### Gherkin Steps in code_block (exact formatting)

Steps inside `code_block` render verbatim. Standard Gherkin whitespace applies:
- `Given`, `When`, `Then`, `And`, `But` = no indent (flush left)
- Continuation lines (e.g. a data table row or docstring) = 2 spaces

### Gherkin Keywords

Use **Given / When / Then / And / But**. Prefer `And` for additional assertions in the same direction. `But` is a **last resort** — only use it when the negative assertion genuinely cannot be expressed any other way. If a `But` clause can be rephrased as an `And` or split into its own scenario, do that instead. When in doubt, `And` keeps scenarios simpler.

### Contract language only -- no implementation details

Gherkin describes what an external caller or QA engineer can observe. It must never reference internal implementation details. The test suite knows about these things; the ticket should not.

**Never write:**
- Language-specific type names or enum values (`StripeIdType.PaymentIntent`, `ResponseStatus.Declined`, `HttpStatusCode.PaymentRequired`)
- SDK field names or internal property names (`decline_code`, `error.Type`, `StripeError.Code`)
- Internal class or method names (`StripeErrorMapper.Map(error)`, `StripeCurrencyHelper.ToMinorUnits`)
- Test parameter values verbatim lifted from `[InlineData(...)]` or similar test attributes

**Write instead:**
- Observable outcomes in plain language (`the response reflects a declined transaction`, `it is identified as a Payment Intent`)
- External API contract terms (HTTP status codes, JSON field names in the public response, error message text visible to callers)
- Stripe's public API concepts where they ARE the external contract (prefix strings like `pi_`, `ch_` -- these are Stripe's documented public identifiers, not internal types)

**Self-check before finalising Gherkin:** Scan every Given/When/Then line. If a term would only appear in source code or a test file -- not in a spec, API doc, or user story -- replace it with what a QA engineer or product owner would say instead. If a detail is genuinely needed for test precision (e.g. "returns HTTP 400"), express it as an observable API contract, not a code symbol.

---

## Gordon Split Mode

When a Gordon scope-split handoff is found (either from conversation context or disk, and not marked `status: complete`), the ticket key, a description of what was committed, and what still needs to be split out are available. Skip Steps 1-4 and follow this procedure:

### Fetch Current Ticket State

- **API mode:** Fetch the current ticket using `jira_get_issue` with `fields: "summary,description,parent,components,labels,<team-field>"` (substitute `<team-field>` with the team custom field ID from config.md) — you need the latest description to safely remove split-out A/C, plus the fields to copy to the new story.
- **Paste mode:** Ask the user to paste the current ticket description so you can identify which A/C to remove. Say: *"I can't reach Jira at the moment, sir. Paste the current ticket description so I can see what's there and what needs splitting."*

### Confirm Scope

- State: "Gordon flagged that the changes for [ticket key] were bigger than one ticket. I'll help split the remaining work into a new story."
- Summarize what was committed and what still needs to go somewhere.
- Ask: "Does this match what you want to split out, or do you want to adjust the scope?"

### Create New Story & Update Original

Proceed with new story creation (the "New story" sub-flow from § Split Story Procedure — skip the "Is this too big?" question since we are already splitting), then update the **original ticket** before moving to Step 6:

**API mode:**
1. Remove the split-out A/C from the original ticket's description. **When removing Gherkin-formatted A/C, remove the entire A/C block** (header `**ACN: ...**` through all its Given/When/Then/And lines and any Scenarios) — do not do line-by-line text subtraction, as this can leave orphaned `And` clauses or broken indentation. Rebuild the remaining A/C cleanly.
2. Use `jira_update_issue` to save the updated description. Confirm with the user before executing.
3. Use `jira_add_comment` to post a comment on the original ticket:
   ```
   Scope split performed. The following A/C were moved to a new story:
   - [list each split-out criterion]

   New story: [new story key] — [new story summary]
   Remaining A/C on this ticket: [list what stays]
   ```
   Confirm with the user before posting.

**Paste mode:**
Collect all Jira actions (updated description, split comment, new story details) — do not display them inline. They will be presented as one consolidated block per the **local mode output rule** before the handoff. Skip Step 6 entirely (it would only repeat the description update).

### Proceed Through Step 6

- **API mode only:** Proceed through Step 6 for the **original ticket** only — apply any remaining Jira updates (e.g. Gherkin formatting if not already done). Skip Steps 5 and 7 entirely — this is a split, not a new implementation session. Skip the Jira description update in Step 6 if it was already updated in the split step above (to avoid a double update).
- **Paste mode:** Skip Step 6 (already handled by the consolidated output block). Proceed directly to the wrap-up actions below.

### Wrap-Up

After Step 6 is complete (or skipped in paste mode), perform these inline:

1. Stamp the Gordon scope-split handoff as complete by adding a `status: complete` line immediately after the first header line in `<BASE_DIR>/handoffs/gordon/Gordon-<ticket-key>-split.md`. This prevents Oracle or Alfred from re-entering split mode on the next session.
2. Ensure `<BASE_DIR>/handoffs/alfred/Alfred-<ticket-key>.md` exists. If not (split mode skips Steps 5-7), create it using the **Step 7 handoff template** with these differences: `**Final A/C:**` contains only the remaining A/C (not split out), add `**Split A/C (if any):** <A/C split to new story with ticket key>`, and `**Assumptions:**` includes split context.
3. Say in Alfred's voice — e.g. *"The split is filed and accounted for, sir. The committed work is already pushed — Gordon's part is done. The new story is queued and waiting whenever you'd like to begin."* Do not invoke Gordon — the code was already committed and pushed before the scope-split was triggered.

---

## QA Completion Comment Template

**When to use:** User says "add a completion comment", "post QA results", "QA passed", "QA failed -- post a comment", or similar after a Bruce handoff exists (PASS, PARTIAL, or FAIL).

**IMPORTANT -- no pipeline skill names in comments.** Never mention "Bruce", "Alfred", "Damian", "Gordon", or any other pipeline skill name in Jira comments. Use "QA validation", "testing", "review", or similar neutral language.

**How to build the comment:**

1. Read `Bruce-<ticket-key>.md` for: QA Result, per-AC findings.
2. Read the ticket description for AC titles.
3. Draft using the template below. Show to user for approval before posting.
4. Post via `$UB post-jira-comment <pin> <issue-key> <sections-json-file>`.

**Template structure:**

```
QA Review -- <TICKET-KEY>: <PASS|FAIL|PARTIAL>

Verdict: <PASS|FAIL|PARTIAL>. <one-line summary, e.g. "All ACs validated." or "N/M ACs pass.">

AC1 -- [PASS|FAIL|PARTIAL]: <one-line summary>
- <specific issue or confirmation>
- <specific issue or confirmation>

AC2 -- [PASS|FAIL|PARTIAL]: <one-line summary>
- <specific issue or confirmation>

...

Notes:
- <cross-cutting notes -- omit this section entirely if none>
```

**Formatting rules:**
- Bullets throughout -- no prose paragraphs
- One header line per AC, bullets underneath for detail
- Omit Notes section if nothing cross-cutting to add
- ASCII only -- no em dashes, smart quotes, ellipsis characters
- No pipeline skill names
