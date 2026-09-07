-- 019: Consumer-facing contact fields.
--
-- phone / menu_url: real columns instead of values folded into the
-- description text (the old importer had no dedicated columns).
-- rating_source: which external platform the scraped
-- rating/review_count aggregate came from (default 'google' — all
-- historical scrapes were Google Maps).
--
-- Photos and menus are stored as EXTERNAL URLs (menu_url, image_url),
-- never as files: no MinIO/object storage involved.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS menu_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS rating_source VARCHAR(32) NOT NULL DEFAULT 'google';

-- Backfill phones captured at scrape time (scraped_businesses.phone).
UPDATE businesses b
SET phone = s.phone
FROM scraped_businesses s
WHERE s.name = b.name
  AND s.phone IS NOT NULL
  AND b.phone IS NULL;
