<!--
surveyed_at: 2026-09-05T19:45:00Z
commit: 1d809d37d45d649844f979496e7d7ea1d47a40ce
relevant_paths:
  - src/app
  - src/lib
  - src/services
  - bw-scraper/src
  - docker-compose.yml
summary: Component map, service boundaries, and why the polyglot split exists.
-->

# Architecture

## Why This Structure Exists

The product is a web directory, so the **Next.js App Router app owns the entire user-facing surface** (pages, REST routes, hand-rolled GraphQL, live chat). Discovery is the expensive part of the pipeline: paged metasearch, rate-limited enrichment, geocoding, and dedupe. That work runs in a **Rust axum worker** (`bw-scraper`) so the web process stays responsive and deploys as a slim container. Browser-based scraping (Google Maps, Yelp, Facebook) needs DOM automation, so it stays **in-process in TypeScript** (`src/services/`). Two storage engines split OLTP (Postgres) from analytics (ClickHouse).

## Component Map

| Component | Project | Type | Responsibility | Key Files |
|-----------|---------|------|----------------|-----------|
| Web app + REST/GraphQL API | root | Next.js App Router | All UI pages, ~50 API routes, auth, chat, admin/owner consoles | `src/app/**`, `src/components/**` |
| Domain libs | root | Node modules | `pg` repositories, JWT auth, Valkey cache, NATS pub/sub, MinIO presigned URLs, GraphQL schema + regex executor | `src/lib/db`, `src/lib/auth`, `src/lib/valkey`, `src/lib/nats`, `src/lib/minio`, `src/lib/graphql` |
| Browser scrapers | root | TS services | Google Maps / Yelp / Facebook scraping driven by `POST /api/scrape-jobs` | `src/services/*-scraper.ts`, `src/services/scraper-job-executor.ts` |
| Discovery worker | bw-scraper | Rust axum service (:8080) | SearXNG discovery, bounded enrichment, Nominatim location discovery, operator API (`/scrape`, `/enrich`, `/locations`, `/health`) | `bw-scraper/src/{main,api,scraper,enrichment,locations,searxng,rate_limiter,robots,user_agent_rotator}.rs` |
| Ingestion lib | bw-ingestion | Rust library (dormant) | NATS chat/email/image consumers, Valkey cache invalidator, ETL transformers; **no binary or compose service runs it** | `bw-ingestion/src/{chat_consumer,email_*,image_*,cache_invalidator,etl/*}.rs` |
| Legacy API | bw-api | Rust crate (dormant) | Pre-Next.js API skeleton: axum bin (`/health` only), placeholder handlers, async-graphql schema; historically created the `reviews`/`categories` tables that migrations 013/020 later backfilled | `bw-api/src/{lib,bin/main,routes/*,middleware/*,graphql/*}.rs` |
| Shared types | bw-types | Rust library | `Business`, `Category`, `Review`, email payload types shared by `bw-api` and `bw-ingestion` | `bw-types/src/{lib,email}.rs` |
| Schema | root | Migrations | Postgres OLTP schema (21 numbered files) + ClickHouse analytics mirror | `migrations/postgresql`, `migrations/clickhouse` |
| UI package | packages/ui | Standalone npm pkg | Component library with its own vitest/playwright; not a root workspace member | `packages/ui` |

## Service Interaction Map

**Crosses a boundary:**
- **HTTP (Next.js → bw-scraper):** only `POST /api/admin/enrichment` proxies to `POST /enrich` (`SCRAPER_BASE_URL`, default `http://localhost:8080`, 502 on failure). `POST /api/scrape-jobs` does NOT call bw-scraper — it inserts a job row and runs the in-process TS scrapers.
- **Shared Postgres (strongest coupling):** Next.js and bw-scraper both write `businesses`, `scrape_jobs`, `scraped_businesses`, `business_locations`. bw-scraper `/enrich` and `/locations` mutate product data directly, bypassing app-layer validation.
- **NATS:** Next.js publishes `user.role_changed`, `verification.approved/rejected`, `chat.message.<cid>`, `chat.notification.<userId>`; the Node side subscribes `cache.invalidate`. bw-scraper health-checks NATS only (no pub/sub in active code). bw-ingestion defines consumers that nothing in this repo runs.
- **Valkey:** TS query cache + NATS cache-invalidator subscription; bw-scraper health-checks `REDIS_URL` only.
- **MinIO:** TS presigned-URL service (active); bw-ingestion image worker (dormant).
- **ClickHouse:** compose service + migration only; bw-scraper carries the dependency for health checks; no runtime write path found in TS.

**Internal:** `src/lib` repositories stay inside the web app; each Rust crate is self-contained; no Rust crate depends on the Next.js app; no circular crate dependencies.

## Why Components Are Bounded This Way

[ASSUMED — from module layout] The boundary that matters is *where network-bound, rate-limited work happens*: SearXNG/Nominatim traffic lives in Rust behind a token-bucket rate limiter and robots.txt guard; DOM automation lives in Node where Playwright lives; user-facing CRUD lives in Next.js. `bw-ingestion`/`bw-api` are the remnants of an earlier "all Rust" architecture: their consumers (NATS work queues) were superseded by in-process TS handling, which is why they ship as libraries no binary runs. The dual-writer Postgres coupling and the single enrichment proxy are the seams that would break first if either side changed its schema or status semantics.
