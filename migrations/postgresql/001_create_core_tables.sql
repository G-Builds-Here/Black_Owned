-- 001: Core schema baseline.
--
-- Snapshot of the verified schema: every table the app uses, in its current
-- reconciled shape. Ordering is foreign-key safe (users -> businesses,
-- scrape_jobs -> scraped_businesses). Later migrations are idempotent
-- history: on a fresh database most are no-ops, and on the live database
-- 004/007/009 close the remaining gaps.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category_id VARCHAR(100) NOT NULL,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified',
  location VARCHAR(255),
  rating DECIMAL DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  image_url TEXT,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses(owner_id);

CREATE TABLE IF NOT EXISTS pending_import_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending_review',
  source VARCHAR(50) NOT NULL,
  source_data JSONB,
  job_id UUID,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_import_status ON pending_import_businesses(status);
CREATE INDEX IF NOT EXISTS idx_pending_import_name ON pending_import_businesses(name);
CREATE INDEX IF NOT EXISTS idx_pending_import_job_id ON pending_import_businesses(job_id);

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

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_created_at ON scrape_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_started_at ON scrape_jobs(started_at DESC);

CREATE TABLE IF NOT EXISTS scraped_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_job_id UUID NOT NULL REFERENCES scrape_jobs(id) ON DELETE CASCADE,
  source VARCHAR(20) NOT NULL,
  name VARCHAR(500) NOT NULL,
  address TEXT,
  phone VARCHAR(50),
  website VARCHAR(500),
  category VARCHAR(255),
  rating DECIMAL(3,2),
  review_count INTEGER,
  source_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraped_businesses_job_id ON scraped_businesses(scrape_job_id);
CREATE INDEX IF NOT EXISTS idx_scraped_businesses_source ON scraped_businesses(source);
CREATE INDEX IF NOT EXISTS idx_scraped_businesses_job_source ON scraped_businesses(scrape_job_id, source);
