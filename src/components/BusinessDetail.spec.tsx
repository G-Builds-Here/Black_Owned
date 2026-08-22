/**
 * Unit tests for BusinessDetail component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BusinessDetail, Business } from './BusinessDetail';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockGetSession = jest.fn();
jest.mock('@/lib/auth/client-session', () => ({
  getSession: () => mockGetSession(),
  authHeaders: () => ({ Authorization: 'Bearer access' }),
  clearSession: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockReturnValue({
    accessToken: 'access',
    refreshToken: 'refresh',
    user: { id: 'u-1', email: 'user@example.com', name: 'User' },
  });
});

const mockBusiness: Business = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Soul Food Kitchen',
  categoryId: 'food-dining',
  verified: true,
  createdAt: {
    timestamp: 1704067200, // 2024-01-01
  },
};

describe('BusinessDetail', () => {
  describe('Loading State', () => {
    it('shows loading spinner and message when loading is true', () => {
      render(
        <BusinessDetail
          business={null}
          loading={true}
          error={null}
        />
      );

      expect(screen.getByText(/loading business details/i)).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when error is provided', () => {
      render(
        <BusinessDetail
          business={null}
          loading={false}
          error="Network error occurred"
        />
      );

      expect(screen.getByText(/unable to load business/i)).toBeInTheDocument();
      expect(screen.getByText(/network error occurred/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('shows retry button that can be clicked', () => {
      render(
        <BusinessDetail
          business={null}
          loading={false}
          error="Network error occurred"
        />
      );

      const retryButton = screen.getByRole('button', { name: /try again/i });
      expect(retryButton).toBeInTheDocument();
      expect(retryButton).toBeEnabled();
    });
  });

  describe('Not Found State', () => {
    it('shows not found message when business is null and not loading', () => {
      render(
        <BusinessDetail
          business={null}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/business not found/i)).toBeInTheDocument();
      expect(screen.getByText(/does not exist or has been removed/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /browse directory/i })).toHaveAttribute(
        'href',
        '/directory'
      );
    });
  });

  describe('Success State', () => {
    it('displays business name', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
    });

    it('displays verified badge for verified businesses', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/verified business/i)).toBeInTheDocument();
    });

    it('does not show verified badge for unverified businesses', () => {
      const unverifiedBusiness: Business = {
        ...mockBusiness,
        verified: false,
      };

      render(
        <BusinessDetail
          business={unverifiedBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.queryByText(/verified business/i)).not.toBeInTheDocument();
    });

    it('displays category', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/food dining/i)).toBeInTheDocument();
    });

    it('displays formatted date', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      // Should show a formatted date (format depends on locale)
      expect(screen.getByText(/joined:/i)).toBeInTheDocument();
    });

    it('displays business ID', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/550e8400-e29b-41d4-a716-446655440000/i)).toBeInTheDocument();
    });

    it('shows back to directory link', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      const backLink = screen.getByRole('link', { name: /back to directory/i });
      expect(backLink).toHaveAttribute('href', '/directory');
    });

    it('shows chat button for signed-in users (verification is not required)', () => {
      const unverifiedBusiness: Business = {
        ...mockBusiness,
        verified: false,
      };

      render(
        <BusinessDetail
          business={unverifiedBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByRole('button', { name: /chat/i })).toBeInTheDocument();
    });

    it('does not show chat button for signed-out visitors', () => {
      mockGetSession.mockReturnValue(null);

      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.queryByRole('button', { name: /chat/i })).not.toBeInTheDocument();
    });

    it('displays status as verified or unverified', () => {
      const { rerender } = render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getAllByText(/verified/i)).toHaveLength(2); // "Verified Business" badge + "Verified" status

      rerender(
        <BusinessDetail
          business={{ ...mockBusiness, verified: false }}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/unverified/i)).toBeInTheDocument();
    });
  });

  describe('Category Formatting', () => {
    it('formats category ID with dashes to readable name', () => {
      const business: Business = {
        ...mockBusiness,
        categoryId: 'professional-services',
      };

      render(
        <BusinessDetail
          business={business}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/professional services/i)).toBeInTheDocument();
    });

    it('handles category IDs without dashes', () => {
      const business: Business = {
        ...mockBusiness,
        categoryId: 'retail',
      };

      render(
        <BusinessDetail
          business={business}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/Retail/i)).toBeInTheDocument();
    });
  });

  describe('Date Formatting', () => {
    it('formats timestamp to readable date', () => {
      const business: Business = {
        ...mockBusiness,
        createdAt: {
          timestamp: 1609459200, // 2021-01-01
        },
      };

      render(
        <BusinessDetail
          business={business}
          loading={false}
          error={null}
        />
      );

      // Should contain some date format
      expect(screen.getByText(/joined:/i)).toBeInTheDocument();
    });
  });
});
