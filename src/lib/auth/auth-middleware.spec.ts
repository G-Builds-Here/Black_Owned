/**
 * Auth Middleware Tests
 *
 * Tests for JWT authentication middleware functionality.
 */

import {
  extractToken,
  verifyToken,
  AuthenticatedUser,
} from '../auth/auth-middleware';
import jwt from 'jsonwebtoken';

// Mock JWT_SECRET
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';

describe('Auth Middleware', () => {
  describe('extractToken', () => {
    it('should extract token from Authorization header', () => {
      const token = 'test-jwt-token';
      const request = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      };

      const result = extractToken(request as never);
      expect(result).toBe(token);
    });

    it('should return null when no token found', () => {
      const request = {
        headers: {},
      };

      const result = extractToken(request as never);
      expect(result).toBeNull();
    });

    it('should extract token from query parameter', () => {
      const token = 'query-token';
      const request = {
        headers: {},
        query: { token },
      };

      const result = extractToken(request as never);
      expect(result).toBe(token);
    });
  });

  describe('verifyToken', () => {
    it('should decode valid token', () => {
      const payload = {
        userId: 'test-user-id',
        email: 'test@example.com',
      };
      const token = jwt.sign(payload, process.env.JWT_SECRET!);

      const result = verifyToken(token);
      expect(result.userId).toBe(payload.userId);
      expect(result.email).toBe(payload.email);
    });

    it('should throw for expired token', () => {
      const payload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };
      const token = jwt.sign(payload, process.env.JWT_SECRET!);

      expect(() => verifyToken(token)).toThrow(expect.objectContaining({ type: 'expired_token' }));
    });

    it('should throw for invalid token', () => {
      expect(() => verifyToken('invalid-token')).toThrow(expect.objectContaining({ type: 'invalid_token' }));
    });
  });
});
