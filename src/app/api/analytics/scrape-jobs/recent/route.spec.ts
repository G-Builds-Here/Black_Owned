import { GET } from './route';
import { getPool } from '@/lib/db/user-repository';

// Mock the database
jest.mock('@/lib/db/user-repository', () => ({
  getPool: jest.fn(),
}));

const mockPool = {
  connect: jest.fn(),
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
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

describe('Recent Scrape Jobs API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPool as jest.Mock).mockReturnValue(mockPool);
    mockPool.connect.mockResolvedValue(mockClient);
  });

  const createRequest = (limit?: string, source?: string) => {
    const url = new URL('http://localhost:3000/api/analytics/scrape-jobs/recent');
    if (limit) url.searchParams.set('limit', limit);
    if (source) url.searchParams.set('source', source);
    return new MockNextRequest(url.toString()) as unknown as Request;
  };

  it('returns empty array when no jobs exist', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data).toEqual([]);
  });

  it('returns default limit of 10 jobs', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it('returns jobs with limit parameter', async () => {
    const mockJobs = [
      {
        id: '1',
        jobName: 'Test Job',
        targetUrl: 'http://example.com',
        status: 'success',
        errorMessage: null,
        itemsScraped: 10,
        startedAt: '2024-01-15T10:00:00Z',
        completedAt: '2024-01-15T10:30:00Z',
        source: 'GoogleMaps',
      },
    ];
    mockClient.query.mockResolvedValue({ rows: mockJobs });

    const request = createRequest('5');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
  });

  it('returns 400 error for invalid limit parameter (zero)', async () => {
    const request = createRequest('0');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid limit parameter');
  });

  it('returns 400 error for invalid limit parameter (negative)', async () => {
    const request = createRequest('-1');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid limit parameter');
  });

  it('returns 400 error for limit exceeding maximum (100)', async () => {
    const request = createRequest('101');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid limit parameter');
  });

  it('returns 400 error for non-numeric limit parameter', async () => {
    const request = createRequest('invalid');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid limit parameter');
  });

  it('returns maximum limit of 100', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const request = createRequest('100');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
  });

  it('returns correct response schema for job objects', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const request = createRequest('10');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('queries database with source filter when GoogleMaps is provided', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const request = createRequest('10', 'GoogleMaps');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(mockClient.query).toHaveBeenCalled();
    const queryCall = mockClient.query.mock.calls[0];
    expect(queryCall[0]).toContain('source =');
    expect(queryCall[1]).toContain('GoogleMaps');
  });

  it('queries database with source filter when Yelp is provided', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const request = createRequest('10', 'Yelp');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    const queryCall = mockClient.query.mock.calls[0];
    expect(queryCall[0]).toContain('source =');
    expect(queryCall[1]).toContain('Yelp');
  });

  it('queries database with source filter when Facebook is provided', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const request = createRequest('10', 'Facebook');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    const queryCall = mockClient.query.mock.calls[0];
    expect(queryCall[0]).toContain('source =');
    expect(queryCall[1]).toContain('Facebook');
  });

  it('returns 400 error for invalid source parameter', async () => {
    const request = createRequest('10', 'InvalidSource');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid source parameter');
  });

  it('returns jobs without source filter when no source provided', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const request = createRequest('10');
    await GET(request);

    const queryCall = mockClient.query.mock.calls[0];
    expect(queryCall[0]).not.toContain('WHERE source');
  });

  it('returns 500 error on database error', async () => {
    mockClient.query.mockRejectedValue(new Error('Database connection failed'));

    const request = createRequest('10');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();

    expect(data.error).toBe('Internal server error');
  });
});
