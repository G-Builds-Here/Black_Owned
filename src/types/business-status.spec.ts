/**
 * Business Status Type Tests
 *
 * Tests for the BusinessStatus enum and validation functions
 * AC: LOC-0073-AC1
 */

import { BusinessStatus, isValidBusinessStatus, VALID_BUSINESS_STATUSES } from './business-status';

describe('BusinessStatus', () => {
  describe('enum values', () => {
    it('should have PENDING_REVIEW status', () => {
      expect(BusinessStatus.PENDING_REVIEW).toBe('pending_review');
    });

    it('should have APPROVED status', () => {
      expect(BusinessStatus.APPROVED).toBe('approved');
    });

    it('should have REJECTED status', () => {
      expect(BusinessStatus.REJECTED).toBe('rejected');
    });

    it('should have exactly 3 status values', () => {
      expect(Object.values(BusinessStatus).length).toBe(3);
    });
  });

  describe('VALID_BUSINESS_STATUSES', () => {
    it('should contain all valid status values', () => {
      expect(VALID_BUSINESS_STATUSES).toEqual([
        'pending_review',
        'approved',
        'rejected',
      ]);
    });

    it('should be an array', () => {
      expect(Array.isArray(VALID_BUSINESS_STATUSES)).toBe(true);
    });
  });

  describe('isValidBusinessStatus', () => {
    it('should return true for pending_review', () => {
      expect(isValidBusinessStatus('pending_review')).toBe(true);
    });

    it('should return true for approved', () => {
      expect(isValidBusinessStatus('approved')).toBe(true);
    });

    it('should return true for rejected', () => {
      expect(isValidBusinessStatus('rejected')).toBe(true);
    });

    it('should return false for invalid status', () => {
      expect(isValidBusinessStatus('invalid_status')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidBusinessStatus('')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidBusinessStatus(null as unknown as string)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidBusinessStatus(undefined as unknown as string)).toBe(false);
    });

    it('should return false for random strings', () => {
      expect(isValidBusinessStatus('pending')).toBe(false);
      expect(isValidBusinessStatus('active')).toBe(false);
      expect(isValidBusinessStatus('completed')).toBe(false);
    });
  });
});
