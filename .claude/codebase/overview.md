<!--
surveyed_at: 2026-09-18T15:38:00Z
commit: 6067387c5757ff143d3b99eaa000af16f4b1d143
relevant_paths:
  - package.json
  - Cargo.toml
  - docker-compose.yml
  - src/app
  - bw-scraper
  - bw-ingestion
  - bw-api
  - bw-types
summary: Business purpose, polyglot structure rationale, entry points, and running modes for the Black_Owned repo.
-->

# Codebase Overview

## What This System Does

"Black Owned" is a public directory platform that discovers, verifies, and showcases
Black-owned businesses. A Rust discovery worker (`bw-scraper`) scrapes business
listings from a SearXNG metasearch instance, enriches them (phone, website, socials,
location via Nominatim geocoding), and writes candidates to PostgreSQL; TypeScript
Playwright scrapers additionally cover Google Maps, Yelp, and Facebook. Admins review
the pending imports, and business owners register, claim their listing through a
3-step wizard, and chat with visitors in real time. The web product (browse, search,
map, owner/admin consoles) is a Next.js 16 App Router app that also hosts the full
REST + GraphQL API surface.

## Why It's Built This Way

[ASSUMED — inferred from code layout and service boundaries]

- **Next.js App Router doubles as the API host.** The product is a web directory, so
  the UI and all 33 REST routes + the GraphQL route live in one `src/app` codebase. There is no
  separate BFF: server components and route handlers (`src/app/api/**/route.ts`) share
  the same `pg` pool and auth middleware.
- **Heavy discovery lives in Rust.** SearXNG paged discovery, rate-limited enrichment,
  and geocoding are CPU/network-bound work that benefits from `axum` + `sqlx` +
  `tokio`. Isolating it as a standalone container (`bw-scraper`, port 8080) keeps the
  web process responsive and deploys as a slim image.
- **Browser scraping stays in TypeScript.** Google Maps / Yelp / Facebook scraping
  needs Playwright/Puppeteer, so it runs in-process inside the Next.js app
  (`src/services/*-scraper.ts`, driven by `POST /api/scrape-jobs`).
- **Shared Rust types in `bw-types`.** The worker, ingestion lib, and API agree on
  domain models (`Business`, `Category`, `Review`, email payloads) via a small shared
  crate.
- **Migrations split by engine.** OLTP schema is `migrations/postgresql` (21 numbered
  files); analytics mirror is `migrations/clickhouse`. Two stores because browsing
  data (Postgres) and view/event analytics (ClickHouse) have different access
  patterns.
- **docker-compose pins container names to a fixed project name** (`black_owned`),
  which is why the e2e helpers can `docker exec black-owned-postgres psql` — a
  deliberate choice to support multiple parallel git worktrees.

## First-Time Setup

**Prerequisites:** Node 18+, Docker (compose v2). Rust toolchain only if building
`bw-scraper` locally — compose builds it for you otherwise.

```
npm install
cp .env.example .env        # .env is gitignored; .env.example is the tracked template
docker compose up -d        # Postgres, ClickHouse, NATS, Valkey, MinIO, bw-scraper
npm run migrate             # apply migrations/postgresql (idempotent, tracked in schema_migrations)
npm run dev                 # Next.js on :3000
```

**Verify:**
- `curl http://localhost:3000/api/health` → 200
- `curl http://localhost:8080/health` → `{"status":"healthy"}`

Optional seed: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed/seed_test_data.sql`.

Key env vars — the tracked `.env.example` template covers only `DATABASE_URL`
(or `POSTGRES_HOST/PORT/DB/USER/PASSWORD`), `VALKEY_HOST`/`VALKEY_PORT`,
`JWT_SECRET`, and `SCRAPER_BASE_URL`. Everything else exists in code only
(compose injects service URLs into the bw-scraper container; host-side runs
must set their own): `JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH` (RS256),
`NATS_URL`, `NEXT_PUBLIC_NATS_WS_URL`, `CLICKHOUSE_URL`, `NOMINATIM_URL`,
`SEARXNG_URL` (no default — empty means discovery cannot reach metasearch), and
the `MINIO_*` set.

## Running Modes

| Mode | How | What runs where |
|------|-----|-----------------|
| Local dev (default) | `docker compose up -d` + `npm run dev` | Web app on host :3000; infra + `bw-scraper` in compose (bw-scraper on :8080). |
| Rust tests | `cargo test` / `cargo test -p bw_scraper <filter>` | No infra needed for unit tests; connector integration tests want live Postgres/NATS/Valkey/ClickHouse on localhost. |
| CI | GitHub Actions | **Rust only** — `cargo check`, `cargo test --all-targets`, clippy (`-D warnings -W clippy::pedantic`), cargo-llvm-cov coverage, Docker build, cargo audit. The TypeScript corpus (Jest + Playwright) is local-only. |

**Default behavior with no env:** the web app boots and serves static content; every
DB/Valkey/NATS route 500s lazily on first use (the `pg` Pool is lazy, `max` 20).
`bw-scraper` is fail-fast: it exits if `DATABASE_URL` is missing or Postgres is down.
