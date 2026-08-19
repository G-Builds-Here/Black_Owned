import { NextRequest, NextResponse } from 'next/server';
import { GET, DELETE } from './route';
import { findScrapeJobById, deleteScrapeJob } from '@/lib/db/scrape-job-repository';
import { getPool } from '@/lib/db/user-repository';

// Mock dependencies
jest.mock('@/lib/db/scrape-job-repository');
jest.mock('@/lib/db/user-repository');

const mockClient = {
  release: jest.fn()
};

const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient)
};

(getPool as jest.Mock).mockReturnValue(mockPool);

describe('Scrape Job Details and Delete Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/scrape-jobs/:id', () => {
    it('returns job details for existing job', async () => {
      const mockJob = {
        id: 'test-job-123',
        source: 'google',
        query: 'test query',
        location: 'New York',
        status: 'completed',
        businessCount: 5,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z')
      };

      (findScrapeJobById as jest.Mock).mockResolvedValue(mockJob);

      const request = new NextRequest('http://localhost/api/scrape-jobs/test-job-123');
      const response = await GET(request, { params: { id: 'test-job-123' } });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('test-job-123');
      expect(json.data.source).toBe('google');
      expect(json.data.status).toBe('completed');
    });

    it('returns 404 for non-existent job', async () => {
      (findScrapeJobById as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/scrape-jobs/non-existent');
      const response = await GET(request, { params: { id: 'non-existent' } });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Scrape job not found');
    });

    it('returns 400 for missing job ID', async () => {
      const request = new NextRequest('http://localhost/api/scrape-jobs/');
      const response = await GET(request, { params: { id: '' } });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Job ID is required');
    });

    it('returns 500 on database error', async () => {
      (findScrapeJobById as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/scrape-jobs/test-job-123');
      const response = await GET(request, { params: { id: 'test-job-123' } });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Internal server error');
    });
  });

  describe('DELETE /api/scrape-jobs/:id', () => {
    it('deletes job successfully', async () => {
      const mockJob = {
        id: 'test-job-123',
        source: 'google',
        query: 'test query',
        location: 'New York',
        status: 'completed',
        businessCount: 5,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z')
      };

      (deleteScrapeJob as jest.Mock).mockResolvedValue(mockJob);

      const request = new NextRequest('http://localhost/api/scrape-jobs/test-job-123', {
        method: 'DELETE'
      });
      const response = await DELETE(request, { params: { id: 'test-job-123' } });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.message).toBe('Scrape job deleted successfully');
      expect(json.data.id).toBe('test-job-123');
    });

    it('returns 404 when deleting non-existent job', async () => {
      (deleteScrapeJob as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/scrape-jobs/non-existent', {
        method: 'DELETE'
      });
      const response = await DELETE(request, { params: { id: 'non-existent' } });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Scrape job not found');
    });

    it('returns 400 for missing job ID', async () => {
      const request = new NextRequest('http://localhost/api/scrape-jobs/', {
        method: 'DELETE'
      });
      const response = await DELETE(request, { params: { id: '' } });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Job ID is required');
    });

    it('returns 500 on database error', async () => {
      (deleteScrapeJob as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/scrape-jobs/test-job-123', {
        method: 'DELETE'
      });
      const response = await DELETE(request, { params: { id: 'test-job-123' } });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Internal server error');
    });
  });
});
