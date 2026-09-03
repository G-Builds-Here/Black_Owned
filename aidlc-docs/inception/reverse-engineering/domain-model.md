<!--
surveyed_at: 2026-08-27T02:40:39Z
commit: 5a67ed37776c18bc32c9f8e783cb67e23b6c1641
relevant_paths:
- migrations/postgresql
- src/types
- src/lib/graphql/business-schema.ts
- bw-types
summary: Postgres schema (system of record), TypeScript types, and GraphQL type surface.
-->

# Domain Model

## Postgres Tables (system of record)

| Table | Used by | Key fields | Validation | Notes |
|---|---|---|---|---|
| users | auth, ownership, chat | id uuid PK, email, password_hash, name, role varchar(50) default 'user', status default 'active', created/updated_at | email UNIQUE NOT NULL; indexes email/role/status | Roles in code: user \| business_owner \| admin; seed inserts `customer` (invalid — finding M3) |
| businesses | directory, claims, reviews, views | id uuid PK, owner_id, name varchar(255), description, category_id varchar(100), verification_status default 'unverified', location, rating decimal default 0, review_count int default 0, image_url, tags text[], website, lat/lng, phone, menu_url, rating_source default 'google', social_urls jsonb | owner_id NOT NULL FK users CASCADE; category_id NOT NULL but **no FK** | rating_source records scraped-rating provenance (019) |
| pending_import_businesses | review queue, import pipeline | id PK, name, description, category_id, status, source, source_data jsonb, job_id, rejection_reason, lat/lng | status CHECK (pending_review, approved, rejected) | job_id has **no FK** to scrape_jobs (finding M4); address/rating live in source_data JSONB |
| scrape_jobs | app + bw-scraper (shared) | id PK, source, query, location, status, business_count, error_message, started/completed/created/updated_at | status CHECK (pending, running, completed, failed, cancelled) | Two uncoordinated writers (finding H3) |
| scraped_businesses | bw-scraper writes; app dedup/import/featured reads | id PK, scrape_job_id FK, source, name, address, phone, website, category, rating decimal(3,2), review_count, source_id, lat/lng | scrape_job_id NOT NULL FK scrape_jobs CASCADE | 017 backfills coords from Google Maps URL encoding |
| business_views | owner dashboard chart | id PK, business_id, viewed_at default NOW() | business_id FK businesses CASCADE | written by open POST /api/businesses/[id]/view |
| conversations | chat | id PK, user_id, business_id, created/updated_at | FKs CASCADE; UNIQUE(user_id, business_id) | resume-not-duplicate semantics |
| messages | chat | id PK, conversation_id, business_id, sender_user_id, body, is_read default false, created_at | conversation_id + business_id FK CASCADE; sender_user_id FK users **without** CASCADE | |
| reviews | review UI, GraphQL | id PK, business_id, user_id, rating smallint, comment, visible default true, location_id, created_at | location_id FK business_locations ON DELETE SET NULL; **no FKs on business_id/user_id, no rating CHECK** | backfilled from live DB created by retired bw-api (013) |
| business_locations | multi-location businesses | id PK, business_id, label, address varchar(500) NOT NULL, lat/lng, is_primary default false | business_id FK CASCADE; partial unique index (business_id) WHERE is_primary | 016 backfills one primary row per business |
| categories | /api/categories, claim, owner list, GraphQL | id, name | **NONE — table has no Postgres migration** (finding H1); exists only in live DB from bw-api era | |

## TypeScript Types (`src/types/`)

- `Business` + `BusinessLocation` + `BusinessProfile` + `BusinessHours` (HH:MM validators, 7-day map)
- `VerificationStatus` (unverified | pending | verified)
- `UserRole` / `UserStatus` + `validatePassword` / `isValidEmail`
- `JwtPayload` / `TokenPair`
- `ScrapeJob` / `ScrapeJobStatus` + `validateScrapeJobInput`
- `PendingImportBusiness` — carries dead field `duplicateStatus` (column dropped in 012, finding L2)
- `ScraperSource` (GOOGLE_MAPS | YELP | FACEBOOK), user-management event types, scraper-result types

## GraphQL Type Surface (`src/lib/graphql/business-schema.ts`)

- Types: `Business` (incl. locations[], siteReviews[], ratingSource), `BusinessLocation`, `Review`, `CreateBusinessInput`, `CreateBusinessPayload`, `DateTimeUtc`
- Query: `business(id)`; resolvers also implement `searchBusinesses` (relevance-ranked, Valkey-cached), `register`, `updateBusiness` (owner-checked), `submitVerification` (MinIO presigned URLs)
- Execution is a regex mini-parser, not graphql-js (finding H5)

## Rust Types (`bw-types`)

Business, Review, User, Verification, Message, Event + email types — consumed only by bw-api and bw-ingestion.
