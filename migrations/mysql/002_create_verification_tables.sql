-- Verification Queue Tables for Business Document Review
-- This migration creates the tables needed for the admin verification workflow

-- Table to store verification submissions
CREATE TABLE IF NOT EXISTS business_verifications (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    document_urls JSON NOT NULL COMMENT 'Array of document URLs',
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    reviewed_by VARCHAR(36) NULL COMMENT 'Admin user ID who reviewed',
    rejection_reason TEXT NULL,
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    INDEX idx_status (status),
    INDEX idx_business_id (business_id),
    INDEX idx_submitted_at (submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add is_verified column to businesses if not exists
ALTER TABLE businesses 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;
