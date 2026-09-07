-- Add website column for business contact information
-- Implements LOC-0062-AC3: Store website from Google Maps scraper

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS website VARCHAR(255);

-- Add index for efficient website lookups
CREATE INDEX IF NOT EXISTS idx_businesses_website ON businesses(website) WHERE website IS NOT NULL;
