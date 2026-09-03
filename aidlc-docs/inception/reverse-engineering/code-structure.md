<!--
surveyed_at: 2026-08-27T02:40:39Z
commit: 5a67ed37776c18bc32c9f8e783cb67e23b6c1641
relevant_paths:
- src
- bw-scraper/src
- bw-ingestion/src
- bw-api/src
- migrations
summary: Directory layout and module responsibilities.
-->

# Code Structure

## Web App (`src/`)

```
src/
  app/                    # App Router
    api/                  # 31 route.ts files (REST + hand-rolled GraphQL)
      auth/{login,register}/   # open
      directory/            # open; /suggest imports from /directory route
      categories/, featured-businesses/, businesses/[id]/{view,claim,approve,reject,verification/*}
      reviews/, reviews/[id]/moderate
      chat/conversations/...   # live chat
      owner/businesses/...     # claim wizard, views
      pending-businesses/...   # admin import queue
      scrape-jobs/, analytics/ # admin + analytics
      users/                  # admin (PATCH /api/users role handler; /status is dead — finding H2)
      graphql/                # regex-parsed mini-GraphQL (finding H5)
    {directory,businesses,owner,admin,login,register,chat,about,...}/page.tsx
  lib/
    db/                   # pg repositories: user, business, scraped-business, scrape-job, pending-import, chat, user-management; getPool() singleton (max 20, lazy)
    auth/                 # auth-service (RS256, config/jwt), jwt-middleware (createAuthMiddleware(roles)), client-session (localStorage)
    valkey/               # ioredis: refresh tokens, query cache
    nats/                 # nats-client (publish) + client (cache-invalidator subscription) — two parallel modules (anti-pattern)
    minio/                # presigned URLs
    chat/                 # browser NATS-WS client
    graphql/              # business-schema.ts (types), resolvers, regex parser, valkey cache
  services/               # Playwright scrapers, executor, dedup, social-discovery, image-service
  components/             # ui/ + admin/ + business/
  qa/                     # AC-level QA suites
  types/                  # TS domain types
e2e/                      # Playwright (8 suites) + e2e-utils
```

## Rust Workspace

```
bw-scraper/src/   # main.rs (fail-fast: PgPool::connect at startup), api.rs, importer.rs (job lifecycle + inserts),
                  # scraper.rs (SearXNG paging), searxng.rs, etl.rs, config.rs (from_env; DATABASE_URL required),
                  # connectors.rs, rate_limiter.rs, robots.rs, user_agent_rotator.rs + 5 inline test mods
bw-ingestion/src/ # lib.rs (duplicated `pub mod cache_service;` — E0584 under integration_test feature),
                  # etl/{google_maps,yelp,facebook}, consumers/{chat,email}, email_service, image/{worker,processor,publisher},
                  # cache_service, cache_invalidator, background_service — NO binary target
bw-api/src/       # lib + schema/ + middleware/ (JWT, rate-limit) + routes/ (images); retired, not compiling
bw-types/src/     # Business, Review, User, Verification, Message, Event + email types
```

## Migrations

- `migrations/postgresql/` — chain 001-019 with deliberate gaps (003/005/006/008 deleted; 012 documents why). 001 is the reconciled baseline; later files are idempotent. 009 reconciles live-DB drift; 017 backfills coords from Google Maps URL encoding; 019 adds phone/menu_url/rating_source.
- `migrations/clickhouse/` + `clickhouse/` — analytics mirror schema (dormant).
- `scripts/migrate-postgres.mjs` — numeric-prefix order, one file per transaction, tracked in `schema_migrations`, re-runs no-op.

## Repo Hygiene Notes

- `.worktrees/epic-jest/` — a full stale worktree committed in-tree with duplicated jest configs (anti-pattern).
- `db/seed/seed_test_data.sql` — 3 users (incl. invalid role `customer`), 20 BWS-TEST businesses, 5 scrape jobs; idempotent.
- `docs/design-drift-audit-2026-08-20.md` — the repo ships its own drift audit; many HIGH items since fixed (chat, admin auth gates, dedup wired, port 9000 collision, migration baseline).
