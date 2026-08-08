import { NextRequest } from 'next/server';
import { POST } from './route';
import { cancelScrapeJob } from '@/lib/db/scrape-job-repository';

// Mock the repository
jest.mock('@/lib/db/scrape-job-repository');

describe('POST /api/scrape-jobs/:id/cancel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when job ID is missing', async () => {
    const request = new NextRequest('http://localhost/api/scrape-jobs/cancel', {
      method: 'POST'
    });

    const response = await POST(request, { params: { id: 'cancel' } });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Job ID is required');
  });

  it('returns 404 when job is not found', async () => {
    (cancelScrapeJob as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/scrape-jobs/123/cancel', {
      method: 'POST'
    });

    const response = await POST(request, { params: { id: '123' } });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('Job not found or not in running status');
  });

  it('returns 404 when job is not in running status', async () => {
    (cancelScrapeJob as jest.Mock).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/scrape-jobs/456/cancel', {
      method: 'POST'
    });

    const response = await POST(request, { params: { id: '456' } });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('Job not found or not in running status');
  });

  it('successfully cancels a running job', async () => {
    const mockJob = {
      id: '789',
      source: 'google-maps' as const,
      query: 'restaurants',
      location: 'Los Angeles',
      status: 'cancelled' as const,
      business_count: 0,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-02')
    };

    (cancelScrapeJob as jest.Mock).mockResolvedValue(mockJob);

    const request = new NextRequest('http://localhost/api/scrape-jobs/789/cancel', {
      method: 'POST'
    });

    const response = await POST(request, { params: { id: '789' } });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe('Job cancelled successfully');
    expect(json.job.id).toBe('789');
    expect(json.job.status).toBe('cancelled');
    expect(json.job.source).toBe('google-maps');
    expect(cancelScrapeJob).toHaveBeenCalledWith('789');
  });

  it('returns 500 on internal error', async () => {
    (cancelScrapeJob as jest.Mock).mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost/api/scrape-jobs/999/cancel', {
      method: 'POST'
    });

    const response = await POST(request, { params: { id: '999' } });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('Internal server error');
  });
});
