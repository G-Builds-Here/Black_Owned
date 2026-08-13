-- Add duplicate_status field to pending_import_businesses table
-- Supports AC LOC-0066-AC4: Skip dedup for businesses with no match
-- When no existing businesses match, business is marked as "new" and import proceeds

ALTER TABLE pending_import_businesses ADD COLUMN IF NOT EXISTS duplicate_status VARCHAR(20) NOT NULL DEFAULT 'new';

-- Update constraint to include new status values
ALTER TABLE pending_import_businesses DROP CONSTRAINT IF EXISTS pending_import_businesses_status_check;
ALTER TABLE pending_import_businesses ADD CONSTRAINT pending_import_businesses_duplicate_status_check
  CHECK (duplicate_status IN ('new', 'potential_duplicate', 'skipped'));

-- Create index for duplicate status filtering
CREATE INDEX IF NOT EXISTS idx_pending_import_duplicate_status ON pending_import_businesses(duplicate_status);
