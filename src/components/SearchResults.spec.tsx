import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchResults, { Business } from './SearchResults';

const MOCK_BUSINESSES: Business[] = [
  {
    id: '1',
    name: 'Soul Food Kitchen',
    category: 'Food & Dining',
    rating: 4.8,
    reviewCount: 156,
    location: 'Harlem, NY',
    isVerified: true,
    imageUrl: '',
    description: 'Authentic Southern cuisine',
    tags: ['Southern', 'Family-Friendly'],
  },
  {
    id: '2',
    name: 'Black Diamond Consulting',
    category: 'Professional Services',
    rating: 5.0,
    reviewCount: 42,
    location: 'Atlanta, GA',
    isVerified: true,
    imageUrl: '',
    description: 'Strategic business consulting',
    tags: ['Consulting', 'B2B'],
  },
];

describe('SearchResults', () => {
  const defaultProps = {
    businesses: MOCK_BUSINESSES,
    currentPage: 1,
    totalPages: 3,
    totalResults: 25,
    onPageChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders businesses correctly', () => {
    render(<SearchResults {...defaultProps} />);

    expect(screen.getByText('Soul Food Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Black Diamond Consulting')).toBeInTheDocument();
  });

  it('displays correct result count', () => {
    render(<SearchResults {...defaultProps} />);

    expect(screen.getByText('Showing 1-10 of 25 businesses')).toBeInTheDocument();
  });

  it('renders pagination controls when totalPages > 1', () => {
    render(<SearchResults {...defaultProps} />);

    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('disables previous button on first page', () => {
    render(<SearchResults {...defaultProps} currentPage={1} />);

    const prevButton = screen.getByRole('button', { name: /previous/i });
    expect(prevButton).toBeDisabled();
  });

  it('disables next button on last page', () => {
    render(<SearchResults {...defaultProps} currentPage={3} totalPages={3} />);

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeDisabled();
  });

  it('calls onPageChange when clicking previous button', () => {
    render(<SearchResults {...defaultProps} currentPage={2} />);

    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(1);
  });

  it('calls onPageChange when clicking next button', () => {
    render(<SearchResults {...defaultProps} currentPage={1} />);

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange when clicking page number', () => {
    render(<SearchResults {...defaultProps} />);

    const page2Button = screen.getByRole('button', { name: 'Page 2' });
    fireEvent.click(page2Button);
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(2);
  });

  it('highlights current page', () => {
    render(<SearchResults {...defaultProps} currentPage={2} />);

    const page2Button = screen.getByRole('button', { name: 'Page 2', current: 'page' });
    expect(page2Button).toBeInTheDocument();
  });

  it('does not render pagination when totalPages is 1', () => {
    render(<SearchResults {...defaultProps} totalPages={1} totalResults={5} />);

    expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
  });

  it('handles ellipsis in page numbers for large result sets', () => {
    const largeResultProps = {
      ...defaultProps,
      totalPages: 10,
      totalResults: 100,
      currentPage: 5,
    };
    render(<SearchResults {...largeResultProps} />);

    const ellipsisElements = screen.getAllByText('...');
    expect(ellipsisElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows correct range for page 2', () => {
    render(<SearchResults {...defaultProps} currentPage={2} />);

    expect(screen.getByText('Showing 11-20 of 25 businesses')).toBeInTheDocument();
  });
});
