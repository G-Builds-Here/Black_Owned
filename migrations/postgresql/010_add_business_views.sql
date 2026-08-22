-- Track public views of business detail pages.
-- Powers the owner dashboard's 30-day views chart (LOC-0043).

CREATE TABLE IF NOT EXISTS business_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_views_business_id ON business_views (business_id, viewed_at DESC);
