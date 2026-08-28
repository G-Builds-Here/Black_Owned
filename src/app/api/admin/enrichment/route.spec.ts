/**
 * Admin Enrichment Route Tests
 *
 * Covers POST /api/admin/enrichment: auth gate (401 unauthenticated,
 * 403 non-admin), verbatim body forwarding to bw-scraper POST /enrich at
 * SCRAPER_BASE_URL (default http://localhost:8080), report wrapping, and
 * worker failure envelopes (502 unreachable / 502 worker error).
 *
 * Unit class: global fetch is mocked; no live worker required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from '@/lib/auth/jwt-middleware';

jest.mock('@/lib/auth/jwt-middleware', () => ({
  createAuthMiddleware: jest.fn(),
  createAuthErrorResponse: jest.fn(),
}));

const AUTH_OK = {
  authenticated: true,
  user: { userId: 'u-admin', email: 'admin@example.com', role: 'admin' },
  statusCode: 200,
};
const AUTH_UNAUTH = {
  authenticated: false,
  errorType: 'NO_AUTH_HEADER',
  errorMessage: 'Authorization header is required',
  statusCode: 401,
};
const AUTH_FORBID = {
  authenticated: false,
  errorType: 'INSUFFICIENT_PERMISSIONS',
  errorMessage: 'Insufficient permissions',
  statusCode: 403,
};

const REPORT = {
  businesses: [
    {
      id: 'b-1',
      name: 'Alpha Kitchen',
      applied: ['phone', 'website'],
      skipped: ['description'],
      error: null,
    },
    {
      id: 'b-2',
      name: 'Beta Diner',
      applied: [],
      skipped: ['phone'],
      error: 'place JSON fetch failed: 403',
    },
  ],
  summary: { total: 2, enriched: 1, skipped: 0, failed: 1 },
};

function makeRequest(body: string): NextRequest {
  return {
    nextUrl: new URL('http://localhost/api/admin/enrichment'),
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as NextRequest;
}

function workerResponse(status: number, payload: unknown, bodyText?: string) {
  const text = bodyText !== undefined ? bodyText : JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => text,
  };
}

const mockFetch = jest.fn();

describe('POST /api/admin/enrichment', () => {
  const originalEnv = process.env.SCRAPER_BASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    if (originalEnv === undefined) {
      delete process.env.SCRAPER_BASE_URL;
    } else {
      process.env.SCRAPER_BASE_URL = originalEnv;
    }
    (globalThis as { fetch: unknown }).fetch = mockFetch;
    jest.mocked(createAuthErrorResponse).mockImplementation(
      (errorType, errorMessage) =>
        NextResponse.json(
          { success: false, error: errorMessage },
          { status: errorType === 'INSUFFICIENT_PERMISSIONS' ? 403 : 401 }
        )
    );
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SCRAPER_BASE_URL;
    } else {
      process.env.SCRAPER_BASE_URL = originalEnv;
    }
  });

  it('rejects an unauthenticated request with 401 and the auth error envelope', async () => {
    jest.mocked(createAuthMiddleware).mockReturnValue(async () => AUTH_UNAUTH);

    const res = await POST(makeRequest('{"limit": 10}'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      error: AUTH_UNAUTH.errorMessage,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a non-admin (role "user") with 403', async () => {
    jest.mocked(createAuthMiddleware).mockReturnValue(async () => AUTH_FORBID);

    const res = await POST(makeRequest('{"limit": 10}'));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      success: false,
      error: AUTH_FORBID.errorMessage,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('forwards {"limit": 10} verbatim to POST /enrich at the default worker URL and wraps the report', async () => {
    jest.mocked(createAuthMiddleware).mockReturnValue(async () => AUTH_OK);
    mockFetch.mockResolvedValue(workerResponse(200, REPORT));

    const res = await POST(makeRequest('{"limit": 10}'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { report: REPORT } });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8080/enrich');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"limit": 10}');
  });

  it('uses SCRAPER_BASE_URL when set', async () => {
    process.env.SCRAPER_BASE_URL = 'http://worker:9000';
    jest.mocked(createAuthMiddleware).mockReturnValue(async () => AUTH_OK);
    mockFetch.mockResolvedValue(workerResponse(200, REPORT));

    await POST(makeRequest('{"limit": 5}'));

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://worker:9000/enrich');
  });

  it('forwards limit and businessIds verbatim when both are present', async () => {
    jest.mocked(createAuthMiddleware).mockReturnValue(async () => AUTH_OK);
    mockFetch.mockResolvedValue(workerResponse(200, REPORT));

    await POST(makeRequest('{"limit": 3, "businessIds": ["b-1", "b-2"]}'));

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBe('{"limit": 3, "businessIds": ["b-1", "b-2"]}');
  });

  it('returns 502 with a worker-error envelope when the worker responds non-2xx', async () => {
    jest.mocked(createAuthMiddleware).mockReturnValue(async () => AUTH_OK);
    mockFetch.mockResolvedValue(workerResponse(400, null, 'limit out of range'));

    const res = await POST(makeRequest('{"limit": 10000}'));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('ENRICHMENT_WORKER_ERROR');
    expect(body.error).toContain('400');
    expect(body.detail).toBe('limit out of range');
  });

  it('returns 502 with an unreachable-worker envelope when fetch rejects', async () => {
    jest.mocked(createAuthMiddleware).mockReturnValue(async () => AUTH_OK);
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    const res = await POST(makeRequest('{"limit": 10}'));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('ENRICHMENT_WORKER_UNREACHABLE');
    expect(body.error).toBe('Enrichment worker unreachable');
  });
});
