/**
 * Unit tests for BusinessDetail component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BusinessDetail, Business, ScrapeMetadata } from './BusinessDetail';

const mockBusiness: Business = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Soul Food Kitchen',
  categoryId: 'food-dining',
  verified: true,
  createdAt: {
    timestamp: 1704067200, // 2024-01-01
  },
};

const mockScrapedData: ScrapeMetadata = {
  scrapedAt: '2024-01-15T10:30:00Z',
  sourceUrl: 'https://example-business-directory.com/listing/123',
  rawDescription: 'Family-owned soul food restaurant serving authentic Southern cuisine since 1985.',
  rawAddress: '123 Main Street, Harlem, NY 10027',
  rawPhoneNumber: '(212) 555-1234',
  rawWebsite: 'https://soulfoodkitchen.com',
  rawContactInfo: 'Email: info@soulfoodkitchen.com\nPhone: (212) 555-1234',
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

    it('shows contact button for verified businesses', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
        />
      );

      expect(screen.getByRole('button', { name: /contact business/i })).toBeInTheDocument();
    });

    it('does not show contact button for unverified businesses', () => {
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

      expect(screen.queryByRole('button', { name: /contact business/i })).not.toBeInTheDocument();
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

  describe('Expanded Panel View', () => {
    it('shows expanded panel when expanded prop is true', () => {
      const mockOnCollapse = jest.fn();
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          expanded={true}
          onCollapse={mockOnCollapse}
        />
      );

      // Should show business name in panel
      expect(screen.getByText(/soul food kitchen/i)).toBeInTheDocument();
      // Should show collapse button
      expect(screen.getByLabelText(/Collapse details/i)).toBeInTheDocument();
    });

    it('displays all business fields in expanded view', () => {
      const businessWithAllFields: Business = {
        ...mockBusiness,
        description: 'Authentic Southern cuisine',
        location: 'Harlem, NY',
        tags: ['Southern', 'Family-Friendly'],
      };

      render(
        <BusinessDetail
          business={businessWithAllFields}
          loading={false}
          error={null}
          expanded={true}
        />
      );

      expect(screen.getByText(/description/i)).toBeInTheDocument();
      expect(screen.getByText(/authentic southern cuisine/i)).toBeInTheDocument();
      expect(screen.getByText(/location/i)).toBeInTheDocument();
      expect(screen.getByText(/harlem, ny/i)).toBeInTheDocument();
      expect(screen.getByText(/tags/i)).toBeInTheDocument();
    });

    it('displays scraped data section when scrapedData is provided', () => {
      const businessWithScrapedData: Business = {
        ...mockBusiness,
        scrapedData: mockScrapedData,
      };

      render(
        <BusinessDetail
          business={businessWithScrapedData}
          loading={false}
          error={null}
          expanded={true}
        />
      );

      expect(screen.getByText(/original scraped data/i)).toBeInTheDocument();
      expect(screen.getByText(/source url/i)).toBeInTheDocument();
      expect(screen.getByText(/scraped at/i)).toBeInTheDocument();
      expect(screen.getByText(/raw description/i)).toBeInTheDocument();
      expect(screen.getByText(/raw address/i)).toBeInTheDocument();
      expect(screen.getByText(/raw phone/i)).toBeInTheDocument();
      expect(screen.getByText(/raw website/i)).toBeInTheDocument();
      expect(screen.getByText(/raw contact info/i)).toBeInTheDocument();
    });

    it('shows raw scraped data values', () => {
      const businessWithScrapedData: Business = {
        ...mockBusiness,
        scrapedData: mockScrapedData,
      };

      render(
        <BusinessDetail
          business={businessWithScrapedData}
          loading={false}
          error={null}
          expanded={true}
        />
      );

      expect(screen.getByText(/example-business-directory.com/i)).toBeInTheDocument();
      expect(screen.getByText(/family-owned soul food/i)).toBeInTheDocument();
      expect(screen.getByText(/123 main street/i)).toBeInTheDocument();
      // Phone appears in both raw phone and raw contact info - use getAllByText
      const phoneElements = screen.getAllByText(/\(212\) 555-1234/i);
      expect(phoneElements.length).toBeGreaterThan(0);
    });

    it('calls onCollapse when collapse button is clicked', () => {
      const mockOnCollapse = jest.fn();
      const businessWithScrapedData: Business = {
        ...mockBusiness,
        scrapedData: mockScrapedData,
      };

      const { getByLabelText } = render(
        <BusinessDetail
          business={businessWithScrapedData}
          loading={false}
          error={null}
          expanded={true}
          onCollapse={mockOnCollapse}
        />
      );

      fireEvent.click(getByLabelText(/collapse details/i));
      expect(mockOnCollapse).toHaveBeenCalled();
    });

    it('does not show scraped data section when scrapedData is undefined', () => {
      render(
        <BusinessDetail
          business={mockBusiness}
          loading={false}
          error={null}
          expanded={true}
        />
      );

      expect(screen.queryByText(/original scraped data/i)).not.toBeInTheDocument();
    });
  });
});
