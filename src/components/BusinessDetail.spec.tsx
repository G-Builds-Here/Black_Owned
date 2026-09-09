/**
 * Unit tests for BusinessDetail component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

    it('renders the hero image cover-fit when imageUrl is provided', () => {
      const businessWithImage: Business = {
        ...mockBusiness,
        imageUrl: 'https://example.com/image.jpg',
      };

      render(
        <BusinessDetail
          business={businessWithImage}
          loading={false}
          error={null}
        />
      );

      const img = screen.getByRole('img', { name: /photo of soul food kitchen/i });
      expect(img).toHaveAttribute('src', 'https://example.com/image.jpg');
      expect(img).toHaveClass('object-cover');
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
      expect(screen.getByText(/88 reviews on Google/i)).toBeInTheDocument();
      expect(screen.getByText(/123 Main St, Harlem, NY/)).toBeInTheDocument();
      expect(screen.getByText(/authentic soul food/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /website/i })).toHaveAttribute(
        'href',
        'https://soulkitchen.example'
      );
      expect(screen.getByRole('link', { name: /555-0100/i })).toHaveAttribute('href', 'tel:555-0100');
      expect(screen.getByText(/southern/i)).toBeInTheDocument();
    });

    it('shows a Menu link when a menu URL is present', () => {
      render(
        <BusinessDetail
          business={{ ...richBusiness, menuUrl: 'https://soulkitchen.example/menu.pdf' }}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByRole('link', { name: /menu/i })).toHaveAttribute(
        'href',
        'https://soulkitchen.example/menu.pdf'
      );
    });

    it('shows on-site reviews separately from external ones', () => {
      render(
        <BusinessDetail
          business={{ ...richBusiness, siteReviewCount: 3, siteRating: 4.9 }}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByText(/3 reviews on this site/i)).toBeInTheDocument();
      expect(screen.getByText(/88 reviews on Google/i)).toBeInTheDocument();
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

    it('lists every location address in the Locations section', () => {
      render(
        <BusinessDetail
          business={multiBusiness}
          loading={false}
          error={null}
        />
      );

      const section = screen
        .getByRole('heading', { name: /locations/i })
        .closest('section');
      expect(within(section as HTMLElement).getByText(/4454 S Cobb Dr SE/i)).toBeInTheDocument();
      expect(within(section as HTMLElement).getByText(/1016 Howell Mill Rd/i)).toBeInTheDocument();
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

  describe('On-site reviews', () => {
    const withReviews: Business = {
      ...mockBusiness,
      siteReviewCount: 1,
      siteRating: 5,
      siteReviews: [
        {
          id: 'review-1',
          rating: 5,
          comment: 'Best gumbo in town',
          reviewerName: 'Jenna L.',
          locationLabel: 'Smyrna',
          createdAt: {
            timestamp: Math.floor(new Date('2026-08-01T00:00:00Z').getTime() / 1000),
          },
        },
      ],
    };

    it('lists on-site reviews with reviewer, stars and location', async () => {
      render(<BusinessDetail business={withReviews} loading={false} error={null} />);

      expect(await screen.findAllByText('Jenna L.')).not.toHaveLength(0);
      // Comment renders in both the review list and the "Customers say" pull-quote (LOC-0088 AC2)
      expect(screen.getAllByText(/best gumbo in town/i)).toHaveLength(2);
      expect(screen.getAllByText('· Smyrna')).not.toHaveLength(0);
    });

    it('shows a sign-in prompt when signed out', async () => {
      mockGetSession.mockReturnValue(null);
      render(<BusinessDetail business={mockBusiness} loading={false} error={null} />);

      const section = screen
        .getByText('Reviews', { selector: 'h2' })
        .closest('section');
      const link = within(section as HTMLElement).getByRole('link', { name: /sign in/i });
      expect(link).toHaveAttribute('href', '/login');
    });

    it('posts a review with the session token when signed in', async () => {
      const onReviewsSubmitted = jest.fn();
      const originalFetch = globalThis.fetch;
      const fetchMock = jest.fn().mockResolvedValue({
        status: 201,
        ok: true,
        json: async () => ({ success: true, data: { id: 'new-review' } }),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          onReviewsSubmitted={onReviewsSubmitted}
        />
      );

      const submit = await screen.findByRole('button', { name: /post review/i });
      fireEvent.click(screen.getByRole('button', { name: '4 stars' }));
      fireEvent.change(screen.getByPlaceholderText(/what was your experience/i), {
        target: { value: 'Great soul food' },
      });
      fireEvent.submit(submit);

      await waitFor(() => {
        expect(fetchMock.mock.calls.some(([url]) => url === '/api/reviews')).toBe(true);
      });
      const [url, init] = fetchMock.mock.calls.find(([u]) => u === '/api/reviews');
      expect(url).toBe('/api/reviews');
      expect(init?.method).toBe('POST');
      expect(init?.headers.Authorization).toBe('Bearer access');
      expect(JSON.parse(init?.body)).toEqual({
        businessId: mockBusiness.id,
        rating: 4,
        comment: 'Great soul food',
      });
      await waitFor(() => expect(onReviewsSubmitted).toHaveBeenCalled());
      globalThis.fetch = originalFetch;
    });
  });

  describe('Highlight chips (LOC-0088 AC1)', () => {
    it('shows all 5 highlights when 5 are provided', () => {
      const biz: Business = {
        ...mockBusiness,
        highlights: ['Organic', 'Locally Sourced', 'Vegan Options', 'Family-Friendly', 'Award-Winning'],
      };
      const { container } = render(<BusinessDetail business={biz} loading={false} error={null} />);
      const chips = container.querySelectorAll('.highlight-chip');
      expect(chips).toHaveLength(5);
    });

    it('shows all highlights when fewer than 5', () => {
      const biz: Business = { ...mockBusiness, highlights: ['Organic', 'Locally Sourced', 'Vegan Options'] };
      const { container } = render(<BusinessDetail business={biz} loading={false} error={null} />);
      const chips = container.querySelectorAll('.highlight-chip');
      expect(chips).toHaveLength(3);
    });
  });

  describe('Customers say (LOC-0088 AC2)', () => {
    const ts = (d: string) => Math.floor(new Date(d).getTime() / 1000);
    const withReviews: Business = {
      ...mockBusiness,
      siteReviewCount: 3,
      siteRating: 4.3,
      siteReviews: [
        { id: 'r1', rating: 3, comment: 'Meh, okay food', reviewerName: 'Amy', locationLabel: 'Midtown', createdAt: { timestamp: ts('2026-08-01') } },
        { id: 'r2', rating: 4, comment: 'Solid experience', reviewerName: 'Bob', locationLabel: 'Smyrna', createdAt: { timestamp: ts('2026-08-05') } },
        { id: 'r3', rating: 5, comment: 'Best gumbo in town', reviewerName: 'Jenna L.', locationLabel: 'Smyrna', createdAt: { timestamp: ts('2026-08-10') } },
      ],
    };

    it('shows the highest-rated review in the Customers say quote', () => {
      render(<BusinessDetail business={withReviews} loading={false} error={null} />);
      expect(screen.getByText(/customers say/i)).toBeInTheDocument();
      const quote = screen.getByRole('blockquote');
      expect(within(quote).getByText(/best gumbo in town/i)).toBeInTheDocument();
      expect(within(quote).queryByText(/meh, okay food/i)).not.toBeInTheDocument();
      expect(within(quote).queryByText(/solid experience/i)).not.toBeInTheDocument();
    });

    it('attributes the reviewer name and location label', () => {
      render(<BusinessDetail business={withReviews} loading={false} error={null} />);
      const quote = screen.getByRole('blockquote');
      expect(within(quote).getByText(/jenna/i)).toBeInTheDocument();
      expect(within(quote).getByText(/smyrna/i)).toBeInTheDocument();
    });

    it('on a rating tie shows the most recent review', () => {
      const tie: Business = {
        ...mockBusiness,
        siteReviewCount: 2,
        siteRating: 5,
        siteReviews: [
          { id: 'old', rating: 5, comment: 'Older great review', reviewerName: 'Old O.', locationLabel: 'A', createdAt: { timestamp: ts('2026-07-01') } },
          { id: 'new', rating: 5, comment: 'Newer great review', reviewerName: 'New N.', locationLabel: 'B', createdAt: { timestamp: ts('2026-08-01') } },
        ],
      };
      render(<BusinessDetail business={tie} loading={false} error={null} />);
      const quote = screen.getByRole('blockquote');
      expect(within(quote).getByText(/newer great review/i)).toBeInTheDocument();
      expect(within(quote).queryByText(/older great review/i)).not.toBeInTheDocument();
    });

    it('hides the Customers say section when there are no reviews', () => {
      render(<BusinessDetail business={{ ...mockBusiness, siteReviewCount: 0, siteReviews: [] }} loading={false} error={null} />);
      expect(screen.queryByText(/customers say/i)).not.toBeInTheDocument();
    });
  });

  describe('Highlight null handling (LOC-0088 AC3)', () => {
    it('does not render a highlight chip row when highlights is null', () => {
      const { container } = render(<BusinessDetail business={{ ...mockBusiness, highlights: null }} loading={false} error={null} />);
      expect(container.querySelectorAll('.highlight-chip')).toHaveLength(0);
    });

    it('does not render a highlight chip row when highlights is empty', () => {
      const { container } = render(<BusinessDetail business={{ ...mockBusiness, highlights: [] }} loading={false} error={null} />);
      expect(container.querySelectorAll('.highlight-chip')).toHaveLength(0);
    });
  });
});
