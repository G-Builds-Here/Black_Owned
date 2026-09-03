## Implementation Blueprint

**Epic:** ENRICHMENT — populate consumer-facing business content (phone, website, description, menu link, photos-as-links, external review counts) through the pipeline, not manual entry.
**Repo:** C:/Users/Merlin/Documents/repos/Black_Owned · **Baseline commit:** a783e16 (post-survey) · **Survey:** `aidlc-docs/inception/reverse-engineering/` (index.md → findings.md H3 constrains this design)

### 1. Repository Mapping & Target Location

- `bw-scraper/src/enrichment.rs` (NEW) — enrichment engine: fetch place JSON, parse, apply fill-empty updates. Location justified: bw-scraper already owns the outbound-HTTP plumbing this work needs — `robots.rs` (robots.txt checks), `rate_limiter.rs` (token bucket), `user_agent_rotator.rs`, `searxng.rs` (reqwest client patterns), sqlx `PgPool` from `AppState` — and it is the only deployed Rust service in the stack. No new container.
- `bw-scraper/src/api.rs` (MODIFY) — add `POST /enrich` route alongside the existing `/scrape` and `/health` routes; same unauthenticated internal-service pattern (finding: bw-scraper's HTTP surface has no auth; the admin route is the gate).
- `src/app/api/admin/enrichment/route.ts` (NEW) — admin-only proxy to bw-scraper `POST /enrich`. Follows `createAuthMiddleware(["admin"])` + `{success, data, code}` envelope (patterns.md).
- `src/app/api/admin/businesses/[id]/content/route.ts` (NEW) — admin-only manual content PATCH via `getPool()` (repository convention, no new table).
- `src/components/admin/` (MODIFY) — enrichment trigger + content-edit form in the existing admin console layout (ui/ primitives).
- `migrations/postgresql/` — **no new migration.** `businesses` already has phone/menu_url/rating_source (019), website, description, image_url, social_urls (014), rating/review_count. H1 (`categories` missing migration) was fixed pre-epic in 020; H4 (tracked `.env`) was fixed pre-epic — both are in baseline commit a783e16.
- `e2e/` (MODIFY) — one new Playwright spec using `e2e-utils` (newSession, apiJson, warmRoutes).

**Why not the alternatives:** the in-app Playwright executor (`src/services/scraper-job-executor.ts`) has zero production callers and finding H3 documents that admin-created scrape jobs are never executed — building on that queue would inherit the breakage. A one-shot tsx script (the `run-social-discovery.ts` pattern) would work but is not rerunnable from the admin console, which the epic requires.

### 2. Confidence Rating

**Confidence: High** — Factor: every story maps onto an existing component and pattern (Rust fetch/ETL in bw-scraper, admin route convention, co-located jest specs); zero new infrastructure, zero new migrations, zero new dependencies (reqwest/sqlx/axum already in the crate). The one genuinely new element — Google share-link place-JSON fetch — is plain HTTP GET with the repo's existing robots/rate-limit/UA guards, and its failure mode (per-business skip + report) is explicit.

### 3. Architectural Analysis

**Pitfalls:**
- Google photo CDN URLs may be time-limited/tokenized → STORY-005 verifies with a HEAD content-type check and falls back to NULL (AC-gated).
- Share-link place JSON can be consent/region-gated → robots check + rate limit + UA rotation (existing); failures are per-business skips, never aborts.
- `source_id` variants: google_maps share-link URLs carry the place; non-Google rows (SearXNG-only) have no place JSON → engine must classify and report "no enrichment source", not error.
- Admin → bw-scraper reachability: host app calls `http://localhost:8080` (compose maps 8080). New env `SCRAPER_BASE_URL` on the admin route with that default; 502-ish envelope on unreachable (UI error banner AC).
- `:8080` is unauthenticated by design (matches `/scrape`); the admin console is the only in-repo caller. Documented risk, consistent with existing exposure.

**Existing Debt:**
- H3 (scrape jobs never executed) — **not fixed by this epic by design:** enrichment's execution home is the direct `POST /enrich` endpoint, not the dead job queue. H3 stays a separate ticket; this blueprint deliberately avoids depending on it.
- H2/H5 (admin user-management dead routes; GraphQL fake auth) — separate surface, logged; not touched here.
- CI is Rust-only; the new admin route specs are local jest (existing debt, deferred — flagged as wont for v1).
- **Wins:** no new tech debt introduced — no new tables, dependencies, containers, or ports.

### 4. Behavior Decomposition

| User Behavior | Story | Type | Draft ACs | Component | Layer | Parallel? | MoSCoW | Depends On | Seams | Contract ACs | Testability |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Business content fills from external source without manual entry | `bw-scraper: Google place-JSON enrichment engine` (STORY-001) | feature | 1. Given a business whose source_id is a Google Maps share-link URL, fetching the place JSON updates phone/website/description/rating/review_count/social_urls **only where the target field is NULL/empty** (fill-empty), setting rating_source='google' when rating is applied. 2. On fetch/parse failure the row is untouched and the failure is recorded in the per-business report. 3. Re-running on an already-filled business applies nothing new and reports those fields as skipped. | enrichment-engine | service | yes | must | — | — | — | standard unit tests (fixture JSON); live fetch verified manually |
| Admin can start a pipeline enrichment run and see what happened | `bw-scraper: POST /enrich endpoint` (STORY-002) | feature | 1. POST /enrich with no body enriches up to `limit` (default 50) businesses that have a google_maps source and ≥1 empty content field; response lists applied/skipped/failed fields per business. 2. `{dry_run: true}` performs zero DB writes and reports what would apply. 3. A 500-business run stays within the existing rate limiter's bounds and returns all per-business results. | enrich-endpoint | controller | no | must | STORY-001 | routes | Contract with STORY-003: exposes POST /enrich — body `{business_ids?: uuid[], limit?: i32, dry_run?: bool}` → 200 `{businesses: [{id, name, applied: [{field, value}], skipped: [field], error?: string}], summary: {total, enriched, skipped, failed, dry_run}}` | requires: postgres (unit: mock pool; integration: compose) |
| Admin UI triggers enrichment and reports results | `Admin UI: enrichment trigger + report` (STORY-003) | feature | 1. POST /api/admin/enrichment returns 401 unauthenticated, 403 non-admin; admin gets 200 `{success, data: {report}}` forwarded from bw-scraper. 2. Admin console shows an "Enrich business content" action and renders the per-business report (applied/skipped/failed); unreachable worker shows an error banner, not a crash. | admin-enrichment-trigger | controller | yes | should | STORY-002 (contract) | routes | Consumes STORY-002's POST /enrich schema; new env `SCRAPER_BASE_URL` (default http://localhost:8080) | requires: mock fetch (route spec), compose (E2E) |
| Admin can manually fix what the pipeline missed | `Admin UI: business content editor` (STORY-004) | feature | 1. PATCH /api/admin/businesses/[id]/content (admin only) writes website/phone/menu_url/image_url/description/social_urls and returns 200 `{success, data: {business}}`; 404 unknown id. 2. Manual writes apply even when the pipeline set the value (override is the point); 400 VALIDATION_ERROR on length violations (website ≤500, phone ≤50, description ≤2000). 3. Admin console renders a pre-filled per-business content form. | admin-content-editor | controller | yes | should | — | routes | — | requires: postgres (route specs mock the pool per convention) |
| Menus and photos appear as external links | `bw-scraper: menu + photo discovery` (STORY-005) | feature | 1. When place JSON includes photos and image_url is empty, the first photo URL is written only after a HEAD check returns an image content-type; failing check → image_url stays NULL, logged. 2. When website exists and menu_url is empty: fetch homepage (depth 1, ≤500 KB, 10 s), extract the first `/menu*` or `.pdf` link, write it; no match → unchanged, logged. | enrichment-engine | service | yes | should | STORY-001 | — | — | standard unit tests (fixture HTML/JSON) |
| End-to-end: trigger → filled fields → visible in directory | `E2E: enrichment pipeline integration` (STORY-006) | test | 1. Given a test business with empty phone/website and source_id pointing at fixture place JSON, triggering enrichment from the admin console fills the fields and the detail page shows them. 2. Re-triggering reports skipped fields; no data changes or duplicates. | N/A | test | no | should | STORY-002, STORY-003, STORY-005 | — | — | requires: postgres (compose stack), fixture server for place JSON |

**Deferred (won't for v1 — recorded, no tickets):** Yelp as second source (needs yelp fetch path + separate aggregate display); top-N external review snippet storage; TS jest in CI (debt); H3 job-queue wiring (separate ticket).

### 5. C4 Delta

**C1:** none (no new external systems — Google Maps share-link JSON is fetched content, not a system integration).
**C2:** no new containers; two new relationships: `black-owned-frontend → bw-scraper` (POST /enrich, admin trigger), `bw-scraper → postgres` (writes enriched fields — edge was missing from baseline).
**C3 (add, bw-scraper container):** `enrichment-engine` (Rust module: fetch/parse/apply, path `bw-scraper/src/enrichment.rs`), `enrich-endpoint` (axum POST /enrich, path `bw-scraper/src/api.rs`).
**C3 (add, black-owned-frontend container):** `admin-enrichment-trigger` (Next.js route + admin UI, `src/app/api/admin/enrichment/route.ts`), `admin-content-editor` (Next.js route + admin UI, `src/app/api/admin/businesses/[id]/content/route.ts`).
**C3.5:** `EnrichRequest`/`EnrichReport`/`EnrichResult` Rust types; `BusinessContentInput` TS type.
**Relationships:** `enrich-endpoint → enrichment-engine` (Runs). Full spec: `delta-spec.json` (same folder); rendered: `c4-delta.html` (user-confirmed 2026-08-27).

### 6. Execution & Integration Strategy

**Tracks:**
- Track A (Rust enrichment): STORY-001 → STORY-002, then STORY-005 (same crate; one agent, sequential).
- Track B (Admin UI): STORY-004 (independent) ∥ STORY-003 (against the /enrich contract from STORY-002).
- Track C (E2E): STORY-006 after A + B land.

**Contracts:**
- `bw-scraper POST /enrich` → admin trigger: request `{business_ids?, limit?, dry_run?}`, response `{businesses: [{id, name, applied, skipped, error?}], summary}` — the only new interface in the epic; defined by STORY-002, consumed by STORY-003/006.
- Fill-empty update semantics (shared engine + tests): "UPDATE businesses SET <field> = $v WHERE id = $id AND <field> IS NULL" per field; rating additionally sets rating_source='google' only when rating was applied.

**Order:**
1. STORY-001 — engine foundation; defines parse + apply everything else consumes
2. STORY-002 — endpoint wiring (depends on 001); STORY-004 starts in parallel (no dependencies)
3. STORY-003 + STORY-005 — parallel (UI against the contract; engine extension)
4. STORY-006 — E2E last (exercises all features together; Bruce runs it as the post-epic gate)

**Seam classes for Dupin:** `routes` (STORY-002, 003, 004 — serialized, one at a time, epic-wide); no `schema`/`compose`/`types`/`config` seam stories this epic.
