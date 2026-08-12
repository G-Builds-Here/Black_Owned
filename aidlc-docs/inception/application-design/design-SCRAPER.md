---
stage: application-design
source: Architect
ticket: SCRAPER
timestamp: 2026-08-01T17:28:38Z
---

# Application Design — SCRAPER

**Gotham Pipeline** · Architect → alfred
**Environment:** N/A
**Mode:** N/A
**Current step:** complete
**Entry:** epic
**Escalation From:** -
**Confidence:** High
**Blueprint Path:** C:/Users/Merlin/Documents/repos/Black_Owned/aidlc-docs/inception/planning/SCRAPER/Implementation-Blueprint.md
**Delta HTML Path:** C:/Users/Merlin/Documents/repos/Black_Owned/aidlc-docs/inception/planning/SCRAPER/c4-delta.html
**Delta Spec Path:** C:/Users/Merlin/Documents/repos/Black_Owned/aidlc-docs/inception/planning/SCRAPER/delta-spec.json
**Epic Summary:** Web scraper service for acquiring business listings from external sources (Google Maps, Yelp, Facebook) with automated ETL, deduplication, and admin review workflow
**Target Directories:** bw-scraper/, bw-scraper/src/scrapers/, bw-scraper/src/etl/, bw-scraper/src/importer/, src/app/admin/scraping/, bw-types/src/scraping.rs
**technology_stack:** [{'layer': 'Scraper Service', 'technology': 'Rust 2021', 'constraint': 'Async runtime with tokio'}, {'layer': 'Web Scraping', 'technology': 'Playwright', 'constraint': 'Headless browser for JS-heavy sites'}, {'layer': 'Database', 'technology': 'PostgreSQL', 'constraint': 'sqlx with type safety'}, {'layer': 'Queue', 'technology': 'NATS JetStream', 'constraint': 'Async-nats with stream support'}, {'layer': 'Analytics', 'technology': 'ClickHouse', 'constraint': 'clickhouse-rs driver'}, {'layer': 'Frontend', 'technology': 'Next.js', 'constraint': 'TypeScript, Tailwind, App Router'}]

**Stories:**
| id | name | user_behavior | type | draft_acs | component | layer | parallel | moscow | depends_on | contract_acs | testability |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STORY-01 | ScrapeJobManager: create scrape job | Admin can start a scrape job for a source | feature | ['Can create a scrape job specifying source (GoogleMaps/Yelp/Facebook), search query, and geographic area'] | scrape-job-manager | handler | True | must | [] | [] | requires: postgres, nats |
| STORY-02 | GoogleMapsScraper: scrape Google Maps | System scrapes businesses from external sources | feature | ['Can extract business name, address, phone, website, category, rating, reviews from Google Maps search results'] | google-maps-scraper | service | True | must | [] | [] | requires: playwright, mock-server for ToS compliance tests |
| STORY-03 | YelpScraper: scrape Yelp | System scrapes businesses from external sources | feature | ['Can extract business name, address, phone, website, category, rating, reviews from Yelp search results'] | yelp-scraper | service | True | should | [] | [] | requires: playwright, mock-server |
| STORY-04 | FacebookScraper: scrape Facebook | System scrapes businesses from external sources | feature | ['Can extract business name, address, phone, website, category from Facebook Business Pages'] | facebook-scraper | service | True | could | [] | [] | requires: playwright |
| STORY-05 | ETLPipeline: normalize scraped data | Scraped data is normalized to business schema | feature | ['Can transform raw scraped data into normalized Business format with validated fields'] | etl-pipeline | service | True | must | [] | [] | standard unit tests |
| STORY-06 | BusinessImporter: import to PostgreSQL | Normalized businesses are imported to database | feature | ['Can import normalized businesses with deduplication against existing listings'] | business-importer | repository | True | must | ['STORY-05'] | [] | requires: postgres |
| STORY-07 | ScrapeJobAPI: query scrape jobs | Admin can view scrape job status and results | feature | ['Can list scrape jobs with status (pending/running/completed/failed) and view imported business count'] | scrape-job-api | controller | True | must | [] | [] | requires: postgres |
| STORY-08 | BusinessReviewUI: review scraped businesses | Admin can review and approve scraped businesses | feature | ['Can review scraped businesses in bulk, approve for import or reject with reason'] | business-review-ui | controller | True | should | ['STORY-07'] | [] | requires: postgres |
| STORY-09 | ScrapingAnalytics: record scrape metrics | System tracks scraping metrics for analytics | feature | ['Can log scrape job duration, businesses found, imported, rejected to ClickHouse'] | scraping-analytics | infrastructure | True | should | [] | [] | requires: clickhouse |
| STORY-10 | bw-scraper: Rust worker crate | Infrastructure: Scraper service runs as background worker | infrastructure | ['Can run as standalone binary with NATS JetStream consumer for scrape jobs'] | bw-scraper | infrastructure | True | must | [] | [] | N/A |
| STORY-11 | ScrapeJobSchema: create tables | Infrastructure: Database schema for scrape jobs | infrastructure | ['Can create scrape_jobs, scraped_businesses, import_batches tables with proper indexes'] | scrape-job-schema | infrastructure | True | must | [] | [] | requires: postgres |
| STORY-12 | AdminScrapingUI: scraping management pages | Infrastructure: Admin scraping pages | infrastructure | ['Can view scrape jobs, review businesses, approve/reject imports'] | admin-scraping-ui | controller | True | must | [] | [] | standard unit tests |
| STORY-13 | E2E: scraper integration tests | E2E: End-to-end scrape workflow | test | ['Can create a scrape job, run it, review results, approve businesses, verify they appear in directory'] | N/A | test | False | must | ['STORY-01', 'STORY-02', 'STORY-05', 'STORY-06', 'STORY-07', 'STORY-08'] | [] | requires: postgres, nats, playwright |
