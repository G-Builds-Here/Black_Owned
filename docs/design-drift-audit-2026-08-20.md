# Design Drift & Unimplemented Features — Black_Owned

**Date:** 2026-08-20
**Scope:** 44 local tickets (LOC-0030…LOC-0075) + `~/.claude/tickets/bugs/` + design docs (`aidlc-docs/inception`, `aidlc-docs/construction`) audited against the working tree (branch `fix/directory-scraped-businesses`). Three audit passes: LOC-0030–0053, LOC-0054–0065 (scraper epic), LOC-0066–0075 + design-doc cross-check.
**Legend:** [HIGH] = broken or user-visible gap · [MED] = weaker than specced · [LOW] = hygiene.
**Remediation:** in progress as of 2026-08-21 — all findings in scope per owner ruling; outcomes and task map in §8.

---

## 1. Ticket verdicts

| Ticket | Verdict | One-line evidence |
|---|---|---|
| LOC-0030 (epic) | DRIFTED | Postgres is the real DB, `bw-api` absent from compose, chat/dashboard/claim/E2E missing |
| LOC-0031 | IMPLEMENTED | 4-crate workspace, 7 types + round-trip tests, CI check/test/clippy |
| LOC-0032 | IMPLEMENTED | 7 ReplacingMergeTree tables; image 23.8 vs specced 24; port 9000 double-bound |
| LOC-0033 | IMPLEMENTED | NATS/MinIO/Valkey provisioning matches; AC2's localhost:9000 check hits the colliding port |
| LOC-0034 | IMPLEMENTED | 8 components in `packages/ui`, Vitest + axe-core + Playwright |
| LOC-0035 | DRIFTED | 9 Rust resolvers exist but frontend calls a regex-parsing TS stub; Rust pagination broken |
| LOC-0036 | PARTIAL | Valkey cache + NATS invalidation exist; rate-limit state in-memory; JWT HS256, exp validation off |
| LOC-0037 | PARTIAL | `moderateReview` missing; `search` = `name ILIKE` only (no ranking/facets/`first`) |
| LOC-0038 | IMPLEMENTED | In TS not Rust; bcrypt 12, RS256, refresh rotation w/ revocation |
| LOC-0039 | PARTIAL | Presigned PUT + admin approve/reject exist; `verification.approved/rejected` NATS events never published |
| LOC-0040 | PARTIAL | Chat/email consumers exist (in `bw-ingestion`, not specced `bw-consumer`); `chat_messages` table missing; SMTP not Resend |
| LOC-0041 | DRIFTED | Directory is a single-column list w/ fake map; no grid, URL-param filters, JSON-LD, gallery, Chat/Claim |
| LOC-0042 | MISSING | No chat route/components anywhere in `src/` |
| LOC-0043 | MISSING | No owner dashboard, no 3-step claim wizard, no views chart |
| LOC-0044 | DRIFTED | Admin page = hardcoded mock metrics; all handlers `console.log` |
| LOC-0045 | PARTIAL | Healthchecks + Playwright compose spec exist; Rust "connectivity" tests are TCP-only with hardcoded `Ok(1)` |
| LOC-0046 | IMPLEMENTED | Thumbnails + cache invalidation in `bw-ingestion` |
| LOC-0047 | IMPLEMENTED | User management table, debounced search, `role_changed` event |
| LOC-0048 | DRIFTED | "Moderation" page is really the pending-businesses bulk-approve flow; verification queue mocked |
| LOC-0049 | DUPLICATE | File is byte-identical to LOC-0048 |
| LOC-0050 | PARTIAL | 5 businesses / 1 category / 0 reviews vs specced 30 / 10 / real; placeholder password hashes |
| LOC-0053 | MISSING | No Playwright E2E for chat, claim wizard, or admin console |
| LOC-0054 epic | MIXED | E1 PARTIAL · E2 PARTIAL · E3 PARTIAL · E4 WEAK · E5 MOSTLY WORKS (UI buttons orphaned) · E6 FAILS (mocked) |
| LOC-0055 | PARTIAL | CI workflows exist; no coverage tooling (AC3), no `permissions:` on fork PRs |
| LOC-0056 | DRIFTED | Compose + Dockerfile exist but Dockerfile builds a **stub** binary; secrets inline (AC4 violated) |
| LOC-0057 | MISSING | No `/health` in Rust (no server at all); TS `/api/health` is static `{status:"healthy"}` |
| LOC-0058 | PARTIAL | Seeds 20 businesses/5 users/5 jobs but against the **dead migration schema**; placeholder hashes |
| LOC-0059 | PARTIAL | CRUD routes exist; no source filter (AC3), no transition validation (AC2), cancel doesn't stop scraper (AC5) |
| LOC-0060 | DRIFTED | TS Playwright GM scraper works; specced Rust scraper returns **mock rows** with random `owner_id` |
| LOC-0061 | DRIFTED | Rate limiter / UA rotator / robots implemented in Rust but invoked by **no request path**; robots never fetched |
| LOC-0062 | DRIFTED | TS Yelp scraper works; Rust side has no Yelp connector |
| LOC-0063 | PARTIAL | TS FB scraper w/ no login handling (AC5 missing); no Rust connector |
| LOC-0064 | DRIFTED | Rust ETL + validators exist but orphaned; live path does ad-hoc normalization |
| LOC-0065 | PARTIAL | Works via `importNormalizedBusinesses`; namesake `business-importer.ts` bypasses the review gate (dead code) |
| LOC-0066 | PARTIAL | Fuzzy/phone dedup built + tested but **wired into no import path**; no env-configurable threshold (AC5) |
| LOC-0067 | PARTIAL | 5 REST endpoints exist; no auth, no pagination, inconsistent error envelope |
| LOC-0068 | PARTIAL | Queue/detail/bulk-approve work; **modal Approve/Reject buttons only close the modal** (verified: `page.tsx:416,419` → `handleCloseDetail`); endpoints orphaned; no reason input |
| LOC-0069 | PARTIAL | Analytics page renders mock zeros; no charts/duration/source filter |
| LOC-0070 | DRIFTED | Real crate + orphan duplicate `bw-scraper/bw-scraper/` (not a workspace member); `etl.rs`/`importer.rs` TODO stubs |
| LOC-0071 | MISSING | Rust types specced as `sqlx::FromRow`; `models.rs` is a 5-line TODO; TS twins exist instead |
| LOC-0072 | PARTIAL | Create form works; Active Jobs only shows `running` (new `pending` jobs invisible); no 5s polling (AC3); no "Review Results" nav (AC4) |
| LOC-0073 | PARTIAL | `src/qa/scraper-e2e.spec.ts` covers lifecycle/statuses/sources; no UI assertions; construction doc claims a file that doesn't exist |
| LOC-0074 | MISSING | No approval-workflow E2E anywhere |
| LOC-0075 | PARTIAL | Phone-dup spec thorough; AC4 (ranked match list) unsupported — service returns single boolean result |

---

## 2. Architectural drift (the big ones)

- **[HIGH] Two parallel full-stack implementations.** The running app is the Next.js one; `bw-api` (async-graphql, Postgres-backed) is a parallel implementation with **no service entry in `docker-compose.yml`** — its resolvers/middleware are dead in the running stack. The frontend's `/api/graphql` is a regex-parsing stub that returns `cursor: 'cursor'` and `hasNextPage: false` for every page and injects a fake auth header on mutations (`src/app/api/graphql/route.ts:64-130`).
- **[HIGH] "ClickHouse is the single database" design abandoned.** Epic AC-E1 says so; in reality 7 Postgres migrations drive every repository. ClickHouse holds only scrape-job stats + 7 unused domain tables.
- **[HIGH] Three competing `scrape_jobs` schemas.** `migrations/postgresql/003` (+005, seed, `clickhouse/002`): `job_name/target_url/items_scraped`, status `success|failed|running|completed`. Runtime bootstrap (`src/lib/db/scrape-job-repository.ts:24-36`): `source/query/location/business_count`, status `pending|running|completed|failed`. Both use `CREATE TABLE IF NOT EXISTS` — whichever runs first wins and the other half of the system fails. Seed data + analytics belong to the dead schema; live jobs to the other.
- **[HIGH] Dual schema sources of truth.** `businesses`, `users`, `pending_import_businesses` are created only by runtime `CREATE TABLE IF NOT EXISTS` (`business-repository.ts:23`, `user-repository.ts:55`, `pending-import-business-repository.ts:54`); migrations contain only ALTERs. `scraped_businesses` has no Postgres migration at all (`scraped-business-repository.ts:57`). `categories` exists only in ClickHouse while Postgres code treats category as a plain string.
- **[HIGH] The Dockerfile ships a stub.** `Dockerfile:27-48` runs `cargo init`, writes a TODO-filled `main.rs` (60s sleep loop), copies only `bw-types/bw-ingestion/bw-api` — never `bw-scraper`. The `wget localhost:8080/health` healthcheck can never pass; the deployed "scraper" silently no-ops.
- **[HIGH] The specced Rust scraper stack is a wall of plausible stubs.** `GoogleMapsScraper.fetch_page` returns fabricated rows and drops every field but name, assigning random `owner_id` (`bw-scraper/src/scraper.rs:145-201`); `etl.rs:7` and `importer.rs:12` are TODO/placeholder; no HTTP server starts (`main.rs`); the nested `bw-scraper/bw-scraper/` duplicate crate is not a workspace member and never builds.
- **[HIGH] Status strings split in two.** App/frontend use `pending/running/completed/failed/cancelled`; the analytics stack (migration CHECK + `/api/analytics/*` + analytics page) uses `success/failed/running`. Any real join across them mismatches.
- **[MED] Port 9000 collision.** ClickHouse native protocol and MinIO both map `9000:9000` (`docker-compose.yml:47-48,80-81`); second bind fails on one host and LOC-0033 AC2's verification-URL check targets the wrong service.
- **[LOW] .NET-era wording in tickets** (Hot Chocolate, `dotnet build`, `IHostedService`, `bw-consumer` — workers actually live in `bw-ingestion`).

---

## 3. Features that are not actually implemented

- **[HIGH] Review-gate UI is orphaned (LOC-0068 AC3/AC4).** The detail modal's Approve and Reject buttons call `handleCloseDetail` (`src/app/admin/reviews/page.tsx:416,419` — verified). `/api/businesses/[id]/approve` and `/reject` (implemented, spec'd) have **zero callers**. Reject also drops the reason (AC-E5: "reject with reason"); no reason input exists.
- **[HIGH] AC-E6 metrics are mocks.** `/api/analytics/scrape-jobs` returns hardcoded zeros ("For now, return mock data"); `/recent` returns an empty mock array; live `scrape_jobs` lacks `started_at/completed_at` so duration is uncomputable; imported/rejected counts never aggregated.
- ~~**[HIGH] Chat (LOC-0042) absent from frontend.** No route, conversation list, message thread, offline queue — grep "chat" in `src/` → nothing. Only the Rust persistence consumer + a `ChatBubble` component exist.~~ — **DONE 2026-08-22 (#56, 7b3922b / 7623bdd / c12667b):** full chat feature — Postgres `conversations`/`messages` (migration 011), REST APIs (conversation create-or-resume, messages with history paging, mark-read; owner-or-user access), `/chat` page (list with 50-char preview + unread badge, thread, optimistic send with offline queue-and-flush, deep link), real-time over NATS (browser `nats.ws` client + global notification banner), detail-page Chat entry; outcome detail in §8
- ~~**[HIGH] Owner dashboard / claim wizard (LOC-0043) absent.** The only "analytics" page is the admin scrape-jobs one; claim is a single form, not the specced 3-step wizard; no 30-day views chart.~~ — **DONE 2026-08-22 (#55, faf4706 / 9831d3a / bd54a9f / e48adfa):** `/owner` dashboard (session-guarded; business cards with status badge, 30-day views chart, inline profile edit, sign out) and the 3-step claim wizard (real category select from `GET /api/categories`, ownership confirmation, sign-in-gated `POST /api/businesses/claim` → `unverified` row under the authenticated owner); daily views tracked via `POST /api/businesses/[id]/view` into `business_views` (migration 010)
- ~~**[HIGH] E2E suites (LOC-0053, LOC-0074) absent.** `e2e/` has only docker-compose, design-system (mislabeled LOC-0051), and performance specs. No chat, claim-wizard, admin-console, or approval-workflow E2E.~~ — **DONE 2026-08-22 (#53):** four Playwright suites added — `e2e/chat.spec.ts` (LOC-0042 flows), `e2e/claim-wizard.spec.ts`, `e2e/admin-console.spec.ts`, `e2e/approval-workflow.spec.ts` — plus shared `e2e/e2e-utils.ts` (API register/login, `black-owned.session` localStorage seeding, psql seed/cleanup, cold-dev-server route warm-up). The gate surfaced and fixed two non-suite defects: `graphql-client.ts` defaulted to `http://localhost:8080/graphql` (the Rust service has no GraphQL route, no CORS) so the business detail page could never load in a browser — now same-origin `/api/graphql`; and `nats/nats.conf` gained `http: 8222` (with a config file in use, NATS 2.x does not start the default monitoring listener the compose healthcheck probes). The "mislabeled LOC-0051" claim is retracted — `handoffs/dupin/LOC-0051` confirms it is the design-system ticket. Outcome detail in §8
- **[HIGH] Fuzzy dedup (AC-E4) unwired.** `duplicate-detection-service.ts` (Levenshtein 0.8/0.85 + phone tie-break) is referenced only by QA specs. The live import route dedups on exact lowercased name **against `pending_import_businesses` only** — not against `businesses` or `scraped_businesses` (`import/job/[jobId]/route.ts:81-84`). Two near-identical listings from different sources pass through.
- **[HIGH] Blueprint-specced, absent:** `bw-types/src/scraping.rs`, `import_batches` table, Rust Yelp/Facebook scrapers + `bw-scraper/src/scrapers/` dir, ClickHouse metrics writes (STORY-09), admin contract `POST /api/admin/scrape-jobs` + `PUT /:id/approve` (route is GET-only; page calls `/api/scrape-jobs`).
- **[MED] Cancel semantics (LOC-0059 AC5).** `cancelScrapeJob` only flips DB status; the executor has no cancellation check and later writes `"completed"` unconditionally — resurrecting cancelled jobs. `"cancelled"` isn't in the `ScrapeJobStatus` type.
- **[MED] Facebook login (LOC-0063 AC5).** Zero login/credential logic; scraping depends on anonymous access.
- **[MED] Admin surface (LOC-0044/0048) mocked.** `src/app/admin/page.tsx:7` "Mock data for admin metrics"; every approve/reject handler is `console.log`; no NATS consumer monitor with the 100-pending threshold; verification queue is mock data.
- **[MED] Active Jobs visibility (LOC-0072).** Tab fetches only `?status=running`, so newly created `pending` jobs never appear; no 5s polling; no "Review Results" navigation.
- **[MED] `moderateReview` mutation** (LOC-0037) doesn't exist anywhere.
- **[MED] NATS `verification.approved/rejected` events** (LOC-0039) never published.
- **[MED] Rust `/health` + `/health/detailed`** (LOC-0057) — no server starts at all.
- **[MED] LOC-0075 AC4** — ranked match list with scores unsupported; the dedup service returns a single boolean-flagged result.

---

## 4. Implemented weaker than specced

- **[HIGH] Dedup** — see §3 (exact-name, pending-table-only).
- **[MED] Rust GraphQL pagination broken even if served.** `has_next_page = rows.len() > limit` with the same `LIMIT` → always false; `after` cursor parsed as `i64` but emitted as UUID string; cursors not base64 (`bw-api/src/graphql/queries.rs:36,53,72`).
- **[MED] Rust auth middleware weaker.** HS256 (spec: RS256) and `validate_exp = false` — expired tokens accepted; no role checks (`bw-api/src/middleware/auth.rs:117-118`). (The TS auth layer does RS256 correctly.)
- **[MED] Rate limiting in-memory** (LOC-0036) — state not in Valkey.
- **[MED] Anti-bot code orphaned** (LOC-0061) — `rate_limiter.rs`/`user_agent_rotator.rs`/`robots.rs` correct per AC but invoked nowhere; `RobotsChecker` never fetches robots.txt; TS scrapers use fixed 1000ms delay + one fixed UA; bot-detection lives only in the orphaned nested crate.
- **[MED] Normalization** (AC-E3) — live path maps `name` + `source_data` JSONB with `category_id` fallback "other"; the validated ETL (E.164 phone, postal, URL) exists only in orphaned Rust.
- **[MED] Search** (LOC-0037/0041) — Rust `search` is `ILIKE` only; frontend search page debounces but has no 5-suggestion autocomplete; filters read `category` from URL but never write it back.
- **[MED] Connectivity tests** (LOC-0045) — `TcpStream` opens + hardcoded `Ok(1)` row counts; no `system.tables`, NATS round-trip, `list_buckets`, or PING (`service_connectivity.rs:136-157`).
- **[MED] Email** (LOC-0040 AC2) — SMTP/lettre, not the specced Resend API (retry/DLQ structure does match).
- **[MED] No auth on admin surface.** `scrape-jobs/*`, `pending-businesses/import/*`, admin routes perform no auth/role checks despite "when an admin…" AC phrasing.
- **[MED] Chat messages vs schema.** `chat_consumer.rs:112` inserts into ClickHouse `chat_messages`; no migration creates it (`001` defines `messages` instead) — every message would error at runtime.
- **[LOW] Error-message drift** — Rust "A review for this business by this user already exists" vs specced "You have already reviewed this business" (`mutations.rs:146,227`).
- **[LOW] Response envelope inconsistency** — `{success,data}` vs `{message,job}` vs bare arrays across routes.

---

## 5. Mocks and dead code in production paths

- **[HIGH] Mock data served live:**
  - `/api/analytics/scrape-jobs` + `/recent` — hardcoded zeros / empty arrays
  - ~~`MOCK_BUSINESSES` backed the public search resolvers, the scraper-failure fallback, and the search page~~ — **DONE 2026-08-22 (#57, a2965d1):** the `/search` page and GraphQL `searchBusinesses` now both use `fetchDirectoryItems` (approved pending + canonical businesses), the same real-data seam `/api/directory` serves; category UUIDs resolve to display names via a `categories` join
  - `src/app/admin/page.tsx:7` mock constants + `console.log` handlers
- ~~**[HIGH] `/api/jobs` is an in-memory store** — `job-repository.ts:63` "TODO: Integrate with actual database connection"~~ — **DONE 2026-08-22 (#64, 4d2070d):** route + spec retired; the store file (`src/lib/db/job-repository.ts`) had already been removed by the 2b88c25 reconciliation, so the route was the last residue. Live scrape jobs go through `scrape-job-repository` → Postgres `scrape_jobs`. Also resolves task #54 via its "retire" option.
- ~~**[MED] Dead/orphan routes** (no client or server caller — verify before deleting): `/api/jobs`, `/api/businesses` main CRUD, `/api/businesses/export` (the reviews-page "Export List" button has no onClick), `/api/admin/scrape-jobs`, `/api/admin/reviews/job/[jobId]`, most `/api/scrape-jobs/[id]` sub-routes, `/api/scraper/*`, `/api/pending-businesses/import` (non-job variant).~~ — **DONE 2026-08-22 (#64):** all deleted — `/api/jobs` (4d2070d), the `scrape-jobs/[id]` sub-routes + `scraper/*` + `admin/scrape-jobs` (c24ac29), `businesses` main CRUD + `/export` + the inert "Export List" button (038a941), `admin/reviews/job/[jobId]` (9e0f446). One documented exception: `/api/pending-businesses/import` (+ job variant) is **kept** — verified as the only bridge moving Rust-scraped `scraped_businesses` rows into `pending_import_businesses` through #47's fuzzy dedup (live DB: 41 scraped, 10 manual pending; the audit's own "verify before deleting" guardrail applies). The UI entry point that calls it lands with #60.
- ~~**[MED] Review-gate bypass in dead code.** `src/lib/importer/business-importer.ts` inserts **directly into `businesses`** (no transaction, no review gate, only deterministic-ID check); unreachable from routes today but one import away from publishing unreviewed data.~~ — **DONE 2026-08-22 (#64, 94cbe45):** deleted, not gated — zero callers through `mod.ts`, and gating dead code would only add more dead code. Every import path now runs through the review-gated `pending_import_businesses` flow.
- **[MED] Orphan Rust crate** `bw-scraper/bw-scraper/` — own Dockerfile, conflicting dep versions, never builds.
- ~~**[MED] Dead migration columns** — `phone`, `potential_duplicate_id` (003), `duplicate_status` (006) never read/written by code.~~ — **DONE 2026-08-22 (#64, 13c315f):** `003_add_phone_duplicate_detection` deleted earlier; `duplicate_status` dropped via the cleaned-up `001` snapshot + deleted `006` + new `012_drop_duplicate_status_from_pending_import_businesses.sql` applied to the live DB. The stale ClickHouse `002_create_scrape_jobs` variant closed in the same task (deleted — no CH runner, no live table, no reader/writer).

---

## 6. Seed, config, and hygiene

- **DONE 2026-08-22 (#61, 8ee6578): Port 9000 double-bind.** MinIO host ports remapped `9000/9001` → `9002/9003` in `docker-compose.yml`; `e2e/docker-compose.spec.ts` healthUrl/ports updated to 9002/9003; `MINIO_PORT=9002` added to `.env` (host app defaulted to 9000, i.e. the ClickHouse native protocol); `scripts/provision-minio.sh` comment updated. ClickHouse keeps its canonical host port 9000 (`clickhouse/loc-0032-ac2-docker-compose.test.ts:107` unchanged and still correct). Verified live: both containers healthy, host 9000 serves ClickHouse, 9002/9003 serve MinIO.
- **[MED] Compose secrets inline** (LOC-0056 AC4) — `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, full `DATABASE_URL` hardcoded; no `${VAR}` interpolation.
- **[MED] Seed passwords are placeholders** — `$2b$10$placeholder_...` while comments document `AdminTestPass123!`; documented credentials cannot authenticate. Seed also targets the dead schema and self-labels "LOC-0058".
- **[MED] CI coverage** (LOC-0055 AC3) — no tarpaulin/llvm-cov/gcovr in either workflow.
- **[LOW] README** — versions are current (Next 16, React 19, Tailwind 4) but the "Project Structure" section documents only the minimal shell; omits `src/app/api/` (28 routes), `src/services/`, `src/lib/db/`, the Rust workspace, `migrations/`, `e2e/`, compose.
- **[LOW] Construction docs vs reality** — `implementation-LOC-0073.md` claims `src/services/scraper-source-integration.spec.ts` (42 tests) — file doesn't exist (actual: `src/qa/scraper-e2e.spec.ts`); `implementation-LOC-0072.md` marks AC5 "complete" though its dashboard is fed by the mocked-zero route.
- **[LOW] Blueprint staleness** — pins Next.js 14 and `src/app/admin/scraping/`; actual is Next 16 and `admin/scrape`. The entire TypeScript scraper stack (Playwright in TS, runtime schema bootstrapping, `/api/scrape-jobs/*`, `duplicate-detection-service.ts`, `src/qa/`) is unspecced in the blueprint.
- **[LOW] Ticket-tracker drift** — all of LOC-0066…0075 still say `Status: backlog` despite substantial code; `LOC-0049.md` is a byte-identical copy of `LOC-0048.md`; `bugs/` contains only a `.prefix` file (no bug reports).

---

## 7. Prioritized fix list

Status as of 2026-08-21 — owner ruling 2026-08-20: "yes all of those will need to be fixed" (all §§1–6 findings in scope, not just this list).

1. **Wire the review UI to the real endpoints** — modal Approve/Reject → `/api/businesses/[id]/approve|reject`, add reason input, persist reason (LOC-0068, AC-E5). Biggest user-visible gap. — **DONE 2026-08-21 (1618f54)**
2. **Unify the `scrape_jobs` schema** — pick one owner (recommend the live runtime one), write a real migration, drop the dead migration variant + matching seed data; unify the status enum in one place. — **DONE 2026-08-21 (75d5776; completed by 39cd004)**
3. **Replace or delete the mock analytics API** — real aggregation queries over live `scrape_jobs`, or remove the routes and page (AC-E6). — **DONE 2026-08-21 (f48db1c)**
4. **Wire fuzzy dedup into the import job route** — match against `businesses` AND `scraped_businesses`, use the existing service, env-configurable threshold (AC-E4, LOC-0066 AC5). — **DONE 2026-08-21 (396d640)**
5. **Decide the Rust workspace's fate** — either build it (health server, real scrapers, ETL, healthcheck) or explicitly park it: fix the Dockerfile, update blueprint/README, and stop presenting stubs as the design. Today it's plausible-looking dead weight. — **PENDING (task #48).** Owner ruled: build it ("the rust backend was the most of the point of making this"). Search backend resolved 2026-08-21: owner's SearXNG container (`http://192.168.68.50:8888`, `GET /search?q=...&format=json`) acts as the discovery layer.
6. **Fix the Dockerfile** to actually build `bw-scraper`; move compose secrets to `.env` interpolation. — **PENDING (task #48)**
7. **Real migrations for `businesses`/`users`/`pending_import_businesses`/`scraped_businesses`** — retire runtime `CREATE TABLE IF NOT EXISTS` bootstrapping; fix the `chat_messages` table name. — **DONE 2026-08-21 (39cd004)**
8. **Cancel semantics** — executor checks for cancellation before each step; never overwrite `cancelled`; add `"cancelled"` to the status type. — **DONE 2026-08-21 (49a1b2e)**
9. **Admin dashboard** — real data from the review queue + jobs, or remove the page (LOC-0044/0048). — **DONE 2026-08-21 (ecc2692)**
10. **Auth on the admin surface** — scrape-jobs + pending-businesses + admin routes (all "when an admin…" ACs). — **PENDING (task #63)**
11. **Ticket hygiene** — update statuses from `backlog`, de-duplicate LOC-0049, populate or remove `bugs/`. — **DONE 2026-08-22:** LOC-0049 removed (byte-identical copy of LOC-0048; backed up to `~/.claude/backups/2026-08-22/`, LOC-0050's `Blocking` repointed to LOC-0048); LOC-0066/0068/0070/0071 → `done`, LOC-0067/0069/0072/0073/0075 → `active` (code exists, follow-up tasks open), LOC-0074 stays `backlog` (genuinely unbuilt, task #53); `bugs/` kept as the `.prefix`-only placeholder (no bug reports to populate). Note: LOC-0031…0065 carry the same `backlog` drift (audit verdicts: most IMPLEMENTED) — follow-up sweep recommended.

---

## 8. Remediation status (2026-08-21)

**Branch:** `fix/directory-scraped-businesses` · **Verification baseline:** tsc clean; jest 84/84 suites, 1276/1276 tests; live Postgres migrated and idempotent on re-run; all 71 pre-existing scrape_jobs intact.

### Findings outside §7 resolved by the same commits

- **§2 "Three competing `scrape_jobs` schemas" / "Status strings split in two"** — resolved by 75d5776 (one enum, lifecycle timestamps, canonical migration) + 39cd004 (baseline `001` snapshot, `009` information-schema-gated reconcile of live drift, dead `003_create_scrape_jobs` deleted). The stale ClickHouse `002` variant closed by task #64 (deleted: no ClickHouse migration runner, no initdb mount, no live CH table, no reader/writer in Rust or Next code).
- **§2 "Dual schema sources of truth"** — resolved by 39cd004: `001_create_core_tables.sql` is a full snapshot of the verified live schema; all seven runtime `initialize*Schema` bootstraps retired across 28 src files + `run-featured-scrape.ts`. The "categories exists only in ClickHouse" note remains open.
- **§3 "Review-gate UI orphaned" / "AC-E6 metrics are mocks" / "Fuzzy dedup unwired" / "Cancel semantics" / "Admin surface mocked"** — resolved by items 1, 3, 4, 8, 9 above.
- **§4 "Chat messages vs schema"** — resolved by 39cd004: ClickHouse `003_create_chat_messages.sql` creates `chat_messages` with exactly the columns `chat_consumer.rs:112` inserts (the CH `001` `messages` table is the separate user-to-user spec table).
- **§5 "Dead migration columns"** — resolved by #64 (13c315f): `duplicate_status` dropped from the `001` snapshot, dead `006` deleted, `012` drop migration applied live; the type-only reference in `pending-import-business-repository.ts` removed.

### Remaining findings → task map

| Finding area | Task |
|---|---|
| Rust stack: main.rs /health, real scrapers replacing fabricated rows (`scraper.rs:145-201`), real ETL + importer, nested `bw-scraper/bw-scraper/` orphan, Dockerfile, compose secrets (SearXNG discovery) | #48 |
| Chat feature (LOC-0042) | #56 |
| Owner dashboard + 3-step claim wizard (LOC-0043) | #55 |
| E2E suites: approval workflow, admin console, claim wizard, chat (LOC-0053/0074) | #53 |
| `/api/jobs` in-memory store → DB or retire | #54 |
| Facebook scraper login handling (LOC-0063 AC5) | #58 |
| Search autocomplete + URL filter write-back | #59 |
| Active Jobs tab: pending visibility, 5s polling, Review Results nav (LOC-0072) | #60 |
| `moderateReview` mutation + NATS `verification.approved/rejected` events | #62 |
| Auth/role checks on admin surface routes | #63 |
| Dead/orphan routes cleanup + gate business-importer + dead migration columns | #64 |
| Unify error messages + response envelopes | #65 |
| CI coverage tooling (LOC-0055 AC3) | #66 |
| Seed data: real password hashes + live schema | #67 |
| README, construction docs, blueprint updated to match reality | #69 |

### SearXNG integration note (2026-08-21)

Owner's SearXNG metasearch container verified live: `GET http://192.168.68.50:8888/search?q={query}&format=json` returns 200 with 20–26 merged results per page (`pageno` for depth; `engines=`, `categories=`, `time_range=` all honored). Upstream engines observed: `google cse`, `duckduckgo`, `brave`, `startpage`, `bing news` — with per-engine circuit-breaking visible in `unresponsive_engines` (documented suspension durations: 429 → 1h, CAPTCHA/access-denied → 24h, Cloudflare CAPTCHA → 15 days). Results are web hits (`url`, `title`, `content`, `engine`, `engines`, `score`), not structured business records — top hits for target queries are directories/listicles. Design consequence: two-stage pipeline — SearXNG discovery, then fetch + extract structured fields into `scraped_businesses` (`source='searxng'`).

### #49 outcome (2026-08-22)

Original source (`black_wall_street/businesses_scraper_output.json`, 10 "verified" businesses) **rejected as fabricated**: sequential `555-…` phone suffixes, one shared `certification_id` (`NBCC-1-1100`) across records with contradicting certifying bodies, and 6/10 websites dead, mismatched to a different business, or pointing at the app's own dev preview. Replacement (owner-approved option 1): 10 real Atlanta Black-owned businesses discovered via SearXNG + verified directories (The Infatuation, Atlanta Parent, BuyBlack.org), each candidate's own website verified live and name-matching before import. Imported idempotently into `pending_import_businesses` (`source='manual'`, status `pending_review` — the app's curation gate, `duplicate_status='new'`; directory URL, ownership evidence, address/phone in `source_data`). Category spread: Food & Dining ×2, Retail & Fashion ×2, Entertainment ×2, Health & Wellness ×2, Personal Services ×1, Professional Services ×1. Re-running the import inserts 0 rows.

### #55 outcome (2026-08-22)

Owner dashboard + 3-step claim wizard (LOC-0043) shipped in four sequential commits on one branch (one-branch, no-worktree protocol): **faf4706** auth foundation (RS256 JWT middleware + `createAuthErrorResponse`); **9831d3a** owner APIs — `GET /api/owner/businesses` (owner-scoped, category display names), `PATCH /api/owner/businesses/[id]` (name/description, ownership-gated), `GET /api/owner/businesses/[id]/views` (zero-filled day windows, 1–90 days), `POST /api/businesses/[id]/view` + `business_views` table (migration 010); **bd54a9f** the `/owner` page — session guard, business cards with status badge + dependency-free SVG 30-day views chart, inline profile edit, empty state with claim link, sign out; **e48adfa** the 3-step claim wizard replacing the old single form that POSTed a string-interpolated GraphQL mutation to a fake resolver with no auth: Step 1 business details (real category `<select>` from `GET /api/categories`, optional description/location/website — phone dropped, no column), Step 2 ownership-confirmation checkbox, Step 3 account (session-gated submit via `POST /api/businesses/claim`, which validates the category against the `categories` table — UUID format + row existence — and inserts an `unverified` business under the authenticated owner). Gates per step: tsc clean; full jest 1335/1335 across 93 suites; live API probes (401 unauthenticated, 400 blank/malformed/unknown category, 201 claim with `unverified` status, owner list reflects the new row); and a full Playwright pass of the wizard end-to-end (category population, step gating, sign-in prompt when logged out, login, submit, success card, and the new unverified business visible on `/owner`), zero page errors.

### #56 outcome (2026-08-22)

Chat (LOC-0042) shipped in three sequential commits on the same branch: **7b3922b** schema + APIs — migration 011 (`conversations` with `UNIQUE(user_id, business_id)`, `messages`), `chat-repository` (list with last-message preview + unread count, owner-or-user conversation access, paged history, mark-read), `GET/POST /api/chat/conversations` (201 create / 200 resume), `GET/POST .../messages` + `POST .../read`, and NATS fan-out on send (`chat.message.<conversationId>` for the thread, `chat.notification.<recipientId>` with 50-char preview for the global banner; `delivered` in the 201 body); **7623bdd** the `/chat` page + browser NATS client — `nats.ws` (the Node-only `nats` package cannot run in browsers) behind `src/lib/chat/nats-client.ts` (singleton connect, status tracking, subject subscription), list with 50-char previews + unread badges + empty state, thread (history oldest-first, oldest-first paging), optimistic send (`Sending…` → `Sent`), offline queue flushed on socket reconnect with a 5s fallback poll, deep link `?conversation=<id>` that resumes without duplicates, and live thread/list updates over NATS; **c12667b** the entry points + transport — `ChatButton` on the business detail page replacing the dead "Contact Business" button (auth-only; create-or-resume → deep link), global `NotificationBanner` in the root layout (subscribes to `chat.notification.<userId>`, latest wins, 5s auto-dismiss, manual dismiss never re-shows, click → thread), and the NATS WebSocket transport: `nats/nats.conf` with `websocket { port: 8081, no_tls: true }` (note: `nats-server` ≥ 2.8 requires TLS for the WS transport — plain dev WS needs explicit `no_tls`; there is no `-w` CLI flag in 2.x), mounted read-only and exposed on host port 8081. The realtime gate also surfaced and fixed two C1 gaps: the conversation list excluded the business-owner side (`WHERE c.user_id = $1` → `OR b.owner_id = $1`), and messages inserted `is_read = TRUE` so no unread badge could ever appear (now inserted unread; `markConversationRead` flips them; the live list increments the badge for whichever conversation is not open). Gates per commit: tsc clean; full jest ending 99 suites / 1379 tests; live API probes 11/11 (auth, create/resume, 400/404 guards, message history, mark-read); Playwright 11/11 on the page (including the offline-queue path); and a two-browser Playwright realtime probe 25/25 — owner sees the conversation in their list, unread badge appears live and clears on open, the global banner renders with business/sender/preview and auto-dismisses, and messages deliver live in both directions over the WS transport with zero unexpected page errors. Probe data swept; chat tables verified empty.

### #53 outcome (2026-08-22)

E2E suites (LOC-0053/0074) shipped: `e2e/chat.spec.ts` (3 tests: signed-in customer starts a conversation from the business detail page via ChatButton → deep link `/chat?conversation=<id>` + DB row verified; customer↔owner round trip — send, owner's conversation list shows `unreadCount: 1`, opening the thread marks `is_read` true, and the owner's reply arrives live over NATS WS in the customer's browser; signed-out visitor sees no Chat button); `e2e/claim-wizard.spec.ts` (2 tests: anonymous visitor reaches the "Sign In to Submit" gate at step 3 with Sign In / Create Account links; signed-in user completes business details → ownership confirmation → submit, sees the "{name} has been claimed!" success card and the unverified business on `/owner`, and the DB row carries the claimant's `owner_id`); `e2e/admin-console.spec.ts` (3 tests: admin dashboard renders its tablist sections — Dashboard / Review Queue / Jobs / User Management — plus the review-queue link; user management lists users and finds one by email search; scraping console renders job creation + active jobs); `e2e/approval-workflow.spec.ts` (4 tests: pending queue lists psql-seeded `pending_import_businesses` rows with the live count; name search narrows the queue; Approve in the detail modal → status `approved` and the row leaves the queue; Reject requires a reason — Confirm Reject stays disabled until entered — and persists `rejected` + `rejection_reason`). Shared helpers in `e2e/e2e-utils.ts`: API register/login, `black-owned.session` localStorage seeding, psql seeding/cleanup via `docker exec`, and route warm-up against the cold dev server (hooks carry explicit timeouts since `describe.configure` timeout does not apply to beforeAll/afterAll). Four app fixes surfaced by the gate: (0) `src/lib/nats/nats-client.ts` — `getNatsClient` cached the singleton connection forever, so after `maxReconnectAttempts` were exhausted (NATS was restarted for the `http: 8222` monitoring fix) every subsequent `publishJson` failed silently with `delivered: false` and no browser ever saw a live message; it now detects a permanently closed client via `isClosed()` and establishes a fresh connection; (1) `src/lib/graphql/graphql-client.ts` defaulted its base URL to `http://localhost:8080` — the Rust bw-scraper service, which exposes no `/graphql` endpoint and no CORS — so every browser GraphQL call (the business detail page) failed with "Failed to fetch"; it now resolves same-origin to the Next app's `POST /api/graphql` resolver route (`graphql-client.spec.ts` updated to match); (2) `nats/nats.conf` gained `http: 8222` — the #56 config change left only the websocket block, and with a config file in use NATS 2.x does not start the default monitoring listener, so the compose healthcheck (`8222/healthz`) had been failing 483×; (3) the chat page's thread-history load now merges into local state instead of clobbering it — a history response that resolved after an optimistic send was wiping the in-flight message and its "Sent" badge, which the round-trip test caught. Two spec corrections as well: the admin-console suite asserts the console's real tablist rather than panel headings, and the approval suite derives its queue counts from the live `pending_review` count at seed time instead of assuming an empty queue. Run: 12/12 on chromium; tsc clean; full jest 99 suites / 1379 tests unchanged. The "mislabeled LOC-0051" claim against `features.spec.ts` is retracted: LOC-0051 is the design-system ticket (`handoffs/dupin/LOC-0051`), so the label is correct.

### #64 outcome (2026-08-22)

§5 dead-code cleanup landed as seven sequential, gated commits on `fix/directory-scraped-businesses` (gate per commit: tsc clean — with `npx next typegen` after every route deletion, since the generated `.next/types/validator.ts` references every route file — full jest, and live probes where the surface was touched): **4d2070d** retired the `/api/jobs` in-memory route + spec (its store file had already gone in the 2b88c25 reconciliation — also closes #54 via the "retire" option); **c24ac29** deleted seven dead route directories — `scrape-jobs/[id]` + its `cancel`/`results`/`status` sub-routes, `scraper/google-maps/places/[id]`, `scraper/yelp/search`, `admin/scrape-jobs` — plus `deleteScrapeJob` from `scrape-job-repository` (`findScrapeJobById` kept; the live `scraper-job-executor` uses it); **94cbe45** deleted `src/lib/importer/` outright — the §5 "review-gate bypass" item, deleted rather than gated because it had zero callers and gating dead code would only add more dead code; **d0b9f44** retired the unused `/api/auth/refresh` route + `src/lib/auth/token-refresh` lib; **038a941** deleted the `businesses` main CRUD + `/export` routes and the inert "Export List" button on the admin reviews page; **9e0f446** retired `admin/reviews/job/[jobId]` with its spec and the orphaned `page.job-filter.spec.tsx` (jest `testPathIgnorePatterns` entry removed with it); **13c315f** dropped the code-dead `duplicate_status` column — cleaned out of the `001` snapshot, dead `006` deleted, new `012_drop_duplicate_status_from_pending_import_businesses.sql` applied live (index + CHECK constraint + column gone; the 10 `manual|pending_review` rows untouched) and the type-only reference removed from `pending-import-business-repository.ts`. One documented exception to the audit's dead list: `/api/pending-businesses/import` (+ job variant) kept — verified as the only bridge moving Rust-scraped `scraped_businesses` rows into `pending_import_businesses` through #47's fuzzy dedup; the UI entry point lands with #60. The last §2 residue — the stale ClickHouse `002_create_scrape_jobs` variant — closed in the closing commit: deleted. There is no ClickHouse migration runner, no initdb mount, no live CH `scrape_jobs` table, and no reader/writer of CH `scrape_jobs` in Rust or Next code (every `scrape_jobs` access in `src/` goes through the Postgres pool). Jest count decreased monotonically by exactly the deleted-spec deltas through the series: 99 suites/1379 tests → 98/1368 → 91/1322 → 90/1314 → 88/1301 → 87/1289 → 86/1281 — no collateral test loss. Playwright `approval-workflow` 4/4 confirmed the review queue still seeds, lists, approves, and rejects after the route deletions.
