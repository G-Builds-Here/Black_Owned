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
- **[HIGH] Chat (LOC-0042) absent from frontend.** No route, conversation list, message thread, offline queue — grep "chat" in `src/` → nothing. Only the Rust persistence consumer + a `ChatBubble` component exist.
- **[HIGH] Owner dashboard / claim wizard (LOC-0043) absent.** The only "analytics" page is the admin scrape-jobs one; claim is a single form, not the specced 3-step wizard; no 30-day views chart.
- **[HIGH] E2E suites (LOC-0053, LOC-0074) absent.** `e2e/` has only docker-compose, design-system (mislabeled LOC-0051), and performance specs. No chat, claim-wizard, admin-console, or approval-workflow E2E.
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
  - `MOCK_BUSINESSES` (`src/lib/graphql/resolvers.ts:40`) backs the public search resolvers **and** the scraper-failure fallback
  - `src/app/search/page.tsx:23` filters the same hardcoded `MOCK_BUSINESSES`
  - `src/app/admin/page.tsx:7` mock constants + `console.log` handlers
- **[HIGH] `/api/jobs` is an in-memory store** — `job-repository.ts:63` "TODO: Integrate with actual database connection".
- **[MED] Dead/orphan routes** (no client or server caller — verify before deleting): `/api/jobs`, `/api/businesses` main CRUD, `/api/businesses/export` (the reviews-page "Export List" button has no onClick), `/api/admin/scrape-jobs`, `/api/admin/reviews/job/[jobId]`, most `/api/scrape-jobs/[id]` sub-routes, `/api/scraper/*`, `/api/pending-businesses/import` (non-job variant).
- **[MED] Review-gate bypass in dead code.** `src/lib/importer/business-importer.ts` inserts **directly into `businesses`** (no transaction, no review gate, only deterministic-ID check); unreachable from routes today but one import away from publishing unreviewed data.
- **[MED] Orphan Rust crate** `bw-scraper/bw-scraper/` — own Dockerfile, conflicting dep versions, never builds.
- **[MED] Dead migration columns** — `phone`, `potential_duplicate_id` (003), `duplicate_status` (006) never read/written by code.

---

## 6. Seed, config, and hygiene

- **[MED] Port 9000 double-bind** (see §2).
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

- **§2 "Three competing `scrape_jobs` schemas" / "Status strings split in two"** — resolved by 75d5776 (one enum, lifecycle timestamps, canonical migration) + 39cd004 (baseline `001` snapshot, `009` information-schema-gated reconcile of live drift, dead `003_create_scrape_jobs` deleted). ClickHouse `002` still carries the old variant — open under task #64.
- **§2 "Dual schema sources of truth"** — resolved by 39cd004: `001_create_core_tables.sql` is a full snapshot of the verified live schema; all seven runtime `initialize*Schema` bootstraps retired across 28 src files + `run-featured-scrape.ts`. The "categories exists only in ClickHouse" note remains open.
- **§3 "Review-gate UI orphaned" / "AC-E6 metrics are mocks" / "Fuzzy dedup unwired" / "Cancel semantics" / "Admin surface mocked"** — resolved by items 1, 3, 4, 8, 9 above.
- **§4 "Chat messages vs schema"** — resolved by 39cd004: ClickHouse `003_create_chat_messages.sql` creates `chat_messages` with exactly the columns `chat_consumer.rs:112` inserts (the CH `001` `messages` table is the separate user-to-user spec table).
- **§5 "Dead migration columns"** — partially resolved: `003_add_phone_duplicate_detection` deleted (phone / potential_duplicate_id unused in code); `duplicate_status` column remains code-dead (type-only reference at `pending-import-business-repository.ts:24`).

### Remaining findings → task map

| Finding area | Task |
|---|---|
| Rust stack: main.rs /health, real scrapers replacing fabricated rows (`scraper.rs:145-201`), real ETL + importer, nested `bw-scraper/bw-scraper/` orphan, Dockerfile, compose secrets (SearXNG discovery) | #48 |
| Chat feature (LOC-0042) | #56 |
| Owner dashboard + 3-step claim wizard (LOC-0043) | #55 |
| E2E suites: approval workflow, admin console, claim wizard, chat (LOC-0053/0074) | #53 |
| `/api/jobs` in-memory store → DB or retire | #54 |
| Remove `MOCK_BUSINESSES` from search + graphql resolvers | #57 |
| Facebook scraper login handling (LOC-0063 AC5) | #58 |
| Search autocomplete + URL filter write-back | #59 |
| Active Jobs tab: pending visibility, 5s polling, Review Results nav (LOC-0072) | #60 |
| Port 9000 collision in compose (ClickHouse vs MinIO) | #61 |
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
