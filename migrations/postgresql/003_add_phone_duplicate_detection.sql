-- Add phone and potential_duplicate_id columns for duplicate detection
-- Implements LOC-0066-AC1: Detect exact phone number match

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS potential_duplicate_id UUID;

-- Add index for efficient phone lookups
CREATE INDEX IF NOT EXISTS idx_businesses_phone ON businesses(phone) WHERE phone IS NOT NULL;

-- Add foreign key constraint for potential_duplicate_id (references same table)
ALTER TABLE businesses
ADD CONSTRAINT fk_potential_duplicate
FOREIGN KEY (potential_duplicate_id) REFERENCES businesses(id) ON DELETE SET NULL;
