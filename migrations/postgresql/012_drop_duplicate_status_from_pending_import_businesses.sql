-- Drop the code-dead duplicate_status column from pending_import_businesses.
-- Neither the Next app nor the Rust scraper reads or writes it (audit #64:
-- "Dead migration columns"). It was baked into 001 and redundantly re-added
-- by 006 (both cleaned up in the same change); this drops it from databases
-- that already carry it.

DROP INDEX IF EXISTS idx_pending_import_duplicate_status;
ALTER TABLE pending_import_businesses DROP CONSTRAINT IF EXISTS pending_import_businesses_duplicate_status_check;
ALTER TABLE pending_import_businesses DROP COLUMN IF EXISTS duplicate_status;
