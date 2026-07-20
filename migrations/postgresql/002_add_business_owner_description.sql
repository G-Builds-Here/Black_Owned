-- Add owner_id and description columns to businesses table
-- This migration supports the createBusiness mutation with owner tracking

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS owner_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
ADD COLUMN IF NOT EXISTS description TEXT;

-- Update the default to allow NULL during migration, then set NOT NULL constraint
ALTER TABLE businesses
ALTER COLUMN owner_id DROP DEFAULT;

-- Add index for owner lookups
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses(owner_id);
