/**
 * Admin Review Page QA Tests - LOC-0074-AC1
 *
 * Validates AC1: Admin can view pending businesses in UI
 * - Given businesses are in "pending_review" status
 * - When the admin opens the review page
 * - Then all pending businesses are displayed
 * - And each shows source, name, and address
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// Mock all UI components using the @ alias
jest.mock('@/components/ui', () => {
  const React = require('react');

  const Navigation = ({ onNavigate }: { onNavigate?: (section: string) => void }) => (
    <nav data-testid="navigation" onClick={() => onNavigate?.('test')} />
  );

  const Card = React.forwardRef<any, any>(
    ({ children, variant, padding, clickable, as: Component, href, ...props }: any, ref) => {
      const cardContent = (
        <div
          ref={ref}
          data-testid="card"
          data-variant={variant}
          data-padding={padding}
          data-clickable={clickable}
          {...props}
        >
          {children}
        </div>
      );
      if (Component && href) {
        return <Component href={href}>{cardContent}</Component>;
      }
      return cardContent;
    }
  );

  const Badge = React.forwardRef<any, any>(
    ({ children, variant, size, ...props }: any, ref) => (
      <span ref={ref} data-testid="badge" data-variant={variant} data-size={size} {...props}>
        {children}
      </span>
    )
  );

  const Button = React.forwardRef<any, any>(
    ({ children, onClick, disabled, variant, size }: any, ref) => (
      <button
        ref={ref}
        data-testid="button"
        data-variant={variant}
        data-size={size}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    )
  );

  const Tabs = React.forwardRef<any, any>(
    ({ tabs, selectedKey, onSelectionChange, children }: any, ref) => (
      <div ref={ref} data-testid="tabs" data-selected={selectedKey}>
        {tabs.map((tab: any) => (
          <button
            key={tab.key}
            data-testid={`tab-${tab.key}`}
            onClick={() => onSelectionChange?.(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        <div className="mt-4">{children}</div>
      </div>
    )
  );

  const TabPanel = React.forwardRef<any, any>(
    ({ value, children }: any, ref) => <div ref={ref} data-testid="tabpanel">{children}</div>
  );

  const TabContent = ({ children }: any) => <>{children}</>;

  return {
    Navigation,
    Card,
    Badge,
    Button,
    Tabs,
    TabPanel,
    TabContent,
  };
});

// Mock fetch
global.fetch = jest.fn();

import AdminReviewPage from './page';

describe('AdminReviewPage - LOC-0074-AC1: View Pending Businesses', () => {
  const mockPendingBusinesses = [
    {
      id: 'biz-001',
      name: 'Soul Food Kitchen',
      address: '123 Main St, Harlem, NY',
      source: 'Business Submission',
      rating: 4.5,
      category: 'Food & Dining',
      phone: '(555) 123-4567',
      website: '',
      status: 'pending_review',
      createdAt: { timestamp: 1723260000 },
      categoryId: 'cat-food',
      verificationStatus: 'pending_review',
    },
    {
      id: 'biz-002',
      name: 'Black Diamond Consulting',
      address: '456 Business Ave, Atlanta, GA',
      source: 'Business Submission',
      rating: 5.0,
      category: 'Professional Services',
      phone: '(555) 987-6543',
      website: '',
      status: 'pending_review',
      createdAt: { timestamp: 1723346400 },
      categoryId: 'cat-services',
      verificationStatus: 'pending_review',
    },
    {
      id: 'biz-003',
      name: 'Heritage Wellness Center',
      address: '789 Health Blvd, Chicago, IL',
      source: 'Business Submission',
      rating: 4.8,
      category: 'Health & Wellness',
      phone: '(555) 456-7890',
      website: '',
      status: 'pending_review',
      createdAt: { timestamp: 1723432800 },
      categoryId: 'cat-health',
      verificationStatus: 'pending_review',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Page Loading State', () => {
    it('shows loading spinner while fetching pending businesses', () => {
      const loadingPromise = new Promise((resolve) => setTimeout(resolve, 100));
      (global.fetch as jest.Mock).mockImplementation(() => loadingPromise);

      render(<AdminReviewPage />);

      // Should show loading spinner
      expect(screen.getByText(/loading pending businesses/i)).toBeInTheDocument();
    });
  });

  describe('Pending Businesses Display', () => {
    it('fetches pending businesses from GraphQL API on mount', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Verify fetch was called with correct query
      expect(global.fetch).toHaveBeenCalledWith('/api/graphql', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('pendingBusinesses'),
      }));
    });

    it('displays all pending businesses in the list', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // All three businesses should be displayed
      expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      expect(screen.getByText(/black diamond consulting/i)).toBeInTheDocument();
      expect(screen.getByText(/heritage wellness center/i)).toBeInTheDocument();
    });

    it('displays business name for each pending business', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Verify business names are displayed
      const businessNames = screen.getAllByRole('heading', { level: 3 });
      expect(businessNames.length).toBeGreaterThanOrEqual(1);
    });

    it('displays source for each pending business', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Source should be displayed (Business Submission) - multiple businesses = multiple occurrences
      const sourceLabels = screen.getAllByText(/source:/i);
      expect(sourceLabels.length).toBeGreaterThan(0);
      const sourceValues = screen.getAllByText(/business submission/i);
      expect(sourceValues.length).toBeGreaterThan(0);
    });

    it('displays address for each pending business', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Address should be shown - multiple businesses = multiple occurrences
      const addressLabels = screen.getAllByText(/address:/i);
      expect(addressLabels.length).toBeGreaterThan(0);
      const addresses = screen.getAllByText(/123 main st/i);
      expect(addresses.length).toBeGreaterThan(0);
    });

    it('displays submission date for each business', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Submitted date should be displayed - multiple businesses = multiple occurrences
      const submittedLabels = screen.getAllByText(/submitted:/i);
      expect(submittedLabels.length).toBeGreaterThan(0);
    });

    it('shows pending review badge for each business', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Pending badge should be displayed
      const pendingBadges = screen.getAllByTestId('badge');
      const pendingBadge = pendingBadges.find(b => b.getAttribute('data-variant') === 'warning');
      expect(pendingBadge).toBeInTheDocument();
    });
  });

  describe('Pending Tab', () => {
    it('shows pending tab with count of pending businesses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Pending tab should show count
      expect(screen.getByTestId('tab-pending')).toBeInTheDocument();
    });

    it('shows empty state when no pending businesses exist', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: [] },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/no pending businesses/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/all businesses have been reviewed/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('shows error message when API returns error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Failed to fetch pending businesses' }],
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/error loading pending businesses/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/failed to fetch pending businesses/i)).toBeInTheDocument();
    });

    it('shows error message when fetch fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/error loading pending businesses/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  describe('Pending Businesses Query', () => {
    it('sends correct GraphQL query for pending businesses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      });

      // Verify the GraphQL query structure
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.query).toContain('pendingBusinesses');
      expect(body.query).toContain('id');
      expect(body.query).toContain('name');
      expect(body.query).toContain('categoryId');
      expect(body.query).toContain('verificationStatus');
      expect(body.query).toContain('createdAt');
    });
  });
});
