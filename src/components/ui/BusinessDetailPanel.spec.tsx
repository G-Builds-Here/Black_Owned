import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BusinessDetailPanel, BusinessDetail } from './BusinessDetailPanel';

describe('BusinessDetailPanel', () => {
  const mockBusiness: BusinessDetail = {
    id: 'test-id',
    name: 'Test Business',
    address: '123 Main St, City, State 12345',
    source: 'google_maps',
    rating: 4,
    status: 'pending_review',
    createdAt: '2026-08-10T10:00:00Z',
    description: 'This is a test business description.',
    categoryId: 'cat-123',
    sourceData: {
      scraped_at: '2026-08-09T08:00:00Z',
      scraper_version: '1.0.0',
      raw_rating: 4.2,
      phone: '+1-555-123-4567',
      website: 'https://testbusiness.com',
    },
  };

  const defaultProps = {
    business: mockBusiness,
    isOpen: true,
    onClose: jest.fn(),
  };

  it('renders correctly when open with business data', () => {
    render(<BusinessDetailPanel {...defaultProps} />);

    expect(screen.getByText('Test Business')).toBeInTheDocument();
    expect(screen.getByText('Google Maps')).toBeInTheDocument();
    expect(screen.getByText(/Pending review/)).toBeInTheDocument();
    expect(screen.getByText('123 Main St, City, State 12345')).toBeInTheDocument();
    expect(screen.getByText('Category ID')).toBeInTheDocument();
    expect(screen.getByText('cat-123')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('pending_review')).toBeInTheDocument();
    expect(screen.getByText('Created At')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('This is a test business description.')).toBeInTheDocument();
    expect(screen.getByText('Original Scraped Data')).toBeInTheDocument();
  });

  it('displays star rating correctly', () => {
    render(<BusinessDetailPanel {...defaultProps} />);

    const stars = screen.getByText(/[★☆]{5}/);
    expect(stars).toBeInTheDocument();
  });

  it('displays N/A for null rating', () => {
    const businessWithoutRating: BusinessDetail = {
      ...mockBusiness,
      rating: null,
    };

    render(<BusinessDetailPanel {...defaultProps} business={businessWithoutRating} />);

    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('does not render description section when description is undefined', () => {
    const businessWithoutDescription: BusinessDetail = {
      ...mockBusiness,
      description: undefined,
    };

    render(<BusinessDetailPanel {...defaultProps} business={businessWithoutDescription} />);

    expect(screen.queryByText('Description')).not.toBeInTheDocument();
  });

  it('displays source data as formatted JSON', () => {
    render(<BusinessDetailPanel {...defaultProps} />);

    expect(screen.getByText(/scraped_at/)).toBeInTheDocument();
    expect(screen.getByText(/scraper_version/)).toBeInTheDocument();
    expect(screen.getByText(/raw_rating/)).toBeInTheDocument();
  });

  it('displays "No additional data" when sourceData is undefined', () => {
    const businessWithoutSourceData: BusinessDetail = {
      ...mockBusiness,
      sourceData: undefined,
    };

    render(<BusinessDetailPanel {...defaultProps} business={businessWithoutSourceData} />);

    expect(screen.getByText('No additional data')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = jest.fn();
    render(<BusinessDetailPanel {...defaultProps} onClose={handleClose} />);

    const closeButton = screen.getByLabelText('Close detail panel');
    fireEvent.click(closeButton);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <BusinessDetailPanel {...defaultProps} isOpen={false} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('formats source name correctly', () => {
    const facebookBusiness: BusinessDetail = {
      ...mockBusiness,
      source: 'facebook',
    };

    render(<BusinessDetailPanel {...defaultProps} business={facebookBusiness} />);

    expect(screen.getByText('Facebook')).toBeInTheDocument();
  });

  it('displays createdAt as formatted date', () => {
    render(<BusinessDetailPanel {...defaultProps} />);

    const dateElement = screen.getByText(/8\/10\/2026/);
    expect(dateElement).toBeInTheDocument();
  });
});
