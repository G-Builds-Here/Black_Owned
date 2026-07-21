import {
  checkRateLimit,
  createRateLimitResponse,
  getClientIP,
  getAuthToken,
  resetRateLimit,
  clearRateLimitStore,
  type RateLimitConfig,
} from './rate-limiter';

describe('Rate Limiter', () => {
  const testConfig: RateLimitConfig = {
    authenticatedLimit: 100,
    unauthenticatedLimit: 30,
    windowMs: 60 * 1000,
  };

  beforeEach(() => {
    clearRateLimitStore();
  });

  describe('getClientIP', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const request = new Request('http://example.com', {
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        },
      });

      expect(getClientIP(request)).toBe('192.168.1.1');
    });

    it('should extract IP from x-real-ip header', () => {
      const request = new Request('http://example.com', {
        headers: {
          'x-real-ip': '192.168.1.1',
        },
      });

      expect(getClientIP(request)).toBe('192.168.1.1');
    });

    it('should return unknown when no IP headers present', () => {
      const request = new Request('http://example.com');
      expect(getClientIP(request)).toBe('unknown');
    });
  });

  describe('getAuthToken', () => {
    it('should extract Bearer token from authorization header', () => {
      const request = new Request('http://example.com', {
        headers: {
          authorization: 'Bearer test-token-123',
        },
      });

      expect(getAuthToken(request)).toBe('test-token-123');
    });

    it('should return null when no authorization header', () => {
      const request = new Request('http://example.com');
      expect(getAuthToken(request)).toBeNull();
    });

    it('should return null for non-Bearer auth', () => {
      const request = new Request('http://example.com', {
        headers: {
          authorization: 'Basic abc123',
        },
      });

      expect(getAuthToken(request)).toBeNull();
    });
  });

  describe('checkRateLimit - authenticated users', () => {
    it('should allow requests under the limit', () => {
      const token = 'user-token-123';
      const request = new Request('http://example.com', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const result = checkRateLimit(request, {
        ...testConfig,
        authenticatedLimit: 100,
        unauthenticatedLimit: 30,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('should reject requests over the authenticated limit', () => {
      const token = 'user-token-456';
      const request = new Request('http://example.com', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        checkRateLimit(request, {
          ...testConfig,
          authenticatedLimit: 100,
          unauthenticatedLimit: 30,
        });
      }

      // 101st request should be rejected
      const result = checkRateLimit(request, {
        ...testConfig,
        authenticatedLimit: 100,
        unauthenticatedLimit: 30,
      });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('checkRateLimit - unauthenticated IPs', () => {
    it('should allow requests under the limit', () => {
      const request = new Request('http://example.com', {
        headers: {
          'x-forwarded-for': '192.168.1.100',
        },
      });

      const result = checkRateLimit(request, {
        ...testConfig,
        authenticatedLimit: 100,
        unauthenticatedLimit: 30,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(29);
    });

    it('should reject requests over the unauthenticated limit', () => {
      const request = new Request('http://example.com', {
        headers: {
          'x-forwarded-for': '192.168.1.200',
        },
      });

      // Make 30 requests
      for (let i = 0; i < 30; i++) {
        checkRateLimit(request, {
          ...testConfig,
          authenticatedLimit: 100,
          unauthenticatedLimit: 30,
        });
      }

      // 31st request should be rejected
      const result = checkRateLimit(request, {
        ...testConfig,
        authenticatedLimit: 100,
        unauthenticatedLimit: 30,
      });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('createRateLimitResponse', () => {
    it('should create a 429 response with correct headers', async () => {
      const response = createRateLimitResponse(45);

      expect(response.status).toBe(429);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Retry-After')).toBe('45');

      const body = await response.json();
      expect(body.error).toBe('Too Many Requests');
      expect(body.retryAfter).toBe(45);
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for a specific key', () => {
      const token = 'reset-test-token';
      const request = new Request('http://example.com', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      // Use up the limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit(request, {
          ...testConfig,
          authenticatedLimit: 100,
          unauthenticatedLimit: 30,
        });
      }

      // Should be rejected
      let result = checkRateLimit(request, {
        ...testConfig,
        authenticatedLimit: 100,
        unauthenticatedLimit: 30,
      });
      expect(result.allowed).toBe(false);

      // Reset and should be allowed again
      resetRateLimit(`token:${token}`);
      result = checkRateLimit(request, {
        ...testConfig,
        authenticatedLimit: 100,
        unauthenticatedLimit: 30,
      });
      expect(result.allowed).toBe(true);
    });
  });
});
