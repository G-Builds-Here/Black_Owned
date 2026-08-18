/**
 * Business Review Page - Job Filter Tests
 *
 * Tests for AC4: Navigate to review queue from job
 * - Given a job is completed, When the admin clicks "Review Results",
 *   Then they are navigated to the business review page filtered by that job
 * - And only businesses from that job are shown
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BusinessReviewPage from './page';

// Mock next/navigation
const mockGetParams = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: mockGetParams,
  }),
}));

// Mock fetch
global.fetch = jest.fn();

describe('BusinessReviewPage - Job Filtering', () => {
  const mockJobId = 'test-job-123';
  const mockJobInfo = {
    id: mockJobId,
    source: 'Google Maps',
    query: 'Black owned restaurants',
    location: 'Atlanta, GA',
    status: 'completed',
    resultCount: 5,
    createdAt: '2026-08-12T10:00:00Z',
  };

  const mockBusinesses = [
    {
      id: 'biz-1',
      name: 'Test Restaurant 1',
      address: '123 Test St, Atlanta GA',
      source: 'google-maps',
      rating: 4.5,
      submittedAt: '2026-08-12',
      category: 'Restaurant',
      phone: '(404) 555-0001',
      website: 'https://test1.example.com',
      originalData: {
        scrapeJobId: mockJobId,
        status: 'pending_review',
        createdAt: '2026-08-12T10:00:00Z',
      },
    },
    {
      id: 'biz-2',
      name: 'Test Restaurant 2',
      address: '456 Test Ave, Atlanta GA',
      source: 'google-maps',
      rating: 4.0,
      submittedAt: '2026-08-12',
      category: 'Restaurant',
      phone: '(404) 555-0002',
      originalData: {
        scrapeJobId: mockJobId,
        status: 'pending_review',
        createdAt: '2026-08-12T10:00:00Z',
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    mockGetParams.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders job-specific header when jobId is present', async () => {
    mockGetParams.mockReturnValue(mockJobId);

    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        success: true,
        data: mockBusinesses,
        job: mockJobInfo,
      }),
    });

    render(<BusinessReviewPage />);

    await waitFor(() => {
      expect(screen.getByText(/Review Results: Google Maps/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Reviewing Black owned restaurants in Atlanta, GA/i)).toBeInTheDocument();
  });

  it('fetches businesses for the specified job on mount', async () => {
    mockGetParams.mockReturnValue(mockJobId);

    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        success: true,
        data: mockBusinesses,
        job: mockJobInfo,
      }),
    });

    render(<BusinessReviewPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(`/api/admin/reviews/job/${mockJobId}`);
    });
  });

  it('displays only businesses from the specified job', async () => {
    mockGetParams.mockReturnValue(mockJobId);

    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        success: true,
        data: mockBusinesses,
        job: mockJobInfo,
      }),
    });

    render(<BusinessReviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Restaurant 1')).toBeInTheDocument();
      expect(screen.getByText('Test Restaurant 2')).toBeInTheDocument();
    });

    // Mock businesses should not appear when filtering by job
    expect(screen.queryByText('Soul Food Kitchen')).not.toBeInTheDocument();
  });

  it('shows job result count in header', async () => {
    mockGetParams.mockReturnValue(mockJobId);

    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        success: true,
        data: mockBusinesses,
        job: mockJobInfo,
      }),
    });

    render(<BusinessReviewPage />);

    await waitFor(() => {
      expect(screen.getByText(/5 results/i)).toBeInTheDocument();
    });
  });

  it('handles API error when fetching job businesses', async () => {
    mockGetParams.mockReturnValue(mockJobId);

    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        success: false,
        error: 'Job not found',
      }),
    });

    render(<BusinessReviewPage />);

    await waitFor(() => {
      // Should fall back to showing no businesses or empty state
      expect(screen.getByText(/No businesses found/i)).toBeInTheDocument();
    });
  });

  it('filters job-specific businesses by search query', async () => {
    mockGetParams.mockReturnValue(mockJobId);

    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        success: true,
        data: mockBusinesses,
        job: mockJobInfo,
      }),
    });

    render(<BusinessReviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Restaurant 1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by name, address, or source/i);
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Test Restaurant 1' } });

    expect(screen.getByText('Test Restaurant 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Restaurant 2')).not.toBeInTheDocument();
  });

  it('shows default review queue when no jobId is present', () => {
    mockGetParams.mockReturnValue(null);

    render(<BusinessReviewPage />);

    expect(screen.getByText('Business Review Queue')).toBeInTheDocument();
    expect(screen.getByText('Soul Food Kitchen')).toBeInTheDocument();
  });

  it('displays business details from job in the detail modal', async () => {
    mockGetParams.mockReturnValue(mockJobId);

    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        success: true,
        data: mockBusinesses,
        job: mockJobInfo,
      }),
    });

    render(<BusinessReviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Restaurant 1')).toBeInTheDocument();
    });

    const firstRow = screen.getAllByText('Test Restaurant 1')[0].closest('tr');
    expect(firstRow).toBeInTheDocument();

    fireEvent.click(firstRow!);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /business details/i })).toBeInTheDocument();
    });

    const nameElements = screen.getAllByText('Test Restaurant 1');
    expect(nameElements.length).toBeGreaterThan(0);
    const addressElements = screen.getAllByText('123 Test St, Atlanta GA');
    expect(addressElements.length).toBeGreaterThan(0);
  });
});
