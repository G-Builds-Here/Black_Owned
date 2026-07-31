import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit, createRateLimitResponse, getClientIP, getAuthToken } from './src/lib/rate-limiter';

const RATE_LIMIT_CONFIG = {
  authenticatedLimit: 100,
  unauthenticatedLimit: 30,
  windowMs: 60 * 1000, // 60 seconds
};

export function middleware(request: NextRequest) {
  // Check rate limit
  const rateLimitResult = checkRateLimit(request, RATE_LIMIT_CONFIG);

  if (!rateLimitResult.allowed) {
    const response = createRateLimitResponse(rateLimitResult.retryAfter!);
    return response;
  }

  // Add rate limit headers to successful responses
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', RATE_LIMIT_CONFIG.authenticatedLimit.toString());
  response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
  response.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime.toString());

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
