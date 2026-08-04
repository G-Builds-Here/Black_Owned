import { GET } from './route';

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
  const createRequest = (days?: string) => {
    const url = new URL('http://localhost:3000/api/analytics/scrape-jobs');
    if (days) url.searchParams.set('days', days);
    return new MockNextRequest(url.toString()) as unknown as Request;
  };

  it('returns default 30-day stats when no days parameter provided', async () => {
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
      avgDurationSeconds: null,
      minDurationSeconds: null,
      maxDurationSeconds: null,
    });
  });

  it('returns stats for 7-day period', async () => {
    const request = createRequest('7');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.periodDays).toBe(7);
  });

  it('returns stats for 14-day period', async () => {
    const request = createRequest('14');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.periodDays).toBe(14);
  });

  it('returns stats for 90-day period', async () => {
    const request = createRequest('90');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.periodDays).toBe(90);
  });

  it('returns stats for maximum 365-day period', async () => {
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
});
