-- 016: Multi-location support.
--
-- A business can have multiple physical locations (e.g. Zeke's Kitchen &
-- Bar: Smyrna + Midtown Atlanta). The businesses.location / lat / lng
-- columns remain the PRIMARY location so the directory map pipeline is
-- untouched; everything else lives here.

CREATE TABLE IF NOT EXISTS business_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  label VARCHAR(255),
  address VARCHAR(500) NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_locations_business_id
  ON business_locations(business_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_locations_primary
  ON business_locations(business_id) WHERE is_primary = TRUE;

-- Backfill: one primary row per business that already has a location.
-- Idempotent: the NOT EXISTS guard makes re-runs no-ops.
INSERT INTO business_locations (business_id, label, address, lat, lng, is_primary)
SELECT b.id, NULL, b.location, b.lat, b.lng, TRUE
FROM businesses b
WHERE b.location IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM business_locations bl WHERE bl.business_id = b.id
  );
