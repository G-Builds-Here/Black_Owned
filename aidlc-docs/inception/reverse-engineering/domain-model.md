<!--
surveyed_at: 2026-09-05T19:45:00Z
commit: 1d809d37d45d649844f979496e7d7ea1d47a40ce
relevant_paths:
  - migrations/postgresql
  - src/types
  - src/lib/graphql
  - bw-types
summary: Postgres schema, TypeScript types, GraphQL types, and Rust shapes with ownership and caveats.
-->

# Domain Model

## Postgres (system of record)

Migrations: `migrations/postgresql/001–021`, applied by `npm run migrate`
(idempotent, tracked in `schema_migrations`).

| Table | Written By | Key Fields / Constraints | Notes |
|-------|-----------|--------------------------|-------|
| `users` | Next.js | `id uuid PK`, `email UNIQUE NOT NULL`, `password_hash`, `role varchar(50) DEFAULT 'user'` (user / business_owner / admin), `status` (active / inactive / suspended) | Auth + admin user management |
| `businesses` | Next.js **and** bw-scraper (dual writer) | `owner_id FK→users CASCADE`, `name varchar(255)`, `category_id varchar(100) NOT NULL`, `verification_status DEFAULT 'unverified'`, `rating`, `image_url`, `card_image_url` (021), `website` (004), `phone`/`menu_url` (019), `social_urls jsonb` (014), `lat`/`lng` (015), `tags text[]`, `owner_description` (002) | Central table. bw-scraper `/enrich` and `/locations` UPDATE it directly, bypassing app-layer validation. |
| `categories` | migration 020 (backfill) | `id`, `name varchar(255) UNIQUE NOT NULL` | Previously live-only (retired bw-api era); 020 seeds 6 baseline UUIDs. |
| `pending_import_businesses` | Next.js (import pipeline) | `status DEFAULT 'pending_review'` CHECK (pending_review / approved / rejected), `source`, `source_data jsonb`, `job_id` | Admin review queue. |
| `scrape_jobs` | Next.js **and** bw-scraper | `source`, `query`, `location`, `status` CHECK (pending / running / completed / failed / cancelled), `business_count`, `error_message` | Two pipelines write different status vocabularies (see findings). |
| `scraped_businesses` | bw-scraper (and TS scrapers via import) | `scrape_job_id FK CASCADE`, `source varchar(20)`, `name varchar(500)`, `rating decimal(3,2)`, `coordinates` (017) | Feeds pending import + featured. |
| `business_views` | Next.js | `business_id FK`, `viewed_at` | Powers owner view-count charts. |
| `reviews` | Next.js | `business_id`, `user_id`, `rating smallint`, `comment text`, `location_id` (018), `visible bool DEFAULT TRUE` | Table predated migrations — created by the retired bw-api; migration 013 backfilled it. |
| `business_locations` | Next.js **and** bw-scraper | `business_id FK CASCADE`, `address varchar(500) NOT NULL`, `lat`/`lng`, `is_primary bool`, partial `UNIQUE(business_id) WHERE is_primary` (016) | Multi-location support. |
| `conversations` / `messages` | Next.js | `UNIQUE(user_id, business_id)`; `is_read bool DEFAULT FALSE` | Live fan-out via NATS `chat.message.<cid>`. |
| `schema_migrations` | migrate script | applied file + timestamp | Bookkeeping. |

## ClickHouse (analytics mirror)

`migrations/clickhouse/001_create_tables.sql` — view/event analytics. No runtime
write path found in the TS app or active Rust code; bw-scraper carries the client
dependency for health checks only. [ASSUMED: analytics writes are planned/deferred.]

## TypeScript Types (`src/types/`)

`user.ts` (UserRole, UserStatus), `user-management.ts` (RoleChangedEvent +
validators), `business.ts` (VerificationStatus), `business-status.ts`, `review.ts`
(ReviewLengthCategory), `scrape-job.ts` (ScrapeJob, ScrapeJobStatus,
CreateScrapeJobInput), `pending-import-business.ts`, `job.ts` (JobStatus — note: TS
executor uses `'scraping'`, Postgres CHECK uses `'running'`), `image.ts`,
`scraper-result.ts` (ScraperResult / RawScraperData for Google|Yelp|Facebook).
App-level validators: `business-data-validator`, `contact-validator`.

## GraphQL Types (`src/lib/graphql/schema.ts`)

Declared: `User`, `TokenPair`, `AuthResponse`, `Business`, `CategoryFacet`,
`SearchResults`, `GQLBusiness`, `PresignedUrl`, `SubmitVerificationResponse`,
`UpdateBusinessResponse`, `DateTimeUtc`. Query: `searchBusinesses`, `business`,
`health`. Mutation: `register`, `createBusiness`, plus `submitVerification` and
`updateBusiness` which are declared but **not executed** by the regex executor.

## Rust Shapes

- **bw-types**: `Business`, `Category`, `Review`, email payloads (shared by
  `bw-api` + `bw-ingestion` only — bw-scraper defines its own models).
- **bw-scraper**: `ScrapeRequest { query, location, max_pages }`,
  `EnrichRequest { business_ids, limit, dry_run }` (snake_case — the TS proxy sends
  camelCase `businessIds` which serde silently drops, see findings),
  `LocationsRequest`, `HealthStatus { service, healthy, message }`.
