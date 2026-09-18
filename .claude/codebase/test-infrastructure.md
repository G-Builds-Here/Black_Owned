<!--
surveyed_at: 2026-09-05T19:45:00Z
commit: 1d809d37d45d649844f979496e7d7ea1d47a40ce
relevant_paths:
  - jest.config.js
  - jest.config.components.js
  - vitest.config.ts
  - playwright.config.ts
  - e2e
  - bw-scraper/tests
  - .github/workflows
summary: How to run every test layer, how infra is resolved, and how to add a new test in each layer.
-->

# Test Infrastructure

## Test Frameworks

| Layer | Framework | Runner / Config |
|-------|-----------|-----------------|
| TS unit + component | Jest 29 + ts-jest, jsdom env | `jest.config.js` (root, `npm test`), `jest.config.components.js` (`npx jest -c jest.config.components.js`) |
| E2E | Playwright ^1.62.1 (chromium/firefox/webkit) | `playwright.config.ts`; `webServer: npm run dev`, `reuseExistingServer: true` |
| Rust unit + integration | cargo test | in-file `#[cfg(test)]` modules; `bw-scraper/tests/*.rs` |
| Rust lint/coverage | clippy + cargo-llvm-cov | CI only: `cargo clippy --all-targets -- -D warnings -W clippy::pedantic` |
| packages/ui (standalone) | Vitest 4 + @vitest/coverage-v8, Playwright + axe | its own `package.json` (NOT a root workspace member) |

**CI (.github/workflows) runs Rust only**: check, test (`--all-targets`), coverage,
clippy, Docker build, cargo audit (bw-scraper-ci). No Jest/Playwright jobs.

## Excluded-from-default Jest Runs (`testPathIgnorePatterns`)

- `src/app/performance.test.ts` — imports vitest, which is **not installed** at root.
- `*-integration.spec.ts` — testcontainers; need Docker + Postgres.
- `src/lib/minio/minio-service.spec.ts` — live MinIO.
- `src/lib/db/business-repository.spec.ts`, `scrape-job-repository.spec.ts`,
  `user-management-repository.spec.ts` — live Postgres.
- `src/qa/scraper-e2e.spec.ts`, `src/services/scraper-job-executor.spec.ts` — live infra.

Run these manually against a live compose stack when needed:
`npx jest src/lib/db/business-repository.spec.ts`.

## First-Time Local Setup

```
docker compose up -d        # infra + bw-scraper
npm run migrate             # schema must exist before DB-backed specs / e2e
npm test                    # Jest — no infra needed
npx playwright test         # E2E — needs the stack + app on :3000
cargo test -p bw_scraper    # Rust — unit needs nothing; connectors want live services
```

Credential/infra resolution:
- Jest unit: none (DB + auth mocked).
- DB-backed Jest / E2E / Rust connectors: `DATABASE_URL` (or `POSTGRES_*`), plus
  NATS/Valkey/ClickHouse on their localhost ports; `e2e-utils.ts` shells out to
  `docker exec black-owned-postgres psql` for seeding/teardown (requires the
  Docker CLI + running containers).
- Rust CI sets `VALKEY_URL`, but the connector test reads `REDIS_URL` — the CI
  variable is therefore ineffective (see findings).

## Running Modes

| Mode | Command | Infra required |
|------|---------|----------------|
| Unit (default) | `npm test` | none |
| Filtered Jest | `npx jest <path> -t '<name>'` | none |
| E2E | `npx playwright test [file]` | full compose stack + app :3000 |
| Rust unit | `cargo test -p bw_scraper <filter>` | none |
| Rust connectors | `cargo test -p bw_scraper` | live Postgres/NATS/Valkey/ClickHouse (localhost) |
| CI | `.github/workflows/ci.yml` | Postgres/NATS/Valkey services (no ClickHouse) |

## Test Groups and Ordering

**Ordering that matters:** compose up → migrate → app/e2e. Migrations must precede
anything touching tables. Jest unit tests need no infra; cargo unit tests need no
services; connector tests are meaningful only with live services.

There is no group/trait system beyond the `testPathIgnorePatterns` exclusions and
the Jest `roots: [src]` scoping.

## Adding a New Test

**Jest REST route spec** (colocate with the route):
`src/app/api/<name>/route.spec.ts` next to `route.ts`.
- Mock the repository boundary:
  `jest.mock("@/lib/db/user-repository", () => ({ getPool: jest.fn() }))`, stub
  `getPool().connect().query()` per call.
- Build the request with `new NextRequest(url)` (jsdom polyfills in
  `jest.setup.ts`); call the exported `GET`/`POST`; assert `res.status` +
  `await res.json()`.
- Pattern: `src/app/api/directory/route.spec.ts`.

**E2E spec**: `e2e/<feature>.spec.ts`.
- Import `test, expect` from `@playwright/test` plus helpers from `./e2e-utils`
  (`apiJson`, `newSession`, `seedSession`, `psql`, `warmRoutes`,
  `firstCategoryUuid`, cleanup helpers).
- Use `RUN_SUFFIX` for unique emails; teardown via `psql` DELETE in `afterAll`;
  call `warmRoutes([...])` before navigation to avoid cold-compile flakes.

**Rust unit**: in-file `#[cfg(test)] mod tests` at the bottom of the module
(example: `bw-scraper/src/robots.rs`); async with `#[tokio::test]`.

**Rust integration**: new file `bw-scraper/tests/<name>_test.rs`; plain
`#[tokio::test]` importing the crate's public API; read service URLs from env with
localhost fallbacks (pattern: `tests/connectors_test.rs`); seed/cleanup with raw
sqlx queries.

## Coverage

- Rust: cargo-llvm-cov in CI (`bw-scraper` only; `bw-api` excluded "until its
  pre-existing compile errors are fixed" — currently `cargo check` passes, so the
  exclusion is stale).
- TS: none configured at root; `packages/ui` has vitest v8 coverage.

## Gotchas

- **MinIO host port is 9002** (9000 is ClickHouse). The app default is
  `MINIO_PORT=9000` — set `MINIO_PORT=9002` in `.env` for host-side presigned URLs.
- **Playwright `reuseExistingServer: true`** — a stale `next dev` (e.g. from a
  worktree) silently serves old code to the suite.
- **Vitest at root is unrunnable** (configured but not installed); the only working
  vitest is `packages/ui`.
- **Rust connector "valid URL" tests assert only that a health message is
  non-empty** — they pass with every service down (hollow CI signal).
