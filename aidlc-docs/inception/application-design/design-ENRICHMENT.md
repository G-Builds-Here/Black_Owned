---
stage: application-design
source: Architect
ticket: ENRICHMENT
timestamp: 2026-08-27T05:13:19Z
---

# Application Design — ENRICHMENT

**Gotham Pipeline** · Architect → alfred
**Environment:** N/A
**Mode:** N/A
**Current step:** complete
**Entry:** epic
**Escalation From:** -
**Confidence:** High
**Blueprint Path:** aidlc-docs/inception/planning/ENRICHMENT/Implementation-Blueprint.md
**Delta HTML Path:** aidlc-docs/inception/planning/ENRICHMENT/c4-delta.html
**Delta Spec Path:** aidlc-docs/inception/planning/ENRICHMENT/delta-spec.json
**Epic Summary:** Populate businesses.* content columns (phone, website, menu_url, description, image_url, social_urls, rating, review_count) from external sources (Google share-link JSON, SearXNG, website crawl) without paid API keys or file storage, plus an admin UI for manual enrichment and a trigger for pipeline runs. No new tables; schema already ready via migrations 014/015/017/019. Pre-epic fixes landed: categories migration 020, .env untracked.
**Target Directories:** bw-scraper/src, src/app/api/admin, src/components/admin, e2e
**constraints:** ['Photos and menus are external URLs only - no file storage', 'No paid API keys; Google data via share-link JSON only', 'Fill-empty rule: enrichment must not overwrite existing non-null values', 'Enrichment must be idempotent and rerunnable', 'Do NOT wire enrichment into the dead scrape_jobs queue (finding H3); execution home is bw-scraper POST /enrich']
**technology_stack:** [{'layer': 'Web app', 'technology': 'Next.js 16 App Router + React 19 + TypeScript', 'constraint': 'admin routes via createAuthMiddleware + {success,data,code} envelope'}, {'layer': 'Enrichment engine', 'technology': 'Rust edition 2021, reqwest 0.12, sqlx 0.7, axum 0.7', 'constraint': 'no new deps; reuse robots/rate_limiter/user_agent_rotator'}, {'layer': 'Data', 'technology': 'PostgreSQL 15', 'constraint': 'fill-empty semantics; no new tables'}, {'layer': 'E2E', 'technology': 'Playwright 1.62', 'constraint': 'compose stack up; e2e-utils helpers'}]

**Stories:**
| id | name | user_behavior | type | draft_acs | component | layer | parallel | moscow | depends_on | contract_acs | testability |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STORY-001 | bw-scraper: Google place-JSON enrichment engine | Businesses get real phone/website/description/rating/review_count without manual entry | feature | ['Given a business whose source_id is a Google Maps share-link URL, fetching the place JSON updates phone, website, description, rating, review_count only for fields that are currently empty (fill-empty)', 'On fetch/parse failure the business row is unchanged and the failure is recorded in the run report', 'Re-running enrichment on already-filled fields is a no-op (idempotent)'] | enrichment-engine | service | True | must | [] | [] | requires: fixture place-JSON files; live fetch needs reachable SearXNG/Maps |
| STORY-002 | bw-scraper: POST /enrich endpoint | Admins can trigger a bounded enrichment run from the admin console and see a per-business report | feature | ['POST /enrich with {business_ids, limit, dry_run} enriches at most limit businesses and returns per-business applied/skipped/failed report', 'dry_run=true performs zero writes', 'Runs respect the existing rate limiter and robots.txt checks'] | enrich-endpoint | controller | False | must | ['STORY-001'] | ['Contract with admin-enrichment-trigger: POST /enrich {business_ids?, limit?, dry_run?} -> 200 {businesses: [{id, name, applied, skipped, error?}], summary}'] | requires: postgres (compose), fixture place-JSON server |
| STORY-003 | Admin UI: enrichment trigger + report | Admin can start an enrichment run and see which fields got filled, which already had values, and which failed | feature | ['Admin-only button/panel triggers POST /api/admin/enrichment and displays per-business report', 'Unauthorized callers get 401/403; unreachable worker surfaces a readable error, not a crash'] | admin-enrichment-trigger | controller | True | should | ['STORY-002'] | ['Contract with enrich-endpoint: consumes POST /enrich schema; forwards limit/ids'] | requires: mocked bw-scraper endpoint in jest; compose stack for e2e |
| STORY-004 | Admin UI: business content editor | Admin can manually fix website/phone/menu_url/image_url/description/social_urls per business (the pipeline missed it or got it wrong) | feature | ['Admin-only form pre-filled with current values; PATCH /api/admin/businesses/[id]/content saves changes', 'Validation rejects over-length fields with 400 VALIDATION_ERROR; unknown business -> 404', 'Non-admin callers get 401/403'] | admin-content-editor | controller | True | should | [] | [] | requires: postgres (mocked getPool in jest route spec) |
| STORY-005 | E2E: enrichment pipeline integration | A scraped business becomes a fully enriched, browsable listing end-to-end | test | ['Given a test business with empty fields, running enrichment populates phone/website/description in Postgres', 'Directory and detail page render the enriched fields afterwards', 'Re-running enrichment changes nothing (idempotent)'] | N/A | test | False | should | ['STORY-002', 'STORY-003', 'STORY-004'] | [] | requires: compose stack (postgres, nats, valkey), fixture SearXNG/place-JSON server |
