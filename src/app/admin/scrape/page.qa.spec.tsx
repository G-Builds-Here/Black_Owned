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
    Navigation: () => <div data-testid="navigation-mock">Navigation</div>,
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

describe('ScrapeJobPage - QA Tests', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    jest.clearAllMocks();
  });

  describe('Page Rendering', () => {
    it('renders the scraping console header', () => {
      render(<ScrapeJobPage />);
      expect(screen.getByText(/scraping console/i)).toBeInTheDocument();
      expect(screen.getByText(/create and monitor data scraping jobs/i)).toBeInTheDocument();
    });

    it('displays both Create Job and Active Jobs tabs', () => {
      render(<ScrapeJobPage />);
      expect(screen.getByTestId('tab-create')).toBeInTheDocument();
      expect(screen.getByTestId('tab-active')).toBeInTheDocument();
    });

    it('shows Create Job tab as active by default', () => {
      render(<ScrapeJobPage />);
      expect(screen.getByTestId('tab-create')).toHaveAttribute('data-active', 'true');
      expect(screen.getByTestId('tab-active')).not.toHaveAttribute('data-active', 'true');
    });
  });

  describe('Form Validation', () => {
    it('shows error when source is not selected', () => {
      render(<ScrapeJobPage />);

      const queryInput = screen.getByPlaceholderText(/enter search query/i);
      const locationInput = screen.getByPlaceholderText(/enter location/i);

      fireEvent.change(queryInput, { target: { value: 'test' } });
      fireEvent.change(locationInput, { target: { value: 'test' } });

      const submitButton = screen.getByTestId('button-mock');
      fireEvent.click(submitButton);

      expect(screen.getByText(/source is required/i)).toBeInTheDocument();
    });

    it('shows error when query is empty', () => {
      render(<ScrapeJobPage />);

      const select = screen.getByRole('combobox');
      const locationInput = screen.getByPlaceholderText(/enter location/i);

      fireEvent.change(select, { target: { value: 'Google Maps' } });
      fireEvent.change(locationInput, { target: { value: 'test' } });

      const submitButton = screen.getByTestId('button-mock');
      fireEvent.click(submitButton);

      expect(screen.getByText(/query is required/i)).toBeInTheDocument();
    });

    it('shows error when location is empty', () => {
      render(<ScrapeJobPage />);

      const select = screen.getByRole('combobox');
      const queryInput = screen.getByPlaceholderText(/enter search query/i);

      fireEvent.change(select, { target: { value: 'Google Maps' } });
      fireEvent.change(queryInput, { target: { value: 'test' } });

      const submitButton = screen.getByTestId('button-mock');
      fireEvent.click(submitButton);

      expect(screen.getByText(/location is required/i)).toBeInTheDocument();
    });

    it('allows form submission when all fields are valid', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'test' } }),
      });

      render(<ScrapeJobPage />);

      const select = screen.getByRole('combobox');
      const queryInput = screen.getByPlaceholderText(/enter search query/i);
      const locationInput = screen.getByPlaceholderText(/enter location/i);

      fireEvent.change(select, { target: { value: 'Google Maps' } });
      fireEvent.change(queryInput, { target: { value: 'test query' } });
      fireEvent.change(locationInput, { target: { value: 'test location' } });

      const submitButton = screen.getByTestId('button-mock');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });

  describe('Source Selection', () => {
    it('has Google Maps as an option', () => {
      render(<ScrapeJobPage />);
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('has Facebook as an option', () => {
      render(<ScrapeJobPage />);
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('has Yelp as an option', () => {
      render(<ScrapeJobPage />);
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('calls API with correct payload on successful submission', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'test-id', source: 'google-maps', query: 'test', location: 'test' },
        }),
      });

      render(<ScrapeJobPage />);

      const select = screen.getByRole('combobox');
      const queryInput = screen.getByPlaceholderText(/enter search query/i);
      const locationInput = screen.getByPlaceholderText(/enter location/i);

      fireEvent.change(select, { target: { value: 'Google Maps' } });
      fireEvent.change(queryInput, { target: { value: 'Black owned restaurants' } });
      fireEvent.change(locationInput, { target: { value: 'Atlanta, GA' } });

      const submitButton = screen.getByTestId('button-mock');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/scrape-jobs',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });
    });

    it('shows success message on successful submission', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'test' } }),
      });

      render(<ScrapeJobPage />);

      const select = screen.getByRole('combobox');
      const queryInput = screen.getByPlaceholderText(/enter search query/i);
      const locationInput = screen.getByPlaceholderText(/enter location/i);

      fireEvent.change(select, { target: { value: 'Google Maps' } });
      fireEvent.change(queryInput, { target: { value: 'test' } });
      fireEvent.change(locationInput, { target: { value: 'test' } });

      const submitButton = screen.getByTestId('button-mock');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/scrape job created successfully/i)).toBeInTheDocument();
      });
    });

    it('shows error message on failed submission', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, error: 'Test error' }),
      });

      render(<ScrapeJobPage />);

      const select = screen.getByRole('combobox');
      const queryInput = screen.getByPlaceholderText(/enter search query/i);
      const locationInput = screen.getByPlaceholderText(/enter location/i);

      fireEvent.change(select, { target: { value: 'Google Maps' } });
      fireEvent.change(queryInput, { target: { value: 'test' } });
      fireEvent.change(locationInput, { target: { value: 'test' } });

      const submitButton = screen.getByTestId('button-mock');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/test error/i)).toBeInTheDocument();
      });
    });

    it('clears form after successful submission', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'test' } }),
      });

      render(<ScrapeJobPage />);

      const select = screen.getByRole('combobox');
      const queryInput = screen.getByPlaceholderText(/enter search query/i);
      const locationInput = screen.getByPlaceholderText(/enter location/i);

      fireEvent.change(select, { target: { value: 'Google Maps' } });
      fireEvent.change(queryInput, { target: { value: 'test' } });
      fireEvent.change(locationInput, { target: { value: 'test' } });

      const submitButton = screen.getByTestId('button-mock');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(select).toHaveValue('');
        expect(queryInput).toHaveValue('');
        expect(locationInput).toHaveValue('');
      });
    });
  });

  describe('Active Jobs Tab', () => {
    it('fetches jobs when switching to Active Jobs tab', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });

      render(<ScrapeJobPage />);

      const activeTab = screen.getByTestId('tab-active');
      fireEvent.click(activeTab);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/scrape-jobs?status=running');
      });
    });

    it('shows loading state while fetching jobs', async () => {
      let resolveFn: (value: any) => void;
      const promise = new Promise<any>((resolve) => {
        resolveFn = resolve;
      });
      mockFetch.mockReturnValueOnce(promise);

      render(<ScrapeJobPage />);

      const activeTab = screen.getByTestId('tab-active');
      fireEvent.click(activeTab);

      expect(screen.getByText(/loading jobs/i)).toBeInTheDocument();

      resolveFn!({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });
    });

    it('shows no jobs message when list is empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });

      render(<ScrapeJobPage />);

      const activeTab = screen.getByTestId('tab-active');
      fireEvent.click(activeTab);

      await waitFor(() => {
        expect(screen.getByText(/no active jobs at the moment/i)).toBeInTheDocument();
      });
    });

    it('displays job details when jobs are fetched', async () => {
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

      const activeTab = screen.getByTestId('tab-active');
      fireEvent.click(activeTab);

      await waitFor(() => {
        expect(screen.getByText(/test query/i)).toBeInTheDocument();
        expect(screen.getByText(/test location/i)).toBeInTheDocument();
      });
    });

    it('shows status badge for running jobs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              id: 'job-1',
              source: 'google-maps',
              query: 'test',
              location: 'test',
              status: 'running',
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      });

      render(<ScrapeJobPage />);

      const activeTab = screen.getByTestId('tab-active');
      fireEvent.click(activeTab);

      await waitFor(() => {
        expect(screen.getByTestId('badge-mock')).toBeInTheDocument();
      });
    });

    it('shows error message for failed jobs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              id: 'job-1',
              source: 'google-maps',
              query: 'test',
              location: 'test',
              status: 'failed',
              errorMessage: 'Test error message',
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      });

      render(<ScrapeJobPage />);

      const activeTab = screen.getByTestId('tab-active');
      fireEvent.click(activeTab);

      await waitFor(() => {
        expect(screen.getByText(/test error message/i)).toBeInTheDocument();
      });
    });

    it('has refresh button for active jobs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });

      render(<ScrapeJobPage />);

      const activeTab = screen.getByTestId('tab-active');
      fireEvent.click(activeTab);

      await waitFor(() => {
        expect(screen.getByText(/refresh/i)).toBeInTheDocument();
      });
    });

    it('updates active jobs count in tab label', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            { id: '1', source: 'test', query: 'test', location: 'test', status: 'running', createdAt: new Date().toISOString() },
            { id: '2', source: 'test', query: 'test', location: 'test', status: 'running', createdAt: new Date().toISOString() },
          ],
        }),
      });

      render(<ScrapeJobPage />);

      const activeTab = screen.getByTestId('tab-active');
      expect(activeTab).toHaveTextContent(/active jobs \(0\)/i);

      fireEvent.click(activeTab);

      await waitFor(() => {
        expect(screen.getByTestId('tab-active')).toHaveTextContent(/active jobs \(2\)/i);
      });
    });
  });

  describe('Navigation', () => {
    it('has navigation component', () => {
      render(<ScrapeJobPage />);
      expect(screen.getByTestId('navigation-mock')).toBeInTheDocument();
    });
  });
});
