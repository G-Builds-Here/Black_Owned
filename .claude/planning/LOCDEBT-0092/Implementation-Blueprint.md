## Implementation Blueprint
**Status:** delivered via LOCDEBT-0092 (off-board epic — no Jira ticket; Dupin runs from this story map)

Epic 2 of 3 (LOCDEBT-0091 → 0092 → 0093). Requires LOCDEBT-0091's dual-lane harness for honest test signals. Findings source: `~/.claude/plans/tech-debt-loc-0091-findings.md` + survey findings #21.

### 1. Repository Mapping & Target Location
- `src/lib/auth/useClientSession.ts` (new) — shared session-read hook; home per `src/lib/auth/` convention
- `src/components/ui/Navigation.tsx` — signout error path, `next/link`, hook adoption
- `src/lib/auth/auth-service.ts` — env-only key loading; delete committed-keypair fallback; delegate refresh persistence
- `src/lib/db/session-repository.ts` (new) + `migrations/postgresql/0XX_create_sessions.sql` — DB-backed refresh tokens; numbered-migration convention exists
- Why: auth-service and session storage are the epic cluster the whole LOC-0091 run circled (TD-2/3/4/7, survey #21); baseline C4 shows the edges (`Navigation→client-session`, `auth-service→valkey` only). `[HIGH]`

### 2. Confidence Rating
**Confidence: Medium** — Factor: STORY-004's dual-write session migration changes live login/logout behavior; blast radius known but regression risk real — mitigated by STORY-005 E2E journey. `[MED]`

### 3. Architectural Analysis
**Pitfalls:** dual-write drift (Postgres vs Valkey diverge) — write-through with Postgres as system of record, Valkey strictly read-through cache; migration rollback — new table only, no destructive DDL; committed JWT keypair is LIVE in any environment relying on it — rotate pair as part of STORY-003, not after; hook adoption changes three call sites at once — keep hook API a superset of existing per-site effects.
**Existing Debt:** TD-2/3/4/7, #21 — all fixed in-epic (Y). `jwt-test-fixtures` leftovers — fix now optional (N, harmless).

### 4. Behavior Decomposition
| User Behavior | Story | Type | Draft ACs | Component | Layer | Parallel? | MoSCoW | Depends On | Seams | Contract ACs | Testability |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Consistent session state across pages | useClientSession: shared session hook | feature | Can read session through one hook with `{user, loading, error, refresh()}`; the three hand-rolled mount effects (Navigation, BusinessDetail, claim page) are removed | use-client-session | type | yes | must | — | — | Contract with STORY-002: exposes `{user, loading, error, refresh}` — STORY-002 consumes it | standard unit tests (jsdom) |
| Reliable sign-out with visible failure | Navigation: signout error path + next/link + hook | feature | Can see an error state when sign-out fails (catch present); internal nav uses `next/link`; session read comes from the hook | components-ui-navigation | controller | no | should | STORY-001 | — | Contract with STORY-001: consumes `{user, loading, refresh}` hook API | standard unit tests (jsdom) |
| No key material in git | auth-service: env-provisioned JWT keys | feature | Can startup fail loudly without env key material; committed `config/jwt` pair deleted + gitignored; rotation performed and documented | lib-auth-auth-service | service | yes | must | — | config | Contract with STORY-004: exposes env-only key load + verify surface — STORY-004 layers persistence on it | standard unit tests + startup probe |
| Sessions survive cache flush | session-repository: DB-backed refresh tokens | feature | Can persist/rotate/revoke refresh tokens in Postgres; revocation survives Valkey flush; read-through keeps cache hits | session-repository | repository | no | must | STORY-003 | schema | Contract with STORY-003: provides save/rotate/revoke consumed by auth-service; Contract with Epic-3 guards: session validity query stays signature-compatible | requires: postgres (integration lane, LOCDEBT-0091 harness) |
| Auth flow proven end-to-end | E2E: auth journey regression | test | Can register → login → refresh → sign out; revoked session rejected after Valkey flush; sign-out failure surfaces UI error | api-auth-login-route | test | no | must | STORY-001, STORY-002, STORY-003, STORY-004 | — | Consumes all epic contracts | requires: compose stack + webServer (playwright) |

### 5. C4 Delta
**C1/C2:** unchanged. **C3 (`black-owned-frontend`):** NEW `use-client-session`, `session-repository`; MODIFIED `components-ui-navigation`, `lib-auth-auth-service`; edges: nav →reads→ hook, auth-service →persists→ session-repository; REMOVED edge `components-ui-navigation →imports→ lib-auth-client-session`. **C3.5:** unchanged. Delta verified 9/9 (amber + removed-edge asserted).

### 6. Execution & Integration Strategy
**Tracks:** Track 1 Client: STORY-001 → 002 / Track 2 Server: STORY-003 → 004 / STORY-005 capstone
**Contracts:** hook `{user, loading, error, refresh()}`; auth-service env-only key load + `save/rotate/revoke` delegation; session-validity query shape (frozen for Epic 3's guard layer).
**Order:** 1. STORY-001 ∥ STORY-003 2. STORY-002 (needs hook) ∥ STORY-004 (needs env-only key surface; shares `auth-service.ts` file with 003 — sequenced after it deliberately) 3. STORY-005. Seam stories: 003 config, 004 schema — serialize epic-wide.

**Dupin-test intent (telemetry):** mixed epic — dependency chains, schema seam + migration story, a deliberate shared-file serialization (003→004), and a failure-prone auth E2E to exercise fix round-trips.
