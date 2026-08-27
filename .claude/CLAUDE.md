# Black_Owned — Project Instructions

Public directory of Black-owned businesses: Next.js 16 web app (UI + REST/GraphQL API) on the host, Rust workspace (bw-scraper active; bw-ingestion/bw-api library/retired) in Docker, backed by Postgres/Valkey/NATS/ClickHouse/MinIO.

## Setup

**Prerequisites:** Node 18+, Docker (compose v2), Rust toolchain only if building bw-scraper locally (compose builds it for you).

**Credentials:** root `.env` is the source of truth — it is tracked in Git and already contains working local values (Postgres, JWT, MinIO, SearXNG LAN URL). Key names: `DATABASE_URL` (or `POSTGRES_*` parts), `JWT_SECRET`, `VALKEY_HOST/PORT`, `NATS_URL`, `NEXT_PUBLIC_NATS_WS_URL`, `CLICKHOUSE_URL`, `SEARXNG_URL`, `MINIO_*`. `config/jwt/` holds the RS256 key material.

**First run:**
```
npm install
docker compose up -d
npm run migrate
npm run dev
```
**Verify:** `curl http://localhost:3000/api/health` → 200, and `curl http://localhost:8080/health` → bw-scraper healthy. The repo also ships `db/seed/seed_test_data.sql` (optional: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed/seed_test_data.sql`).

## Commands

| Command | What |
|---|---|
| `npm run dev` / `build` / `start` | Next.js web app (:3000) |
| `npm test` | Jest unit + component (~100 specs, jsdom, NO infra needed) |
| `npx jest <path> -t '<name>'` | filtered Jest |
| `npx playwright test` | E2E (needs compose stack; auto-starts dev server) |
| `cargo test` / `cargo test -p bw_scraper <filter>` | Rust tests |
| `cargo clippy --all-targets -- -D warnings -W clippy::pedantic` | Rust lint |
| `npm run migrate` | Postgres migrations (idempotent, tracked in schema_migrations) |
| `npm run geocode` | lat/lng backfill (Nominatim) |
| `docker compose up -d` | infra + bw-scraper worker |

**Ordering & why:** compose up → migrate → app/e2e. Migrations must precede anything touching tables; Jest unit needs no infra (DB/auth are mocked); `cargo test` unit needs no services, but `bw-scraper` connector tests with valid URLs need live local Postgres/NATS/Valkey/ClickHouse. CI is Rust-only — the entire TypeScript corpus is local-only.

## Environment

| Mode | How | What runs where |
|---|---|---|
| Local dev (default) | `docker compose up -d` + `npm run dev` | app on host :3000; infra on compose ports; bw-scraper in compose :8080 |
| Rust tests | `cargo test` | no infra needed for unit; live services for connector valid-URL tests |
| CI | GitHub Actions | Rust only; Postgres 15/NATS/Valkey as services |

**Default behavior with no env:** web app boots and serves static content; every DB/Valkey/NATS route 500s lazily on first use (pg Pool is lazy, max 20). bw-scraper is fail-fast: exits if `DATABASE_URL` is missing or Postgres is down. MinIO host port is **9002** but the app defaults `MINIO_PORT` to 9000 — set `MINIO_PORT=9002` for host-side presigned URLs. SearXNG defaults to a hardcoded developer LAN IP in Rust.

## Adding Tests

Colocation is the rule: specs sit next to source.
- API route → `src/app/api/<name>/route.spec.ts`
- Component → `src/components/<Name>.spec.tsx`
- Lib → `src/lib/<area>/<module>.spec.ts`
- Rust → `#[cfg(test)] mod tests` in-file (unit) or `tests/<name>_test.rs` (integration)
- E2E → `e2e/<feature>.spec.ts` using helpers from `e2e/e2e-utils.ts` (newSession, apiJson, seedSession, warmRoutes)

Example (new POST /api/widgets route):
```ts
// src/app/api/widgets/route.spec.ts
import { getPool } from "@/lib/db/user-repository";
import { POST } from "./route";

jest.mock("@/lib/db/user-repository", () => ({ getPool: jest.fn() }));
jest.mock("@/lib/auth/jwt-middleware", () => ({
  createAuthMiddleware: jest.fn(),
  createAuthErrorResponse: jest.fn(),
}));

const mockClient = { query: jest.fn() };
const mockPool = { connect: jest.fn() };
const AUTH_OK = { authenticated: true, user: { userId: "u-1", role: "admin" } };

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockReturnValue(mockPool);
  mockPool.connect.mockResolvedValue(mockClient);
  (createAuthMiddleware as jest.Mock).mockReturnValue(jest.fn(async () => AUTH_OK));
});

it("returns 201 when the payload is valid", async () => {
  mockClient.query.mockResolvedValue({ rows: [{ id: "w-1" }] });
  const res = await POST({ json: () => Promise.resolve({ name: "w" }) } as unknown as Request);
  expect(res.status).toBe(201);
});
```

## Gotchas

- `npm test` green ≠ integration proof: 5 DB-backed + all testcontainers + MinIO suites are excluded by `testPathIgnorePatterns` — they only run against a live Postgres when targeted manually.
- `/api/directory` and `/suggest` load the entire directory into memory and filter in JS (no SQL pagination).
- `categories` table has no Postgres migration — fresh databases lack it until it is created out-of-band (survey finding H1).
- Admin user-management UI calls `PATCH /api/users/role` and `/api/users/status` — neither is a reachable route (finding H2).
- `POST /api/scrape-jobs` inserts a pending row that nothing in the deployed stack executes (finding H3); bw-scraper has its own standalone `POST /scrape` and does not poll the queue.
- `/api/graphql` is a regex mini-parser with a hardcoded fake Bearer token — `createBusiness` can never authenticate (finding H5); the declared `graphql`/`@graphql-tools/schema` deps are unused.
- `bw-api` does not compile (task #71) and is excluded from coverage; `bw-ingestion` is an orphan library crate.
- Vitest config exists but vitest is not installed — `src/app/performance.test.ts` cannot run.
- Playwright `reuseExistingServer: true` — a stale `next dev` (e.g. from a worktree) silently serves old code.
- `.env` is tracked in Git and contains secrets — rotate, don't add new ones carelessly.

## Architecture

Codebase survey artifacts are in `aidlc-docs/inception/reverse-engineering/`.
Each file has a metadata header showing when it was surveyed and which paths it covers —
check the header against what you are currently editing to assess freshness.
Read the relevant file directly when you need it. Start at `index.md`.

| File | Read when you need |
|------|--------------------|
| `index.md` | Survey navigation hub |
| `overview.md` | Business purpose, entry points, running modes, first-time setup |
| `architecture.md` | Component map, service boundaries, why the structure exists |
| `api-documentation.md` | Endpoint contracts — request/response shapes, auth, status codes |
| `patterns.md` | Conventions: auth, response envelope, data access, testing, migrations |
| `domain-model.md` | Postgres tables, TypeScript types, GraphQL types |
| `dependencies.md` | External services, env vars, dependency risks |
| `component-inventory.md` | Component list with responsibilities and key files |
| `code-structure.md` | Namespace/module layout, data flow, notable patterns |
| `technology-stack.md` | Frameworks, runtimes, service versions |
| `test-infrastructure.md` | How to run tests, how to add a new test, mock patterns |
| `findings.md` | Violations, recommendations, tech debt, gotchas — read before touching unfamiliar areas |
| `anti-patterns.md` | What NOT to replicate in this codebase, with evidence |

If the file you are editing matches paths listed in an artifact's `relevant_paths` header
and commits have landed since the artifact's `commit` header, note this to the user —
the artifact may be stale for that area. Run `/luke` to refresh specific artifacts.

## AI Context Protocol

Before answering codebase questions, writing or editing code, or making architectural decisions, follow this fallback chain:

1. **Index once per session** — run `ctx_batch_execute` over all `*.md` files in `aidlc-docs/inception/reverse-engineering/` to load them into the searchable knowledge base
2. **Search first** — run `ctx_search` with a specific query; returns focused excerpts without reading raw files
3. **Agent fallback** — if `ctx_search` returns nothing useful, spawn `.claude/agents/luke.md` with `QUESTION`, `REPO_ROOT`, and `ARTIFACT_DIR`
4. **No artifacts** — if `aidlc-docs/inception/reverse-engineering/` is empty, offer to run `/luke`
