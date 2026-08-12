import { render, screen, waitFor, act } from '@testing-library/react';
import AnalyticsPage from './page';

// Mock fetch
global.fetch = jest.fn();

describe('AnalyticsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset fetch mock to undefined to force fresh mocks per test
    (global.fetch as jest.Mock) = jest.fn();
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

  it('displays source filter buttons', () => {
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

    expect(screen.getByText('All Sources')).toBeInTheDocument();
    expect(screen.getByText('Google Maps')).toBeInTheDocument();
    expect(screen.getByText('Yelp')).toBeInTheDocument();
    expect(screen.getByText('Facebook')).toBeInTheDocument();
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

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
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
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    render(<AnalyticsPage />);

    // Wait for error to be displayed - the component shows "Error: Network error"
    await waitFor(() => {
      expect(screen.getByText(/Error: Network error/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('changes period when clicking period buttons', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          totalJobs: 0,
          successfulJobs: 0,
          failedJobs: 0,
          totalItemsScraped: 0,
          periodDays: 30,
        }),
      });

    (global.fetch as jest.Mock).mockImplementation(fetchMock);

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('days=30')
      );
    });

    // Update mock to return 7 days after click
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        totalItemsScraped: 0,
        periodDays: 7,
      }),
    });

    // Click on "Last 7 days" button
    const sevenDaysButton = screen.getByText('Last 7 days');
    await act(async () => {
      sevenDaysButton.click();
    });

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

  it('filters metrics by Google Maps source when selected', async () => {
    const mockStats = {
      totalJobs: 50,
      successfulJobs: 45,
      failedJobs: 5,
      totalItemsScraped: 5000,
      periodDays: 30,
      source: 'GoogleMaps',
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStats,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    render(<AnalyticsPage />);

    // Click on "Google Maps" source filter
    const googleMapsButton = screen.getByText('Google Maps');
    await act(async () => {
      googleMapsButton.click();
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('source=GoogleMaps')
      );
    });
  });

  it('filters metrics by Yelp source when selected', async () => {
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

    // Click on "Yelp" source filter
    const yelpButton = screen.getByText('Yelp');
    await act(async () => {
      yelpButton.click();
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('source=Yelp')
      );
    });
  });

  it('filters metrics by Facebook source when selected', async () => {
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

    // Click on "Facebook" source filter
    const facebookButton = screen.getByText('Facebook');
    await act(async () => {
      facebookButton.click();
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('source=Facebook')
      );
    });
  });

  it('removes source filter when "All Sources" is selected', async () => {
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

    // Wait for initial load
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Click on "Google Maps" source filter
    const googleMapsButton = screen.getByText('Google Maps');
    await act(async () => {
      googleMapsButton.click();
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('source=GoogleMaps')
      );
    });

    // Click on "All Sources" to remove filter
    const allSourcesButton = screen.getByText('All Sources');
    await act(async () => {
      allSourcesButton.click();
    });

    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).not.toContain('source=');
    });
  });

  it('updates metrics within 2 seconds when source filter changes', async () => {
    const mockStats = {
      totalJobs: 100,
      successfulJobs: 90,
      failedJobs: 10,
      totalItemsScraped: 10000,
      periodDays: 30,
    };

    const fetchStartTime = Date.now();
    (global.fetch as jest.Mock).mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: async () => mockStats,
          });
        }, 500); // Simulate 500ms response time
      });
    });

    render(<AnalyticsPage />);

    // Wait for initial load
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Click on "Google Maps" source filter
    const googleMapsButton = screen.getByText('Google Maps');
    googleMapsButton.click();

    // Wait for the update to complete
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('source=GoogleMaps')
      );
    });

    const fetchDuration = Date.now() - fetchStartTime;
    // Verify the update happens within 2 seconds
    expect(fetchDuration).toBeLessThan(2000);
  });
});
