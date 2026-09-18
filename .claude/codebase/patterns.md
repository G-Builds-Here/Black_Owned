<!--
surveyed_at: 2026-09-18T15:38:00Z
commit: 6067387c5757ff143d3b99eaa000af16f4b1d143
relevant_paths:
  - src/lib
  - src/app/api
  - bw-scraper/src
summary: Observed conventions — auth, response envelope, data access, caching, error handling, testing, migrations, config.
-->

# Observed Patterns

## Auth & Security

- **JWT RS256** (primary) with **HS256 fallback** when no key material is
  configured. Keys: `config/jwt/` via `JWT_PRIVATE_KEY_PATH` /
  `JWT_PUBLIC_KEY_PATH`; fallback secret `JWT_SECRET`.
- Routes guard with `createAuthMiddleware` (admin) or role + row-ownership checks
  (owner routes). Chat routes require participant membership.
- Passwords hashed with `bcryptjs` (cost 12).
- Access tokens: RS256, 15 min, claims `{ userId, email, role }`. Refresh
  tokens: 7 d, stored **only** as Valkey keys (`refresh:<token>` → userId) — no
  DB table, so a Valkey flush invalidates every session.
- The `config/jwt/` keypair is committed (dev material); production overrides via
  `JWT_PRIVATE_KEY`/`JWT_PRIVATE_KEY_PATH` env — see findings (HIGH).
- [NOTE] The GraphQL route performs no auth; `createBusiness` runs under a hardcoded
  `Bearer token` context — see `findings.md` / `anti-patterns.md`.
- [NOTE] bw-scraper exposes mutating endpoints with no auth; only `/enrich` is
  fronted by an admin-gated proxy.

## Response Envelope

- Success: `{ success: true, data: ... }`.
- Errors: `{ error: "..." }` (or `{ success: false, errors: [...] }` for batch
  imports) with a 4xx/5xx status.
- Batch endpoints (bulk-approve, pending import) return per-item results so a
  partial failure is actionable.
- `405` for wrong-verb on a single-verb route (e.g. `GET /api/health` only).

## Data Access

- One lazy `pg` Pool (`max` 20) per process via `getPool()` in
  `src/lib/db/user-repository.ts`; repositories split by domain
  (`business-repository`, `scrape-job-repository`, `chat-repository`, ...).
- Rust side: `sqlx` with a shared pool in `bw-scraper` (`AppState`); no ORM.
- Dual-writer tables: `businesses`, `scrape_jobs`, `scraped_businesses`,
  `business_locations` are written by both the TS app and bw-scraper with no
  app-level coordination — the strongest coupling in the repo.

## Caching & Invalidation

- Valkey query cache in front of directory/GraphQL reads
  (`src/lib/graphql/query-cache.ts`).
- Invalidation is **NATS-pub/sub only on the TS side**: a `cache.invalidate`
  subject is consumed by `src/lib/nats/cache-invalidator.ts`. Rust-side writes
  (bw-scraper `/enrich`, `/locations`) do NOT publish invalidation, so the TS
  query cache can serve stale rows after enrichment. `bw-ingestion` contains a
  second, dormant `cache.invalidate` consumer.

## Error Handling

- TS routes: try/catch per handler, map DB/JSON failures to 400/500 with a short
  `error` string; 404 for missing rows; 409 for verification state conflicts.
- The enrichment proxy distinguishes transport failure (502
  `ENRICHMENT_WORKER_UNREACHABLE`) from worker-reported failure
  (`ENRICHMENT_WORKER_ERROR`).
- Rust: `Result`-based; axum handlers return JSON error objects; `/health/detailed`
  aggregates per-service checks (`healthy` / `degraded` / 503 on Postgres down).

## Testing

- Colocation: specs next to source (`route.spec.ts`, `Component.spec.tsx`).
- DB/auth mocked at the repository boundary (`jest.mock("@/lib/db/...")`), so the
  default Jest run needs no infra.
- E2E helpers centralize sessions, psql access, and route warm-up
  (`e2e/e2e-utils.ts`).
- Rust: in-file `#[cfg(test)]` modules + `tests/` integration; clippy pedantic in
  CI.

Full details: `test-infrastructure.md`.

## Naming Conventions

- TS: kebab-case modules (`user-repository.ts`, `jwt-middleware.ts`), PascalCase
  components, `*.spec.ts`/`*.spec.tsx` tests.
- Rust: snake_case modules; request/response types as `XxxRequest` /
  `XxxResponse` / `XxxPayload`.
- Migrations: `NNN_description.sql`, applied in numeric order.

## Configuration

- Single source of truth: root `.env` (gitignored; tracked template
  `.env.example`).
- TS reads `process.env` with per-variable defaults; Rust `config.rs` parses env
  with `default` attributes (`SEARXNG_URL` now defaults to empty — configured or
  discovery cannot run; the old developer-LAN-IP default is fixed).
- Env-name drift is a live trap: compose injects `REDIS_URL`/`MINIO_ROOT_*`, the
  TS app reads `VALKEY_HOST/PORT` and `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`
  (see findings/anti-patterns).
- `docker-compose.yml` pins the project name `black_owned` so container names are
  stable across worktrees.

## Serialization

- TS: native `JSON`; no JSON library (the once-declared `graphql`/`@graphql-tools/schema`
  deps have been removed from `package.json`).
- Rust: `serde` throughout; bw-scraper request types use **snake_case** field names
  (see the cross-language field drift finding).
