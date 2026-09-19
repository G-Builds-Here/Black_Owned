<!--
surveyed_at: 2026-09-18T15:38:00Z
commit: 6067387c5757ff143d3b99eaa000af16f4b1d143
relevant_paths:
- src/app/api/graphql
- src/app/admin
- src/app/api/directory
- src/lib/nats
- src/services
- config/jwt
- bw-scraper/src
- bw-ingestion/src
- bw-api/src
- .env.example
summary: Anti-patterns observed in this codebase, with evidence, risk, and the pattern to use instead. Do not replicate these.
-->

# Anti-Patterns

Patterns found in this codebase that should NOT be replicated. Each entry documents
what was found, why it's wrong, and what to do instead.

## 1. Fake auth context in GraphQL route
**Project:** root (Next.js)
**Location:** `src/app/api/graphql/route.ts`
**Evidence:** The route sets a hardcoded `context.authorization = "Bearer token"` (`:125`) and performs no JWT verification before dispatching mutations.
**Why it's wrong:** Any anonymous caller can execute `createBusiness` and other mutations; the auth model enforced on every REST route is bypassed on this one route.
**What to do instead:** Run the route through `createAuthMiddleware` and pass the real request headers into the resolver context.
**Severity:** High

## 2. Regex-based GraphQL execution
**Project:** root (Next.js)
**Location:** `src/app/api/graphql/route.ts`, `src/lib/graphql/`
**Evidence:** Queries are parsed with regex over the raw query string; `variables` are mostly ignored; `schema.ts` declares more operations (`submitVerification`, `updateBusiness`) than the executor implements. (The once-declared `graphql`/`@graphql-tools/schema` deps have since been removed from `package.json`.)
**Why it's wrong:** Fragile parsing, broken `variables` handling (only inline literals work), no schema validation, and the schema file misleads readers about what actually executes.
**What to do instead:** Use a real executor with resolvers, or retire the GraphQL surface entirely.
**Severity:** Medium

## 3. Unauthenticated, host-published worker endpoints
**Project:** bw-scraper (Rust axum service)
**Location:** `bw-scraper/src/api.rs`, `docker-compose.yml`
**Evidence:** `POST /scrape`, `POST /enrich`, `POST /locations` carry no auth; compose publishes 8080 to the host. Only `/enrich` has an admin-gated proxy in the web app.
**Why it's wrong:** Anyone who can reach :8080 can trigger scrapes and mutate product data (`businesses`, `business_locations`) with no user attribution.
**What to do instead:** Require a shared-secret middleware on all mutating worker routes and stop publishing the port to the host (bind to the compose network only).
**Severity:** High

## 4. Shared table writes without coordination
**Project:** root (Next.js) + bw-scraper (Rust axum service)
**Location:** `businesses`, `scrape_jobs`, `scraped_businesses`, `business_locations` tables
**Evidence:** Both the web app and bw-scraper write these tables; there is no claim/lock protocol, no unique constraint on `(source, query, location)`, and Rust-side writes publish no `cache.invalidate` events.
**Why it's wrong:** Duplicate jobs, lost updates, and status drift between the TS executor vocabulary (`scraping`) and the Postgres CHECK values (`running`); the Valkey query cache can serve stale rows after enrichment.
**What to do instead:** A single owner per table (or an explicit ownership rule), a claim protocol for scrape jobs, and cache-invalidation publishing from every writer.
**Severity:** Medium

## 5. Cross-language field-name drift across the HTTP boundary
**Project:** root (Next.js) → bw-scraper (Rust)
**Location:** `src/app/api/admin/enrichment/route.ts` → `bw-scraper/src/api.rs`
**Evidence:** The TS proxy sends camelCase `businessIds`; `EnrichRequest` deserializes snake_case `business_ids`, so serde silently drops the field.
**Why it's wrong:** A targeted "enrich these businesses" call degrades into an unfiltered enrichment run — wasted SearXNG/Nominatim quota and unexpected writes.
**What to do instead:** Add `#[serde(alias = "businessIds")]` (or normalize one side) and add a regression test asserting a targeted request touches only the requested ids.
**Severity:** Medium

## 6. In-app scraper executor has no production caller
**Project:** root (Next.js)
**Location:** `src/services/scraper-job-executor.ts`, `src/app/api/scrape-jobs/route.ts`
**Evidence:** `POST /api/scrape-jobs` inserts a `pending` row; nothing in the deployed stack polls `scrape_jobs` — bw-scraper's `/scrape` is standalone and does not read the queue. The executor is referenced only from tests.
**Why it's wrong:** Admin action appears accepted but the queue row is never consumed; the queue semantics are decorative.
**What to do instead:** Either publish work to a consumer that actually runs it, or execute in-process and drop the queue-status pretense.
**Severity:** Medium

## 7. Orphan Rust crates carrying dead auth and duplicate consumers
**Project:** bw-api, bw-ingestion (Rust libraries)
**Location:** `bw-api/`, `bw-ingestion/`
**Evidence:** No binary or compose service runs either crate. bw-ingestion defines NATS consumers (`chat.message`, `email.send`, `image.process`) nothing hosts, and duplicates the TS `cache.invalidate` consumer, with drifted crate pins (async-nats 0.40, redis 0.27) vs bw-scraper. bw-api's `router()` returns an empty Router: its `jsonwebtoken` tower middleware never serves a request, and its async-graphql mutations parse bearer tokens as raw UUIDs (`Uuid::parse_str`) without signature verification. CI excludes bw-api with a stale "compile errors (task #71)" comment — `cargo check` passes today.
**Why it's wrong:** Unused code, longer builds, CI confusion, "which side handles cache.invalidate?" ambiguity, and — worst — readers may cite bw-api's fake auth as prior art.
**What to do instead:** Decide per crate: reactivate with a running consumer, or delete/quarantine with a documented rationale. Never build new auth on bw-api.
**Severity:** Medium

## 8. Two parallel NATS clients
**Project:** root (Next.js)
**Location:** `src/lib/nats/nats-client.ts` and `src/lib/nats/client.ts`
**Evidence:** Two modules expose different functions (`getNatsClient` vs `getNatsConnection`) with duplicated reconnect/cache logic.
**Why it's wrong:** Inconsistent client behavior across features; reconnect/backoff logic diverges over time.
**What to do instead:** One module, one connection factory; delete the other.
**Severity:** Low

## 9. In-memory full-collection loads for filtering
**Project:** root (Next.js)
**Location:** `src/app/api/directory/route.ts`, `src/app/api/directory/suggest/route.ts`
**Evidence:** Both routes load the entire directory (approved pending + businesses + locations) and filter/sort/page in JavaScript; `/suggest` pays the full load on every autocomplete keystroke.
**Why it's wrong:** Memory and latency grow linearly with directory size; this is a performance optimisation masquerading as architecture.
**What to do instead:** Push search/category/rating filters and LIMIT into SQL; give suggest a dedicated `SELECT DISTINCT name … WHERE name ILIKE $1 LIMIT 5`.
**Severity:** Medium

## 10. Dead test-config surface
**Project:** root (Next.js)
**Location:** `tsconfig.json`, `jest.config.components.js`, `jest.setup.js`, `src/app/performance.test.ts`
**Evidence:** Root vitest configs were deleted, but `tsconfig.json` still references them and `performance.test.ts` still imports vitest (not installed; Jest-excluded). `jest.config.components.js` maps images to a missing `__mocks__/file-mock.js` and dies on run. `jest.setup.js` is dead next to the live `jest.setup.ts`. The only working vitest lives in `packages/ui`, which is not a workspace member.
**Why it's wrong:** `npm test` can pass while meaningful suites silently never run; configs mislead about which runner owns which file.
**What to do instead:** Delete the stale tsconfig entries and `jest.setup.js`; either restore `file-mock.js` or delete the components config; make `packages/ui` a workspace member if it stays.
**Severity:** Low

## 11. Environment-variable drift
**Project:** root (Next.js) + bw-scraper (Rust)
**Location:** `docker-compose.yml`, `.env.example`, `bw-scraper/src/config.rs`, `bw-scraper/tests/connectors_test.rs`
**Evidence:** Compose supplies `MINIO_ROOT_*` while the app reads `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`; compose host MinIO port is 9002 while the app default is `MINIO_PORT=9000`; `.env.example` tracks only a handful of vars — `NATS_URL`, `CLICKHOUSE_URL`, `SEARXNG_URL`, `MINIO_*` exist in code but not in the template. The connector test now prefers `VALKEY_URL` (matching CI), but `Config::from_env` keeps the opposite order (`REDIS_URL` first).
**Why it's wrong:** Local/dev failures that depend on which env file happens to set the right name; CI "connectivity" tests pass with every service down.
**What to do instead:** One canonical env name per service, documented in `.env.example`; make connector tests fail (not pass) when a service is unreachable.
**Severity:** Low

## 12. Committed JWT signing keys as silent fallback
**Project:** root (Next.js)
**Location:** `config/jwt/private.pem`, `config/jwt/public.pem`, `src/lib/auth/auth-service.ts`
**Evidence:** The RS256 keypair is tracked in Git and the auth service uses it whenever `JWT_PRIVATE_KEY`/`JWT_PRIVATE_KEY_PATH` are unset — no warning at boot.
**Why it's wrong:** Anyone with repo read access can forge valid tokens (including admin) against any deployment that ships without the env override; the fallback makes the misconfiguration invisible.
**What to do instead:** Per-environment keys injected via env, gitignored key files, fail startup when no key material is configured, rotate the committed pair.
**Severity:** High

## 13. Client-side-only admin section guard
**Project:** root (Next.js)
**Location:** `src/app/admin/*/page.tsx` (`:148-153`)
**Evidence:** Admin pages check `getSession().user.role !== 'admin'` in the browser and clear the session on API 401; the server renders the admin HTML to anyone.
**Why it's wrong:** UI-hiding is not access control; the admin surface leaks structure to anonymous users, and safety rests on a single enforcement point (the API routes) with no defense in depth.
**What to do instead:** Enforce the admin role server-side (middleware or layout check) in addition to the existing API-route guards.
**Severity:** Medium

## 14. Test binary mutates process-global proxy env
**Project:** bw-scraper (Rust)
**Location:** `bw-scraper/src/api.rs` test module (`:558`)
**Evidence:** A `LazyLock` stub-server fixture calls `std::env::set_var("http_proxy"/"HTTP_PROXY")` for the whole test binary, and an accumulating `Mutex<HashSet>` of stub paths has no reset between tests.
**Why it's wrong:** Any other test in that binary that issues real HTTP after the stub initializes is silently routed through it; new tests touching the stub race unless they know to take the stub lock.
**What to do instead:** Scope interception per-test (inject the proxy into the client under test rather than process env), or split the stub-dependent tests into their own integration-test binary.
**Severity:** Medium
