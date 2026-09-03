<!--
surveyed_at: 2026-08-27T02:40:39Z
commit: 5a67ed37776c18bc32c9f8e783cb67e23b6c1641
relevant_paths:
- src/app
- src/lib
- src/services
- bw-scraper/src
- docker-compose.yml
summary: Component boundaries, data flows, and cross-boundary calls.
-->

# Architecture

## Components

| Component | Project | Responsibility |
|---|---|---|
| `src/app` (pages + `api/**/route.ts`) | web app | entire HTTP surface: 31 API routes + ~20 pages (directory, search, business detail, owner claim wizard, admin console, chat, auth) |
| `src/lib` | web app | service layer: `db/` repositories, `auth/` JWT + role middleware, `valkey/`, `nats/`, `minio/`, `chat/` (browser WS client), `graphql/` (resolvers + regex mini-parser + 30s Valkey cache) |
| `src/services` | web app | Playwright scrapers (google-maps/yelp/facebook), scraper-job-executor, duplicate-detection, social-discovery, image-service — executor is invoked **only by tests** (see findings H3) |
| `src/components` | web app | UI: `ui/` primitives, `admin/`, `business/` |
| `bw-scraper` | Rust | active discovery worker: SearXNG → ETL → `scraped_businesses`; owns `scrape_jobs` lifecycle rows; axum /health + POST /scrape on :8080 |
| `bw-ingestion` | Rust | library only: ETL pipelines, NATS chat/email consumers, image pipeline, cache invalidation — no binary, no in-repo consumer |
| `bw-api` | Rust | retired axum/GraphQL service (created `reviews` table per migration 013); still a workspace member; currently not compiling |
| `bw-types` | Rust | shared domain types (used by bw-api + bw-ingestion only) |
| one-shot scripts | root | `import-scraped-businesses.ts` (scraped → businesses promotion), `run-*.ts`, `scripts/*.mjs` |
| `docker-compose.yml` | infra | postgres, nats, clickhouse, valkey, minio, bw-scraper |

## Cross-Boundary Calls

- **web app ↔ Postgres** — direct `pg` Pool, the primary data channel; every route. Tables: users, businesses, categories, pending_import_businesses, scrape_jobs, scraped_businesses, business_views, conversations, messages, reviews, business_locations.
- **web app ↔ bw-scraper** — **no HTTP calls at all.** Verified: nothing in `src/` fetches `:8080`. The only coupling is shared Postgres: both write `scrape_jobs`, both touch `scraped_businesses`, with no claim/lock protocol (finding H3).
- **bw-scraper ↔ SearXNG** — outbound HTTP (`SEARXNG_URL`).
- **web app ↔ Valkey** — refresh tokens (`refresh:{token}`) + GraphQL query cache (30s TTL).
- **web app ↔ NATS (4222)** — publish `role_changed` (admin role PATCH), subscribe `cache.invalidate` → delete Valkey keys.
- **browser ↔ NATS WebSocket (8081)** — live chat + notifications via nats.ws.
- **web app ↔ MinIO** — presigned PUT URLs for owner verification documents.
- **ClickHouse** — provisioned + health-checked + schema present (ReplacingMergeTree mirror), **zero writers** — dormant.

## Core Data Flow (directory content pipeline)

```
SearXNG ──(bw-scraper, Rust)──► scraped_businesses ──(admin import / one-shot script)──► pending_import_businesses (pending_review)
                                                                                          │
Google Maps/Yelp/Facebook ──(src/services Playwright, test-only executor)─────────────────┤
                                                                                          ▼
                                          businesses (status: unverified → pending_review → approved/rejected)
                                                                                          │
                                  claim wizard (owner) + verification doc (MinIO) ◄───────┤
                                                                                          ▼
                                            admin approval / bulk-approve ──► verified listings in /directory
```

Directory merge: `approved` rows in `pending_import_businesses` are also served as directory content until promoted into `businesses` — the queue table doubles as live content (finding M5).

## On-Site Reviews

Write path is shipped: POST /api/reviews (authenticated), admin moderation via /api/reviews/[id]/moderate (soft-hide), location-scoped via `location_id`. External Google reviews (aggregate count + snippets) are still the gap this epic addresses — no S1 enrichment pipeline exists yet.

## Why These Boundaries

[ASSUMED] Single Postgres as system of record keeps the directory queryable in one place at the cost of two uncoordinated writers on the scrape pipeline. NATS was chosen for chat fan-out (browser WS relay) and cross-cutting cache invalidation rather than polling. Valkey holds refresh tokens (survival across process restarts, revocable) instead of stateless-only JWTs.
