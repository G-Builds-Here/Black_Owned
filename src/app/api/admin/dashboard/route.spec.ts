/**
 * Admin Dashboard Route Tests
 *
 * Covers GET /api/admin/dashboard: parameter validation, count mapping,
 * the job-activity window, review-queue mapping, recent-jobs passthrough,
 * and error handling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';
import { getPool } from '@/lib/db/user-repository';
import { findScrapeJobs } from '@/lib/db/scrape-job-repository';
import { findPendingByStatus } from '@/lib/db/pending-import-business-repository';

jest.mock('@/lib/db/user-repository', () => ({
  getPool: jest.fn(),
}));

jest.mock('@/lib/db/scrape-job-repository', () => ({
  findScrapeJobs: jest.fn(),
}));

jest.mock('@/lib/db/pending-import-business-repository', () => ({
  findPendingByStatus: jest.fn(),
}));

function makeRequest(url: string): NextRequest {
  return { nextUrl: new URL(url, 'http://localhost') } as unknown as NextRequest;
}

const countsRow = {
  total_businesses: 10,
  new_businesses: 3,
  total_users: 4,
  users_today: 1,
  pending_reviews: 2,
  pending_jobs: 1,
  running_jobs: 1,
};

const aggRow = {
  total_jobs: 8,
  successful_jobs: 5,
  failed_jobs: 2,
  total_items_scraped: 40,
  avg_duration: 12.4,
};

describe('GET /api/admin/dashboard', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mockPool = {
    connect: jest.fn().mockResolvedValue(mockClient),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getPool as jest.Mock).mockReturnValue(mockPool);
    (findScrapeJobs as jest.Mock).mockResolvedValue([]);
    (findPendingByStatus as jest.Mock).mockResolvedValue([]);
  });

  it('returns live counts and job stats for the default 30-day period', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [countsRow] })
      .mockResolvedValueOnce({ rows: [aggRow] });

    const response = await GET(makeRequest('/api/admin/dashboard'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.periodDays).toBe(30);
    expect(body.counts).toEqual({
      totalBusinesses: 10,
      newBusinesses: 3,
      totalUsers: 4,
      usersToday: 1,
      pendingReviews: 2,
      pendingJobs: 1,
      runningJobs: 1,
    });
    expect(body.jobStats).toEqual({
      totalJobs: 8,
      successfulJobs: 5,
      failedJobs: 2,
      totalItemsScraped: 40,
      avgDurationSeconds: 12,
      periodDays: 30,
    });
    expect(body.reviewQueue).toEqual([]);
    expect(body.recentJobs).toEqual([]);
    expect(mockClient.query).toHaveBeenCalledTimes(2);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('uses the requested day window in both queries', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [countsRow] })
      .mockResolvedValueOnce({ rows: [aggRow] });

    const response = await GET(makeRequest('/api/admin/dashboard?days=7'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.periodDays).toBe(7);
    expect(mockClient.query).toHaveBeenNthCalledWith(1, expect.anything(), [7]);
    expect(mockClient.query).toHaveBeenNthCalledWith(2, expect.anything(), [7]);
  });

  it('rejects days below 1', async () => {
    const response = await GET(makeRequest('/api/admin/dashboard?days=0'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Invalid days');
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('rejects days above 365', async () => {
    const response = await GET(makeRequest('/api/admin/dashboard?days=999'));

    expect(response.status).toBe(400);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('maps pending businesses into the review queue, capped at 5', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [countsRow] })
      .mockResolvedValueOnce({ rows: [aggRow] });

    const created = new Date('2026-08-20T12:00:00.000Z');
    const fakeRows = Array.from({ length: 7 }, (_, i) => ({
      id: `id-${i}`,
      name: `Business ${i}`,
      description: null,
      category_id: 'food-dining',
      source: 'google-maps',
      source_data: { source: 'google-maps', address: `123 St ${i}`, rating: 4.5 },
      status: 'pending_review',
      created_at: created,
      updated_at: created,
    }));
    (findPendingByStatus as jest.Mock).mockResolvedValue(fakeRows);

    const response = await GET(makeRequest('/api/admin/dashboard'));
    const body = await response.json();

    expect(body.reviewQueue).toHaveLength(5);
    expect(body.reviewQueue[0]).toEqual({
      id: 'id-0',
      name: 'Business 0',
      address: '123 St 0',
      source: 'google-maps',
      rating: 4.5,
      status: 'pending_review',
      createdAt: '2026-08-20T12:00:00.000Z',
    });
    expect(findPendingByStatus).toHaveBeenCalledWith(mockClient, 'pending_review');
  });

  it('falls back to N/A address and unknown source when source_data is empty', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [countsRow] })
      .mockResolvedValueOnce({ rows: [aggRow] });

    (findPendingByStatus as jest.Mock).mockResolvedValue([
      {
        id: 'id-x',
        name: 'No Data Business',
        source_data: {},
        status: 'pending_review',
        created_at: new Date(),
      },
    ]);

    const response = await GET(makeRequest('/api/admin/dashboard'));
    const body = await response.json();

    expect(body.reviewQueue[0].address).toBe('N/A');
    expect(body.reviewQueue[0].source).toBe('unknown');
    expect(body.reviewQueue[0].rating).toBeNull();
  });

  it('surfaces the most recent scrape jobs', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [countsRow] })
      .mockResolvedValueOnce({ rows: [aggRow] });

    const jobs = [
      { id: 'job-1', status: 'completed', businessCount: 5 },
      { id: 'job-2', status: 'pending', businessCount: undefined },
    ];
    (findScrapeJobs as jest.Mock).mockResolvedValue(jobs);

    const response = await GET(makeRequest('/api/admin/dashboard'));
    const body = await response.json();

    expect(findScrapeJobs).toHaveBeenCalledWith(mockClient, undefined, 5);
    expect(body.recentJobs).toEqual(jobs);
  });

  it('reports null average duration when no jobs completed in the window', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [countsRow] })
      .mockResolvedValueOnce({
        rows: [{ ...aggRow, total_jobs: 0, total_items_scraped: 0, avg_duration: null }],
      });

    const response = await GET(makeRequest('/api/admin/dashboard'));
    const body = await response.json();

    expect(body.jobStats.avgDurationSeconds).toBeNull();
  });

  it('returns 500 when a query fails and still releases the client', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockClient.query.mockRejectedValueOnce(new Error('db down'));

    const response = await GET(makeRequest('/api/admin/dashboard'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to build dashboard');
    expect(mockClient.release).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
