'use client';

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ReviewList, Review } from './Review';

const mockReviews: Review[] = [
  {
    id: '1',
    reviewerName: 'John Doe',
    rating: 5,
    date: '2026-07-01',
    title: 'Excellent service',
    content: 'Great experience overall. Highly recommend!',
    isVerifiedPurchase: true,
    helpfulCount: 10,
  },
  {
    id: '2',
    reviewerName: 'Jane Smith',
    rating: 4,
    date: '2026-07-05',
    title: 'Very good',
    content: 'Good quality and fast delivery.',
    isVerifiedPurchase: false,
    helpfulCount: 5,
  },
];

describe('ReviewList', () => {
  it('renders review summary with average rating', () => {
    render(
      <ReviewList
        reviews={mockReviews}
        averageRating={4.5}
        totalReviews={2}
      />
    );

    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('Based on 2 reviews')).toBeInTheDocument();
  });

  it('renders star rating distribution', () => {
    render(
      <ReviewList
        reviews={mockReviews}
        averageRating={4.5}
        totalReviews={2}
      />
    );

    // Check that star ratings are displayed
    expect(screen.getByText('5 ★')).toBeInTheDocument();
    expect(screen.getByText('4 ★')).toBeInTheDocument();
  });

  it('renders individual reviews', () => {
    render(
      <ReviewList
        reviews={mockReviews}
        averageRating={4.5}
        totalReviews={2}
      />
    );

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Excellent service')).toBeInTheDocument();
    expect(screen.getByText('Very good')).toBeInTheDocument();
  });

  it('displays verified badge for verified purchases', () => {
    render(
      <ReviewList
        reviews={mockReviews}
        averageRating={4.5}
        totalReviews={2}
      />
    );

    expect(screen.getByText('✓ Verified')).toBeInTheDocument();
  });

  it('displays helpful count', () => {
    render(
      <ReviewList
        reviews={mockReviews}
        averageRating={4.5}
        totalReviews={2}
      />
    );

    expect(screen.getByText(/Helpful \(10\)/)).toBeInTheDocument();
    expect(screen.getByText(/Helpful \(5\)/)).toBeInTheDocument();
  });

  it('formats date correctly', () => {
    render(
      <ReviewList
        reviews={mockReviews}
        averageRating={4.5}
        totalReviews={2}
      />
    );

    // Check that dates are rendered (format may vary by locale)
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
  });

  it('renders stars correctly for different ratings', () => {
    const { container } = render(
      <ReviewList
        reviews={[
          {
            id: '1',
            reviewerName: 'Test',
            rating: 3.5,
            date: '2026-07-01',
            title: 'Test',
            content: 'Test',
          },
        ]}
        averageRating={3.5}
        totalReviews={1}
      />
    );

    // Check for star elements
    const stars = container.querySelectorAll('[aria-hidden="true"]');
    expect(stars.length).toBeGreaterThan(0);
  });

  it('handles empty reviews array', () => {
    render(
      <ReviewList
        reviews={[]}
        averageRating={0}
        totalReviews={0}
      />
    );

    expect(screen.getByText('0.0')).toBeInTheDocument();
    expect(screen.getByText('Based on 0 reviews')).toBeInTheDocument();
  });
});
