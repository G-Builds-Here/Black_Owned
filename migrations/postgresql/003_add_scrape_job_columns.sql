-- Add result_count and error_message columns to scrape_jobs table
-- Supports the updateScrapeJobStatus function for tracking job results

ALTER TABLE scrape_jobs
ADD COLUMN IF NOT EXISTS result_count INTEGER,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Create index on result_count for filtering completed jobs by result size
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_result_count ON scrape_jobs(result_count);
