<!--
surveyed_at: 2026-09-18T15:38:00Z
commit: 6067387c5757ff143d3b99eaa000af16f4b1d143
relevant_paths:
  - jest.config.js
  - jest.config.components.js
  - playwright.config.ts
  - e2e
  - bw-scraper/tests
  - bw-ingestion/tests
  - .github/workflows
summary: How to run every test layer, how infra/credentials resolve, and how to add a new test in each layer.
-->

# Test Infrastructure

## Test Frameworks

| Layer | Framework | Runner / Config |
|-------|-----------|-----------------|
| TS unit + component | Jest 29 + ts-jest, jsdom env | `jest.config.js` (root, `npm test`); default run is by **exclusion** — see testPathIgnorePatterns below |
| TS components config | — | `jest.config.components.js` is **unrunnable**: it maps image imports to `__mocks__/file-mock.js`, which does not exist (only `next-server.ts` + `style-mock.js` are in `__mocks__/`) |
| E2E | Playwright ^1.62.1 (chromium/firefox/webkit) | `playwright.config.ts`; `fullyParallel: true`; CI: `workers=1`, retries 2; `webServer: npm run dev` :3000, `reuseExistingServer: !CI` |
| Rust unit | cargo test | in-file `#[cfg(test)]` modules — **34 files across all four crates** (bw-scraper 10, bw-ingestion 17, bw-api 5, bw-types 2) |
| Rust integration | cargo test | `bw-scraper/tests/{connectors_test,cargo_config_test}.rs`; `bw-ingestion/tests/{cache_invalidator,cache_service}_{unit,integration}.rs` |
| Rust lint/coverage | clippy + cargo-llvm-cov | CI only: `-p bw_scraper -p bw-types --all-targets -- -D warnings -W clippy::pedantic` |
| packages/ui (standalone) | Vitest 4 + @vitest/coverage-v8, Playwright + axe | its own `package.json` (NOT a root workspace member; its dev server also targets port 3000) |

**CI (.github/workflows: `ci.yml` + `bw-scraper-ci.yml`) runs Rust only, and only
two crates** (`-p bw_scraper -p bw-types`). There is no Jest, Playwright, or Vitest
job anywhere — the entire TypeScript corpus is local-only — and bw-ingestion's and
bw-api's test code never executes in any workflow. Root `vitest.config.ts` /
`vitest.setup.ts` were deleted since the July survey (`.bak` files remain);
`jest.setup.js` is dead (both Jest configs point at `jest.setup.ts`).

**CI order and why:** check (compile gate) → test (unit tests need no services) →
coverage (the only job with Postgres/NATS/Valkey service containers; no ClickHouse
service anywhere in CI). `bw-scraper-ci.yml` (main only): lint → test → coverage +
Docker build (push:false) + cargo audit.

## Excluded-from-default Jest Runs (`testPathIgnorePatterns`)

- `src/app/performance.test.ts` — imports vitest, which is **not installed** at root.
- `*-integration.spec.ts` — testcontainers; need Docker + Postgres.
- `src/lib/minio/minio-service.spec.ts` — live MinIO.
- `src/lib/db/business-repository.spec.ts`, `scrape-job-repository.spec.ts`,
  `user-management-repository.spec.ts` — live Postgres.
- `src/qa/scraper-e2e.spec.ts`, `src/services/scraper-job-executor.spec.ts` — live infra.

`npm test` being green does **not** mean these ran; target them explicitly against
a live stack: `npx jest src/lib/db/business-repository.spec.ts`.

## First-Time Local Setup

```
npm install
cp .env.example .env        # then fill in what the template omits (see overview.md)
docker compose up -d        # infra + bw-scraper
npm run migrate             # schema must exist before DB-backed specs / e2e
npm test                    # Jest — no infra needed
npx playwright test         # E2E — needs the stack + app on :3000
cargo test -p bw_scraper    # Rust — unit needs nothing; connectors want live services
```

**Common first-run mistakes:**
1. No `.env` → the app silently uses `postgres:postgres@localhost:5432/black_owned`
   defaults (wrong-database, not an error). Fix: copy `.env.example`, compose up, migrate.
2. `npx playwright test` with a stale `next dev` (e.g. left from a worktree) —
   `reuseExistingServer` reuses it and the suite tests old code. Kill the old server.
3. `npx jest -c jest.config.components.js` dies on missing `__mocks__/file-mock.js`.
4. `cargo test` is green even with all services down — connector "valid URL" tests
   only assert the health message is non-empty.
5. Host-side MinIO presigned URLs need `MINIO_PORT=9002` in `.env` (9000 is ClickHouse).
6. `cd packages/ui && npm test` works, but its `dev`/Playwright scripts collide with
   the root app on port 3000.
7. bw-scraper without `DATABASE_URL` exits immediately with "DATABASE_URL must be
   set" (clear, by design).

## Credential / Infra Resolution Chain

Traced from code (Next.js has no startup credential check — resolution is lazy, per usage):

1. **Postgres (TS):** `getPool()` in `src/lib/db/user-repository.ts` — module-level
   singleton `Pool`. `DATABASE_URL` wins, else built from `POSTGRES_HOST/PORT/DB/USER/PASSWORD`
   (defaults `localhost/5432/black_owned/postgres/postgres`). `new Pool()` never
   throws; failure surfaces only at first `.connect()` (2 s timeout) — unset env
   silently connects to the default DB.
2. **JWT (TS):** `auth-middleware.ts` reads `JWT_SECRET` **per request**; unset →
   `throw new Error("JWT_SECRET environment variable is not set")` at first authed
   hit, not at startup — the app looks healthy until someone logs in.
3. **bw-scraper (Rust):** `Config::from_env()` — `DATABASE_URL` **required**
   (anyhow context message, clean startup exit). Optional with defaults:
   `SEARXNG_URL` (empty), `HOST`/`PORT`, `RUST_LOG`. Optional-with-none (health
   degrades, no crash): `NATS_URL`, `REDIS_URL` → `VALKEY_URL` fallback (reverse of
   the connector test's order), `CLICKHOUSE_URL`, `NOMINATIM_URL` (public OSM fallback).
4. **bw-ingestion:** zero env reads in `src/` — caller-injected (dormant lib).
   Its integration tests read `VALKEY_URL`.
5. **Optional TS services:** Valkey (`VALKEY_HOST/PORT` vs compose `REDIS_URL` —
   name drift), NATS (`NATS_URL`, `NEXT_PUBLIC_NATS_WS_URL` for browser chat),
   MinIO (`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` vs compose `MINIO_ROOT_*`),
   ClickHouse, `SCRAPER_BASE_URL`.

## Running Modes

| Mode | Command | Infra required |
|------|---------|----------------|
| Unit (default) | `npm test` | none |
| Filtered Jest | `npx jest <path> -t '<test name>'` | none |
| DB-backed Jest (skipped by default) | `npx jest src/lib/db/<repo>.spec.ts` | live Postgres |
| E2E | `npx playwright test [file] [--project=chromium] [-g '<title>']` | full compose stack + app :3000 |
| Rust unit | `cargo test -p bw_scraper <filter>` (module: `cargo test -p bw_scraper robots::tests`) | none |
| Rust integration file | `cargo test -p bw_scraper --test connectors_test` | live services for meaningful signal |
| What CI runs | `cargo test -p bw_scraper -p bw-types --all-targets` | Postgres/NATS/Valkey services (no ClickHouse) |

> **Jest output trap (proven 2026-09-18, LOC-0092 pilot):** Jest writes its run
> summary (pass/fail counts, test names) to **stderr**, not stdout. A wrapper or
> pipe that captures only stdout sees empty output on a fully-green run and can
> read as "no tests ran". When capturing Jest output, capture both streams (or
> run via `npm test --silent`, which still reports on stderr — read stderr).
> `$UB test-summary` is dotnet-runsettings-only and does NOT parse Jest output.

## Test Groups and Ordering

**Ordering that matters:** compose up → migrate → app/e2e. Migrations must precede
anything touching tables. Jest unit tests need no infra; cargo unit tests need no
services; connector tests are meaningful only with live services.

There is no group/trait system beyond `testPathIgnorePatterns` and Jest
`roots: [src]`. E2E is `fullyParallel: true` against one shared live Postgres;
cross-file isolation rests entirely on `RUN_SUFFIX`-unique emails and per-file
`afterAll` psql teardown — non-user-keyed tables (categories, businesses) can
still collide across files.

## Adding a New Test

**Jest REST route spec** (colocate with the route):
`src/app/api/<name>/route.spec.ts` next to `route.ts`.
- Mock the repository boundary (required — `getPool()` is a process-wide singleton):
  `jest.mock("@/lib/db/user-repository", () => ({ getPool: jest.fn() }))`, stub
  `getPool().connect().query()` per sequential query with
  `jest.fn().mockResolvedValueOnce({ rows: [...] })`.
- Build the request with `new NextRequest(url)` (jsdom polyfills + `MockResponse`
  come from `jest.setup.ts`); call the exported `GET`/`POST`; assert
  `res.status` + `await res.json()`.
- Authed specs set `process.env.JWT_SECRET` in the file (pattern:
  `auth-middleware.spec.ts`).
- Pattern: `src/app/api/directory/route.spec.ts`.
- Concrete example — new REST route test: create `src/app/api/<name>/route.spec.ts`,
  copy the directory mock-the-pool shape, run `npx jest src/app/api/<name>/route.spec.ts`
  (no infra needed).

**E2E spec**: `e2e/<feature>.spec.ts`.
- Import `test, expect` from `@playwright/test` plus helpers from `./e2e-utils`
  (`BASE_URL`, `apiJson`, `registerUser`/`loginUser`/`newSession(prefix)`,
  `promoteAdmin`, `userIdByEmail`, `firstCategoryUuid`, `psql`, `warmRoutes`).
- Seed via public APIs or `psql`, tear down with `psql` DELETE in `afterAll`;
  guard data-dependent tests with `test.skip(cond, reason)` (pattern:
  `search-directory.spec.ts`); call `warmRoutes([...])` before navigation to
  dodge cold-compile flakes. Windows note: SQL passed to `psql -c` must avoid
  double quotes.

**Rust unit**: `#[cfg(test)] mod tests` at the bottom of the module under test;
async with `#[tokio::test]` (pattern: `bw-scraper/src/robots.rs`).

**Rust integration**: new file `bw-scraper/tests/<name>_test.rs` (or
`bw-ingestion/tests/`); separate binary importing the crate's public API;
`#[tokio::test]`; read service URLs from env with localhost fallbacks
(pattern: `tests/connectors_test.rs`).

**Parallel-run hazard (Rust):** the `api.rs` test module binds a stub HTTP server
in a `LazyLock` and calls `std::env::set_var("http_proxy"/"HTTP_PROXY")` for the
whole test binary, and `AC3_STUB_PATHS` accumulates across tests with no reset. A
new test in that binary that issues real HTTP after the stub initializes gets
routed through it; tests touching the stub must take `AC3_STUB_LOCK`. Files under
`tests/` are separate binaries and unaffected.

## Coverage

- Rust: cargo-llvm-cov in CI — `bw_scraper` + `bw-types` only. The bw-api
  exclusion comment ("pre-existing compile errors, task #71") is stale:
  `cargo check` passes today (5 warnings would fail clippy `-D warnings`).
  bw-ingestion's 17 unit modules + 4 integration files never run anywhere.
- TS: none configured at root; `packages/ui` has vitest v8 coverage.

## Gotchas

- **MinIO host port is 9002** (9000 is ClickHouse). The app default is
  `MINIO_PORT=9000` — set `MINIO_PORT=9002` in `.env` for host-side presigned URLs.
- **Playwright `reuseExistingServer`** — a stale `next dev` (e.g. from a worktree)
  silently serves old code to the suite.
- **`npm test` green ≠ integration proof** — 8 DB/live-infra spec files are silently
  skipped by `testPathIgnorePatterns`.
- **Rust connector "valid URL" tests assert only that a health message is
  non-empty** — they pass with every service down (hollow CI signal). The CI
  `VALKEY_URL` export now works (the test prefers `VALKEY_URL`, falling back to
  `REDIS_URL`), but `Config::from_env` uses the opposite order — see findings.
- **`getPool()` singleton** is process-wide; any unit spec that forgets
  `jest.mock` at the repository boundary silently flakes against real infra.
- **`.worktrees/`** contains 20 stale in-tree checkouts — scope Jest `roots`
  (`src`) and manual greps so they don't match duplicate old copies.
