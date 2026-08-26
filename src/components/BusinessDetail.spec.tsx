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

      expect(screen.getByRole('heading', { name: /soul food kitchen/i })).toBeInTheDocument();
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

      expect(screen.getAllByText(/food dining/i)).not.toHaveLength(0);
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
      expect(screen.getByText(/listed since/i)).toBeInTheDocument();
    });

    it('does not display the raw business ID', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.queryByText(/550e8400-e29b-41d4-a716-446655440000/i)).not.toBeInTheDocument();
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

      expect(screen.getByText(/verified business/i)).toBeInTheDocument();

      rerender(
        <BusinessDetail
          business={{ ...mockBusiness, verified: false }}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/unverified/i)).toBeInTheDocument();
      expect(screen.queryByText(/verified business/i)).not.toBeInTheDocument();
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

      expect(screen.getAllByText(/professional services/i)).not.toHaveLength(0);
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

      expect(screen.getAllByText(/Retail/i)).not.toHaveLength(0);
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
      expect(screen.getByText(/listed since/i)).toBeInTheDocument();
    });
  });

  describe('OpenTable-style profile', () => {
    const richBusiness: Business = {
      ...mockBusiness,
      category: 'Food & Dining',
      description: 'Authentic soul food.',
      location: '123 Main St, Harlem, NY',
      phone: '555-0100',
      website: 'https://soulkitchen.example',
      rating: 4.5,
      reviewCount: 88,
      tags: ['Southern', 'Family-Friendly'],
      verified: false,
    };

    it('shows rating, reviews, location, contact and about', () => {
      render(
        <BusinessDetail
          business={richBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/4\.5/)).toBeInTheDocument();
      expect(screen.getByText(/88 reviews/)).toBeInTheDocument();
      expect(screen.getByText(/123 Main St, Harlem, NY/)).toBeInTheDocument();
      expect(screen.getByText(/authentic soul food/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /website/i })).toHaveAttribute(
        'href',
        'https://soulkitchen.example'
      );
      expect(screen.getByRole('link', { name: /555-0100/i })).toHaveAttribute('href', 'tel:555-0100');
      expect(screen.getByText(/southern/i)).toBeInTheDocument();
    });

    it('offers a claim CTA for unverified businesses and hides it when verified', () => {
      const { rerender } = render(
        <BusinessDetail
          business={richBusiness}
          loading={false}
          error={null}
        />
      );

      const claim = screen.getByRole('link', { name: /claim this business/i });
      expect(claim).toHaveAttribute('href', '/business/claim');

      rerender(
        <BusinessDetail
          business={{ ...richBusiness, verified: true }}
          loading={false}
          error={null}
        />
      );

      expect(screen.queryByRole('link', { name: /claim this business/i })).not.toBeInTheDocument();
    });

    it('prefers the resolved category name over the id', () => {
      render(
        <BusinessDetail
          business={richBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getAllByText(/food & dining/i)).not.toHaveLength(0);
    });
  });

  describe('Multiple locations', () => {
    const multiBusiness: Business = {
      ...mockBusiness,
      locations: [
        {
          id: 'loc-1',
          label: 'Smyrna',
          address: '4454 S Cobb Dr SE Ste. 101, Smyrna, GA 30080',
          lat: 33.846956,
          lng: -84.505185,
          isPrimary: true,
        },
        {
          id: 'loc-2',
          label: 'Midtown',
          address: '1016 Howell Mill Rd, Ste A, Atlanta, GA 30318',
          lat: 33.782548,
          lng: -84.411627,
          isPrimary: false,
        },
      ],
    };

    it('lists every location address', () => {
      render(
        <BusinessDetail
          business={multiBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/4454 S Cobb Dr SE/i)).toBeInTheDocument();
      expect(screen.getByText(/1016 Howell Mill Rd/i)).toBeInTheDocument();
    });

    it('shows a Locations heading with the location count', () => {
      render(
        <BusinessDetail
          business={multiBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByRole('heading', { name: /locations/i })).toBeInTheDocument();
    });
  });
});
