---
stage: requirements-analysis
source: Refiner
ticket: HIGHLIGHTS
timestamp: 2026-09-06T20:29:32Z
---

# Refined Acceptance Criteria — HIGHLIGHTS

**Gotham Pipeline** · Refiner → dupin
**Environment:** N/A
**Mode:** N/A
**Current step:** complete
**Local ticket:** N/A
**PRD Hash:** N/A
**PRD Version:** N/A
**Architect Story Map:** STORY-001 -> LOC-0084, STORY-002 -> LOC-0085, STORY-003 -> LOC-0086, STORY-004 -> LOC-0087, STORY-005 -> LOC-0088, STORY-006 -> LOC-0089, STORY-007 -> LOC-0090
**Blueprint Path:** C:/Users/Merlin/Documents/repos/Black_Owned/.claude/codebase/planning/HIGHLIGHTS/Implementation-Blueprint.md
**Delta HTML:** C:/Users/Merlin/Documents/repos/Black_Owned/.claude/codebase/planning/HIGHLIGHTS/c4-delta.html
**Epic Key:** LOC-0083
**Story Files:** tickets/LOC-0083.md (epic), LOC-0084..LOC-0090 (stories)
**Phases:** P1: LOC-0084, LOC-0085 | P2: LOC-0086, LOC-0088, LOC-0089 | P3: LOC-0087 | P4: LOC-0090 (E2E)

**Acceptance Criteria:**
Full Gherkin lives in tickets/LOC-0084.md .. LOC-0090.md. Per-story AC summary:

LOC-0084 (schema, P1, Must, 2pts):
  AC1: migration 022 adds nullable businesses.highlights JSONB, tracked in schema_migrations; existing rows stay NULL
  AC2: migration re-run is idempotent (exit 0, single schema_migrations row)

LOC-0085 (description, P1, Must, 3pts):
  AC1: og:description (>=40 chars, not equal/containing top snippet) fills description in preference to snippet; too-short and duplicate variants fall back to snippet
  AC2: top snippet <80 chars merges up to 3 more snippets, sentence-level dedupe, <=500 chars; >=80 uses top snippet alone
  AC3: fill-empty -- existing description never overwritten; no usable source leaves it NULL

LOC-0086 (category extraction, P2, Must, 5pts):
  AC1: food-dining dictionary terms word-boundary matched into highlights (<=5 entries, <=80 chars each, original casing); no-boundary and >5 capped
  AC2: professional-services practice areas (nav/h2) extracted
  AC3: zero matches -> no write, stays NULL, report notes 'no highlights found'; unknown category slug -> no entries, no error

LOC-0087 (review mining, P3, Should, 3pts):
  AC1: 2-4 word phrases in >=2 visible positive reviews extracted; single-review, stopword-heavy, and negative-sentiment phrases excluded
  AC2: review phrases merge behind dictionary entries, deduped, total <=5; cap trims review phrases first
  AC3: <2 usable reviews (zero, one, or all hidden) -> no review-derived highlights

LOC-0088 (frontend chips + quote, P2, Must, 3pts):
  AC1: card shows <=3 chips, detail shows <=5; fewer render fewer
  AC2: 'Customers say' blockquote = highest-rated siteReviews comment (most-recent on tie) with reviewer name + location; section hidden when no reviews
  AC3: NULL highlights -> API returns [] and UI renders no chip row / no empty section

LOC-0089 (admin editor, P2, Should, 3pts):
  AC1: PATCH /api/admin/businesses/[id]/content accepts highlights string[] (<=5, <=80 chars); 400 VALIDATION_ERROR beyond; 4xx when not admin
  AC2: manual write overrides pipeline value; pipeline re-run does not clobber admin value
  AC3: content form renders pre-filled chip editor; add/remove round-trips

LOC-0090 (E2E, P4, Should, 2pts):
  AC1: fixture business enriches -> highlights + description populated, card + detail render chips + quote
  AC2: re-run reports highlights skipped, row unchanged
  AC3: no-extraction fixture stays NULL, no chip row / empty section
