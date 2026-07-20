/**
 * User Management Types Tests
 *
 * Tests for user role and status validation utilities.
 */

import {
  isValidRole,
  isValidStatus,
  getRoleLabel,
  getStatusLabel,
  getStatusVariant,
  UserRole,
  UserStatus,
} from './user-management';

describe('User Management Types', () => {
  describe('isValidRole', () => {
    it('should return true for valid roles', () => {
      expect(isValidRole('user')).toBe(true);
      expect(isValidRole('business_owner')).toBe(true);
      expect(isValidRole('admin')).toBe(true);
    });

    it('should return false for invalid roles', () => {
      expect(isValidRole('super_admin')).toBe(false);
      expect(isValidRole('moderator')).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole('unknown')).toBe(false);
    });
  });

  describe('isValidStatus', () => {
    it('should return true for valid statuses', () => {
      expect(isValidStatus('active')).toBe(true);
      expect(isValidStatus('inactive')).toBe(true);
      expect(isValidStatus('suspended')).toBe(true);
    });

    it('should return false for invalid statuses', () => {
      expect(isValidStatus('banned')).toBe(false);
      expect(isValidStatus('pending')).toBe(false);
      expect(isValidStatus('')).toBe(false);
      expect(isValidStatus('unknown')).toBe(false);
    });
  });

  describe('getRoleLabel', () => {
    it('should return correct labels for each role', () => {
      expect(getRoleLabel('user')).toBe('User');
      expect(getRoleLabel('business_owner')).toBe('Business Owner');
      expect(getRoleLabel('admin')).toBe('Admin');
    });
  });

  describe('getStatusLabel', () => {
    it('should return correct labels for each status', () => {
      expect(getStatusLabel('active')).toBe('Active');
      expect(getStatusLabel('inactive')).toBe('Inactive');
      expect(getStatusLabel('suspended')).toBe('Suspended');
    });
  });

  describe('getStatusVariant', () => {
    it('should return correct variants for each status', () => {
      expect(getStatusVariant('active')).toBe('success');
      expect(getStatusVariant('inactive')).toBe('default');
      expect(getStatusVariant('suspended')).toBe('error');
    });
  });
});
