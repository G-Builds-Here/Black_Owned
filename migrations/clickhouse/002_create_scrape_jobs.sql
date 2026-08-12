-- Scrape jobs tracking table for analytics
-- Tracks web scraping operations with success/failure status

CREATE TABLE IF NOT EXISTS scrape_jobs (
    id UUID,
    job_name String,
    target_url String,
    status String,  -- 'success', 'failed', 'running'
    error_message Nullable(String),
    items_scraped UInt32 DEFAULT 0,
    started_at DateTime64(6, 'UTC'),
    completed_at Nullable(DateTime64(6, 'UTC')),
    _version UInt64
) ENGINE = ReplacingMergeTree(_version)
ORDER BY id;

-- Index for efficient date-based queries (last 30 days default)
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_started_at ON scrape_jobs (started_at);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs (status);
