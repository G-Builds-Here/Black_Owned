/**
 * Rate Limiter Utility
 *
 * Provides rate limiting with minimum delay and random jitter to prevent
 * pattern detection by target servers.
 */

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Minimum delay between requests in milliseconds (default: 2000) */
  minDelayMs: number;
  /** Maximum jitter to add in milliseconds (default: 1000, giving 2-3s range) */
  maxJitterMs: number;
}

/**
 * Rate limiter class that tracks request timing
 */
export class RateLimiter {
  private config: Required<RateLimiterConfig>;
  private lastRequestTime: number | null = null;

  constructor(config: RateLimiterConfig = { minDelayMs: 2000, maxJitterMs: 1000 }) {
    this.config = {
      minDelayMs: config.minDelayMs ?? 2000,
      maxJitterMs: config.maxJitterMs ?? 1000,
    };
  }

  /**
   * Wait until the rate limit allows the next request
   * @returns Promise that resolves when the request can be made
   */
  async waitForRateLimit(): Promise<void> {
    if (this.lastRequestTime === null) {
      // First request, no need to wait
      this.lastRequestTime = Date.now();
      return;
    }

    const elapsed = Date.now() - this.lastRequestTime;
    const jitter = Math.random() * this.config.maxJitterMs;
    const requiredDelay = this.config.minDelayMs + jitter;

    if (elapsed < requiredDelay) {
      const waitTime = requiredDelay - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Reset the rate limiter (e.g., before starting a new scrape session)
   */
  reset(): void {
    this.lastRequestTime = null;
  }

  /**
   * Get the time since the last request in milliseconds
   */
  getTimeSinceLastRequest(): number | null {
    if (this.lastRequestTime === null) {
      return null;
    }
    return Date.now() - this.lastRequestTime;
  }
}

/**
 * Creates a rate limiter with default configuration (2s minimum + up to 1s jitter)
 */
export function createRateLimiter(config?: RateLimiterConfig): RateLimiter {
  return new RateLimiter(config);
}
