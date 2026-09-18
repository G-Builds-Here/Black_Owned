<!--
surveyed_at: 2026-09-18T15:38:00Z
commit: 6067387c5757ff143d3b99eaa000af16f4b1d143
relevant_paths:
  - package.json
  - Cargo.toml
  - .env
  - .env.example
  - docker-compose.yml
summary: Internal crate/module dependencies and external service dependencies with how they are called.
-->

# Dependency Map

## Internal

| Dependency | Depends On | Reason |
|------------|-----------|--------|
| `bw-scraper` | (no internal crates) | Self-contained axum service; verified against `bw-scraper/Cargo.toml` — does **not** depend on `bw-types`; its models live in `src/models.rs` |
| `bw-ingestion` | `bw-types` | Shared domain models for ETL/chat/email processing |
| `bw-api` | `bw-types` | Shared domain models for the legacy API |
| `packages/ui` | (standalone) | Not a workspace member; separate vitest/playwright stack |

No circular dependencies among the Rust crates.

## External

| Name | Purpose | How Called | Env / Config |
|------|---------|-----------|-------------|
| PostgreSQL 15 | System of record | `pg` Pool (TS) / `sqlx` (Rust) | `DATABASE_URL` or `POSTGRES_*` vars |
| ClickHouse 23.8 | Analytics mirror | `clickhouse` crate (bw-scraper health check only; no TS client found) | `CLICKHOUSE_URL` |
| NATS 2.10 | Event bus: cache invalidation, chat fan-out, work queues | `nats` (Node), `nats.ws` (browser), `async-nats` (Rust) | `NATS_URL`, `NEXT_PUBLIC_NATS_WS_URL` |
| Valkey 7.2 | Query cache, rate limits, keyspace notifications | `ioredis` (TS), `redis` crate (Rust) | `VALKEY_HOST`/`VALKEY_PORT`, `REDIS_URL` |
| MinIO | Image object storage (presigned URLs) | `minio` npm (TS), `minio-rsc` (Rust, dormant) | `MINIO_ENDPOINT`, `MINIO_PORT` (9002 host), `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_DEFAULT_BUCKET` |
| SearXNG | Metasearch for discovery/enrichment | `reqwest` with robots.txt + rate-limiting (bw-scraper) | `SEARXNG_URL` (default is empty — must be configured; not in `.env.example`) |
| Nominatim (OSM) | Geocoding for location discovery | `reqwest` with User-Agent + rate-limit (bw-scraper) | `NOMINATIM_URL` (default: nominatim.openstreetmap.org) |
| Google Maps / Yelp / Facebook | Business listing scraping | Playwright/Puppeteer in `src/services/` | Browser session, no API key |
| JWT (RS256) | Auth token issue/verify | `jsonwebtoken` npm (HS256 fallback: `JWT_SECRET`); keys in `config/jwt/` | `JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH` or `JWT_SECRET` |

## Why These External Dependencies

- **Postgres + ClickHouse**: CQRS-lite split — OLTP for directory/transactions, analytics for view/event data.
- **NATS JetStream**: Decouples cache invalidation and chat fan-out from the request path; enables future work-queue consumption (email, image processing) in `bw-ingestion`.
- **Valkey**: Sub-millisecond query cache for the directory listing and GraphQL search; keyspace notifications + NATS `cache.invalidate` subject keep it fresh.
- **MinIO**: Self-hosted S3-compatible storage avoids cloud lock-in; presigned URLs let the browser upload/download images without exposing credentials.
- **SearXNG + Nominatim**: Open-source metasearch and geocoding avoid Google API quotas and costs for the discovery pipeline.

## Dependency Risks

- The `graphql`/`@graphql-tools/schema` dead deps are **gone** (removed since the last survey); the GraphQL route remains a hand-rolled regex executor.
- `bw-api` and `bw-ingestion` pin different versions of shared crates than `bw-scraper`; drift risk if they are ever reactivated.
- `SEARXNG_URL` now defaults to empty (the developer-LAN-IP default is fixed) but is **not** in `.env.example` — a host-side run without an override silently cannot reach metasearch.
- `packages/ui` is not a workspace member; its vitest/playwright are invisible to root-level tooling.
- The RS256 keypair in `config/jwt/` is committed (`private.pem` + `public.pem`) — dev-only material; any deployment that forgets the `JWT_PRIVATE_KEY`/`JWT_PRIVATE_KEY_PATH` env override can have tokens forged by anyone with repo read access (see findings).
