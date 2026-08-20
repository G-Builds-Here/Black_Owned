'use client';

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import ScrapeJobPage from './page';

// Navigation is imported from a submodule, so it must be mocked at that path
jest.mock('@/components/ui/Navigation', () => ({
  Navigation: () => <nav data-testid="navigation">Navigation</nav>,
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('ScrapeJobPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders the scraping console page', () => {
    render(<ScrapeJobPage />);
    expect(screen.getByTestId('navigation')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /scraping console/i })).toBeInTheDocument();
    expect(screen.getByText(/create and monitor data scraping jobs/i)).toBeInTheDocument();
  });

  it('displays the Create Job tab content by default', () => {
    render(<ScrapeJobPage />);
    expect(screen.getByText(/create job/i)).toBeInTheDocument();
    expect(screen.getByText(/create new scrape job/i)).toBeInTheDocument();
    expect(screen.getByText(/start scraping/i)).toBeInTheDocument();
  });

  it('displays the Active Jobs tab', () => {
    render(<ScrapeJobPage />);
    expect(screen.getByRole('tab', { name: /active jobs/i })).toBeInTheDocument();
  });

  it('shows source dropdown with all options', () => {
    render(<ScrapeJobPage />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('');

    const options = screen.getAllByRole('option').map((o) => o.value);
    expect(options).toEqual(['', 'Google Maps', 'Facebook', 'Yelp']);
  });

  it('validates form and shows errors for empty fields', () => {
    render(<ScrapeJobPage />);

    fireEvent.click(screen.getByRole('button', { name: /start scraping/i }));

    expect(screen.getByText(/source is required/i)).toBeInTheDocument();
    expect(screen.getByText(/query is required/i)).toBeInTheDocument();
    expect(screen.getByText(/location is required/i)).toBeInTheDocument();
  });

  it('shows source validation error when source is not selected', () => {
    render(<ScrapeJobPage />);

    const queryInput = screen.getByPlaceholderText(/enter search query/i);
    const locationInput = screen.getByPlaceholderText(/enter location/i);

    fireEvent.change(queryInput, { target: { value: 'test query' } });
    fireEvent.change(locationInput, { target: { value: 'test location' } });

    fireEvent.click(screen.getByRole('button', { name: /start scraping/i }));

    expect(screen.getByText(/source is required/i)).toBeInTheDocument();
    expect(screen.queryByText(/query is required/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/location is required/i)).not.toBeInTheDocument();
  });

  it('shows query validation error when query is empty', () => {
    render(<ScrapeJobPage />);

    const select = screen.getByRole('combobox');
    const locationInput = screen.getByPlaceholderText(/enter location/i);

    fireEvent.change(select, { target: { value: 'Google Maps' } });
    fireEvent.change(locationInput, { target: { value: 'test location' } });

    fireEvent.click(screen.getByRole('button', { name: /start scraping/i }));

    expect(screen.getByText(/query is required/i)).toBeInTheDocument();
  });

  it('shows location validation error when location is empty', () => {
    render(<ScrapeJobPage />);

    const select = screen.getByRole('combobox');
    const queryInput = screen.getByPlaceholderText(/enter search query/i);

    fireEvent.change(select, { target: { value: 'Google Maps' } });
    fireEvent.change(queryInput, { target: { value: 'test query' } });

    fireEvent.click(screen.getByRole('button', { name: /start scraping/i }));

    expect(screen.getByText(/location is required/i)).toBeInTheDocument();
  });

  it('submits form successfully when all fields are valid', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'test-id',
            source: 'google-maps',
            query: 'test query',
            location: 'test location',
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });

    render(<ScrapeJobPage />);

    const select = screen.getByRole('combobox');
    const queryInput = screen.getByPlaceholderText(/enter search query/i);
    const locationInput = screen.getByPlaceholderText(/enter location/i);

    fireEvent.change(select, { target: { value: 'Google Maps' } });
    fireEvent.change(queryInput, { target: { value: 'test query' } });
    fireEvent.change(locationInput, { target: { value: 'test location' } });

    fireEvent.click(screen.getByRole('button', { name: /start scraping/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/scrape-jobs',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/scrape job created successfully/i)).toBeInTheDocument();
    });
  });

  it('shows error message when submission fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Failed to create scrape job',
      }),
    });

    render(<ScrapeJobPage />);

    const select = screen.getByRole('combobox');
    const queryInput = screen.getByPlaceholderText(/enter search query/i);
    const locationInput = screen.getByPlaceholderText(/enter location/i);

    fireEvent.change(select, { target: { value: 'Google Maps' } });
    fireEvent.change(queryInput, { target: { value: 'test query' } });
    fireEvent.change(locationInput, { target: { value: 'test location' } });

    fireEvent.click(screen.getByRole('button', { name: /start scraping/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to create scrape job/i)).toBeInTheDocument();
    });
  });

  it('switches to Active Jobs tab, fetches jobs, and displays them', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 'job-1',
            source: 'google-maps',
            query: 'test query',
            location: 'test location',
            status: 'running',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });

    render(<ScrapeJobPage />);

    fireEvent.click(screen.getByRole('tab', { name: /active jobs/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/scrape-jobs?status=running');
    });

    await waitFor(() => {
      expect(screen.getByText(/test query/i)).toBeInTheDocument();
      expect(screen.getByText(/test location/i)).toBeInTheDocument();
      // Status appears in both the badge and the running indicator
      expect(screen.getAllByText(/running/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows "No active jobs" message when no jobs exist', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    render(<ScrapeJobPage />);

    fireEvent.click(screen.getByRole('tab', { name: /active jobs/i }));

    await waitFor(() => {
      expect(screen.getByText(/no active jobs at the moment/i)).toBeInTheDocument();
    });
  });

  it('shows loading state while jobs are being fetched', async () => {
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockReturnValueOnce(promise);

    render(<ScrapeJobPage />);

    fireEvent.click(screen.getByRole('tab', { name: /active jobs/i }));

    expect(screen.getByText(/loading jobs/i)).toBeInTheDocument();

    resolvePromise!({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    await waitFor(() => {
      expect(screen.getByText(/no active jobs at the moment/i)).toBeInTheDocument();
    });
  });

  it('has refresh button for active jobs that re-fetches the job list', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    render(<ScrapeJobPage />);

    fireEvent.click(screen.getByRole('tab', { name: /active jobs/i }));

    // Wait for the first fetch to fully settle so the Refresh button is enabled
    await waitFor(() => {
      expect(screen.getByText(/no active jobs at the moment/i)).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(/refresh/i));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
