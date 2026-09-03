-- 018: Location-aware reviews.
--
-- A review targets a specific physical location of a business (e.g. one of
-- Zeke's two locations). The column is nullable: reviews can outlive their
-- location row (ON DELETE SET NULL), and businesses without location rows
-- keep working. The review write path defaults to the business's primary
-- location so existing flows are unaffected.
--
-- Per-location rating/review_count aggregates and location_images are
-- deliberately NOT added yet: there are zero reviews and zero images in
-- the database, so those columns would be dead weight. They are a
-- one-line extension when the review write / image upload features land.

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS location_id UUID
  REFERENCES business_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_location ON reviews(location_id);
