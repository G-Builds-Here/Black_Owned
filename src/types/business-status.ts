/**
 * Business Status Enum
 *
 * Defines the lifecycle states for businesses in the pending_import_businesses table.
 * Used for AC LOC-0073-AC1: Create pending_review status enum and database schema
 */

export enum BusinessStatus {
  /** Initial state when business is imported and awaiting review */
  PENDING_REVIEW = 'pending_review',
  /** Business has been approved and is ready for final import */
  APPROVED = 'approved',
  /** Business has been rejected and will not be imported */
  REJECTED = 'rejected',
}

/**
 * Array of all valid BusinessStatus values for validation
 */
export const VALID_BUSINESS_STATUSES = Object.values(BusinessStatus);

/**
 * Type guard to validate if a string is a valid BusinessStatus
 */
export function isValidBusinessStatus(status: string): status is BusinessStatus {
  return VALID_BUSINESS_STATUSES.includes(status as BusinessStatus);
}
