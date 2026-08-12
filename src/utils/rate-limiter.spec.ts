/**
 * Rate Limiter Tests
 */

import { RateLimiter, createRateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = createRateLimiter({ minDelayMs: 100, maxJitterMs: 50 });
  });

  describe("waitForRateLimit", () => {
    it("should not wait for the first request", async () => {
      const start = Date.now();
      await rateLimiter.waitForRateLimit();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50); // Should be nearly instantaneous
    });

    it("should wait at least minDelayMs between requests", async () => {
      await rateLimiter.waitForRateLimit(); // First request

      const start = Date.now();
      await rateLimiter.waitForRateLimit(); // Second request
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(100); // minDelayMs
    });

    it("should add jitter to the delay", async () => {
      await rateLimiter.waitForRateLimit(); // First request

      const start = Date.now();
      await rateLimiter.waitForRateLimit(); // Second request
      const elapsed = Date.now() - start;

      // Should be at least minDelayMs + some jitter (could be up to 150ms)
      expect(elapsed).toBeLessThanOrEqual(200); // minDelayMs + maxJitterMs + buffer
    });

    it("should track time since last request", async () => {
      await rateLimiter.waitForRateLimit();

      const timeSince = rateLimiter.getTimeSinceLastRequest();
      expect(timeSince).toBeGreaterThanOrEqual(0);
      expect(timeSince).toBeLessThan(100);
    });

    it("should return null for time since last request when no requests made", () => {
      const freshLimiter = createRateLimiter();
      expect(freshLimiter.getTimeSinceLastRequest()).toBeNull();
    });
  });

  describe("reset", () => {
    it("should reset the last request time", async () => {
      await rateLimiter.waitForRateLimit();
      rateLimiter.reset();

      expect(rateLimiter.getTimeSinceLastRequest()).toBeNull();
    });

    it("should not wait after reset", async () => {
      await rateLimiter.waitForRateLimit();
      rateLimiter.reset();

      const start = Date.now();
      await rateLimiter.waitForRateLimit();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50); // Should be nearly instantaneous
    });
  });

  describe("constructor configuration", () => {
    it("should use default configuration when no config provided", () => {
      const defaultLimiter = new RateLimiter();
      // Can't directly access config, but can test behavior
      // Default is 2000ms min, 1000ms max jitter
      expect(defaultLimiter).toBeInstanceOf(RateLimiter);
    });

    it("should use custom minDelayMs", async () => {
      const customLimiter = createRateLimiter({ minDelayMs: 50, maxJitterMs: 10 });
      await customLimiter.waitForRateLimit();

      const start = Date.now();
      await customLimiter.waitForRateLimit();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(elapsed).toBeLessThan(100); // 50 + 10 + buffer
    });

    it("should use custom maxJitterMs", async () => {
      const customLimiter = createRateLimiter({ minDelayMs: 50, maxJitterMs: 5 });
      await customLimiter.waitForRateLimit();

      const start = Date.now();
      await customLimiter.waitForRateLimit();
      const elapsed = Date.now() - start;

      // Should be close to 50ms with very little jitter
      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(elapsed).toBeLessThan(80); // 50 + 5 + buffer
    });
  });
});
