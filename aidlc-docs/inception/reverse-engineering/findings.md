<!--
surveyed_at: 2026-08-27T02:40:39Z
commit: 5a67ed37776c18bc32c9f8e783cb67e23b6c1641
relevant_paths:
- src/app/api
- src/lib
- bw-scraper/src
- docker-compose.yml
- .env
summary: High-severity findings with operational impact and mitigation sketches.
-->

# Findings

## HIGH

### H1 — `categories` table has no Postgres migration
**Impact:** Fresh databases created by `npm run migrate` lack `categories`. `/api/categories`, claim category validation, owner business category joins, and GraphQL category resolution fail or leave listings with invalid categories.  
**Evidence:** No `migrations/postgresql/*.sql` creates `categories`; routes read Postgres `categories` table; table exists only in ClickHouse schema and live DB from prior bw-api era.  
**Mitigation sketch:** Add an idempotent migration creating `categories` if absent and seed baseline categories; verify claim, directory, categories, and GraphQL paths against a fresh database.

### H2 — User-management UI calls missing endpoints
**Impact:** Admin role/status changes from `UserManagement.tsx` and `UserTable.tsx` can 404 in production. The actual role endpoint is `PATCH /api/users`, while the UI targets `PATCH /api/users/role`; status endpoint is exported as `PATCH_STATUS`, which is not a valid App Router export.  
**Evidence:** `src/components/admin/UserManagement.tsx`, `src/components/ui/UserTable.tsx`, `src/app/api/users/route.ts`.  
**Mitigation sketch:** Move handlers to `src/app/api/users/[id]/role/route.ts` and `src/app/api/users/[id]/status/route.ts` or update UI to existing reachable route shape; add route specs and admin E2E coverage.

### H3 — Scraped jobs are never executed by the deployed stack
**Impact:** `POST /api/scrape-jobs` creates `pending` jobs, but no deployed component executes them. In-app executor is test-only, and bw-scraper does not poll `scrape_jobs`; it only has its own `POST /scrape` entry point. Admin-created jobs can stall forever.  
**Evidence:** `src/app/api/scrape-jobs/route.ts` inserts pending; `src/services/scraper-job-executor.ts` has no production caller; bw-scraper `main.rs`/`api.rs` only exposes health and scrape commands.  
**Mitigation sketch:** Choose one execution model: either make bw-scraper poll `scrape_jobs` and update status, or expose a controlled executor service. Add integration test proving a job transitions pending → running → completed.

### H4 — `.env` is tracked in Git
**Impact:** Secrets (`JWT_SECRET`, MinIO credentials) and private network details (`SEARXNG_URL=http://192.168.68.50:8888`) are in repository history. Any clone can expose auth material and internal endpoints.  
**Evidence:** `.gitignore` lacks `.env`; `git ls-files` includes `.env`.  
**Mitigation sketch:** Remove `.env` from Git, add it to `.gitignore`, rotate JWT/MinIO credentials, commit `.env.example` with non-secret values, and audit history/remote if the repo has ever been shared.

### H5 — GraphQL `createBusiness` cannot authenticate
**Impact:** The GraphQL route hardcodes a fake authorization context, so `createBusiness` (and owner-scoped mutations) cannot rely on the real user. This can allow unauthenticated mutation attempts or always produce auth failures depending on resolver logic.  
**Evidence:** `src/app/api/graphql/route.ts` hardcodes `context.authorization = "Bearer token"` and never sets `context.user`; resolver expects `getCurrentUserId`.  
**Mitigation sketch:** Use the shared auth middleware or explicitly verify `Authorization` before building resolver context. Remove the regex parser and use the existing `graphql`/`@graphql-tools/schema` dependencies or explicitly retire them.

## MEDIUM

### M1 — Reviews table lacks referential integrity
**Impact:** `reviews.business_id` and `reviews.user_id` have no FKs; rating has no 1-5 CHECK. Bad rows can exist only if route validation is bypassed or a future writer forgets constraints.  
**Mitigation sketch:** Add migrations for FKs and `rating CHECK (rating BETWEEN 1 AND 5)` after validating existing data.

### M2 — `pending_import_businesses.job_id` has no FK
**Impact:** Pending import rows can reference missing jobs, making audit/debugging and import reporting unreliable.  
**Mitigation sketch:** Add FK to `scrape_jobs(id)` with appropriate delete behavior after data validation.

### M3 — Seed role `customer` is invalid
**Impact:** Seeded customer user can log in but fail all `createAuthMiddleware` role checks, breaking role-based E2E tests or seeded workflows.  
**Mitigation sketch:** Change seed role to `user` or add/align role enum if `customer` is intentionally supported.

### M4 — Orphan Rust crates and dead dependencies
**Impact:** `bw-ingestion` has no binary and no in-repo consumer; `bw-api` is retired and not compiling; `graphql`/`@graphql-tools/schema` are unused by the actual GraphQL route. This increases build time, CI noise, and maintenance confusion.  
**Mitigation sketch:** Decide whether to delete, extract, or rewire each crate/dependency. If kept, document owner and consumer.

### M5 — Directory and suggest load all rows into memory
**Impact:** `/api/directory` and `/api/directory/suggest` fetch all directory rows, then filter/sort in JS. Performance degrades linearly with data size and can strain Postgres/Node under load.  
**Mitigation sketch:** Move filtering/pagination into SQL, add indexes on common filters, and cap result sets.

### M6 — MinIO port and credential mismatch
**Impact:** Compose exposes MinIO on host 9002, but the TS client defaults to 9000. Host-side dev without `MINIO_PORT=9002` points to ClickHouse. Compose uses `MINIO_ROOT_*` while app reads `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`, relying on defaults.  
**Mitigation sketch:** Use one canonical env convention, set `MINIO_PORT` in `.env.example`/compose, and add a health/presign smoke test.

## LOW

### L1 — `messages.sender_user_id` lacks `ON DELETE CASCADE`
**Impact:** Deleting a user can fail or leave inconsistent chat rows, unlike sibling FKs.  
**Mitigation sketch:** Add a migration after checking message retention requirements.

### L2 — `PendingImportBusiness` carries dead `duplicateStatus`
**Impact:** TypeScript type references a dropped column, causing confusion and possible null/deserialize mismatch.  
**Mitigation sketch:** Remove field from type and mappers, or restore column if still needed.

### L3 — Inconsistent `POSTGRES_SCHEMA` qualification
**Impact:** Some routes qualify table names, most do not. Future schema usage will be inconsistent and error-prone.  
**Mitigation sketch:** Standardize repository queries to use a schema-qualified table name helper.

### L4 — Stale duplicate test infrastructure
**Impact:** Multiple jest setups, missing file mocks, Vitest config without dependency, and root-level specs not picked up by Jest create false confidence.  
**Mitigation sketch:** Remove unused configs/files or wire them into npm scripts; make `npm test` reflect all intended test groups.
