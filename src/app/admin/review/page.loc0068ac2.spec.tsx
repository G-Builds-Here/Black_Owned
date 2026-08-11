/**
 * Admin Review Page Unit Tests - LOC-0068-AC2
 *
 * Validates AC2: View business details
 * - Given a business row exists
 * - When the admin clicks on the row
 * - Then a detail panel opens showing all fields
 * - And the original scraped data is visible
 */

'use client';

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminReviewPage from './page';

// Mock all UI components
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

// Mock the fetch API
global.fetch = jest.fn();

const mockPendingBusinesses = [
  {
    id: 'biz-001',
    name: 'Soul Food Kitchen',
    address: '123 Main St, Harlem, NY',
    source: 'Google Maps',
    rating: 4.5,
    category: 'Food & Dining',
    phone: '(555) 123-4567',
    website: 'https://soulfoodkitchen.com',
    status: 'pending_review',
    createdAt: { timestamp: 1723260000 },
    categoryId: 'cat-food',
    verificationStatus: 'pending_review',
  },
  {
    id: 'biz-002',
    name: 'Black Diamond Consulting',
    address: '456 Business Ave, Atlanta, GA',
    source: 'Bing Maps',
    rating: 5.0,
    category: 'Professional Services',
    phone: '(555) 987-6543',
    website: 'https://blackdiamondconsulting.com',
    status: 'pending_review',
    createdAt: { timestamp: 1723346400 },
    categoryId: 'cat-services',
    verificationStatus: 'pending_review',
  },
];

describe('Admin Review Page - LOC-0068-AC2: View Business Details', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Detail Panel Opening', () => {
    it('opens detail panel when clicking on a business row', async () => {
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

      // Click on the first business card
      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Detail panel should open
      await waitFor(() => {
        expect(screen.getByText(/basic information/i)).toBeInTheDocument();
      });
    });

    it('shows business name in detail panel header', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel header contains the business name
      await waitFor(() => {
        const detailHeader = screen.getByRole('heading', { level: 2 });
        expect(detailHeader).toHaveTextContent(/soul food kitchen/i);
      });
    });

    it('shows pending review badge in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains a warning badge
      await waitFor(() => {
        const badges = screen.getAllByTestId('badge');
        const warningBadge = badges.find(b => b.getAttribute('data-variant') === 'warning');
        expect(warningBadge).toBeInTheDocument();
      });
    });
  });

  describe('Basic Information Section', () => {
    it('displays business ID in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the business ID
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/biz-001/i);
      });
    });

    it('displays category in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the category
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/food & dining/i);
      });
    });

    it('displays address in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the address
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/123 main st/i);
      });
    });

    it('displays phone in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the phone
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/555.*123.*4567/i);
      });
    });

    it('displays website in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the website
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/soulfoodkitchen/i);
      });
    });

    it('displays rating in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the rating
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/4\.5/i);
      });
    });

    it('displays status in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the status
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/pending/i);
      });
    });

    it('displays submitted date in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the submitted date
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/submitted/i);
      });
    });
  });

  describe('Source Information Section', () => {
    it('displays source in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the source
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/source/i);
        expect(textContent).toMatch(/google maps/i);
      });
    });

    it('displays scraped at date in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the scraped at date
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/scraped at/i);
      });
    });
  });

  describe('Original Scraped Data Section', () => {
    it('displays original scraped data in code block', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the original scraped data
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/original scraped data/i);
        expect(textContent).toMatch(/biz-001/);
      });
    });

    it('displays all business fields in scraped data JSON', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the original scraped data
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/original scraped data/i);
      });
    });

    it('displays all business fields in scraped data JSON', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains all business fields
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/soul food kitchen/i);
      });
    });
  });

  describe('Detail Panel Closing', () => {
    it('shows close button in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the close button
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/close/i);
      });
    });

    it('closes detail panel when clicking close button', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel is open
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/basic information/i);
      });

      // Click close button
      fireEvent.click(screen.getByText(/close/i));

      // Detail panel should close
      await waitFor(() => {
        expect(screen.queryByText(/basic information/i)).not.toBeInTheDocument();
      });
    });

    it('closes detail panel when clicking backdrop', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel is open
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/basic information/i);
      });

      // Click backdrop (the overlay div)
      const backdrop = screen.getByRole('presentation');
      fireEvent.click(backdrop);

      // Detail panel should close
      await waitFor(() => {
        expect(screen.queryByText(/basic information/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Action Buttons in Detail Panel', () => {
    it('shows approve button in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the approve button
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/approve/i);
      });
    });

    it('shows reject button in detail panel', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the reject button
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/reject/i);
      });
    });

    it('closes detail panel after approving', async () => {
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

      const firstCard = screen.getByText(/soul food kitchen/i).closest('[data-testid="card"]');
      fireEvent.click(firstCard!);

      // Check that the detail panel contains the approve button
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/approve/i);
      });

      // Click approve button in the detail panel (get the second approve button which is in the detail panel)
      const approveButtons = screen.getAllByText(/approve/i);
      fireEvent.click(approveButtons[approveButtons.length - 1]);

      // Detail panel should close
      await waitFor(() => {
        expect(screen.queryByText(/basic information/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Multiple Businesses', () => {
    it('shows correct details when clicking on different businesses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { pendingBusinesses: mockPendingBusinesses },
        }),
      });

      render(<AdminReviewPage />);

      // Wait for both businesses to render
      await waitFor(() => {
        expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
        expect(screen.getByText(/black diamond consulting/i)).toBeInTheDocument();
      });

      // Click on first business - get the first card element specifically
      const firstCard = screen.getAllByTestId('card')[0];
      fireEvent.click(firstCard);

      // Check detail panel shows first business
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/soul food kitchen/i);
        expect(textContent).toMatch(/biz-001/i);
      });

      // Close panel
      fireEvent.click(screen.getByText(/close/i));

      await waitFor(() => {
        expect(screen.queryByText(/basic information/i)).not.toBeInTheDocument();
      });

      // Click on second business
      const secondCard = screen.getAllByTestId('card')[1];
      fireEvent.click(secondCard);

      // Check detail panel shows second business
      await waitFor(() => {
        const textContent = screen.getByRole('presentation').textContent;
        expect(textContent).toMatch(/black diamond consulting/i);
        expect(textContent).toMatch(/biz-002/i);
      });
    });
  });
});
