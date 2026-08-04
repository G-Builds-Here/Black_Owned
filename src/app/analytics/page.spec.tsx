import { render, screen, waitFor } from '@testing-library/react';
import AnalyticsPage from './page';

// Mock fetch
global.fetch = jest.fn();

describe('AnalyticsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the analytics page header', () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        totalItemsScraped: 0,
        periodDays: 30,
      }),
    });

    render(<AnalyticsPage />);

    expect(screen.getByText('Scrape Job Analytics')).toBeInTheDocument();
    expect(screen.getByText('Monitor web scraping operations and success rates')).toBeInTheDocument();
  });

  it('displays period selector buttons', () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        totalItemsScraped: 0,
        periodDays: 30,
      }),
    });

    render(<AnalyticsPage />);

    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('Last 14 days')).toBeInTheDocument();
    expect(screen.getByText('Last 30 days')).toBeInTheDocument();
    expect(screen.getByText('Last 90 days')).toBeInTheDocument();
  });

  it('displays loading state initially', () => {
    (global.fetch as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<AnalyticsPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('displays stats cards when data loads', async () => {
    const mockStats = {
      totalJobs: 150,
      successfulJobs: 135,
      failedJobs: 15,
      totalItemsScraped: 45000,
      periodDays: 30,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats,
    });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('135')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('45,000')).toBeInTheDocument();
    });
  });

  it('displays "No scrape jobs recorded yet" when no jobs exist', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalJobs: 0,
          successfulJobs: 0,
          failedJobs: 0,
          totalItemsScraped: 0,
          periodDays: 30,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('No scrape jobs recorded yet')).toBeInTheDocument();
    });
  });

  it('displays error message when fetch fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Error:/i)).toBeInTheDocument();
    });
  });

  it('changes period when clicking period buttons', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalJobs: 0,
          successfulJobs: 0,
          failedJobs: 0,
          totalItemsScraped: 0,
          periodDays: 7,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    (global.fetch as jest.Mock).mockImplementation(fetchMock);

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('days=30')
      );
    });

    // Click on "Last 7 days" button
    const sevenDaysButton = screen.getByText('Last 7 days');
    sevenDaysButton.click();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('days=7')
      );
    });
  });

  it('displays recent jobs table when jobs exist', async () => {
    const mockStats = {
      totalJobs: 5,
      successfulJobs: 4,
      failedJobs: 1,
      totalItemsScraped: 1000,
      periodDays: 30,
    };

    const mockJobs = [
      {
        id: '1',
        jobName: 'Business Scraper',
        targetUrl: 'https://example.com/businesses',
        status: 'success' as const,
        errorMessage: null,
        itemsScraped: 500,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ];

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockJobs,
      });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Jobs')).toBeInTheDocument();
      expect(screen.getByText('Business Scraper')).toBeInTheDocument();
      expect(screen.getByText('success')).toBeInTheDocument();
    });
  });

  it('displays average job duration when data is available', async () => {
    const mockStatsWithDurations = {
      totalJobs: 100,
      successfulJobs: 85,
      failedJobs: 15,
      totalItemsScraped: 5000,
      periodDays: 30,
      avgDurationSeconds: 125,
      minDurationSeconds: 45,
      maxDurationSeconds: 340,
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatsWithDurations,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Avg Duration')).toBeInTheDocument();
    });

    // 125 seconds = 2m 5s
    expect(screen.getByText('2m 5s')).toBeInTheDocument();
  });

  it('displays minimum job duration when data is available', async () => {
    const mockStatsWithDurations = {
      totalJobs: 100,
      successfulJobs: 85,
      failedJobs: 15,
      totalItemsScraped: 5000,
      periodDays: 30,
      avgDurationSeconds: 125,
      minDurationSeconds: 45,
      maxDurationSeconds: 340,
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatsWithDurations,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Min Duration')).toBeInTheDocument();
    });

    // 45 seconds = 45s
    expect(screen.getByText('45s')).toBeInTheDocument();
  });

  it('displays maximum job duration when data is available', async () => {
    const mockStatsWithDurations = {
      totalJobs: 100,
      successfulJobs: 85,
      failedJobs: 15,
      totalItemsScraped: 5000,
      periodDays: 30,
      avgDurationSeconds: 125,
      minDurationSeconds: 45,
      maxDurationSeconds: 340,
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatsWithDurations,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Max Duration')).toBeInTheDocument();
    });

    // 340 seconds = 5m 40s
    expect(screen.getByText('5m 40s')).toBeInTheDocument();
  });

  it('displays N/A for duration metrics when no data exists', async () => {
    const mockEmptyStats = {
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      totalItemsScraped: 0,
      periodDays: 30,
      avgDurationSeconds: null,
      minDurationSeconds: null,
      maxDurationSeconds: null,
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockEmptyStats,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Avg Duration')).toBeInTheDocument();
    });

    // Verify N/A is displayed for null durations
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('displays correct subtitle for each duration metric', async () => {
    const mockStatsWithDurations = {
      totalJobs: 100,
      successfulJobs: 85,
      failedJobs: 15,
      totalItemsScraped: 5000,
      periodDays: 30,
      avgDurationSeconds: 125,
      minDurationSeconds: 45,
      maxDurationSeconds: 340,
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatsWithDurations,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Avg Duration')).toBeInTheDocument();
    });

    // Verify subtitles for each duration metric
    expect(screen.getByText('Completed jobs only')).toBeInTheDocument();
    expect(screen.getByText('Fastest job')).toBeInTheDocument();
    expect(screen.getByText('Longest job')).toBeInTheDocument();
  });

  it('displays all three duration metric cards in the UI', async () => {
    const mockStatsWithDurations = {
      totalJobs: 100,
      successfulJobs: 85,
      failedJobs: 15,
      totalItemsScraped: 5000,
      periodDays: 30,
      avgDurationSeconds: 125,
      minDurationSeconds: 45,
      maxDurationSeconds: 340,
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatsWithDurations,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Avg Duration')).toBeInTheDocument();
    });

    // Verify all three duration metric labels are present
    expect(screen.getByText('Avg Duration')).toBeInTheDocument();
    expect(screen.getByText('Min Duration')).toBeInTheDocument();
    expect(screen.getByText('Max Duration')).toBeInTheDocument();
  });
});
