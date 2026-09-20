## Implementation Blueprint
**Status:** delivered via LOCDEBT-0093 (off-board epic — no Jira ticket; Dupin runs from this story map)

Epic 3 of 3 (LOCDEBT-0091 → 0092 → 0093). Runs after LOCDEBT-0092 — the guard layer consumes the session-validity surface Epic 2 froze. Findings source: `~/.claude/plans/tech-debt-loc-0091-findings.md` + survey findings #8.

### 1. Repository Mapping & Target Location
- `src/lib/graphql/guard.ts` (new) — canonical `requireUser`/`requireRole`; home beside existing resolvers
- `src/middleware.ts` (new) — server-side `/admin` guard; App Router middleware is the documented mechanism
- `src/app/api/graphql/route.ts` — entry delegates to guard layer
- `src/lib/graphql/resolvers.ts` — hand-rolled per-op checks replaced; envelope contract documented
- Why: baseline C3 shows auth decided per resolver (3 hand-rolled variants by LOC-0093) and every `/admin` page importing only the client-side helper — the server-side gap is survey finding #8. `[HIGH]`

### 2. Confidence Rating
**Confidence: Medium** — Factor: guard + middleware patterns are standard, but Next.js middleware matcher scope over `src/app/**` route segments needs verification against the actual route tree before the guard story's ACs can be trusted `[MED]`.

### 3. Architectural Analysis
**Pitfalls:** middleware matcher too narrow → guardless /admin pages — enumerate matcher against route tree in STORY-002 ACs; guard layer bypassed by future resolvers — make entry-level delegation the single auth decision point; envelope "versioning" story scope creep — document + pin with regression tests, no wire change (owner ruling: contract decision, not redesign).
**Existing Debt:** TD-5/TD-6, survey #8 — fixed in-epic (Y). `login-resolvers` hand-rolled check — folded into guard adoption via resolvers story only if same file; else N (deferred note).

### 4. Behavior Decomposition
| User Behavior | Story | Type | Draft ACs | Component | Layer | Parallel? | MoSCoW | Depends On | Seams | Contract ACs | Testability |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Uniform authorization on API | graphql-guard: canonical guard layer | feature | Can enforce `requireUser`/`requireRole` from one module; all guarded resolvers delegate; unauthorized calls return Forbidden without data side-effects | graphql-guard | service | yes | must | — | — | Contract with LOCDEBT-0092 STORY-004 (provider): session-validity surface stays signature-compatible — this story consumes it; Contract with STORY-003: exposes guard call shape | standard unit tests (mocked auth) |
| /admin unreachable without admin session | admin-route-guard: server-side enforcement | feature | Can reach no `/admin` page server-side without admin session (redirect/401); client-side check reduced to presentation | admin-route-guard | handler | yes | must | — | routes | Contract with Epic-2 auth-service: verifies via existing cookie verification — consumes it | standard unit tests + server-side probe tests |
| Envelope shape is a known contract | resolvers: createBusiness envelope contract documented + pinned | feature | Can read documented envelope contract (`{success,data,error}` shape + version policy); regression tests pin the shape | lib-graphql-resolvers | service | no | should | STORY-001 | — | Contract with STORY-001: consumes guard call shape in resolver rewrites | standard unit tests |
| Authorization proven end-to-end | E2E: authorization journey | test | Can reject non-admin direct-URL and API probes; role matrix passes; envelope shape assertions hold after guard adoption | api-graphql-route | test | no | must | STORY-001, STORY-002, STORY-003 | — | Consumes guard + envelope contracts | requires: compose stack + webServer (playwright) |

### 5. C4 Delta
**C1/C2:** unchanged. **C3 (`black-owned-frontend`):** NEW `graphql-guard`, `admin-route-guard`; MODIFIED `api-graphql-route`, `lib-graphql-resolvers`; edges: route →delegates→ guard, guard →verifies→ auth-service, admin-guard →verifies→ auth-service, resolvers →guarded by→ guard. **C3.5:** unchanged. Delta verified 8/8.

### 6. Execution & Integration Strategy
**Tracks:** Track 1 API: STORY-001 → 003 / Track 2 Routes: STORY-002 / capstone STORY-004
**Contracts:** session-validity surface (from Epic 2, frozen); guard call shape `requireRole(ctx, role)`; envelope `{success,data,error}` + version policy.
**Order:** 1. STORY-001 ∥ STORY-002 2. STORY-003 (needs guard shape) 3. STORY-004. Seam story: STORY-002 declares `routes` — serializes against any other route-touching story.

**Dupin-test intent (telemetry):** mostly-parallel feature dispatch, contract-AC-heavy decomposition, security-shaped test stories — exercises parallel claims + contract agreement between concurrent implementers.
