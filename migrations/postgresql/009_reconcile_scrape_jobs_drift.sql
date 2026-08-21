-- 009: Reconcile the live scrape_jobs table with the 001 canonical shape.
--
-- The live table predates the canonical DDL: source/location/status are
-- wider than the spec, business_count is NOT NULL with a DEFAULT 0, and
-- created_at/updated_at are naive (without time zone) timestamps. Fresh
-- databases already match 001, so every step is guarded and becomes a
-- no-op there.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scrape_jobs' AND column_name = 'source'
      AND character_maximum_length <> 255
  ) THEN
    ALTER TABLE scrape_jobs ALTER COLUMN source TYPE VARCHAR(255);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scrape_jobs' AND column_name = 'location'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE scrape_jobs ALTER COLUMN location TYPE VARCHAR(255);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scrape_jobs' AND column_name = 'status'
      AND character_maximum_length <> 20
  ) THEN
    ALTER TABLE scrape_jobs ALTER COLUMN status TYPE VARCHAR(20);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scrape_jobs' AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    -- Live timestamps are naive UTC (container TZ is UTC); interpret as UTC.
    ALTER TABLE scrape_jobs
      ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING created_at AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scrape_jobs' AND column_name = 'updated_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE scrape_jobs
      ALTER COLUMN updated_at TYPE TIMESTAMPTZ
      USING updated_at AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scrape_jobs' AND column_name = 'business_count'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE scrape_jobs ALTER COLUMN business_count DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scrape_jobs' AND column_name = 'business_count'
      AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE scrape_jobs ALTER COLUMN business_count DROP DEFAULT;
  END IF;
END
$$;
