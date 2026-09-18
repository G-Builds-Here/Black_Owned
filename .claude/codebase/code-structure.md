<!--
surveyed_at: 2026-09-05T20:30:00Z
commit: 1d809d37d45d649844f979496e7d7ea1d47a40ce
relevant_paths:
- src
- bw-scraper/src
- bw-ingestion/src
- bw-api/src
- migrations
summary: Directory layout and module responsibilities (Next.js front-end + Rust workspace + infra).
-->

# Code Structure

## Web App (`src/`)

```
src/
  app/                    # App Router
    api/                  # 32 route.ts files (REST + hand-rolled GraphQL)
      auth/{login,register}/   # open
      directory/            # open; /suggest imports from /directory route
      categories/, featured-businesses/, health/
      businesses/[id]/{view,claim,approve,reject,verification/{approve,reject}}, bulk-approve/
      admin/{businesses/[id]/content, dashboard, enrichment}/   # admin content + enrichment trigger (LOC-0079)
      reviews/, reviews/[id]/moderate
      chat/conversations/{, [id]/{messages,read}}/   # live chat
      owner/businesses/{, [id]/{,views}}/     # claim wizard, views
      pending-businesses/{, import/{,job/[jobId]}}/   # admin import queue
      scrape-jobs/, analytics/scrape-jobs/{,recent}/ # admin + analytics
      users/                  # admin (PATCH /api/users role handler; /status is dead — finding H2)
      graphql/                # regex-parsed mini-GraphQL (finding H5)
    {directory,businesses,owner,admin,login,register,chat,about,...}/page.tsx
  lib/
    db/                   # pg repositories: user, user-management, business, business-content,
                           # scraped-business, scrape-job (job-repository), pending-import, chat; getPool() singleton
    auth/                 # auth-service (RS256, config/jwt), jwt-middleware (createAuthMiddleware(roles)), client-session
    valkey/               # ioredis: refresh tokens, query cache
    nats/                 # nats-client (publish) + client (cache-invalidator subscription) — two parallel modules (anti-pattern)
    minio/                # presigned URLs
    chat/                 # browser NATS-WS client
    graphql/              # business-schema.ts (types), resolvers, regex parser, valkey cache
    design-tokens/, utils/, index.ts
  services/               # Playwright scrapers (google-maps, yelp, facebook), scraper-job-executor,
                           # duplicate-detection, social-discovery, image-service, review-service
  components/             # ui/ + admin/ + business/
  qa/                     # AC-level QA suites
  types/                  # TS domain types
e2e/                      # Playwright: 9 suites (search-directory, enrichment, features, performance,
                           # admin-console, approval-workflow, chat, claim-wizard, docker-compose) + e2e-utils
```

## Rust Workspace (`Cargo.toml` virtual workspace, 4 members)

```
bw-scraper/src/   # main.rs (fail-fast: PgPool::connect at startup), api.rs (operator API: /scrape, /enrich,
                  # /locations, /businesses endpoints + oneshot tests), enrichment.rs (SearXNG-primary engine,
                  # menu/social/phone/image extraction), locations.rs (Nominatim geocoding + merge),
                  # etl.rs, importer.rs, models.rs, scraper.rs, searxng.rs, connectors.rs,
                  # rate_limiter.rs, robots.rs, user_agent_rotator.rs, config.rs (from_env), lib.rs
bw-scraper/tests/ # connectors_test.rs (live-service gates), cargo_config_test.rs, fixtures/
bw-ingestion/src/ # lib.rs, etl/{pipeline,transformer,validation,google_maps,yelp,facebook}, email_service,
                  # email_{consumer,publisher}, chat_consumer, image_{worker,processor,publisher},
                  # cache_service, cache_invalidator, background_service, stream_config,
                  # scraper_rate_limiter, service_connectivity — NO binary target (dormant lib)
bw-ingestion/tests/ # cache_service_{unit,integration}, cache_invalidator_{unit,integration} (integration gated on feature)
bw-api/src/       # bin/main.rs + schema + graphql/{queries,mutations,types} + middleware/{auth,rate_limiter}
                  # + routes/images; does NOT compile (task #71)
bw-types/src/     # lib.rs (Business, Review, User, Verification, Message, Event) + email.rs (SmtpConfig,
                  # NatsEmailPayload, EmailTemplate)
```

## Migrations

- `migrations/postgresql/` — chain 001–021 with deliberate gaps (003/005/006/008 deleted; 012 documents why). 001 is the reconciled baseline; later files are idempotent. 017 backfills coords from Google Maps URL encoding; 019 adds phone/menu_url/rating_source; 020 creates categories; 021 adds card_image_url (dual image slots, LOC-0076).
- `migrations/clickhouse/` (001, 003_chat_messages) + `clickhouse/` — analytics mirror schema (dormant).
- `scripts/migrate-postgres.mjs` — numeric-prefix order, one file per transaction, tracked in `schema_migrations`, re-runs no-op.

## Repo Hygiene Notes

- `.worktrees/` — 8 git worktrees checked out in-tree; they double file counts in any naive tree walk (excluded from survey scans).
- `db/seed/seed_test_data.sql` — test users + BWS-TEST businesses + scrape jobs; idempotent.
- `docs/design-drift-audit-2026-08-20.md` — the repo ships its own drift audit; many HIGH items since fixed.
