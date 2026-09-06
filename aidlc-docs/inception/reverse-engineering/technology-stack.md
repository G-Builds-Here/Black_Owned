<!--
surveyed_at: 2026-09-05T19:45:00Z
commit: 1d809d37d45d649844f979496e7d7ea1d47a40ce
relevant_paths:
  - package.json
  - Cargo.toml
  - bw-scraper/Cargo.toml
  - bw-ingestion/Cargo.toml
  - bw-api/Cargo.toml
  - bw-types/Cargo.toml
  - docker-compose.yml
summary: Languages, frameworks, runtimes, and versions for every component in the workspace.
-->

# Technology Stack

## Core Languages & Frameworks

| Layer | Tech | Version | Project |
|-------|------|---------|---------|
| Web app / API | Next.js (App Router) | 16.0.0 | root (`package.json`) |
| UI | React + TypeScript + Tailwind CSS | React 19.0.0, TS ^5, Tailwind ^4 | root |
| GraphQL | graphql + @graphql-tools/schema | graphql ^16.8 | root (declared; not yet wired into a real executor) |
| Browser scraping | Playwright, Puppeteer | Playwright ^1.62.1, Puppeteer ^24 | `src/services/` |
| Discovery worker | Rust, axum, tokio, sqlx | Rust 1.88 (Dockerfile), axum 0.7, sqlx 0.7, async-nats 0.33 | `bw-scraper` |
| Ingestion lib | Rust, NATS, MinIO, Redis, ClickHouse | async-nats 0.40, minio-rsc 0.2.6, redis 0.27, clickhouse 0.13 | `bw-ingestion` |
| Legacy API lib | Rust, axum 0.8, async-graphql 7.0 | edition 2021 | `bw-api` (dormant) |
| Shared types | Rust (serde, sqlx, derive_builder) | edition 2021 | `bw-types` |
| Test (TS) | Jest 29 + ts-jest, Playwright 1.62 | jsdom env | root |
| Test (Rust) | cargo test, cargo-llvm-cov | CI only | Rust workspace |
| Test (UI pkg) | Vitest 4 + @vitest/coverage-v8 | packages/ui (separate, not a workspace member) | `packages/ui` |

## Infrastructure Services

| Service | Version | Purpose |
|---------|---------|---------|
| PostgreSQL | 15 | System of record (businesses, users, reviews, chat, scrape jobs, locations, categories) |
| ClickHouse | 23.8 | Analytics (view counts, event mirror) |
| NATS | 2.10 (JetStream) | Event bus: cache invalidation, live chat fan-out, email/image work queues |
| Valkey (Redis-compatible) | 7.2 | Query cache, rate-limit state, keyspace notifications (allkeys-lru, 256 MB) |
| MinIO | S3-compatible | Object storage for business images (presigned URLs) |
| SearXNG | user-supplied instance | Metasearch for business discovery and enrichment |

## Why This Stack

The polyglot split follows the performance profile of each workload:
- **Browser scraping** (Maps/Yelp/Facebook) needs DOM automation → Playwright in Node.
- **High-volume discovery + enrichment** is CPU/network-bound with tight rate limits → Rust with `tokio` and `axum`.
- **The product UI and CRUD API** are straightforward web work → Next.js App Router with colocated route handlers.
- **Analytics** (view counts, event streams) use ClickHouse for fast aggregate queries alongside Postgres OLTP.

[ASSUMED] The Rust ingestion and API crates were an earlier architectural iteration (pre-Next.js) that has been partially superseded by the Next.js app; `bw-ingestion` and `bw-api` are currently dormant.

## Version Constraints / Notes

- `bw-api` pins axum 0.8 while `bw-scraper` uses 0.7; they are separate crates so this is not a build conflict, but it signals drift.
- `bw-ingestion` pins async-nats 0.40 vs 0.33 in bw-scraper; same rationale.
- Rust 1.88 in the Dockerfile; local builds should use a compatible toolchain.
- `sqlx-postgres` 0.7.4 emits a future-incompatibility warning on current stable; no action needed yet.
- Root `package.json` has **no** `workspaces` key — `packages/ui` is a standalone package with its own vitest/playwright, not a monorepo member.
