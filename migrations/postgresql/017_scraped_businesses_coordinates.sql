-- 017: Coordinates on scraped_businesses.
--
-- Google Maps place URLs embed coordinates as `!3d<lat>!4d<lng>`; the
-- scraper now extracts them (see bw-scraper etl) and stores them here so
-- promotion into `businesses` can carry real pins instead of relying on
-- the geocode backfill script alone.

ALTER TABLE scraped_businesses
ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- Backfill the historical google_maps rows from their embedded URL coords.
UPDATE scraped_businesses s
SET lat = substring(s.source_id FROM '!3d(-?[0-9.]+)')::double precision,
    lng = substring(s.source_id FROM '!4d(-?[0-9.]+)')::double precision
WHERE s.source = 'google_maps'
  AND s.lat IS NULL
  AND s.source_id LIKE '%!3d%!4d%';
