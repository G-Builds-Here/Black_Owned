-- 013: Backfill the reviews table into the migration chain and add the
-- "visible" soft-hide flag used by review moderation (LOC-0037 AC4).
--
-- The reviews table existed in live Postgres without any migration
-- (created by the Rust bw-api before it was retired from compose).
-- CREATE TABLE IF NOT EXISTS keeps this idempotent on the live DB while
-- making fresh installs correct.

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  user_id uuid NOT NULL,
  rating smallint NOT NULL,
  comment text NOT NULL,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reviews_business ON reviews (business_id);

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT TRUE;
