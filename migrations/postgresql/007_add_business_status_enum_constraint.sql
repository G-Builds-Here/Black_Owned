-- Add business status enum constraint to pending_import_businesses table
-- AC: LOC-0073-AC1 - Create pending_review status enum and database schema
--
-- This migration:
-- 1. Drops the existing VARCHAR status check constraint (if exists)
-- 2. Adds a CHECK constraint enforcing the three valid status values
-- 3. Ensures data integrity at the database level

-- Drop existing status check constraint if it exists
ALTER TABLE pending_import_businesses
  DROP CONSTRAINT IF EXISTS pending_import_businesses_status_check;

-- Add CHECK constraint for status enum values
ALTER TABLE pending_import_businesses
  ADD CONSTRAINT pending_import_businesses_status_check
  CHECK (status IN ('pending_review', 'approved', 'rejected'));

-- Add comment documenting the status lifecycle
COMMENT ON COLUMN pending_import_businesses.status IS
  'Business lifecycle status: pending_review (initial), approved (ready for import), rejected (discarded)';
