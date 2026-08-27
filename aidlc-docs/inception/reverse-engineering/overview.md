<!--
surveyed_at: 2026-08-27T02:40:39Z
commit: 5a67ed37776c18bc32c9f8e783cb67e23b6c1641
relevant_paths:
- package.json
- docker-compose.yml
- src/app
- bw-scraper
- bw-ingestion
- bw-api
summary: Business purpose, structure rationale, and entry points for the Black_Owned repo.
-->

# Overview

## What This System Does

Black Owned is a public directory platform connecting consumers with Black-owned businesses. Users browse and search a business directory (by category, location, rating), and business owners claim listings through a 3-step wizard, submit verification documents (MinIO presigned upload), and view per-business traffic analytics. Admins review claims and scraped imports, moderate reviews, and manage users. Listings are seeded and expanded by scraping pipelines (SearXNG meta-search in Rust, Playwright scrapers in TypeScript) whose candidates are promoted into the directory through an admin import queue.

## Why the Project Is Structured This Way

[ASSUMED — inferred from code layout and service boundaries]

- **Browser-facing app (Next.js)**: one process owns the entire HTTP surface (directory UI, REST + GraphQL API, admin/owner consoles, live chat). Keeping routing, UI, and API in one App-Router codebase avoids a separate BFF layer at this scale.
- **Rust scraper worker (bw-scraper)**: discovery/ETL is heavy, rate-limited, flaky network work (SearXNG paging, robots.txt checks, user-agent rotation) with its own analytics sink (ClickHouse). Isolating it as a standalone axum service deploys as a slim Docker image and keeps the web process responsive.
- **One-shot `tsx` scripts** (`import-scraped-businesses.ts`, `run-social-discovery.ts`, `run-featured-scrape.ts`, `scripts/*.mjs`): backfill/seed jobs that only need a live `DATABASE_URL`, not a long-running service.
- **Rust library crates** (`bw-ingestion`, `bw-types`): shared ETL/email/cache logic. [ASSUMED] `bw-ingestion` started life as the service that created the `reviews` table (per migration 013, the Rust `bw-api` was "retired"); it is now a library with no in-repo consumer — see findings.

## Entry Points

| Entry point | Project | How it runs |
|---|---|---|
| `src/app/page.tsx` + ~30 API routes | web app | `npm run dev` / `npm run build && npm start` (port 3000) |
| `bw-scraper/src/main.rs` | Rust worker | `cargo run -p bw_scraper` or compose service (port 8080) |
| `import-scraped-businesses.ts` | root | `npx -y tsx import-scraped-businesses.ts` |
| `run-social-discovery.ts` | root | `npx tsx run-social-discovery.ts [--all\|--business <id>]` |
| `run-featured-scrape.ts` | root | `npx tsx run-featured-scrape.ts` |
| `scripts/migrate-postgres.mjs` | root | `npm run migrate` |
| `scripts/geocode-locations.mjs` | root | `npm run geocode` |

## Key External Dependencies

PostgreSQL (system of record), Valkey (refresh tokens + GraphQL cache), NATS (chat events + cache invalidation, browser via WebSocket 8081), MinIO (presigned uploads), ClickHouse (analytics — currently dormant), SearXNG (meta-search for discovery; default URL is a developer LAN IP — see findings). Details: `dependencies.md`.

## Build & Test Commands

- Web: `npm install`, `npm run dev` / `build` / `start`, `npm test` (Jest, no infra needed), `npm run lint`, `npm run migrate`, `npx playwright test` (E2E, needs compose stack)
- Rust: `cargo test` (workspace), `cargo test -p bw_scraper <filter>`, `cargo clippy --all-targets -- -D warnings -W clippy::pedantic`, `cargo llvm-cov`
- Infra: `docker compose up -d` (postgres 15, nats 2.10, clickhouse 23.8, valkey 7.2, minio, bw-scraper)

Full detail: `technology-stack.md`, `test-infrastructure.md`.
