## Implementation Blueprint
**Status:** delivered via LOCDEBT-0091 (off-board epic — no Jira ticket; Dupin runs from this story map)

Epic 1 of 3 (LOCDEBT-0091 → 0092 → 0093). Findings source: `~/.claude/plans/tech-debt-loc-0091-findings.md` (TD-1..TD-10 + survey #8/#21), harvested via `dupin-retro` (`~/.claude/audits/LOC-0091/retro.md`).

### 1. Repository Mapping & Target Location
- `jest.config.js` — dual-lane projects config; only harness home (Jest is the repo's unit runner)
- `src/qa/loc-0092-next-response-fidelity.spec.ts` — fidelity suite moves to integration lane here
- `src/lib/db/pending-import-business-repository.spec.ts` — DB-bound suite mocked into unit lane here
- `docker-compose.yml`, `.env.example`, `scripts/` — dev-env bootstrap + port-3000 probe
- `.gitignore` — Playwright `test-results/` hygiene
- Why: baseline-red suites poison every QA signal (25 tests fail on every run per LOC-0093/0095 QA handoffs); fix the harness before feature debt so every later story gets honest green/red signals. `[HIGH]`

### 2. Confidence Rating
**Confidence: High** — Factor: Jest projects-splitting and gitignore/compose work are standard; only open question is the fidelity suite's partial-`next build` requirement `[MED]`.

### 3. Architectural Analysis
**Pitfalls:** unit lane accidentally touching real I/O → lane drift — mitigate: unit lane runs with `CI=true` + no network env, mock `getPool()` at module boundary. Port-3000 stale server (LOC-0093 L4 blocker) → probe fails fast with named PID. `next build` runtime in integration lane → gate it behind a build-artifact check, run once per lane not per spec.
**Existing Debt:** TD-8 foldable test duplicate — fix now (Y, folded into harness story). Pipeline-side debt — out of scope by owner ruling.

### 4. Behavior Decomposition
| User Behavior | Story | Type | Draft ACs | Component | Layer | Parallel? | MoSCoW | Depends On | Seams | Contract ACs | Testability |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Clean `git status` after test runs | Repo hygiene: gitignore Playwright artifacts | infrastructure | Can run Playwright suites leaving no untracked `test-results/` entries | config | infrastructure | yes | must | — | — | — | N/A — tested by CI itself |
| One-command dev environment | Dev-env bootstrap + port-3000 probe | infrastructure | Can bring up Postgres+Valkey with one documented command; probe detects a stale server on :3000 and fails with an actionable message | config | infrastructure | yes | must | — | compose | — | N/A — tested by CI itself |
| Honest unit test signal | Jest Dual-Lane Harness: unit + integration lanes | infrastructure | Can run unit lane green with zero services; integration lane runs DB/build-bound suites against compose stack + `next build`; LOC-0092 foldable duplicate folded (TD-8) | jest-test-harness | infrastructure | no | must | STORY-002 | config | Contract with STORY-004/005: exposes `test:unit` / `test:integration` entry points with lane globs — those stories consume them | N/A — tested by CI itself |
| pending-import spec passes without DB | pending-import-business-repository: mock into unit lane | test | Can run spec green with no services; repository call contract preserved under mocks | lib-db-pending-import-business-repository | test | no | must | STORY-003 | — | Contract with STORY-003: consumes `test:unit` lane entry point | standard unit tests |
| fidelity spec runs where its artifact exists | loc-0092 fidelity spec: integration-lane + build gate | test | Can run fidelity suite in integration lane after `next build`; matcher assertions run on real build output; skip-gate bypass removed | jest-test-harness | test | no | must | STORY-003 | — | Contract with STORY-003: consumes `test:integration` lane + build-artifact gate | requires: next build artifact + compose stack (integration lane) |

Epic E2E gate (Dupin 3h): both lanes green at epic tip — unit lane with services DOWN, integration lane with stack up.

### 5. C4 Delta
**C1/C2:** unchanged. **C3 (`black-owned-frontend`):** NEW `jest-test-harness` (Jest projects config); edges: harness →tests→ `api-graphql-route`, →tests→ `components-ui-navigation`. **C3.5:** unchanged. Delta spec + verified render: `delta-spec.json`, `c4-delta.html` (computed-styles verified 7/7).

### 6. Execution & Integration Strategy
**Tracks:** Track 1 Infra: STORY-001 → 002 → 003 / Track 2 Suites: STORY-004 ∥ STORY-005 (after 003)
**Contracts:** harness → suites: `test:unit`/`test:integration` globs + env contract (ports per compose, env names per `.env.example`); bootstrap → harness: services reachable + port-3000 proven fresh.
**Order:** 1. STORY-001 (no deps) 2. STORY-002 (compose seam) 3. STORY-003 (config seam, needs 002 env contract) 4. STORY-004 ∥ STORY-005 5. E2E gate. Seam-class stories (002 compose, 003 config) serialize epic-wide.

**Dupin-test intent (this epic as telemetry):** all-seam infra chain — exercises seam serialization, infra-only story typing, and a lanes-are-the-gate E2E.
