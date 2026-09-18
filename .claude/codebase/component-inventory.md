<!--
surveyed_at: 2026-09-05T19:45:00Z
commit: 1d809d37d45d649844f979496e7d7ea1d47a40ce
relevant_paths:
  - src
  - bw-scraper
  - bw-ingestion
  - bw-api
  - scripts
summary: Every significant module with its responsibility and key files, plus orphans/isolates.
-->

# Component Inventory

## Next.js App (root)

| Component | Responsibility | Key Files |
|-----------|----------------|-----------|
| Route handlers (33 files) | REST API surface: auth, users, categories, directory, featured, reviews, businesses, owner, admin, chat, analytics, pending-businesses, scrape-jobs, health | `src/app/api/**/route.ts` |
| Pages | Directory browse/search/map, business detail, owner console, admin console, login/register, chat, static pages | `src/app/directory`, `src/app/business`, `src/app/owner`, `src/app/admin`, `src/app/chat`, `src/app/login` |
| UI components (32) | BusinessCard, Carousel, FilterBar, MapView, SearchBar, SourceFilter, Review, StarRating, VerifiedBadge, BusinessDetailPanel, admin editors, shared primitives (Button, Input, Card, Modal, Dropdown, Badge, Table, Toast, Navigation) | `src/components/**` |
| db repositories | `pg` access per domain: business, user, scrape-job, scraped-business, pending-import, chat, user-management, business-content | `src/lib/db/*.ts` |
| auth | JWT issue/verify (RS256 + HS256 fallback), `createAuthMiddleware` guard, client session | `src/lib/auth/{auth-service,jwt-middleware,auth-middleware,client-session}.ts` |
| graphql | Schema strings, resolvers, Valkey query cache, and the regex query executor | `src/lib/graphql/{schema,business-schema,query-cache,executor?}.ts` |
| nats | Node client, cache-invalidator subscriber, role/verification publishers | `src/lib/nats/{client,cache-invalidator}.ts` |
| valkey | ioredis client + cache helpers | `src/lib/valkey/valkey-client.ts` |
| minio | Presigned URL service | `src/lib/minio/minio-service.ts` |
| chat | Browser `nats.ws` live-chat client | `src/lib/chat/nats-client.ts` |
| services (scrapers) | Google Maps / Yelp / Facebook Playwright scrapers + job executor | `src/services/{google-maps-scraper,yelp-scraper,facebook-scraper,scraper-job-executor}.ts` |
| one-off scripts | Migrate, geocode backfill, import/seed, social discovery, featured scrape | `scripts/*.mjs`, `import-scraped-businesses.ts` |

## Rust Workspace

| Component | Responsibility | Key Files |
|-----------|----------------|-----------|
| bw-scraper (service, ACTIVE) | SearXNG paged discovery → ETL → Postgres; bounded enrichment; Nominatim location discovery; operator API | `bw-scraper/src/main.rs`, `api.rs`, `scraper.rs`, `etl.rs`, `enrichment.rs` (215 KB monolith), `locations.rs`, `searxng.rs`, `rate_limiter.rs`, `robots.rs`, `user_agent_rotator.rs`, `connectors.rs`, `config.rs`, `models.rs` |
| bw-scraper tests | 8 in-file unit modules + 2 integration files + a Dockerfile test script | `bw-scraper/src/**` (`#[cfg(test)]`), `bw-scraper/tests/{connectors_test,cargo_config_test}.rs` |
| bw-ingestion (library, DORMANT) | NATS chat consumer, email publisher/consumer (letra), image worker (MinIO + thumbnails), Valkey cache invalidator, ETL transformers (yelp/google_maps/facebook); no binary runs it | `bw-ingestion/src/{chat_consumer,email_publisher,email_consumer,email_service,image_worker,image_publisher,cache_invalidator,background_service,stream_config,service_connectivity,etl/*}.rs` |
| bw-api (crate, DORMANT) | Legacy pre-Next.js API skeleton: axum bin (`/health` only), placeholder route handlers, async-graphql schema, JWT + rate-limit middleware | `bw-api/src/{lib,bin/main,routes/{mod,images},middleware/{mod,auth,rate_limiter},graphql/*}.rs` |
| bw-types (library) | Shared `Business`, `Category`, `Review` + email payload types | `bw-types/src/{lib,email}.rs` |

## Orphans or Isolates

- **bw-api** — no compose service, placeholder handlers, historically created the `reviews`/`categories` tables that migrations 013/020 later backfilled. Candidate for removal or reactivation.
- **bw-ingestion** — consumers for `chat.message`, `email.send`, `image.process` that nothing in this repo hosts; a second `cache.invalidate` consumer that duplicates the TS one.
- **`vitest.config.ts` + `vitest.setup.ts` (root)** — configured but vitest is not a root dependency; `src/app/performance.test.ts` and `clickhouse/*.test.ts` (LOC-0032) cannot run from root. The only working vitest is in `packages/ui`.
- **`graphql` / `@graphql-tools/schema`** — declared in `package.json`, never imported.
- **`PATCH_STATUS` export** in the users route — unreachable; App Router only wires `PATCH`.
- **ClickHouse mirror table** (`migrations/clickhouse/001_create_tables.sql`) — no runtime write path found in TS or active Rust code.
