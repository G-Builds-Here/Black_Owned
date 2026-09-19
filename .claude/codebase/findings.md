<!--
surveyed_at: 2026-09-18T15:38:00Z
commit: 6067387c5757ff143d3b99eaa000af16f4b1d143
relevant_paths:
  - src/app/api
  - src/lib
  - bw-scraper/src
  - .github/workflows
  - docker-compose.yml
  - .env.example
  - config/jwt
summary: Survey findings — violations, recommendations, tech debt, gotchas, and cross-cutting connections.
-->

# Survey Findings

## Violations

### 1. GraphQL route bypasses authentication entirely
**Project:** root (Next.js)
**Severity:** HIGH
`POST /api/graphql` performs no JWT verification, and the `createBusiness` mutation
resolver is invoked with a fabricated `Authorization: Bearer token` context
(`src/app/api/graphql/route.ts:125`). Any anonymous caller can create businesses
through the GraphQL surface while every REST equivalent requires auth (24 of 33
REST route handlers import the auth guard).
**Operational Impact:** Unauthenticated business creation; directory data integrity
and the verification pipeline are open to abuse (spam listings, fake claims) the
moment this route is reachable.
**Mitigation Sketch:** Wire the route through `createAuthMiddleware` like the REST
routes, pass the real request headers into the resolver context, and delete the
hardcoded token. Until then, consider restricting `/api/graphql` to a dev-only mount.

### 2. bw-scraper mutating endpoints are unauthenticated and port-published
**Project:** bw-scraper (Rust axum service)
**Severity:** HIGH
`POST /scrape`, `POST /enrich`, `POST /locations` carry no auth, and docker-compose
publishes `8080` to the host. Only `/enrich` is fronted by the admin-gated
`/api/admin/enrichment` proxy; `/scrape` and `/locations` have no gate at all.
**Operational Impact:** Anyone who can reach :8080 can trigger scrapes, mutate
`businesses` rows (enrichment overwrites product data), and write location rows —
with no audit trail tied to a user.
**Mitigation Sketch:** Add a shared-secret header (e.g. `X-Worker-Token`) checked by a
middleware layer on all mutating routes, and un-publish the port from the host (or
bind to the compose network only). Keep the admin proxy as the product-facing seam.

### 3. RS256 keypair is committed to the repository
**Project:** root (Next.js)
**Severity:** HIGH
`config/jwt/private.pem` + `public.pem` are tracked in Git. The auth service falls
back to these files when `JWT_PRIVATE_KEY` / `JWT_PRIVATE_KEY_PATH` are unset, and
an HS256 fallback exists via `JWT_SECRET`. The failure mode is silent: the app boots
and issues tokens normally with the committed dev key.
**Operational Impact:** Anyone with repository read access (every clone, every fork,
CI logs) can forge valid access tokens — including `role: "admin"` — against any
deployment that ships without the env override. Production compromise is one
forged Bearer header away.
**Mitigation Sketch:** Generate per-environment keypairs, gitignore `config/jwt/`,
bootstrap keys at deploy time from the env vars, and rotate the committed pair
(treat it as public). Fail startup loudly when no key material is configured
instead of silently using repo defaults.

### 4. CI tests only two of four Rust crates and zero TypeScript
**Project:** root + bw-ingestion + bw-api + bw-scraper (CI)
**Severity:** HIGH
`.github/workflows/` contains only Rust jobs, and they pin `-p bw_scraper -p bw-types`.
There is no Jest, Playwright, or Vitest job anywhere. Consequences: ~100 TS specs +
9 e2e suites (including the entire auth surface) are local-only — TS regressions
merge green; bw-ingestion's 17 `#[cfg(test)]` modules + 4 integration files and
bw-api's 5 never execute in any workflow; no ClickHouse service exists in CI.
**Operational Impact:** The only thing a green pipeline proves is that two crates
compile and their unit tests pass. Auth/route regressions, e2e breakage, and two
crates' test failures can all merge to main undetected.
**Mitigation Sketch:** Add a node CI job (`npm ci && npm test`, plus a smoke e2e on
chromium against compose services), and extend the cargo invocations to
`--workspace` (or add the missing crates) once their warnings are clean.

### 5. Cross-language field-name drift silently widens enrichment scope
**Project:** root (Next.js) → bw-scraper (Rust)
**Severity:** MEDIUM
The TS proxy forwards `{ limit?, businessIds? }` camelCase; bw-scraper's
`EnrichRequest` deserializes `business_ids` (snake_case). Serde silently drops the
unknown camelCase key, so a targeted "enrich these N businesses" call degrades to an
unfiltered enrichment run up to `limit`.
**Operational Impact:** Admin "enrich selected" actions actually enrich up to
`limit` arbitrary businesses — wasted SearXNG/Nominatim quota, rate-limit pressure,
and unexpected writes to rows the admin did not select.
**Mitigation Sketch:** Add `#[serde(alias = "businessIds")]` to the Rust field (or
rename the TS payload to snake_case) and add a regression test that asserts a
targeted request touches only the requested ids.

## Recommendations

### 6. Push directory filtering/pagination into SQL
**Project:** root (Next.js)
`GET /api/directory` and `/api/directory/suggest` load the entire directory into
memory and filter/sort/page in JS. This is a performance optimisation, not a
requirement — correctness does not depend on it — but cost grows linearly with
directory size and `/suggest` pays the full load on every autocomplete keystroke.
Move search/category/rating filters and LIMIT into SQL; give suggest a dedicated
`SELECT DISTINCT name … WHERE name ILIKE $1 LIMIT 5`.

### 7. Replace the regex GraphQL executor or retire GraphQL
**Project:** root (Next.js)
The dead `graphql`/`@graphql-tools/schema` deps have since been removed from
`package.json`, but the regex executor (finding 1) remains: `variables` are mostly
ignored, `schema.ts` declares more operations than execute, and
`createBusiness` runs under a fake Bearer context. Either wire a real executor
(preferable — it fixes finding 1's auth story) or delete the GraphQL surface so the
schema file stops lying about what runs.

### 8. Add a server-side guard to the admin section
**Project:** root (Next.js)
`src/app/admin/*` pages guard themselves client-side only (`getSession().user.role`
in `page.tsx`, cleared on API 401) — the admin HTML ships to anyone, and real
enforcement lives entirely in the API routes. The API enforcement is correct; add a
server-side check (middleware or layout) so admin surfaces don't render for
anonymous users and defense is layered rather than single-point.

### 9. Re-verify the bw-api CI exclusion
**Project:** bw-api (Rust)
The coverage-exclusion comment ("pre-existing compile errors, task #71") is stale —
`cargo check` passes today (5 warnings would fail CI clippy `-D warnings`). Fix the
warnings and re-include it, or drop the crate (see #12).

## Tech Debt

### 10. `POST /api/scrape-jobs` inserts queue rows no worker consumes
**Project:** root (Next.js)
The endpoint inserts a `scrape_jobs` row with status `pending` and runs the
in-process TS scrapers; nothing ever polls the queue (bw-scraper has its own
standalone `POST /scrape` and does not read the table). The queue semantics are
decorative, and the TS executor's status vocabulary (`'scraping'`) does not match
the Postgres CHECK values (`'running'`).

### 11. Dormant Rust crates: bw-api and bw-ingestion
**Project:** bw-api, bw-ingestion (Rust)
Neither is run by any compose service or binary. bw-ingestion defines NATS
consumers (`chat.message`, `email.send`, `image.process`) that nothing hosts, a
second `cache.invalidate` consumer duplicating the TS one, and pins drifted crate
versions (async-nats 0.40, redis 0.27; bw-api axum 0.8 vs bw-scraper 0.7) — a build
conflict waiting if they're ever reactivated together. bw-api's `jsonwebtoken` tower
middleware is compiled-but-never-served (its `router()` returns an empty Router)
and its async-graphql mutations treat the bearer token as a raw UUID without
signature verification — do not cite bw-api as prior art for JWT handling. Their
tests (22 files) never run in CI. Decision needed: reactivate, delete, or
quarantine with a documented rationale.

### 12. bw-types has drifted from TS/Postgres — not a trustworthy user model
**Project:** bw-types (Rust)
`User` is `{ id, email, display_name, created_at }` — no `role`, no `status` — while
Postgres/TS carry `role`, `status`, and `name`; `Business.verified: bool` vs DB
`verification_status` string; `category_id: Uuid` vs `varchar(100)`. There is no
codegen linking the three representations. Login/auth work that reaches into the
Rust side must treat the Postgres `users` table as the only source of truth.

### 13. Dead test-config surface
**Project:** root (Next.js)
- Root `vitest.config.ts`/`vitest.setup.ts` were deleted since the last survey, but
  `tsconfig.json` still lists them (stale references) and
  `src/app/performance.test.ts` still imports vitest (not installed; the spec is
  Jest-excluded).
- `jest.setup.js` is dead — both configs point at `jest.setup.ts`.
- `jest.config.components.js` is unrunnable: it maps images to
  `__mocks__/file-mock.js`, which does not exist.
- `packages/ui` is not a root workspace member — its vitest/playwright suite is
  invisible to root tooling and its dev server collides on port 3000.

### 14. Dead symbols
**Project:** root (Next.js)
- `PATCH_STATUS` export in the users route — unreachable (App Router wires `PATCH`
  only); meanwhile the admin `UserManagement` UI calls `/api/users/role` and
  `/api/users/status`, which are not routes at all (`src/components/admin/UserManagement.tsx:272,300`).
- ClickHouse mirror tables (`migrations/clickhouse/001`) have no runtime write path
  in the active code.

### 15. `getPool()` process-wide singleton forces a mock-at-the-boundary test regime
**Project:** root (Next.js)
The cached module-level `Pool` in `user-repository.ts` is shared across every spec
file inside a Jest worker. Every honest unit spec must `jest.mock` the repository
boundary; a spec that forgets silently hits real infra and flakes. This is the
cost of the lazy-singleton design choice, not a per-test bug.

## Gotchas

### 16. MinIO host port is 9002, not 9000
**Project:** root
Compose publishes MinIO on host **9002** (9000 is ClickHouse), but the app default
is `MINIO_PORT=9000`. Host-side presigned URLs require `MINIO_PORT=9002` in `.env`.

### 17. Playwright `reuseExistingServer` silently serves stale code
**Project:** root
A long-lived `next dev` (e.g. left running from a worktree) is reused for E2E runs
and may be serving old code. Kill/restart the dev server when results look wrong.

### 18. Rust connector "connectivity" tests pass with every service down
**Project:** bw-scraper (Rust)
The `tests/connectors_test.rs` "valid URL" tests assert only that the health
message is non-empty. The env-name drift they used to have is partially fixed (the
test now prefers `VALKEY_URL`, matching CI), but `Config::from_env` keeps the
opposite priority (`REDIS_URL` first, `VALKEY_URL` fallback) — CI green does not
prove service connectivity.

### 19. E2E helpers require the Docker CLI
**Project:** root (e2e)
`e2e-utils.ts` seeds/teardowns via `docker exec black-owned-postgres psql`
(`execSync`). E2E cannot run where the Docker CLI is absent or the container name
differs (the pinned `black_owned` compose project name is what keeps this working).
Windows: SQL passed via `-c` must avoid double quotes.

### 20. E2E parallelism relies on unique-email convention, not isolation
**Project:** root (e2e)
`fullyParallel: true` runs against one shared live Postgres. Isolation is
`RUN_SUFFIX`-unique emails plus per-file `afterAll` psql teardown — cross-file
collisions on non-user-keyed tables (categories, businesses) are possible.

### 21. Refresh sessions live only in Valkey
**Project:** root (Next.js)
Refresh tokens are Valkey keys (`refresh:<token>` → userId, 7 d TTL) with no DB
table. A Valkey flush/eviction silently invalidates every session; logout is a key
delete. Relevant to any login/session epic: consider a DB-backed session table if
revocation durability matters.

### 22. The bw-scraper test binary mutates global proxy env
**Project:** bw-scraper (Rust)
The `api.rs` test module binds a stub HTTP server in a `LazyLock` and calls
`std::env::set_var("http_proxy"/"HTTP_PROXY")` for the whole binary
(`bw-scraper/src/api.rs:558`); `AC3_STUB_PATHS` accumulates across tests with no
reset. New tests in that binary that issue real HTTP after the stub initializes get
routed through it. `tests/` files are separate binaries and unaffected.

### 23. Admin user-management UI calls routes that do not exist
**Project:** root (Next.js)
`UserManagement.tsx` fetches `/api/users/role` and `/api/users/status`; neither is a
route (the only wired handler is `PATCH /api/users`). The role/status actions in the
admin console fail at runtime today — do not treat current admin UI behavior as the
intended contract.

### 24. Survey tooling is still weak on polyglot repos
**Project:** survey infrastructure (`~/.claude/tools/`)
The .NET-shaped static scan still returns near-empty results for this Next.js+Rust
repo (0 recognized endpoints/config reads); the Rust-side scan now runs alongside
it (fixed since the July survey — that gap is closed), but the C4 extractor still
emits placeholder system names and boilerplate component descriptions for TS repos,
and its skeleton needed hand-correction (system name, actors, TypeScript components,
SearXNG/Nominatim externals) before rendering. **Recommendation:** give the C4
extraction a polyglot pass (repo-name resolution, TS component extraction,
language-neutral relationship labels).

### 25. `.worktrees/` holds 20 stale in-tree checkouts
**Project:** repo hygiene
Story-era worktrees (LOC-0077…LOC-0090, epic-jest, gatefix…) sit inside the working
tree with divergent package.json/Cargo.toml content. They multiply file counts in
naive tree walks and grep hits, and misled parts of the July survey (the "bw-types
re-export?" question and the ghost graphql dep copy both came from stale copies).
Exclude `.worktrees/` from all repo-wide tooling; prune the worktrees themselves.

## Cross-Cutting Connections

- **The auth surface is the epic-shaped weak point**: unauthenticated GraphQL (#1),
  committed signing keys (#3), client-side-only admin page guard (#8), Valkey-only
  refresh sessions (#21), and the dead admin UI routes (#23) all converge on
  login/session work — fix or wrap each while touching auth rather than building on
  it as-is.
- **Dual-writer Postgres + TS-only cache invalidation**: bw-scraper writes
  `businesses`/`business_locations` without publishing `cache.invalidate`, so the
  Valkey query cache (invalidated only by the TS NATS subscriber) can serve stale
  rows after enrichment — compounds with #2 and #5.
- **Enrichment boundary drift**: the camelCase→snake_case gap (#5) plus the missing
  auth (#2) make the single HTTP seam between the two languages the weakest part of
  the pipeline.
- **Hollow CI signal** (#4 + #18): only two crates compile-and-test in CI, and even
  their integration coverage is vacuous — integration regressions in the Rust
  worker and every TypeScript regression reach main without a tripwire.
- **Static-state chain**: `getPool()` singleton (#15) → mandatory jest.mock
  workarounds; the test-binary proxy mutation (#22) → serialized test modules;
  E2E shared-DB convention (#20). Together they cap how far test parallelism can
  grow without design changes.
- **Dormant crates vs in-process TS** (#11 + #12): bw-ingestion's consumers were
  superseded by TS equivalents, and bw-types no longer matches the schema anyone
  actually uses — the Rust tree carries two inconsistent views of the domain.

## Resolved Since Last Survey (2026-09-05)

- `SEARXNG_URL` LAN-IP default → now empty (anti-pattern removed; env template gap remains — see dependencies).
- Root `vitest.config.ts`/`vitest.setup.ts` deleted (stale references remain — #13).
- `graphql` + `@graphql-tools/schema` dead deps removed (executor unchanged — #7).
- CI `VALKEY_URL` vs connector-test env drift fixed in the test (#18 drift note).
- categories table now has a migration (020) — the old "no Postgres migration for categories" gotcha is obsolete.
