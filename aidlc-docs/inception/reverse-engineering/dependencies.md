<!--
surveyed_at: 2026-08-27T02:40:39Z
commit: 5a67ed37776c18bc32c9f8e783cb67e23b6c1641
relevant_paths:
- package.json
- Cargo.toml
- .env
- docker-compose.yml
summary: External dependencies, runtime env vars, and dependency risks.
-->

# Dependencies

## Core External Services

| Dependency | Used by | Purpose | Env / config | Notes |
|---|---|---|---|---|
| PostgreSQL 15 | web app, bw-scraper, one-shot scripts, seeds | system of record | `DATABASE_URL`; fallback `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`; optional `POSTGRES_SCHEMA` | compose port 5432; container URL uses `postgres:5432` |
| Valkey / Redis 7.2 | web app, bw-scraper | refresh tokens, GraphQL cache, scraper rate/cache state | `VALKEY_HOST`, `VALKEY_PORT`; Rust `REDIS_URL`; CI uses `VALKEY_URL` (TS client does not read it) | compose port 6379 |
| NATS 2.10 JetStream | web app, browser chat, bw-scraper | chat/notification events, cache invalidation | `NATS_URL`, `NEXT_PUBLIC_NATS_WS_URL`; Rust `NATS_URL` | host ports 4222 + 8081 WS; no_tls dev-only |
| ClickHouse 23.8 | bw-scraper, bw-ingestion optional, SQL files | analytics mirror | `CLICKHOUSE_URL` | compose ports 8123/9000; no app writers currently |
| MinIO | web app | presigned owner-verification uploads | `MINIO_ENDPOINT`, `MINIO_PORT` default 9000, `MINIO_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_DEFAULT_BUCKET` | compose exposes 9002/9003; host dev needs `MINIO_PORT=9002`; compose uses `MINIO_ROOT_*` |
| SearXNG | bw-scraper, social discovery | meta-search business/social discovery | `SEARXNG_URL` default `http://192.168.68.50:8888` | external/self-hosted; default is a LAN IP |
| Google Maps | Playwright scraper | business data discovery | no API key; Playwright navigation | scraping, not official API |
| OpenStreetMap Nominatim | geocode script | lat/lng backfill | hardcoded endpoint | manual script |

## JavaScript / TypeScript Dependencies

- `next` 16.0.0, `react`/`react-dom` 19.0.0 — core web framework/UI.
- `pg` — Postgres driver.
- `jsonwebtoken`, `bcryptjs` — auth.
- `ioredis` — Valkey/Redis client.
- `nats`, `nats.ws` — event bus / browser chat.
- `minio` — S3-compatible client.
- `leaflet` — map UI.
- `puppeteer` — Playwright-based scraping.
- `graphql`, `@graphql-tools/schema` — declared but unused by the hand-rolled `/api/graphql` parser.
- `jest`, `ts-jest`, `jest-environment-jsdom`, `@testing-library/react`, `jest-dom` — web tests.
- `playwright` — E2E tests.

## Rust Workspace Dependencies

- `tokio` — async runtime.
- `sqlx` — Postgres access.
- `axum` — HTTP service.
- `reqwest` — outbound HTTP.
- `redis` — Valkey/Redis access.
- `clickhouse` — analytics writes/queries.
- `async-nats` — event bus.
- `minio-rsc`, `image`, `lettre` — optional ingestion pipelines.
- `async-graphql`, `jsonwebtoken`, `tower-http` — retired bw-api service.

## Dependency Risks

- `graphql` / `@graphql-tools/schema` are dead dependencies because the GraphQL route does not use them.
- Vitest is configured but not installed; `src/app/performance.test.ts` cannot run.
- Rust workspace version pins are not consistently shared; several crates bypass workspace versions.
- `bw-api` is excluded from coverage because it does not compile (task #71).
- `.env` is tracked in Git and contains secrets plus a private SearXNG LAN URL.
