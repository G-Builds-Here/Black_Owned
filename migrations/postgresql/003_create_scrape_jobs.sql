-- Scrape jobs tracking table (canonical schema)
-- Single source of truth: matches src/lib/db/scrape-job-repository.ts
-- (initializeScrapeJobSchema) and src/types/scrape-job.ts (ScrapeJobStatus).
--
-- Supersedes the former analytics variant (job_name/target_url/items_scraped),
-- the duplicate 003 result_count migration, and 005_add_scrape_analytics_fields.
-- The live columns are source/query/location/business_count; started_at and
-- completed_at support duration analytics.

CREATE TABLE IF NOT EXISTS scrape_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(255) NOT NULL,
    query TEXT NOT NULL,
    location VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    business_count INTEGER,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT scrape_jobs_status_check
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

-- Idempotent upgrades for databases created before the analytics columns existed
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Reconcile the status check constraint (older databases may lack it or carry
-- the legacy success/failed/running-only variant)
ALTER TABLE scrape_jobs DROP CONSTRAINT IF EXISTS scrape_jobs_status_check;
ALTER TABLE scrape_jobs ADD CONSTRAINT scrape_jobs_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs (status);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_created_at ON scrape_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_started_at ON scrape_jobs (started_at DESC);
