-- Add analytics fields to scrape_jobs table
-- Supports metrics: total jobs, success rate, items scraped, businesses scraped, import rate, duration trends

-- Add columns for items scraped and completion tracking
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS items_scraped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Update status check constraint to include 'completed'
ALTER TABLE scrape_jobs DROP CONSTRAINT IF EXISTS scrape_jobs_status_check;
ALTER TABLE scrape_jobs ADD CONSTRAINT scrape_jobs_status_check CHECK (status IN ('success', 'failed', 'running', 'completed', 'pending'));

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_started_at ON scrape_jobs (started_at DESC);
