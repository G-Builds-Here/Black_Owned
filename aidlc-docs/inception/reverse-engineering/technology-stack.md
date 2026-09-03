<!--
surveyed_at: 2026-08-27T02:40:39Z
commit: 5a67ed37776c18bc32c9f8e783cb67e23b6c1641
relevant_paths:
- package.json
- Cargo.toml
- bw-scraper/Cargo.toml
- bw-ingestion/Cargo.toml
- docker-compose.yml
summary: Languages, frameworks, runtimes, and dependency versions with their purposes.
-->

# Technology Stack

## Web App (package.json)

| Item | Version | Purpose |
|---|---|---|
| TypeScript | ^5 | language |
| Next.js | 16.0.0 | App Router UI + API (all HTTP surface) |
| React / react-dom | 19.0.0 | UI |
| Tailwind CSS | ^4.0.0 | styling |
| pg | ^8.11.0 | Postgres client (module-level Pool via `getPool()`) |
| jsonwebtoken | ^9.0.0 | JWT RS256 sign/verify (key material in `config/jwt`) |
| bcryptjs | ^2.4.3 | password hashing |
| ioredis | ^5.4.1 | Valkey client (refresh tokens, cache) |
| nats / nats.ws | ^2.28 / ^1.30 | server event bus / browser chat WebSocket |
| minio | ^8.0.0 | presigned upload URLs |
| leaflet | ^1.9.4 | directory + detail-page maps |
| puppeteer | ^24.0.0 | Playwright-based Google Maps/Yelp/Facebook scrapers (src/services) |
| graphql + @graphql-tools/schema | ^16.8 / ^10 | [DEAD DEPS] declared but the `/api/graphql` route is a hand-rolled regex parser that never imports them — see anti-patterns |

## Rust Workspace (Cargo.toml, edition 2021)

| Crate | Role | Notable deps |
|---|---|---|
| bw-types | shared domain types | serde, uuid, chrono |
| bw-scraper | axum HTTP worker (SearXNG discovery + ETL → Postgres) | tokio, sqlx 0.7 (postgres), axum 0.7, reqwest 0.12, redis 0.24, clickhouse 0.12, async-nats |
| bw-ingestion | library: ETL + NATS consumers + cache invalidation (no binary, no in-repo consumer) | redis 0.27, minio-rsc, image, lettre (optional) |
| bw-api | axum + GraphQL service, RETIRED from compose, currently not compiling (task #71) | async-graphql 7.0, jsonwebtoken 9.3, tower-http |

Note: workspace `dependencies` pins (async-nats 0.33, redis 0.24, clickhouse 0.12, axum 0.7) are bypassed by per-crate versions (0.40 / 0.27 / 0.13 / 0.8) — the sharing is nominal only.

## Infrastructure (docker-compose.yml)

| Service | Version | Ports (host) |
|---|---|---|
| PostgreSQL | 15-alpine | 5432 |
| NATS (JetStream) | 2.10-alpine | 4222, 8081 (WS, no_tls per nats/nats.conf), 8222 |
| ClickHouse | 23.8-alpine | 8123, 9000 |
| Valkey | 7.2-alpine | 6379 |
| MinIO | latest | 9002 (console 9003) — 9000 was double-mapped with ClickHouse and moved |
| bw-scraper | built from root Dockerfile (rust:1.88 → bookworm-slim) | 8080, healthcheck /health |

The Next.js app is NOT a compose service — it runs on the host via `npm run dev`.

## Test Frameworks

Jest ^29.7 (ts-jest, jsdom; unit + component, ~100 specs), Playwright ^1.62 (8 E2E suites), cargo test (Rust unit + integration), Vitest (configured but not installed — dead), plus a second Jest config (`jest.config.components.js`) not wired to any npm script. Details: `test-infrastructure.md`.
