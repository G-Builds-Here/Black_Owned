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

describe('Scrape Jobs Stats API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPool as jest.Mock).mockReturnValue(mockPool);
    mockPool.connect.mockResolvedValue(mockClient);
  });

  const createRequest = (days?: string, source?: string) => {
    const url = new URL('http://localhost:3000/api/analytics/scrape-jobs');
    if (days) url.searchParams.set('days', days);
    if (source) url.searchParams.set('source', source);
    return new MockNextRequest(url.toString()) as unknown as Request;
  };

  it('returns default 30-day stats when no days parameter provided', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ total_jobs: '0', successful_jobs: '0', failed_jobs: '0', total_items_scraped: '0' }],
    });

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toEqual({
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      totalItemsScraped: 0,
      periodDays: 30,
    });
  });

  it('returns stats for 7-day period', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ total_jobs: '5', successful_jobs: '4', failed_jobs: '1', total_items_scraped: '150' }],
    });

    const request = createRequest('7');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.periodDays).toBe(7);
    expect(data.totalJobs).toBe(5);
  });

  it('returns stats for 14-day period', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ total_jobs: '10', successful_jobs: '8', failed_jobs: '2', total_items_scraped: '300' }],
    });

    const request = createRequest('14');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.periodDays).toBe(14);
  });

  it('returns stats for 90-day period', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ total_jobs: '50', successful_jobs: '45', failed_jobs: '5', total_items_scraped: '1500' }],
    });

    const request = createRequest('90');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.periodDays).toBe(90);
  });

  it('returns stats for maximum 365-day period', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ total_jobs: '200', successful_jobs: '180', failed_jobs: '20', total_items_scraped: '5000' }],
    });

    const request = createRequest('365');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.periodDays).toBe(365);
  });

  it('returns 400 error for invalid days parameter (zero)', async () => {
    const request = createRequest('0');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid days parameter');
  });

  it('returns 400 error for invalid days parameter (negative)', async () => {
    const request = createRequest('-5');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid days parameter');
  });

  it('returns 400 error for invalid days parameter (exceeds 365)', async () => {
    const request = createRequest('366');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid days parameter');
  });

  it('returns 400 error for non-numeric days parameter', async () => {
    const request = createRequest('invalid');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid days parameter');
  });

  it('returns stats with correct schema structure', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ total_jobs: '10', successful_jobs: '8', failed_jobs: '2', total_items_scraped: '250' }],
    });

    const request = createRequest('30');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('totalJobs');
    expect(data).toHaveProperty('successfulJobs');
    expect(data).toHaveProperty('failedJobs');
    expect(data).toHaveProperty('totalItemsScraped');
    expect(data).toHaveProperty('periodDays');
    expect(typeof data.totalJobs).toBe('number');
    expect(typeof data.successfulJobs).toBe('number');
    expect(typeof data.failedJobs).toBe('number');
    expect(typeof data.totalItemsScraped).toBe('number');
    expect(typeof data.periodDays).toBe('number');
  });

  it('queries database with source filter when GoogleMaps is provided', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ total_jobs: '5', successful_jobs: '4', failed_jobs: '1', total_items_scraped: '100' }],
    });

    const request = createRequest('30', 'GoogleMaps');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.source).toBe('GoogleMaps');
    expect(mockClient.query).toHaveBeenCalled();
    const queryCall = mockClient.query.mock.calls[0];
    expect(queryCall[0]).toContain('source =');
  });

  it('queries database with source filter when Yelp is provided', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ total_jobs: '3', successful_jobs: '3', failed_jobs: '0', total_items_scraped: '75' }],
    });

    const request = createRequest('30', 'Yelp');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.source).toBe('Yelp');
    const queryCall = mockClient.query.mock.calls[0];
    expect(queryCall[0]).toContain('source =');
    expect(queryCall[1]).toContain('Yelp');
  });

  it('queries database with source filter when Facebook is provided', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ total_jobs: '2', successful_jobs: '1', failed_jobs: '1', total_items_scraped: '50' }],
    });

    const request = createRequest('30', 'Facebook');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.source).toBe('Facebook');
    const queryCall = mockClient.query.mock.calls[0];
    expect(queryCall[0]).toContain('source =');
    expect(queryCall[1]).toContain('Facebook');
  });

  it('returns 400 error for invalid source parameter', async () => {
    const request = createRequest('30', 'InvalidSource');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid source parameter');
  });

  it('returns stats without source field when no source filter provided', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ total_jobs: '10', successful_jobs: '8', failed_jobs: '2', total_items_scraped: '250' }],
    });

    const request = createRequest('30');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.source).toBeUndefined();
  });

  it('does not include source filter in query when no source provided', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ total_jobs: '10', successful_jobs: '8', failed_jobs: '2', total_items_scraped: '250' }],
    });

    const request = createRequest('30');
    await GET(request);

    const queryCall = mockClient.query.mock.calls[0];
    expect(queryCall[0]).not.toContain('source =');
  });

  it('returns 500 error on database error', async () => {
    mockClient.query.mockRejectedValue(new Error('Database connection failed'));

    const request = createRequest('30');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();

    expect(data.error).toBe('Internal server error');
  });
});
