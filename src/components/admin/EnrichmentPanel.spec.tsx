/**
 * Enrichment Panel Tests — LOC-0079 AC1 (trigger + report half)
 *
 * Verifies the admin trigger POSTs the limit to /api/admin/enrichment and
 * renders the per-business report (applied, skipped, failed fields with
 * their reasons) plus a readable error when the run fails.
 */

'use client';

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EnrichmentPanel from './EnrichmentPanel';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch;
});

const REPORT = {
  businesses: [
    {
      id: 'b-1',
      name: 'Alpha Kitchen',
      applied: ['phone', 'website'],
      skipped: ['description'],
      error: null,
    },
    {
      id: 'b-2',
      name: 'Beta Diner',
      applied: [],
      skipped: ['phone'],
      error: 'place JSON fetch failed: 403',
    },
  ],
  summary: { total: 2, enriched: 1, skipped: 0, failed: 1 },
};

describe('EnrichmentPanel', () => {
  it('renders the trigger with a default limit of 10', () => {
    render(<EnrichmentPanel />);

    expect(screen.getByRole('button', { name: /enrich business content/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^limit$/i)).toHaveValue(10);
  });

  it('posts the limit to the enrichment route and renders the per-business report', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { report: REPORT } }),
    });
    render(<EnrichmentPanel />);

    fireEvent.click(screen.getByRole('button', { name: /enrich business content/i }));

    await waitFor(() => {
      expect(screen.getByText('Alpha Kitchen')).toBeInTheDocument();
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/admin/enrichment');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ limit: 10 });

    // One row per business: name, applied, skipped, and error columns
    expect(screen.getByText('Alpha Kitchen')).toBeInTheDocument();
    expect(screen.getByText('phone, website')).toBeInTheDocument();
    expect(screen.getByText('description')).toBeInTheDocument();
    expect(screen.getByText('Beta Diner')).toBeInTheDocument();
    expect(screen.getByText('phone')).toBeInTheDocument();
    expect(screen.getByText('place JSON fetch failed: 403')).toBeInTheDocument();
    // Summary line
    expect(screen.getByText(/2 businesses/i)).toBeInTheDocument();
  });

  it('shows the error banner when the route reports an unreachable worker', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        code: 'ENRICHMENT_WORKER_UNREACHABLE',
        error: 'Enrichment worker unreachable',
      }),
    });
    render(<EnrichmentPanel />);

    fireEvent.click(screen.getByRole('button', { name: /enrich business content/i }));

    await waitFor(() => {
      expect(screen.getByText(/enrichment worker unreachable/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Alpha Kitchen')).not.toBeInTheDocument();
  });

  it('sends a custom limit when the admin changes it', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { report: REPORT } }),
    });
    render(<EnrichmentPanel />);

    fireEvent.change(screen.getByLabelText(/^limit$/i), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /enrich business content/i }));

    await waitFor(() => {
      expect(screen.getByText('Alpha Kitchen')).toBeInTheDocument();
    });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ limit: 25 });
  });
});
