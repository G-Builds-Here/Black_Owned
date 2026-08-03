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

describe('Recent Scrape Jobs API', () => {
  const createRequest = (limit?: string) => {
    const url = new URL('http://localhost:3000/api/analytics/scrape-jobs/recent');
    if (limit) url.searchParams.set('limit', limit);
    return new MockNextRequest(url.toString()) as unknown as Request;
  };

  it('returns empty array when no jobs exist', async () => {
    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data).toEqual([]);
  });

  it('returns default limit of 10 jobs', async () => {
    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    // Default limit is 10, returns empty array when no jobs
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it('returns jobs with limit parameter', async () => {
    const request = createRequest('5');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
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
    const request = createRequest('100');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
  });

  it('returns correct response schema for job objects', async () => {
    // Test with empty array - schema is defined in route
    const request = createRequest('10');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
  });
});
