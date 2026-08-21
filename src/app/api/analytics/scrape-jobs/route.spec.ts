import { GET } from './route';
import { getPool } from '@/lib/db/user-repository';

jest.mock('@/lib/db/user-repository');

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

const zeroJobAgg = {
  total_jobs: 0,
  successful_jobs: 0,
  failed_jobs: 0,
  total_items_scraped: 0,
  avg_duration: null,
  min_duration: null,
  max_duration: null,
};

// The route runs three ordered queries: job aggregates, scraped count, imported count
function mockAggregates(jobAgg: object, scraped: number, imported: number) {
  mockClient.query
    .mockResolvedValueOnce({ rows: [jobAgg] })
    .mockResolvedValueOnce({ rows: [{ total: scraped }] })
    .mockResolvedValueOnce({ rows: [{ total: imported }] });
}

describe('Scrape Jobs Stats API', () => {
  const createRequest = (days?: string) => {
    const url = new URL('http://localhost:3000/api/analytics/scrape-jobs');
    if (days) url.searchParams.set('days', days);
    return new MockNextRequest(url.toString()) as unknown as Request;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns default 30-day stats when no days parameter provided', async () => {
    mockAggregates(zeroJobAgg, 0, 0);
    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toEqual({
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      totalItemsScraped: 0,
      totalBusinessesScraped: 0,
      totalBusinessesImported: 0,
      importRate: 0,
      periodDays: 30,
      avgDurationSeconds: null,
      minDurationSeconds: null,
      maxDurationSeconds: null,
    });
    expect(mockClient.query).toHaveBeenCalledTimes(3);
    expect(mockClient.query.mock.calls[0][1]).toEqual([30]);
    expect(mockClient.release).toHaveBeenCalled();
  });

  const periods: Array<[string, number]> = [
    ['7', 7],
    ['14', 14],
    ['90', 90],
    ['365', 365],
  ];

  it.each(periods)('returns stats for the %s-day period', async (daysParam, days) => {
    mockAggregates(zeroJobAgg, 0, 0);
    const request = createRequest(daysParam);
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.periodDays).toBe(days);
    expect(mockClient.query.mock.calls[0][1]).toEqual([days]);
  });

  it('aggregates job counts and scraped totals from the database', async () => {
    mockAggregates(
      {
        total_jobs: 10,
        successful_jobs: 8,
        failed_jobs: 2,
        total_items_scraped: 140,
        avg_duration: null,
        min_duration: null,
        max_duration: null,
      },
      36,
      12
    );
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.totalJobs).toBe(10);
    expect(data.successfulJobs).toBe(8);
    expect(data.failedJobs).toBe(2);
    expect(data.totalItemsScraped).toBe(140);
    expect(data.totalBusinessesScraped).toBe(36);
    expect(data.totalBusinessesImported).toBe(12);
  });

  it('computes import rate as a percentage of scraped businesses', async () => {
    mockAggregates(zeroJobAgg, 200, 50);
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.importRate).toBe(25);
  });

  it('returns import rate of 0 when no businesses were scraped', async () => {
    mockAggregates(zeroJobAgg, 0, 0);
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.importRate).toBe(0);
  });

  it('rounds duration metrics to whole seconds', async () => {
    mockAggregates(
      {
        total_jobs: 5,
        successful_jobs: 5,
        failed_jobs: 0,
        total_items_scraped: 0,
        avg_duration: 123.456,
        min_duration: 10.2,
        max_duration: 500.9,
      },
      0,
      0
    );
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.avgDurationSeconds).toBe(123);
    expect(data.minDurationSeconds).toBe(10);
    expect(data.maxDurationSeconds).toBe(501);
  });

  it('returns 400 error for invalid days parameter (zero)', async () => {
    const request = createRequest('0');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid days parameter');
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('returns 400 error for invalid days parameter (negative)', async () => {
    const request = createRequest('-5');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid days parameter');
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('returns 400 error for invalid days parameter (exceeds 365)', async () => {
    const request = createRequest('366');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid days parameter');
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('returns 400 error for non-numeric days parameter', async () => {
    const request = createRequest('invalid');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();

    expect(data.error).toContain('Invalid days parameter');
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('returns stats with correct schema structure', async () => {
    mockAggregates(zeroJobAgg, 3, 1);
    const request = createRequest('30');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('totalJobs');
    expect(data).toHaveProperty('successfulJobs');
    expect(data).toHaveProperty('failedJobs');
    expect(data).toHaveProperty('totalItemsScraped');
    expect(data).toHaveProperty('totalBusinessesScraped');
    expect(data).toHaveProperty('totalBusinessesImported');
    expect(data).toHaveProperty('importRate');
    expect(data).toHaveProperty('periodDays');
    expect(typeof data.totalJobs).toBe('number');
    expect(typeof data.successfulJobs).toBe('number');
    expect(typeof data.failedJobs).toBe('number');
    expect(typeof data.totalItemsScraped).toBe('number');
    expect(typeof data.totalBusinessesScraped).toBe('number');
    expect(typeof data.totalBusinessesImported).toBe('number');
    expect(typeof data.importRate).toBe('number');
    expect(typeof data.periodDays).toBe('number');
  });

  it('returns 500 when a query fails', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('db down'));
    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    const data = await response.json();

    expect(data.error).toBe('Internal server error');
    expect(mockClient.release).toHaveBeenCalled();
  });
});
