-- 021: Add a separate card image column to businesses.
--
-- image_url continues to serve the wide detail-page hero.
-- card_image_url serves the near-square directory card image.
--
-- Idempotent: safe to re-run against databases that already have the column.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS card_image_url TEXT;
