<!--
surveyed_at: 2026-08-27T02:40:39Z
commit: 5a67ed37776c18bc32c9f8e783cb67e23b6c1641
relevant_paths:
- src/app/api/graphql
- src/lib
- bw-ingestion/src
- .env
- .worktrees
summary: Anti-patterns observed in the repo, with evidence and risk.
-->

# Anti-Patterns

## Hardcoded credentials/secrets in tracked files
**Evidence:** `.env` is git-tracked and includes `JWT_SECRET`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, and private `SEARXNG_URL`.  
**Risk:** secret leakage and unreviewable environment-specific defaults.

## Fake auth context in GraphQL route
**Evidence:** `src/app/api/graphql/route.ts` hardcodes `context.authorization = "Bearer token"` and does not set `context.user`.  
**Risk:** mutation handlers cannot authenticate correctly; security control is bypassed or inconsistent.

## Regex-based GraphQL execution
**Evidence:** `/api/graphql` parses queries with regex instead of using `graphql` / `@graphql-tools/schema`, which are declared dependencies.  
**Risk:** fragile query parsing, poor validation, broken variables/whitespace handling, and dead dependencies.

## Shared table writes without coordination
**Evidence:** web app and `bw-scraper` both write `scrape_jobs` and `scraped_businesses`; no claim/lock protocol, no unique constraint on `(source, query, location)`.  
**Risk:** duplicate jobs, lost updates, inconsistent status, and race conditions.

## Orphan Rust crates
**Evidence:** `bw-ingestion` has no binary and no in-repo dependent crate; `bw-api` is retired from compose and currently not compiling.  
**Risk:** unused code, longer builds, CI confusion, and misleading architecture.

## Two parallel NATS clients
**Evidence:** `src/lib/nats/nats-client.ts` and `src/lib/nats/client.ts` expose different functions (`getNatsClient` vs `getNatsConnection`).  
**Risk:** duplicated reconnect/cache logic and inconsistent client behavior.

## In-app scraper executor has no production caller
**Evidence:** `src/services/scraper-job-executor.ts` is only referenced by tests, while admin scrape-job creation only inserts pending rows.  
**Risk:** user/admin actions appear accepted but have no effect in production.

## Dead test infrastructure
**Evidence:** Vitest config exists but Vitest is not installed; `jest.config.components.js` references missing `__mocks__/file-mock.js`; root-level specs are outside Jest `roots`; multiple `jest.setup*` files exist.  
**Risk:** `npm test` can pass while meaningful tests are not run.

## Committed stale worktree
**Evidence:** `.worktrees/epic-jest/` contains duplicated jest configs and test files.  
**Risk:** accidental edits, confusing test discovery, and repo bloat.

## Environment-variable drift
**Evidence:** Compose supplies `MINIO_ROOT_*`, but app reads `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`; compose host MinIO port is 9002 while app default is 9000; CI uses `VALKEY_URL` while TS code reads `VALKEY_HOST`/`VALKEY_PORT`.  
**Risk:** local/dev failures that depend on which env file happens to set the right name.

## Hardcoded LAN defaults in product code
**Evidence:** `SEARXNG_URL` default in `bw-scraper/src/config.rs` is `http://192.168.68.50:8888`.  
**Risk:** deployment-specific address leaks into defaults and silently works only on one network.
