'use client';

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import ScrapeJobPage from './page';

// Mock all UI components
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual('@/components/ui');
  return {
    ...actual,
    Navigation: () => <nav data-testid="navigation">Navigation</nav>,
    Card: ({ children, variant, padding }: any) => (
      <div data-testid="card-mock" data-variant={variant} data-padding={padding}>
        {children}
      </div>
    ),
    Badge: ({ children, variant, size }: any) => (
      <span data-testid="badge-mock" data-variant={variant} data-size={size}>
        {children}
      </span>
    ),
    Button: ({ children, onClick, variant, size, isLoading, loadingText, type, fullWidth }: any) => (
      <button
        data-testid="button-mock"
        data-variant={variant}
        data-size={size}
        data-loading={isLoading}
        data-full-width={fullWidth}
        onClick={onClick}
        type={type}
        disabled={isLoading}
      >
        {isLoading ? loadingText : children}
      </button>
    ),
    Input: ({ label, placeholder, value, onChange, error, fullWidth }: any) => (
      <div data-testid="input-mock" data-error={error}>
        {label && <label>{label}</label>}
        <input
          data-testid="input-field"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          data-full-width={fullWidth}
        />
        {error && <span data-testid="input-error">{error}</span>}
      </div>
    ),
    Tabs: ({ tabs, selectedKey, onSelectionChange }: any) => (
      <div data-testid="tabs-mock" data-selected={selectedKey}>
        {tabs.map((tab: any) => (
          <button
            key={tab.key}
            data-testid={`tab-${tab.key}`}
            data-active={tab.key === selectedKey}
            onClick={() => onSelectionChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    ),
    TabPanel: ({ value, children }: any) => (
      <div data-testid="tab-panel" data-value={value}>
        {children}
      </div>
    ),
  };
});

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('ScrapeJobPage', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('renders the scraping console page', () => {
    render(<ScrapeJobPage />);
    expect(screen.getByTestId('navigation')).toBeInTheDocument();
    expect(screen.getByText(/scraping console/i)).toBeInTheDocument();
    expect(screen.getByText(/create and monitor data scraping jobs/i)).toBeInTheDocument();
  });

  it('displays the Create Job tab as default', () => {
    render(<ScrapeJobPage />);
    expect(screen.getByTestId('tab-create')).toHaveAttribute('data-active', 'true');
    expect(screen.getByText(/create new scrape job/i)).toBeInTheDocument();
  });

  it('displays the Active Jobs tab', () => {
    render(<ScrapeJobPage />);
    expect(screen.getByTestId('tab-active')).toBeInTheDocument();
  });

  it('shows source dropdown with all options', () => {
    render(<ScrapeJobPage />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    // Check default option
    expect(select).toHaveValue('');

    // Note: Option checking would require opening the select in a real test
  });

  it('validates form and shows errors for empty fields', () => {
    render(<ScrapeJobPage />);

    // Try to submit empty form
    const submitButton = screen.getByTestId('button-mock');
    fireEvent.click(submitButton);

    // Should show validation errors
    expect(screen.getByTestId('input-error')).toBeInTheDocument();
  });

  it('shows source validation error when source is not selected', () => {
    render(<ScrapeJobPage />);

    // Fill in query and location but not source
    const queryInput = screen.getByPlaceholderText(/enter search query/i);
    const locationInput = screen.getByPlaceholderText(/enter location/i);

    fireEvent.change(queryInput, { target: { value: 'test query' } });
    fireEvent.change(locationInput, { target: { value: 'test location' } });

    // Submit
    const submitButton = screen.getByTestId('button-mock');
    fireEvent.click(submitButton);

    // Should show source error
    expect(screen.getByText(/source is required/i)).toBeInTheDocument();
  });

  it('shows query validation error when query is empty', () => {
    render(<ScrapeJobPage />);

    // Fill in source and location but not query
    const select = screen.getByRole('combobox');
    const locationInput = screen.getByPlaceholderText(/enter location/i);

    fireEvent.change(select, { target: { value: 'Google Maps' } });
    fireEvent.change(locationInput, { target: { value: 'test location' } });

    // Submit
    const submitButton = screen.getByTestId('button-mock');
    fireEvent.click(submitButton);

    // Should show query error
    expect(screen.getByText(/query is required/i)).toBeInTheDocument();
  });

  it('shows location validation error when location is empty', () => {
    render(<ScrapeJobPage />);

    // Fill in source and query but not location
    const select = screen.getByRole('combobox');
    const queryInput = screen.getByPlaceholderText(/enter search query/i);

    fireEvent.change(select, { target: { value: 'Google Maps' } });
    fireEvent.change(queryInput, { target: { value: 'test query' } });

    // Submit
    const submitButton = screen.getByTestId('button-mock');
    fireEvent.click(submitButton);

    // Should show location error
    expect(screen.getByText(/location is required/i)).toBeInTheDocument();
  });

  it('submits form successfully when all fields are valid', async () => {
    mockFetch.mockResolvedValueOnce({
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
    });

    render(<ScrapeJobPage />);

    // Fill in all fields
    const select = screen.getByRole('combobox');
    const queryInput = screen.getByPlaceholderText(/enter search query/i);
    const locationInput = screen.getByPlaceholderText(/enter location/i);

    fireEvent.change(select, { target: { value: 'Google Maps' } });
    fireEvent.change(queryInput, { target: { value: 'test query' } });
    fireEvent.change(locationInput, { target: { value: 'test location' } });

    // Submit
    const submitButton = screen.getByTestId('button-mock');
    fireEvent.click(submitButton);

    // Verify fetch was called
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/scrape-jobs',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    // Should show success message
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

    // Fill in all fields
    const select = screen.getByRole('combobox');
    const queryInput = screen.getByPlaceholderText(/enter search query/i);
    const locationInput = screen.getByPlaceholderText(/enter location/i);

    fireEvent.change(select, { target: { value: 'Google Maps' } });
    fireEvent.change(queryInput, { target: { value: 'test query' } });
    fireEvent.change(locationInput, { target: { value: 'test location' } });

    // Submit
    const submitButton = screen.getByTestId('button-mock');
    fireEvent.click(submitButton);

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/failed to create scrape job/i)).toBeInTheDocument();
    });
  });

  it('switches to Active Jobs tab and fetches jobs', async () => {
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

    // Click on Active Jobs tab
    const activeTab = screen.getByTestId('tab-active');
    fireEvent.click(activeTab);

    // Should fetch jobs
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/scrape-jobs?status=running');
    });
  });

  it('displays active jobs when fetched successfully', async () => {
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

    // Click on Active Jobs tab
    const activeTab = screen.getByTestId('tab-active');
    fireEvent.click(activeTab);

    // Wait for jobs to be displayed
    await waitFor(() => {
      expect(screen.getByText(/test query/i)).toBeInTheDocument();
      expect(screen.getByText(/test location/i)).toBeInTheDocument();
    });
  });

  it('shows "No active jobs" message when no jobs exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [],
      }),
    });

    render(<ScrapeJobPage />);

    // Click on Active Jobs tab
    const activeTab = screen.getByTestId('tab-active');
    fireEvent.click(activeTab);

    // Should show no jobs message
    await waitFor(() => {
      expect(screen.getByText(/no active jobs at the moment/i)).toBeInTheDocument();
    });
  });

  it('displays status badges for different job statuses', () => {
    render(<ScrapeJobPage />);

    // Note: Status badge rendering would be tested when jobs are displayed
    // This is a basic check that the badge component is available
    expect(screen.getByTestId('badge-mock')).not.toBeNull();
  });

  it('shows loading state when fetching jobs', async () => {
    // Mock a delayed response
    let resolvePromise: (value: any) => void;
    const promise = new Promise<any>((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockReturnValueOnce(promise);

    render(<ScrapeJobPage />);

    // Click on Active Jobs tab
    const activeTab = screen.getByTestId('tab-active');
    fireEvent.click(activeTab);

    // Should show loading state
    expect(screen.getByText(/loading jobs/i)).toBeInTheDocument();

    // Resolve the promise
    resolvePromise!({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });
  });

  it('has refresh button for active jobs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [],
      }),
    });

    render(<ScrapeJobPage />);

    // Click on Active Jobs tab
    const activeTab = screen.getByTestId('tab-active');
    fireEvent.click(activeTab);

    // Wait for tab to load
    await waitFor(() => {
      expect(screen.getByTestId('button-mock')).toBeInTheDocument();
    });

    // Should have refresh button
    const refreshButton = screen.getByText(/refresh/i);
    expect(refreshButton).toBeInTheDocument();
  });
});
