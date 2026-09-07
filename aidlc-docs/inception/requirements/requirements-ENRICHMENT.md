---
stage: requirements-analysis
source: Refiner
ticket: ENRICHMENT
timestamp: 2026-08-27T05:44:21Z
---

# Refined Acceptance Criteria — ENRICHMENT

**Gotham Pipeline** · Refiner → dupin
**Environment:** local dev; docker compose stack; Next.js dev server
**Mode:** standard
**Current step:** complete
**Local ticket:** N/A
**PRD Hash:** N/A
**PRD Version:** N/A
**Architect Story Map:** STORY-001 to LOC-0077, STORY-002 to LOC-0078, STORY-003 to LOC-0079, STORY-004 to LOC-0080, STORY-005 to LOC-0081, STORY-006 to LOC-0082
**Blueprint Path:** C:/Users/Merlin/Documents/repos/Black_Owned/aidlc-docs/inception/planning/ENRICHMENT/Implementation-Blueprint.md
**Delta HTML:** C:/Users/Merlin/Documents/repos/Black_Owned/aidlc-docs/inception/planning/ENRICHMENT/c4-delta.html
**Local tickets:** LOC-0076 epic, LOC-0077 through LOC-0082 stories
**Delta Spec:** C:/Users/Merlin/Documents/repos/Black_Owned/aidlc-docs/inception/planning/ENRICHMENT/delta-spec.json
**Epic Key:** LOC-0076
**Target directories:** bw-scraper/src, src/app/api/admin, src/components/admin, e2e
**Constraints:** ['Photos and menus are external URLs only - no file storage', 'No paid API keys; Google data via share-link JSON only', 'Fill-empty rule: enrichment must not overwrite existing non-null values', 'Enrichment must be idempotent and rerunnable', 'Do not wire enrichment into the dead scrape_jobs queue; execution home is bw-scraper POST /enrich']

**Acceptance Criteria:**
Epic: LOC-0076 -- ENRICHMENT: populate business content through the pipeline

Stories:

## LOC-0077

### AC1: Fill-empty enrichment from place JSON

Given a business "b-1" whose source_id is a Google Maps share-link URL
And b-1 has phone NULL, website NULL, description NULL, rating 0, review_count 0, social_urls NULL
And the place JSON for that share link contains phone "+15551234567", website "https://example.com", description "Southern kitchen and bar", rating 4.5, review_count 214
When the enrichment engine runs for b-1
Then b-1.phone is "+15551234567", b-1.website is "https://example.com", b-1.description is "Southern kitchen and bar"
And b-1.rating is 4.5, b-1.review_count is 214, b-1.rating_source is 'google'
And b-1.social_urls is set from the place JSON social array

Scenario: existing values are never clobbered
Given a business "b-2" with phone "+15550001111" (manually set) and description NULL
And the place JSON contains phone "+15559998888" and description "Text from Google"
When the enrichment engine runs for b-2
Then b-2.phone remains "+15550001111"
And b-2.description is "Text from Google"
And the run report lists phone as skipped (already set) for b-2

### AC2: Failures are isolated per business

Given a business "b-3" whose share-link fetch returns HTTP 500
When the enrichment engine runs a batch containing b-3
Then b-3's row is unchanged
And the run report records b-3 with error "fetch failed: HTTP 500"
And the remaining businesses in the batch still process to completion

Scenario: no enrichment source
Given a business "b-4" with source "searxng" and no Google share link in source_id
When the enrichment engine runs for b-4
Then b-4 is reported as skipped with reason "no enrichment source"
And no error is raised

### AC3: Reruns are idempotent

Given a business "b-5" fully enriched by a previous run
When the enrichment engine runs again for b-5
Then every target field is reported as skipped
And

## LOC-0078

### AC1: Bounded run with per-business report

Given 10 businesses with source 'google_maps' and at least one empty content field
When POST /enrich with body {"limit": 5}
Then at most 5 businesses are enriched
And the response is 200 with body {"businesses": [{"id","name","applied","skipped","error"}], "summary": {"total": 5, "enriched": 5, "skipped": 0, "failed": 0}}
And the default limit when omitted is 50

Scenario: dry run performs

## LOC-0079

### AC1: Auth-gated trigger renders the report

Given an authenticated admin
When the admin clicks "Enrich business content" with limit 10
Then POST /api/admin/enrichment forwards to the bw-scraper POST /enrich at SCRAPER_BASE_URL (default http://localhost:8080) with {"limit": 10}
And the response is 200 {"success": true, "data": {"report": ...}}
And the admin console renders the per-business report: applied fields, skipped fields, and failed fields with their reasons

Scenario: unauthenticated
Given no Authori

## LOC-0080

### AC1: Pre-filled form and save

Given business "b-9" with website NULL and phone "+15551112222"
When an admin opens the content editor for b-9
Then the form is pre-filled with phone "+15551112222" and an empty website field
When the admin enters website "https://example.com" and saves
Then PATCH /api/admin/businesses/b-9/content returns 200 {"success": true, "data": {"business": {...}}}
And b-9.website in Postgres is "https://example.com"
And the form re-renders showing the saved value

Scenario: partial save
Given the admin edits only menu_url to "https://example.com/menu"
When the admin saves
Then only menu_url is written; phone and description keep their previous values

### AC2: Validation, auth, and unknown business

Given an authenticated admin
When the admin saves a website longer than 500 characters
Then the response is 400 with code VALIDATION_ERROR
When the admin saves phone "+1555111222" (11 chars) alongside a 2001-character description
Then the response is 400 with code VALIDATION_ERROR naming description
Given no Authori

## LOC-0081

### AC1: Menu discovery from the homepage

Given a business with website "https://example.com" and menu_url NULL
And the business homepage contains the link "https://example.com/menu"
When the menu-discovery pass runs for that business
Then menu_url is "https://example.com/menu"

Scenario: no menu-like link
Given a business with website "https://example.com" and menu_url NULL
And the homepage contains no link whose path contains "menu" (case-insensitive) or ends in ".pdf"
When the menu-discovery pass runs
Then menu_url stays NULL
And the run report says "no menu link found"

Scenario: crawl failure
Given a business whose website fetch times out (10 s cap)
When the menu-discovery pass runs
Then menu_url is unchanged
And the run report logs the fetch error and the run continues

### AC2: Photo selection with stability check

Given a business whose place JSON contains a photos array and image_url is NULL
When the photo pass runs and a HEAD check on the first photo URL returns an image content type
Then image_url is set to that URL

Scenario: unstable or invalid photo URL
Given a business whose first photo URL returns 404 or a non-image content type on HEAD
When the photo pass runs
Then image_url stays NULL
And the run report logs the skip ("photo url failed check")

## LOC-0082

### AC1: End-to-end enrichment happy path

Given a test business with source "google_maps", a share-link source_id, and empty phone/website/description/rating
When an admin triggers enrichment (via POST /api/admin/enrichment or the console)
Then the business row in Postgres has phone, website, description, rating, and review_count populated from the fixture source
And the directory and business detail pages render the enriched values
And external (Google) review count displays separately from on-site reviews

### AC2: Idempotent re-run

Given a business already enriched by a previous run
When enrichment runs again against the same business
Then all fields report as skipped, no data changes, and no duplicate content appears

### AC3: Partial failure isolation

Given one business with a valid source and one business with an unreachable/failing source
When enrichment runs over both
Then the valid business is enriched and the failing one is reported with an error
And the failing business's existing data is unchanged

## Design change note (2026-08-30)

Enrichment now uses SearXNG as the primary content source: the `google_maps`
share-link row in `scraped_businesses` is the eligibility gate only and is
never fetched. The engine queries SearXNG (`{SEARXNG_URL}/search?q=<name> [location]&format=json`)
and maps the top result to `website` (result URL), `description` (snippet),
and `phone` (ETL US-phone regex on the snippet). `rating`, `review_count`,
`social_urls`, and photos are not supplied by SearXNG and remain untouched.
LOC-0081 photo/menu passes are unchanged but are exercised directly in tests,
since SearXNG lookups never carry photos.
