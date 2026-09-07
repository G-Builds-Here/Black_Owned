-- Add geolocation columns so the directory map can place pins.
-- Populated by scripts/geocode-locations.mjs (OpenStreetMap Nominatim).

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

ALTER TABLE pending_import_businesses
ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
