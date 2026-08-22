import { GET } from './route';
import { getPool } from '@/lib/db/user-repository';
import { NextResponse } from 'next/server';
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from '@/lib/auth/jwt-middleware';

jest.mock('@/lib/db/user-repository');

jest.mock('@/lib/auth/jwt-middleware', () => ({
  createAuthMiddleware: jest.fn(),
  createAuthErrorResponse: jest.fn(),
}));

const AUTH_OK = {
  authenticated: true,
  user: { userId: 'u-admin', email: 'admin@example.com', role: 'admin' },
  statusCode: 200,
};
const AUTH_FAIL = {
  authenticated: false,
  errorType: 'NO_AUTH_HEADER',
  errorMessage: 'Authorization header is required',
  statusCode: 401,
};

// Mock NextRequest to provide searchParams
class MockNextRequest {
  url: string;
  nextUrl: { searchParams: { get: (key: string) => string | null } };

  constructor(url: string) {
    this.url = url;
    const urlObj = new URL(url);
    this.nextUrl = {
      searchParams: {
        get: (key: string) => urlObj.searchParams.get(key),
      },
    };
  }
}

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient),
};

(getPool as jest.Mock).mockReturnValue(mockPool);

describe('Recent Scrape Jobs API', () => {
  const createRequest = (limit?: string) => {
    const url = new URL('http://localhost:3000/api/analytics/scrape-jobs/recent');
    if (limit) url.searchParams.set('limit', limit);
    return new MockNextRequest(url.toString()) as unknown as Request;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createAuthMiddleware as jest.Mock).mockReturnValue(jest.fn(async () => AUTH_OK));
    (createAuthErrorResponse as jest.Mock).mockReturnValue(
      NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 })
    );
    mockClient.query.mockReset();
  });

  it('returns 401 when the request is not authenticated as admin', async () => {
    (createAuthMiddleware as jest.Mock).mockReturnValue(jest.fn(async () => AUTH_FAIL));
    const request = createRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('returns empty array when no jobs exist', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data).toEqual([]);
  });

  it('uses a default limit of 10 when no limit parameter is provided', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.query.mock.calls[0][0]).toContain('LIMIT $1');
    expect(mockClient.query.mock.calls[0][1]).toEqual([10]);
  });

  it('passes the limit parameter through to the query', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    const response = await GET(createRequest('5'));

    expect(response.status).toBe(200);
    expect(mockClient.query.mock.calls[0][1]).toEqual([5]);
  });

  it('supports the maximum limit of 100', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    const response = await GET(createRequest('100'));

    expect(response.status).toBe(200);
    expect(mockClient.query.mock.calls[0][1]).toEqual([100]);
  });

  it.each(['0', '-1', '101', 'invalid'])('returns 400 for invalid limit %s', async (limit) => {
    const response = await GET(createRequest(limit));

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid limit parameter');
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('maps snake_case rows to camelCase job objects', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          id: 'job-1',
          source: 'yelp',
          query: 'black owned restaurants',
          location: 'Atlanta, GA',
          status: 'completed',
          business_count: 12,
          error_message: null,
          started_at: '2026-08-01T10:00:00.000Z',
          completed_at: '2026-08-01T11:00:00.000Z',
          created_at: '2026-08-01T09:59:00.000Z',
        },
      ],
    });

    const response = await GET(createRequest('10'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const data = await response.json();

    expect(data).toEqual([
      {
        id: 'job-1',
        source: 'yelp',
        query: 'black owned restaurants',
        location: 'Atlanta, GA',
        status: 'completed',
        businessCount: 12,
        errorMessage: null,
        startedAt: '2026-08-01T10:00:00.000Z',
        completedAt: '2026-08-01T11:00:00.000Z',
        createdAt: '2026-08-01T09:59:00.000Z',
      },
    ]);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns null values for jobs without counts or timestamps', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          id: 'job-2',
          source: 'google',
          query: 'salons',
          location: 'Chicago, IL',
          status: 'pending',
          business_count: null,
          error_message: null,
          started_at: null,
          completed_at: null,
          created_at: '2026-08-02T00:00:00.000Z',
        },
      ],
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(data[0].businessCount).toBeNull();
    expect(data[0].status).toBe('pending');
    expect(data[0].startedAt).toBeNull();
    expect(data[0].completedAt).toBeNull();
  });

  it('returns 500 when the query fails', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('db down'));
    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    const data = await response.json();

    expect(data.error).toBe('Internal server error');
    expect(mockClient.release).toHaveBeenCalled();
  });
});
