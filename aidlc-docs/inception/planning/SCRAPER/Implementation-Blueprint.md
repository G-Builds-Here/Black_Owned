# Implementation Blueprint: Web Scraper for Business Listings

**Ticket:** SCRAPER  
**Created:** 2026-07-31  
**Status:** Ready for Jira breakdown

---

## 0. As-Built Deviations (verified 2026-08-22)

This blueprint planned the scraper stack entirely in Rust. The as-built system
splits the work differently; the original plan below is retained for
reference. Key divergences:

- **Source scraping is in TypeScript, not Rust.** Google Maps, Yelp, and
  Facebook extraction run on Playwright in `src/services/`
  (`google-maps-scraper.ts`, `yelp-scraper.ts`, `facebook-scraper.ts`, the
  `business-scraper.ts` factory, and `scraper-job-executor.ts`). The planned
  Rust `bw-scraper/src/scrapers/` directory was not created.
- **Rust `bw-scraper` handles discovery + ETL, not raw scraping.** Its `src/`
  holds a single `scraper.rs` plus `searxng.rs` (SearXNG metasearch discovery —
  added after this blueprint), `etl.rs`, `importer.rs`, `connectors.rs`,
  `models.rs`, `api.rs`, `main.rs`, and anti-bot modules
  (`rate_limiter.rs`, `user_agent_rotator.rs`, `robots.rs`).
- **`bw-types/src/scraping.rs` was not created** (the crate keeps `email.rs`
  and `lib.rs` only). Scraping types live in `bw-scraper/src/models.rs` and in
  the frontend `src/types/`.
- **No `import_batches` table.** Import tracking uses `scrape_jobs` (Postgres)
  plus the `pending_import_businesses` review gate.
- **Job lifecycle** adds a fifth status: `pending | running | completed |
  failed | cancelled` (the Behavior Decomposition table in §4 lists four,
  omitting `cancelled`).
- **Admin job API** is the REST route `src/app/api/scrape-jobs/` (GET/POST),
  not the specced `POST /api/admin/scrape-jobs` + `PUT /:id/approve`; approval
  goes through `POST /api/businesses/[id]/approve`.
- **Fuzzy deduplication** is `src/services/duplicate-detection-service.ts`
  (name + address + phone), wired into the import job route.
- **AC-level QA suites** live in `src/qa/` (incl. `scraper-e2e.spec.ts`).

---

## 1. Repository Mapping & Target Location

| Path | Why |
|------|-----|
| `bw-scraper/` | New Rust crate following bw-ingestion pattern for background workers |
| `bw-scraper/src/scrapers/` | Source-specific scraper implementations (GoogleMaps, Yelp, Facebook) |
| `bw-scraper/src/etl/` | Data normalization and transformation pipeline |
| `bw-scraper/src/importer/` | PostgreSQL import logic with deduplication |
| `src/app/admin/scrape/` | Admin UI for managing scrape jobs and reviewing imported businesses |
| `bw-types/src/scraping.rs` | Shared types for scrape jobs and raw data |

**Justification:** The `bw-scraper` crate follows the existing `bw-ingestion` pattern for async background workers using NATS JetStream. Admin UI placed alongside existing admin console pages.

---

## 2. Confidence Rating

**Confidence: Medium** — Factor: Novel domain (web scraping with anti-bot evasion) but maps cleanly to existing worker patterns (bw-ingestion email/image processors)

---

## 3. Architectural Analysis

### Pitfalls & Mitigations

| Risk | Mitigation |
|------|------------|
| **Anti-bot detection** (CAPTCHA, IP bans) | Use headless browser (Playwright) with rotating user agents, rate limiting, and proxy support |
| **Legal/compliance** (ToS violations) | Focus on publicly available data, respect robots.txt, implement reasonable rate limits |
| **Data quality** (inconsistent formats) | Robust ETL with validation, manual review queue for edge cases |
| **Scalability** (large scrape jobs) | NATS JetStream queue with worker pool, progress tracking in ClickHouse |
| **Duplicate detection** | Fuzzy matching on business name + location + phone before import |

### Existing Technical Debt in Scope

| Area | Can Fix Now? |
|------|--------------|
| Missing service layer tests (bw-ingestion) | No — out of scope, note for future |
| Hardcoded credentials | Yes — scraper config via environment variables only |

---

## 4. Behavior Decomposition

| User Behavior | Story | Type | Draft ACs | Component | Layer | Parallel? | MoSCoW | Depends On | Contract ACs | Testability |
|---|---|---|---|---|---|---|---|---|---|---|
| Admin can start a scrape job for a source | `ScrapeJobManager: create scrape job` | feature | Can create a scrape job specifying source (GoogleMaps/Yelp/Facebook), search query, and geographic area | scrape-job-manager | handler | yes | Must | N/A | N/A | requires: postgres, nats |
| System scrapes businesses from external sources | `GoogleMapsScraper: scrape Google Maps` | feature | Can extract business name, address, phone, website, category, rating, reviews from Google Maps search results | google-maps-scraper | service | yes | Must | N/A | N/A | requires: playwright, mock-server for ToS compliance tests |
| System scrapes businesses from external sources | `YelpScraper: scrape Yelp` | feature | Can extract business name, address, phone, website, category, rating, reviews from Yelp search results | yelp-scraper | service | yes | Should | N/A | N/A | requires: playwright, mock-server |
| System scrapes businesses from external sources | `FacebookScraper: scrape Facebook` | feature | Can extract business name, address, phone, website, category from Facebook Business Pages | facebook-scraper | service | yes | Could | N/A | N/A | requires: playwright |
| Scraped data is normalized to business schema | `ETLPipeline: normalize scraped data` | feature | Can transform raw scraped data into normalized Business format with validated fields | etl-pipeline | service | yes | Must | N/A | N/A | standard unit tests |
| Normalized businesses are imported to database | `BusinessImporter: import to PostgreSQL` | feature | Can import normalized businesses with deduplication against existing listings | business-importer | repository | yes | Must | ETL Pipeline | N/A | requires: postgres |
| Admin can view scrape job status and results | `ScrapeJobAPI: query scrape jobs` | feature | Can list scrape jobs with status (pending/running/completed/failed) and view imported business count | scrape-job-api | controller | yes | Must | N/A | N/A | requires: postgres |
| Admin can review and approve scraped businesses | `BusinessReviewUI: review scraped businesses` | feature | Can review scraped businesses in bulk, approve for import or reject with reason | business-review-ui | controller | yes | Should | ScrapeJobAPI | N/A | requires: postgres |
| System tracks scraping metrics for analytics | `ScrapingAnalytics: record scrape metrics` | feature | Can log scrape job duration, businesses found, imported, rejected to ClickHouse | scraping-analytics | infrastructure | yes | Should | N/A | N/A | requires: clickhouse |
| Infrastructure: Scraper service runs as background worker | `bw-scraper: Rust worker crate` | infrastructure | Can run as standalone binary with NATS JetStream consumer for scrape jobs | bw-scraper | infrastructure | yes | Must | N/A | N/A | N/A — infra story, tested by CI itself |
| Infrastructure: Database schema for scrape jobs | `ScrapeJobSchema: create tables` | infrastructure | Can create scrape_jobs, scraped_businesses, import_batches tables with proper indexes | scrape-job-schema | infrastructure | yes | Must | N/A | N/A | requires: postgres |
| Infrastructure: Admin scraping pages | `AdminScrapingUI: scraping management pages` | infrastructure | Can view scrape jobs, review businesses, approve/reject imports | admin-scraping-ui | controller | yes | Must | N/A | N/A | standard unit tests |
| E2E: End-to-end scrape workflow | `E2E: scraper integration tests` | test | Can create a scrape job, run it, review results, approve businesses, verify they appear in directory | N/A | test | no | Must | All feature stories | N/A | requires: postgres, nats, playwright |

---

## 5. C4 Delta

### C1 (Context) - New External Systems

| ID | Name | Type | Description | Technology |
|----|------|------|-------------|------------|
| google-maps | Google Maps | External System | Google Maps business listing API | Web Scraping / HTTP |
| yelp | Yelp | External System | Yelp business listing API | Web Scraping / HTTP |
| facebook | Facebook | External System | Facebook Business Pages | Web Scraping / HTTP |

### C2 (Containers) - New Services

| ID | Name | Type | Description | Technology |
|----|------|------|-------------|------------|
| bw-scraper | bw-scraper | Service | Rust background worker for web scraping | Rust 2021 / Playwright |
| scrape-job-db | scrape_job_db | Database | PostgreSQL tables for scrape job tracking | PostgreSQL |

### C3 (Components) - New Components

| ID | Name | Container | Description | Technology |
|----|------|-----------|-------------|------------|
| scrape-job-manager | ScrapeJobManager | bw-scraper | Manages scrape job lifecycle | Rust async struct |
| google-maps-scraper | GoogleMapsScraper | bw-scraper | Google Maps scraper implementation | Playwright + Rust |
| yelp-scraper | YelpScraper | bw-scraper | Yelp scraper implementation | Playwright + Rust |
| facebook-scraper | FacebookScraper | bw-scraper | Facebook scraper implementation | Playwright + Rust |
| etl-pipeline | ETLPipeline | bw-scraper | Data normalization pipeline | Rust async functions |
| business-importer | BusinessImporter | bw-scraper | PostgreSQL import with deduplication | sqlx |
| scraping-analytics | ScrapingAnalytics | bw-scraper | ClickHouse metrics logging | clickhouse-rs |

### C3.5 (Code) - New Types

| ID | Name | Container | Description | Technology |
|----|------|-----------|-------------|------------|
| scrapejob | ScrapeJob | bw-types | Scrape job entity (id, source, query, status, created_at) | Rust struct |
| scrapedbusiness | ScrapedBusiness | bw-types | Raw scraped business data | Rust struct |
| importbatch | ImportBatch | bw-types | Import batch tracking | Rust struct |

### Relationships

| Source | Target | Label | Technology |
|--------|--------|-------|------------|
| bw-scraper | google-maps | Scrapes | HTTP / Playwright |
| bw-scraper | yelp | Scrapes | HTTP / Playwright |
| bw-scraper | facebook | Scrapes | HTTP / Playwright |
| bw-scraper | scrape-job-db | Reads/Writes | PostgreSQL |
| bw-scraper | nats | Publishes/Subscribes | NATS JetStream |
| bw-scraper | clickhouse | Writes | ClickHouse |
| black-owned-frontend | scrape-job-db | Reads/Writes | PostgreSQL (admin UI) |

---

## 6. Execution & Integration Strategy

### Parallel Tracks

**Track 1: Core Infrastructure**
- bw-scraper crate setup
- Database schema (scrape_jobs, scraped_businesses, import_batches)
- NATS JetStream configuration

**Track 2: Scraper Implementations**
- GoogleMapsScraper (priority 1)
- YelpScraper (priority 2)
- FacebookScraper (priority 3)

**Track 3: ETL & Import**
- ETL pipeline for data normalization
- BusinessImporter with deduplication logic
- ClickHouse analytics integration

**Track 4: Admin UI**
- Scrape job management pages
- Business review and approval interface

### Interface Contracts

| Provider | Consumer | Contract |
|----------|----------|----------|
| bw-scraper | Admin UI | REST API: `GET /api/admin/scrape-jobs`, `POST /api/admin/scrape-jobs`, `PUT /api/admin/scrape-jobs/:id/approve` |
| Scraper modules | ETL Pipeline | `ScrapedBusiness` struct with source-specific fields |
| ETL Pipeline | BusinessImporter | `NormalizedBusiness` struct matching Business schema |

### Dependency Order

1. **Infrastructure** (bw-scraper crate, database schema) — Foundation, no dependencies
2. **Scraper implementations** — Depends on infrastructure for job tracking
3. **ETL Pipeline** — Depends on scraper outputs
4. **BusinessImporter** — Depends on ETL normalized output
5. **Admin UI** — Depends on all backend APIs
6. **E2E Tests** — Depends on all features complete

---

## Technology Stack Table

| Layer | Technology | Version / Flavor | Constraint |
|-------|-----------|------------------|------------|
| Scraper Service | Rust | 2021 edition | Async runtime with tokio |
| Web Scraping | Playwright | Latest | Headless browser for JS-heavy sites |
| HTTP Client | reqwest | Latest | For non-Playwright requests |
| Database | PostgreSQL | 15+ | sqlx with type safety |
| Queue | NATS JetStream | 2.10+ | Async-nats with stream support |
| Analytics | ClickHouse | 23.8+ | clickhouse-rs driver |
| Cache | Valkey/Redis | 7.2+ | Rate limiting state |
| Frontend | Next.js | 16 | TypeScript, Tailwind, App Router |

---

## Notes

1. **Legal Considerations:** Implement robots.txt compliance, rate limiting, and consider using official APIs where available (e.g., Google Places API) to avoid ToS violations.

2. **Deduplication Strategy:** Use fuzzy matching on (business_name, phone, location) with Levenshtein distance threshold to identify duplicates before import.

3. **Rate Limiting:** Implement per-source rate limits to avoid triggering anti-bot measures. Use Valkey for distributed rate limit state.

4. **Progress Tracking:** Log scrape progress to ClickHouse for analytics and job resumption capability.

---

*Blueprint ready for Alfred to create Jira epic and stories.*
