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
        success: true,
        data: {
          totalJobs: 0,
          successfulJobs: 0,
          failedJobs: 0,
          totalItemsScraped: 0,
          totalBusinessesScraped: 0,
          totalBusinessesImported: 0,
          importRate: 0,
          periodDays: 30,
        },
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
        success: true,
        data: {
          totalJobs: 0,
          successfulJobs: 0,
          failedJobs: 0,
          totalItemsScraped: 0,
          totalBusinessesScraped: 0,
          totalBusinessesImported: 0,
          importRate: 0,
          periodDays: 30,
        },
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
      totalBusinessesScraped: 100,
      totalBusinessesImported: 75,
      importRate: 75.0,
      periodDays: 30,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockStats }),
    });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('135')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('45,000')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('75')).toBeInTheDocument();
    });
  });

  it('displays "No scrape jobs recorded yet" when no jobs exist', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            totalJobs: 0,
            successfulJobs: 0,
            failedJobs: 0,
            totalItemsScraped: 0,
            totalBusinessesScraped: 0,
            totalBusinessesImported: 0,
            importRate: 0,
            periodDays: 30,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
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
          success: true,
          data: {
            totalJobs: 0,
            successfulJobs: 0,
            failedJobs: 0,
            totalItemsScraped: 0,
            totalBusinessesScraped: 0,
            totalBusinessesImported: 0,
            importRate: 0,
            periodDays: 7,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });

    (global.fetch as jest.Mock).mockImplementation(fetchMock);

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('days=30'),
        expect.objectContaining({ headers: {} })
      );
    });

    // Click on "Last 7 days" button (role query avoids ambiguity with the
    // "Last 7 days" stats caption rendered when stats.periodDays is 7)
    const sevenDaysButton = screen.getByRole('button', { name: 'Last 7 days' });
    sevenDaysButton.click();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('days=7'),
        expect.objectContaining({ headers: {} })
      );
    });
  });

  it('displays recent jobs table when jobs exist', async () => {
    const mockStats = {
      totalJobs: 5,
      successfulJobs: 4,
      failedJobs: 1,
      totalItemsScraped: 1000,
      totalBusinessesScraped: 5,
      totalBusinessesImported: 3,
      importRate: 60.0,
      periodDays: 30,
    };

    const mockJobs = [
      {
        id: '1',
        source: 'yelp',
        query: 'black owned restaurants',
        location: 'Atlanta, GA',
        status: 'completed' as const,
        businessCount: 12,
        errorMessage: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockStats }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockJobs }),
      });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Jobs')).toBeInTheDocument();
      expect(screen.getByText('yelp')).toBeInTheDocument();
      expect(screen.getByText('black owned restaurants')).toBeInTheDocument();
      expect(screen.getByText('Atlanta, GA')).toBeInTheDocument();
      expect(screen.getByText('completed')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
    });
  });

  it('displays businesses scraped and imported stats', async () => {
    const mockStats = {
      totalJobs: 10,
      successfulJobs: 8,
      failedJobs: 2,
      totalItemsScraped: 500,
      totalBusinessesScraped: 50,
      totalBusinessesImported: 35,
      importRate: 70.0,
      periodDays: 30,
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockStats }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Businesses Scraped')).toBeInTheDocument();
      expect(screen.getByText('Businesses Imported')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText('35')).toBeInTheDocument();
      expect(screen.getByText(/70\.0/)).toBeInTheDocument();
      expect(screen.getByText(/import rate/)).toBeInTheDocument();
    });
  });
});
