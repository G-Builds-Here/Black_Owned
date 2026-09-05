## Implementation Blueprint — DRAFT (pre-epic)

**Epic (proposed):** HIGHLIGHTS — replace bland one-line business descriptions with category-specific highlights and review-derived copy, using only data the enrichment pipeline already fetches.
**Repo:** C:/Users/Merlin/Documents/repos/Black_Owned · **Baseline commit:** 1de32d3 · **Survey:** `aidlc-docs/inception/reverse-engineering/`
**Status:** design draft for epic conversion. Scope settled with the product owner 2026-09-05: (1) homepage `og:description` as top description candidate, (2) multi-snippet description merge, (3) review highlights ("customers say" pull-quote), (4) category-specific highlight facets (restaurant → cuisine/menu/decor/chef; law firm → practice areas; barber → services offered). No LLM in v1 — deterministic extraction only (product owner's model-cost concern).

### 0. Problem Statement

`description` is filled from a single SearXNG snippet or the Google place-JSON one-liner (e.g. "Townsend Lockett is the standard for the lean, efficient, sophisticated law practice…"). It is generic, and the same bland one-liner shows on the directory card and the detail page. Two gaps:

1. **Description quality** — the homepage's own `og:description` (already fetched for menu discovery) and additional SearXNG snippets are unused.
2. **Category facets** — "what does this business actually do / serve / offer" (practice areas for a law firm, cuisine/signature dishes for a restaurant, services for a barbershop) is not captured anywhere. It is derivable from data we already fetch (homepage nav/headings, search snippets, stored review comments).

### 1. Repository Mapping & Target Location

- `migrations/postgresql/022_add_highlights_to_business.sql` (NEW) — `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS highlights JSONB;` (JSONB matches the `social_urls` convention; `string[]` of short phrases, ≤5, each ≤80 chars; leaves room for future `{facet, value}` pairs).
- `bw-scraper/src/highlights.rs` (NEW) — pure extraction module: per-category keyword dictionaries, match scoring, result shaping. No I/O, fully unit-testable. Lives next to `enrichment.rs` in `bw-scraper` because that crate owns the enrichment engine and its fixture/test patterns.
- `bw-scraper/src/enrichment.rs` (MODIFY) —
  - description pass: pull `og:description` from the already-fetched homepage body (new `find_og_description(html, website)` helper, same host-resolution rules as `find_og_image`); candidate order `og:description` > top snippet > merged snippets.
  - multi-snippet merge: when the top snippet is thin (<80 chars), merge up to 3 non-overlapping ranked snippets; sentence-level overlap dedupe; cap 500 chars.
  - highlights pass: build text corpus = homepage nav links + `<h1>`–`<h3>` text + `og:description` + SearXNG result titles/snippets + place-JSON description; run `highlights::extract(category_id, corpus, review_phrases)`; fill-empty write to `highlights` (JSONB).
  - `BusinessRow` gains `highlights: Option<serde_json::Value>`; `load_business` SELECT, `update_field` arm (`highlights = $2::jsonb … AND highlights IS NULL`), `previous_value` arm.
  - review mining: `site_reviews` read (existing table, `business_id` index) — top-N most frequent positive-sentiment n-grams (2–4 words) from recent review comments, capped at 5 phrases, fed to the extractor.
- `bw-scraper/src/api.rs` (MODIFY) — `SELECT_ELIGIBLE` gains `OR b.highlights IS NULL` (same pattern as the `card_image_url` addition in 1de32d3-uncommitted work).
- `src/types/business.ts` + `src/lib/db/business-repository.ts` (MODIFY) — `highlights?: string[] | null` on `Business`; `rowToBusiness` maps `highlights` (JSONB deserializes to `string[]`).
- `src/app/api/directory/route.ts` + `src/app/directory/page.tsx` (MODIFY) — SELECT + `DirectoryBusiness.highlights` + `toCardBusiness` passthrough.
- `src/lib/graphql/{business-schema.ts,schema.ts,graphql-client.ts,resolvers.ts}` (MODIFY) — `highlights: [String!]` on the Business types; resolver passthrough (`business.highlights ?? []`).
- `src/components/ui/BusinessCard.tsx` + `src/components/SearchResults.tsx` (MODIFY) — highlights rendered as small chips under the name (max 3 on the card to preserve layout; existing `Badge` primitive, `variant="default" size="sm"`).
- `src/components/BusinessDetail.tsx` (MODIFY) — full highlight chip row under the title (max 5) + "Customers say" pull-quote: highest-rated stored review comment (fallback: most recent), reviewer name + location label, rendered in a blockquote. No new query — `siteReviews` is already on the GraphQL Business shape.
- `src/app/api/admin/businesses/[id]/content/route.ts` (MODIFY) — add `highlights` to the manual content editor's writable fields (validation: array of ≤80-char strings, ≤5 entries) so admin can fix a bad extraction.
- `e2e/` (MODIFY) — one Playwright spec: enriched fixture business shows chips on the card + detail and a review pull-quote.

**Why not the alternatives:** LLM-generated copy is rejected for v1 (new API dependency, cost, hallucination risk — product owner's explicit constraint). Display-time computation (no DB column) is rejected: extraction scans multi-KB corpora and the directory page renders 10+ businesses per page; store-once-at-enrichment matches the existing fill-empty model.

### 2. Confidence Rating

**Confidence: High** — Factor: every story maps onto an existing pattern (deterministic Rust extraction with fixtures, fill-empty `update_field` arm, co-located jest specs, `Badge` chips already in the UI kit). Zero new services/containers/dependencies; one new column; the only new I/O is a `site_reviews` SELECT the enrichment crate can issue against the same pool. The one genuinely uncertain element — keyword-dictionary coverage for long-tail businesses — is mitigated by the review-phrase backstop and by an explicit "no highlights = render nothing" rule (never an empty section, never invented text).

### 3. Architectural Analysis

**Pitfalls:**
- **Dictionary coverage:** curated keyword lists can't cover every business. Mitigation: (a) review-phrase mining is category-agnostic and always runs, (b) zero-extraction is a valid outcome (no write, no UI section), (c) admin editor allows manual override.
- **False-positive facets:** keyword matching must require the phrase in title/nav/meta position or ≥2 occurrences in body text to avoid matching "law" inside "belaw" — word-boundary regex per term.
- **Review n-grams:** naive frequency mining picks up stopword-heavy phrases ("very good", "was great"). Mitigation: stopword filter + minimum document frequency (phrase in ≥2 reviews) + max length 4 words + sentiment gate (positive-only via a small polarity wordlist; no NLP model).
- **Description merge dedupe:** SearXNG snippets overlap heavily; merge only at sentence boundaries, skip sentences whose token Jaccard similarity > 0.6 with an already-chosen sentence.
- **og:description duplicates:** skip when it equals/contains the top snippet or is <40 chars (many sites reuse the title).
- **JSONB vs text[]:** `social_urls` precedent is JSONB; keep JSONB even though v1 stores `string[]` so v2 facet pairs don't need a column change.

**Existing Debt:**
- `pending_import_businesses` has no highlights column — out of scope; enrichment only targets `businesses` (same as every other enriched field).
- `toSearchBusiness` (public search resolver) already stubs `imageUrl: ""` — highlights ride the same stub (`[]`) until that resolver is wired to real directory data (separate debt, not this epic).
- **Wins:** no new tech debt — one nullable column, one pure module, no new containers/ports/dependencies.

### 4. Behavior Decomposition

| User Behavior | Story | Type | Draft ACs | Component | Layer | Parallel? | MoSCoW | Depends On | Seams | Contract ACs | Testability |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Schema carries the new column | `Postgres: highlights column` (STORY-001) | infrastructure | 1. Migration 022 adds nullable `highlights JSONB` to `businesses`, idempotent (`IF NOT EXISTS`), tracked in `schema_migrations`. 2. Fresh `npm run migrate` + re-run both succeed. | migration | infra | no | must | — | schema | — | standard migration tests (compose) |
| Descriptions use the homepage's own copy and richer snippets | `bw-scraper: description upgrade` (STORY-002) | feature | 1. When the homepage fetch succeeds and carries an `og:description` ≥40 chars that is not a duplicate of any SearXNG snippet, it fills `description` in preference to the top snippet. 2. When the top snippet is <80 chars, up to 3 additional ranked snippets are merged (sentence-level, overlap-deduped, ≤500 chars). 3. Fill-empty still applies: an existing `description` is never overwritten. | enrichment-engine | service | yes | must | — | — | — | standard unit tests (fixture HTML/SearXNG JSON) |
| Each category gets its own highlight facets | `bw-scraper: category highlight extraction` (STORY-003) | feature | 1. Given a `food-dining` business whose homepage/snippets mention "soul food", "vegan options" and "live music", `highlights` receives those as `string[]` (word-boundary match, ≤5 entries, ≤80 chars each). 2. A `professional-services` business with "family law" + "estate planning" on its homepage gets those practice areas. 3. Categories without a dictionary (v1: only food-dining, professional-services, personal-services have dicts) still get review-derived highlights. 4. Zero matches → no write, field stays NULL, report notes "no highlights found". | enrichment-engine + highlights module | service | yes | must | STORY-001 | — | — | standard unit tests (fixture corpora per category) |
| Review themes surface for every category | `bw-scraper: review-phrase mining` (STORY-004) | feature | 1. From stored `site_reviews` comments, phrases of 2–4 words appearing in ≥2 positive reviews (stopword-filtered, polarity-gated) are extracted, capped at 5. 2. Phrases are merged into the same `highlights` array behind any dictionary matches (dictionary entries first, deduped, total ≤5). 3. Businesses with <2 usable reviews get no review-derived highlights. | enrichment-engine + highlights module | service | yes | should | STORY-001, STORY-003 | — | — | standard unit tests (fixture review sets) |
| Highlights and the review pull-quote are visible | `Frontend: highlight chips + customers-say quote` (STORY-005) | feature | 1. Directory cards render up to 3 highlight chips (existing `Badge`); the detail page renders up to 5. 2. Detail page shows a "Customers say" blockquote: highest-rated `siteReviews` comment (most-recent on tie), with reviewer name and location label; hidden entirely when no reviews exist. 3. Businesses with NULL `highlights` render no chip row and no empty section. | components | presentation | yes | must | STORY-001 (type shape only) | types | Consumes `highlights: string[]` on the Business type (GraphQL + /api/directory) | co-located jest specs (BusinessCard, BusinessDetail) |
| Admin can fix a bad extraction | `Admin UI: highlights in content editor` (STORY-006) | feature | 1. PATCH /api/admin/businesses/[id]/content accepts `highlights: string[]` (≤5 entries, ≤80 chars each); 400 VALIDATION_ERROR beyond. 2. Manual write overrides pipeline-written values (same override semantics as `image_url`). 3. Admin content form renders a pre-filled chip editor. | admin-content-editor | controller | yes | should | STORY-001 | routes | — | route spec (mocked pool) + jest |
| End-to-end: enrich → chips + quote visible | `E2E: highlights pipeline integration` (STORY-007) | test | 1. Given a fixture business with empty `highlights` and a `google_maps` source, a `/enrich` run populates `highlights` and the directory card + detail page render the chips. 2. The review pull-quote renders from a seeded `site_reviews` row. 3. Re-running enrichment reports `highlights` skipped. | N/A | test | no | should | STORY-002–006 | — | — | requires: compose postgres, fixture SearXNG + homepage stubs (existing `ac4_start_*_stub` patterns) |

**Deferred (won't for v1 — recorded, no tickets):** menu-page fetch for dining dish/chef/decor highlights (new outbound fetch per restaurant; v2 candidate — best source for food-dining depth); LLM-written description/highlight copy (dependency + cost + hallucination risk); hours/price-level fact chips (no reliable data source in SearXNG or the Google share-link JSON — verified against `tests/fixtures/place-json/southern_kitchen.json`); dictionary coverage for retail-fashion/health-wellness/automotive/home-services/entertainment/education (seed those when real businesses in those categories accumulate).

### 5. C4 Delta

**C1:** none (no new external systems — all sources are already-fetched content or the existing `site_reviews` table).
**C2:** no new containers. New write edge: `bw-scraper → postgres` (new column `businesses.highlights`, same connection pool).
**C3 (add, bw-scraper container):** `highlights-module` (Rust module: dictionaries + extraction, path `bw-scraper/src/highlights.rs`).
**C3 (add, black-owned-frontend container):** `highlight-chips` (BusinessCard/SearchResults chips + BusinessDetail pull-quote, `src/components/ui/BusinessCard.tsx` / `src/components/BusinessDetail.tsx`).
**C3.5:** `Highlights` = `JSONB string[]` (≤5 × ≤80 chars); description candidate order `og:description` > top snippet > merged snippets.
**Relationships:** `enrichment-engine → highlights-module` (Uses). No `delta-spec.json` yet — produced at epic conversion.

### 6. Execution & Integration Strategy

**Tracks:**
- Track A (Rust): STORY-001 → STORY-002 ∥ STORY-003 → STORY-004 (same crate; 003 and 004 share the `highlights` module, so sequential after 003's module skeleton).
- Track B (Frontend): STORY-005 (against the type contract) ∥ STORY-006 (independent admin route).
- Track C (E2E): STORY-007 after A + B land.

**Contracts:**
- `highlights` shape: `JSONB` array of `string`, ≤5 entries, each ≤80 chars, deduped; `null` = never extracted (UI renders nothing).
- Description candidate order: `og:description` (≥40 chars, non-duplicate) → top SearXNG snippet → merged top-3 snippets (≤500 chars total). Fill-empty semantics unchanged.
- Fill-empty write: `UPDATE businesses SET highlights = $2::jsonb, updated_at = now() WHERE id = $1 AND highlights IS NULL`.

**Order:**
1. STORY-001 — schema; unblocks Rust + frontend in parallel
2. STORY-002 + STORY-005 + STORY-006 — parallel (Rust description pass; frontend chips; admin editor)
3. STORY-003 → STORY-004 — extraction core, then review mining (same module)
4. STORY-007 — E2E last (exercises the full path; Bruce runs it as the post-epic gate)

**Seam classes for Dupin:** `schema` (STORY-001 — serialized, epic-wide), `types` (STORY-001/005 — the Business type gains `highlights` in one commit), `routes` (STORY-006). No `compose`/`config` seam stories.

**Seed data for dictionaries (v1 categories):**
- `food-dining`: cuisine types (soul food, sushi, pizza, mexican, vegan, gluten-free, farm-to-table…), ambience (outdoor seating, live music, rooftop, bar, family-friendly), people (chef's table, named chef patterns `Chef \w+`), offerings (brunch, happy hour, private events, catering).
- `professional-services`: practice-area/specialty lexicon — law (family law, estate planning, criminal defense, personal injury, business law, immigration, tax, employment, real estate), accounting (tax preparation, CPA, bookkeeping, audit), legal-adjacent services; pattern: capitalized two-word proper-noun practice names in nav/h2/h3 positions.
- `personal-services`: service verbs/nouns — hair (fade, haircut, beard trim, color, extensions), skin (facial, waxing, massage), nails (manicure, pedicure, gel), grooming (puppy cut, de-shedding), home (laundry, cleaning).
- Extraction rule: term must hit a word-boundary match; nav/h1/h2/h3/meta occurrences weight 3×, body occurrences 1×; threshold ≥2 weighted hits OR any title/nav hit; top-5 by weight, original casing from first occurrence.

**Open questions (resolve at epic conversion, not now):**
1. Pull-quote tie-break: highest rating → most recent, or most recent first? (Proposed: highest rating, most-recent tie-break.)
2. Chip budget on cards: 3 or 4 without pushing the "View Details" button down? (Proposed: 3.)
3. Should `pending_import_businesses` gain `highlights` at approval time (backfill from source_data) or stay NULL until post-approval enrichment? (Proposed: stay NULL; enrichment covers it.)
4. Dictionary maintenance ownership: committed fixture file (`bw-scraper/src/highlights/dictionaries.json`) vs. hand-written Rust consts? (Proposed: JSON fixture loaded via `include_str!`, one file per category.)
