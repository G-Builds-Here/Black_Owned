-- Add social_urls column for discovered social media profiles
-- Task #70: port of black_wall_street social profile discovery (6 platforms)

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS social_urls JSONB;
