/**
 * Rate Limiter - Per-token and per-IP request limiting
 *
 * Limits:
 * - Authenticated users: 100 requests per minute (tracked by auth token)
 * - Unauthenticated IPs: 30 requests per minute (tracked by IP address)
 */

export interface RateLimitConfig {
  authenticatedLimit: number;
  unauthenticatedLimit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  authenticatedLimit: 100,
  unauthenticatedLimit: 30,
  windowMs: 60 * 1000, // 60 seconds
};

interface RequestState {
  count: number;
  windowStart: number;
}

// In-memory store for rate limiting (replace with Redis in production)
const rateLimitStore = new Map<string, RequestState>();

/**
 * Get the client IP from a request
 */
export function getClientIP(request: Request): string {
  // Check for forwarded headers (behind proxy/load balancer)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  // Check for real-ip header
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Fall back to socket address (Next.js middleware provides this)
  const socketAddress = (request as unknown as { socket?: { remoteAddress?: string } }).socket?.remoteAddress;
  if (socketAddress) {
    // Handle IPv6-mapped IPv4 addresses
    return socketAddress.replace('::ffff:', '');
  }

  return 'unknown';
}

/**
 * Get the auth token from a request
 */
export function getAuthToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return null;
  }

  // Bearer token format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Check and update rate limit for a given key
 */
function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || now - existing.windowStart >= config.windowMs) {
    // New window
    rateLimitStore.set(key, {
      count: 1,
      windowStart: now,
    });

    return {
      allowed: true,
      remaining: config.authenticatedLimit - 1,
      resetTime: now + config.windowMs,
    };
  }

  // Existing window - increment counter
  existing.count++;

  const remaining = Math.max(0, config.authenticatedLimit - existing.count);
  const resetTime = existing.windowStart + config.windowMs;
  const retryAfter = Math.ceil((resetTime - now) / 1000);

  if (existing.count > config.authenticatedLimit) {
    return {
      allowed: false,
      remaining: 0,
      resetTime,
      retryAfter,
    };
  }

  return {
    allowed: true,
    remaining,
    resetTime,
  };
}

/**
 * Check rate limit for a request
 * @returns RateLimitResult with allowed status and metadata
 */
export function checkRateLimit(request: Request, config: RateLimitConfig = DEFAULT_CONFIG): RateLimitResult {
  const token = getAuthToken(request);
  const ip = getClientIP(request);

  // Use token for authenticated users, IP for unauthenticated
  const limitKey = token ? `token:${token}` : `ip:${ip}`;
  const limit = token ? config.authenticatedLimit : config.unauthenticatedLimit;

  // Create a temporary config with the correct limit for this request
  const requestConfig: RateLimitConfig = {
    ...config,
    authenticatedLimit: limit,
    unauthenticatedLimit: limit,
  };

  return checkRateLimitInternal(limitKey, requestConfig);
}

/**
 * Internal rate limit checker with explicit limit per key
 */
function checkRateLimitInternal(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || now - existing.windowStart >= config.windowMs) {
    // New window
    rateLimitStore.set(key, {
      count: 1,
      windowStart: now,
    });

    return {
      allowed: true,
      remaining: config.authenticatedLimit - 1,
      resetTime: now + config.windowMs,
    };
  }

  // Existing window - increment counter
  existing.count++;

  const remaining = Math.max(0, config.authenticatedLimit - existing.count);
  const resetTime = existing.windowStart + config.windowMs;
  const retryAfter = Math.ceil((resetTime - now) / 1000);

  if (existing.count > config.authenticatedLimit) {
    return {
      allowed: false,
      remaining: 0,
      resetTime,
      retryAfter,
    };
  }

  return {
    allowed: true,
    remaining,
    resetTime,
  };
}

/**
 * Create a 429 response with Retry-After header
 */
export function createRateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Limit': DEFAULT_CONFIG.authenticatedLimit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': Date.now().toString(),
      },
    }
  );
}

/**
 * Reset rate limit for a specific key (useful for testing)
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Clear all rate limit data (useful for testing)
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}
