<!--
surveyed_at: 2026-08-27T02:40:39Z
commit: 5a67ed37776c18bc32c9f8e783cb67e23b6c1641
relevant_paths:
- src
- bw-scraper
- bw-ingestion
- bw-api
- scripts
summary: Component ownership table — what each module owns and why.
-->

# Component Inventory

| Component | Project | Type | Responsibility | Key files |
|---|---|---|---|---|
| `src/app` (pages + api) | web app | Next.js 16 App Router UI + API | entire HTTP surface: 31 route.ts + ~20 pages | `src/app/**/route.ts`, `src/app/*/page.tsx` |
| `src/lib` | web app | service layer | db/ repositories; auth/ JWT + role middleware; valkey/; nats/; minio/; chat/ (browser WS); graphql/ (resolvers, regex parser, 30s cache) | `src/lib/{db,auth,valkey,nats,minio,chat,graphql}` |
| `src/services` | web app | in-app Playwright scraper pipeline | google-maps/yelp/facebook scrapers, job executor, duplicate-detection, social-discovery, image-service — executor invoked **only by tests** | `src/services/*.ts` |
| `src/components` | web app | UI components | `ui/` primitives (Button, Card, Badge, Input, Modal, Table), `admin/` (UserManagement, UserTable), `business/` (BusinessDetail, ChatButton, SimilarBusinesses) | `src/components/**` |
| bw-scraper | Rust | axum HTTP worker (:8080, in compose) | SearXNG discovery + ETL → Postgres; owns scrape_jobs lifecycle + scraped_businesses inserts; /health + POST /scrape | `bw-scraper/src/{main,api,importer,scraper,searxng,etl,config}.rs` |
| bw-ingestion | Rust | library crate (NO binary) | ETL pipelines, NATS chat/email consumers, image pipeline, cache service/invalidator — **orphaned: no in-repo consumer** | `bw-ingestion/src/*.rs` |
| bw-api | Rust | axum + GraphQL service (bin exists) | GraphQL schema, JWT + rate-limit middleware, images route — RETIRED from compose (migration 013); not compiling (task #71) | `bw-api/src/**` |
| bw-types | Rust | shared types | Business, Review, User, Verification, Message, Event + email types | `bw-types/src/*.rs` |
| `import-scraped-businesses.ts` | root | one-shot script | promotes scraped_businesses → businesses (idempotent; seed owner; category name→id) | `import-scraped-businesses.ts` |
| `run-social-discovery.ts` / `run-featured-scrape.ts` | root | one-shot scripts | SearXNG social-profile discovery → businesses.social_urls; featured-scrape runner | `run-*.ts` |
| `scripts/` | root | ops scripts | migrate-postgres.mjs, provision-minio.sh, provision-nats.sh, geocode-locations.mjs (Nominatim backfill) | `scripts/*` |
| `db/seed` | SQL | test seed | 3 users (admin/owner/customer — role `customer` is invalid, finding M3), 20 BWS-TEST businesses, 5 scrape jobs; idempotent | `db/seed/seed_test_data.sql` |
| `migrations/` | SQL | schema | Postgres 001-019 (15 files; 003/005/006/008 deliberately deleted) + ClickHouse 001/003 | `migrations/postgresql/*.sql` |
| `docker-compose.yml` | infra | orchestration | postgres:15, nats:2.10 (+WS 8081), clickhouse:23.8, valkey:7.2, minio (9002/9003), bw-scraper (:8080). App NOT in compose (host process) | `docker-compose.yml`, `nats/nats.conf`, `Dockerfile` |
| `e2e/` + `src/qa/` + colocated `*.spec.ts` | tests | Playwright + Jest | 8 Playwright suites; AC-level QA suites; ~100 colocated jest specs | `e2e/`, `src/qa/` |
