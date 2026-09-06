<!--
surveyed_at: 2026-09-05T19:45:00Z
commit: 1d809d37d45d649844f979496e7d7ea1d47a40ce
relevant_paths:
- src/app/api/graphql
- src/app/api/directory
- src/lib/nats
- src/services
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
**Evidence:** The route sets a hardcoded `context.authorization = "Bearer token"` and performs no JWT verification before dispatching mutations.
**Why it's wrong:** Any anonymous caller can execute `createBusiness` and other mutations; the auth model enforced on every REST route is bypassed on this one route.
**What to do instead:** Run the route through `createAuthMiddleware` and pass the real request headers into the resolver context.
**Severity:** High

## 2. Regex-based GraphQL execution
**Project:** root (Next.js)
**Location:** `src/app/api/graphql/route.ts`, `src/lib/graphql/`
**Evidence:** Queries are parsed with regex over the raw query string; the declared `graphql` and `@graphql-tools/schema` dependencies are never imported.
**Why it's wrong:** Fragile parsing, broken `variables` handling (only inline literals work), no schema validation, and the declared deps are dead weight that misleads readers about the real stack.
**What to do instead:** Use the already-declared `graphql` package with a real executor and resolvers, or drop the deps if GraphQL is being retired.
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
**Why it's wrong:** A targeted "enrich these businesses" call degrades into an unfiltered full-table run — wasted SearXNG/Nominatim quota and unexpected writes.
**What to do instead:** Add `#[serde(alias = "businessIds")]` (or normalize one side) and add a regression test asserting a targeted request touches only the requested ids.
**Severity:** Medium

## 6. In-app scraper executor has no production caller
**Project:** root (Next.js)
**Location:** `src/services/scraper-job-executor.ts`, `src/app/api/scrape-jobs/route.ts`
**Evidence:** `POST /api/scrape-jobs` inserts a `pending` row; nothing in the deployed stack polls `scrape_jobs` — bw-scraper's `/scrape` is standalone and does not read the queue. The executor is referenced only from tests.
**Why it's wrong:** Admin action appears accepted but the queue row is never consumed; the queue semantics are decorative.
**What to do instead:** Either publish work to a consumer that actually runs it, or execute in-process and drop the queue-status pretense.
**Severity:** Medium

## 7. Orphan Rust crates
**Project:** bw-api, bw-ingestion (Rust libraries)
**Location:** `bw-api/`, `bw-ingestion/`
**Evidence:** No binary or compose service runs either crate. bw-ingestion defines NATS consumers (`chat.message`, `email.send`, `image.process`, `cache.invalidate`) nothing hosts, and pins drifted versions (async-nats 0.40, redis 0.27) vs bw-scraper (0.33, 0.24). bw-api's CI exclusion ("pre-existing compile errors, task #71") is stale — `cargo check` now passes.
**Why it's wrong:** Unused code, longer builds, CI confusion, and a second `cache.invalidate` consumer that invites "who handles this?" ambiguity.
**What to do instead:** Decide per crate: reactivate with a running consumer, or delete/quarantine with a documented rationale.
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

## 10. Dead test infrastructure at root
**Project:** root (Next.js)
**Location:** `vitest.config.ts`, `vitest.setup.ts`, `src/app/performance.test.ts`, `jest.config.components.js`
**Evidence:** Vitest config is tracked but vitest is not installed at root; `performance.test.ts` and `clickhouse/*.test.ts` cannot run; `jest.config.components.js` references a missing `__mocks__/file-mock.js`; the only working vitest lives in `packages/ui` (not a workspace member).
**Why it's wrong:** `npm test` can pass while meaningful suites silently never run; config misleads about which runner owns which file.
**What to do instead:** Install vitest at root or delete the root config and relocate those specs; make `packages/ui` a workspace member if it stays.
**Severity:** Low

## 11. Environment-variable drift
**Project:** root (Next.js) + bw-scraper (Rust)
**Location:** `docker-compose.yml`, `.env.example`, `bw-scraper/src/config.rs`, `bw-scraper/tests/connectors_test.rs`
**Evidence:** Compose supplies `MINIO_ROOT_*` while the app reads `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`; compose host MinIO port is 9002 while the app default is `MINIO_PORT=9000`; CI exports `VALKEY_URL` while the Rust connector test reads `REDIS_URL` (falling back to localhost).
**Why it's wrong:** Local/dev failures that depend on which env file happens to set the right name; CI "connectivity" tests pass with every service down.
**What to do instead:** One canonical env name per service, documented in `.env.example`; make connector tests fail (not pass) when a service is unreachable.
**Severity:** Low

## 12. Hardcoded LAN default in product code
**Project:** bw-scraper (Rust)
**Location:** `bw-scraper/src/config.rs`
**Evidence:** `SEARXNG_URL` defaults to `http://192.168.68.50:8888` — a developer's LAN address.
**Why it's wrong:** Deployment-specific address leaks into defaults; any environment without an override silently points discovery at one machine's LAN.
**What to do instead:** Default to an empty value and fail fast with a clear "SEARXNG_URL not configured" error.
**Severity:** Low
