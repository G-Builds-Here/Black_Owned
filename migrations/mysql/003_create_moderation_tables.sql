-- Moderation Queue Tables for Review Moderation
-- This migration creates the tables needed for the admin moderation workflow

-- Add status and hide_reason columns to reviews table if not exists
ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS status ENUM('pending', 'approved', 'hidden') NOT NULL DEFAULT 'pending' COMMENT 'Review moderation status';

ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Whether review is visible to public';

ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP NULL COMMENT 'When admin reviewed the review';

ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(36) NULL COMMENT 'Admin user ID who reviewed';

ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS hide_reason TEXT NULL COMMENT 'Reason for hiding the review';

-- Add indexes for moderation queries
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_visible ON reviews(visible);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);
